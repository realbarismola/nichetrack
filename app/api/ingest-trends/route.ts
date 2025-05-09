import { NextResponse } from 'next/server';
import snoowrap from 'snoowrap';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  await Promise.allSettled(
    userSubreddits.map(async ({ subreddit, user_id }) => {
      try {
        console.log(`[Reddit Fetch] Fetching /r/${subreddit} for user ${user_id}`);
        const topPosts = await r.getSubreddit(subreddit).getTop({ time: 'day', limit: 5 });

        const postInserts = topPosts.slice(0, 3).map(post => ({
          user_id,
          subreddit,
          title: post.title,
          url: post.url,
          score: post.score,
          num_comments: post.num_comments,
          created_utc: new Date(post.created_utc * 1000).toISOString(),
          summary: null
        }));

        const { error: insertError } = await supabase.from('user_posts').insert(postInserts);

        if (insertError) throw new Error(`Insert error: ${insertError.message}`);

        insertedPosts.push(subreddit);
      } catch (err) {
        console.warn(`[❌] Failed for /r/${subreddit}:`, err);
        failedSubreddits.push(subreddit);
      }
    })
  );

  return NextResponse.json({
    success: true,
    inserted: insertedPosts,
    failed: failedSubreddits,
  });
}

export const config = {
  runtime: 'nodejs',
};
