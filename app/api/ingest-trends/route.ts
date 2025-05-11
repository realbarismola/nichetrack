import { NextResponse } from 'next/server';
import snoowrap from 'snoowrap';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const redditClientId = process.env.REDDIT_CLIENT_ID;
const redditClientSecret = process.env.REDDIT_CLIENT_SECRET;
const redditUsername = process.env.REDDIT_USERNAME;
const redditPassword = process.env.REDDIT_PASSWORD;

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

async function getTopComments(post: snoowrap.Submission, limit = 3): Promise<string[]> {
  const fullPost = await post.expandReplies({ limit, depth: 1 });
  return (fullPost.comments as snoowrap.Comment[])
    .filter((c) => 
      typeof c.body === 'string' &&
      !c.body.includes('[removed]') &&
      c.author?.name !== 'AutoModerator'
    )
    .slice(0, limit)
    .map((c) => `- ${c.author.name}: ${c.body}`);
}

async function generateSummary(title: string, comments: string[]): Promise<string | null> {
  const prompt = `
Summarize the following Reddit post and its top comments in 2-3 concise sentences.

Title: ${title}

Top Comments:
${comments.join('\n')}
`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  });

  return response.choices[0].message.content?.trim() || null;
}

export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  console.log('✅ [/api/ingest-trends] Route execution started.');

  if (!redditClientId || !redditClientSecret || !redditUsername || !redditPassword) {
    return NextResponse.json({ success: false, error: 'Missing Reddit credentials.' }, { status: 500 });
  }

  const r = new snoowrap({
    userAgent,
    clientId: redditClientId,
    clientSecret: redditClientSecret,
    username: redditUsername,
    password: redditPassword,
  });

  const userSubreddits = await getActiveSubreddits();
  const insertedPosts: string[] = [];
  const failedSubreddits: string[] = [];

  for (const { subreddit, user_id } of userSubreddits) {
    try {
      console.log(`[Reddit Fetch] Fetching /r/${subreddit} for user ${user_id}`);
      const topPosts = await r.getSubreddit(subreddit).getTop({ time: 'day', limit: 5 });

      for (const post of topPosts.slice(0, 3)) {
        const topComments = await getTopComments(post);
        const summary = await generateSummary(post.title, topComments);

        const { error: insertError } = await supabase.from('user_posts').insert([
          {
            user_id,
            subreddit,
            title: post.title,
            url: post.url,
            score: post.score,
            num_comments: post.num_comments,
            created_utc: new Date(post.created_utc * 1000).toISOString(),
            summary,
          },
        ]);

        if (insertError) throw new Error(`Insert error: ${insertError.message}`);
      }

      insertedPosts.push(subreddit);
    } catch (err) {
      console.warn(`[❌] Failed for /r/${subreddit}:`, err);
      failedSubreddits.push(subreddit);
    }
  }

  return NextResponse.json({
    success: true,
    inserted: insertedPosts,
    failed: failedSubreddits,
  });
}

export const config = {
  runtime: 'nodejs',
};
