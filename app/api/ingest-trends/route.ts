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

async function getTopComments(post: snoowrap.Submission, finalLimit = 3): Promise<string[]> {
  // Fetch more comments than finalLimit to account for filtering
  const fetchLimit = finalLimit * 2 + 10; // e.g., if finalLimit is 3, fetch 16

  let commentsListing: snoowrap.Listing<snoowrap.Comment>;

  try {
    // This is the line (or the await of it) that causes ts(1062)
    // We cast the promise to Promise<any> to break the TS inference cycle,
    // then cast the resolved value back to the expected type.
    const promise = post.expandReplies({ limit: fetchLimit, depth: 1 });
    // Depth 1 is usually for fetching top-level comments and their immediate replies.
    // If you strictly only want top-level comments, depth: 0 might be considered,
    // but snoowrap's behavior with depth 0 on expandReplies for a submission needs careful checking.
    // Depth 1 is generally safer for ensuring comments are loaded.

    commentsListing = await (promise as Promise<any>) as snoowrap.Listing<snoowrap.Comment>;

  } catch (error) {
    console.error(`[getTopComments] Failed to expand replies for post ${post.id} (${post.title.slice(0,30)}...):`, error);
    return []; // Return empty array if fetching/expanding comments fails
  }

  if (!commentsListing || commentsListing.length === 0) {
    // console.log(`[getTopComments] No comments found or fetched for post ${post.id}`);
    return [];
  }

  // A snoowrap.Listing can be treated as an array for .filter, .slice, .map
  const formattedComments = commentsListing
    .filter((c): c is snoowrap.Comment => // Type guard to ensure c is a valid Comment after filtering
      Boolean( // Ensure the entire condition results in a boolean
        c && // Check if comment object itself is not null/undefined
        c.author && // Ensure author object exists before trying to access c.author.name
        c.body && // Check if body exists
        typeof c.body === 'string' &&
        !c.body.toLowerCase().includes('[removed]') &&
        !c.body.toLowerCase().includes('[deleted]') &&
        c.author.name !== 'AutoModerator' && // No need for optional chaining if c.author is checked
        c.body.trim() !== '' // Ensure comment is not just whitespace
      )
    )
    .slice(0, finalLimit) // Apply the final limit *after* filtering
    .map((c: snoowrap.Comment) => { // c is now a valid, filtered snoowrap.Comment
      const authorName = c.author.name; // Already checked c.author exists
      // Sanitize comment body for the prompt: remove excessive newlines, limit length
      const cleanBody = c.body.replace(/\n{2,}/g, ' ').replace(/\n/g, ' ').trim().slice(0, 200); // Limit comment length for prompt
      return `- ${authorName}: ${cleanBody}${c.body.length > 200 ? '...' : ''}`;
    });

  return formattedComments;
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
