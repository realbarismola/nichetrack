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

export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

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

  console.log("✅ Starting per-user subreddit trend ingestion...");

  const { data: users, error: userError } = await supabase.from('user_subreddits').select('user_id, subreddit').eq('is_active', true);
  if (userError || !users) {
    console.error('❌ Could not fetch user subreddits:', userError);
    return NextResponse.json({ success: false, error: 'Could not load user subreddits' });
  }

  const trendsByUser = users.reduce((acc, curr) => {
    if (!acc[curr.user_id]) acc[curr.user_id] = [];
    acc[curr.user_id].push(curr.subreddit);
    return acc;
  }, {} as Record<string, string[]>);

  const inserted: string[] = [];
  const failed: string[] = [];

  for (const [userId, subreddits] of Object.entries(trendsByUser)) {
    for (const subreddit of subreddits) {
      try {
        console.log(`🔍 Fetching /r/${subreddit} for user ${userId}`);
        const topPosts = await r.getSubreddit(subreddit).getTop({ time: 'day', limit: 5 });
        const posts = topPosts.map((p) => p.title);
        const title = posts[0]?.replace(/["<>]/g, '').trim();

        if (!title) throw new Error('Empty Reddit title');

        const prompt = `You are a trend researcher. Analyze this phrase and return ONLY a valid JSON object (no preamble, no explanation) with this exact structure:\n\n{\n  "title": "a short catchy trend title",\n  "description": "what the trend is and why it’s interesting (1-2 sentences)",\n  "category": "one of: travel, health, finance, tech",\n  "ideas": ["bullet point 1", "bullet point 2"]\n}\n\nTrend keyword: \"${title}\"`;

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
        const parsed = JSON.parse(contentString);

        const { error: insertError } = await supabase.from('user_trends').insert({
          user_id: userId,
          title: parsed.title,
          description: parsed.description,
          category: parsed.category,
          ideas: parsed.ideas,
          source: 'reddit',
          keyword: title,
          source_subreddit: subreddit,
        });

        if (insertError) throw new Error(`Supabase insert error: ${insertError.message}`);

        inserted.push(`${userId}:${subreddit}`);
      } catch (err) {
        console.warn(`❌ Failed for /r/${subreddit} (user: ${userId}):`, err);
        failed.push(`${userId}:${subreddit}`);
      }
    }
  }

  return NextResponse.json({ success: true, inserted, failed });
}

export const config = {
  runtime: 'nodejs',
};
