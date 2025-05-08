import { NextResponse } from 'next/server';
import snoowrap from 'snoowrap';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openaiKey = process.env.OPENAI_API_KEY;
const openaiOrg = process.env.OPENAI_ORG_ID;
const redditClientId = process.env.REDDIT_CLIENT_ID;
const redditClientSecret = process.env.REDDIT_CLIENT_SECRET;
const redditUsername = process.env.REDDIT_USERNAME;
const redditPassword = process.env.REDDIT_PASSWORD;

const openAIUrl = 'https://api.openai.com/v1/chat/completions';
const userAgent = 'web:Nichetracker:v1.1 (contact: baris.mola@gmail.com)';

async function getActiveSubreddits(): Promise<{ subreddit: string; user_id: string }[]> {
  const { data, error } = await supabase
    .from('user_subreddits')
    .select('subreddit, user_id')
    .eq('is_active', true);

  if (error || !data) {
    console.error('❌ Failed to fetch user subreddits from Supabase:', error);
    return [];
  }

  return data;
}

export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  console.log("✅ [/api/ingest-trends] Route execution started.");

  if (!openaiKey || !redditClientId || !redditClientSecret || !redditUsername || !redditPassword) {
    return NextResponse.json({ success: false, error: 'Missing environment variables.' }, { status: 500 });
  }

  const r = new snoowrap({
    userAgent,
    clientId: redditClientId,
    clientSecret: redditClientSecret,
    username: redditUsername,
    password: redditPassword,
  });

  const userSubreddits = await getActiveSubreddits();
  const insertedTrends: string[] = [];
  const failedSubreddits: string[] = [];

  await Promise.allSettled(
    userSubreddits.map(async ({ subreddit, user_id }) => {
      try {
        console.log(`[Reddit Fetch] Trying /r/${subreddit}...`);
        const topPosts = await r.getSubreddit(subreddit).getTop({ time: 'day', limit: 5 });
        const posts = topPosts.map((post) => post.title);

        const redditTitle = posts.find(title =>
          title && title.length > 20 && /[a-zA-Z]/.test(title)
        )?.replace(/["<>]/g, '').trim();

        if (!redditTitle) throw new Error('No suitable title found');

        const prompt = `You are a trend researcher. Analyze this phrase and return ONLY a valid JSON object (no preamble, no explanation) with this exact structure:\n\n{\n  "title": "a short catchy trend title",\n  "description": "what the trend is and why it’s interesting (1-2 sentences)",\n  "category": "one of: travel, health, finance, tech",\n  "ideas": ["bullet point 1 (blog, YouTube, etc.)", "bullet point 2"]\n}\n\nTrend keyword: \"${redditTitle}\"`;

        const response = await fetch(openAIUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${openaiKey}`,
            'User-Agent': userAgent,
            ...(openaiOrg ? { 'OpenAI-Organization': openaiOrg } : {}),
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
          }),
        });

        const bodyText = await response.text();
        if (!response.ok) throw new Error(`OpenAI Error: ${response.status}`);

        const jsonResponse = JSON.parse(bodyText);
        const contentString = jsonResponse.choices?.[0]?.message?.content;
        if (!contentString) throw new Error('Missing OpenAI content');

        const contentJson = JSON.parse(contentString);

        const { error: insertError } = await supabase.from('user_trends').insert([
          {
            title: contentJson.title,
            description: contentJson.description,
            category: contentJson.category,
            ideas: contentJson.ideas,
            source: 'reddit',
            keyword: redditTitle,
            source_subreddit: subreddit,
            user_id: user_id,
          },
        ]);

        if (insertError) throw new Error(`Supabase insert error: ${insertError.message}`);

        insertedTrends.push(subreddit);
      } catch (err) {
        console.warn(`[❌] Failed for /r/${subreddit}:`, err);
        failedSubreddits.push(subreddit);
      }
    })
  );

  return NextResponse.json({
    success: true,
    inserted: insertedTrends,
    failed: failedSubreddits,
  });
}

export const config = {
  runtime: 'nodejs',
};
