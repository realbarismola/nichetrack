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
  console.log('[getActiveSubreddits] Fetching active subreddits...');
  const { data, error } = await supabase
    .from('user_subreddits')
    .select('subreddit, user_id')
    .eq('is_active', true);

  if (error || !data) {
    console.error('❌ [getActiveSubreddits] Failed to fetch user subreddits from Supabase:', error);
    return [];
  }
  console.log(`[getActiveSubreddits] Found ${data.length} active subreddits.`);
  return data;
}

async function getTopComments(post: snoowrap.Submission, finalLimit = 3): Promise<string[]> {
  const fetchLimit = finalLimit * 2 + 10;
  let commentsListing: unknown;

  console.log(`[getTopComments] Attempting to fetch up to ${fetchLimit} comments for post ID ${post.id} ("${post.title.slice(0, 30)}...")`);

  try {
    const promise = post.expandReplies({ limit: fetchLimit, depth: 1 });
    commentsListing = await (promise as Promise<unknown>);
    console.log(`[getTopComments] Raw commentsListing type:`, typeof commentsListing);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`❌ [getTopComments] Failed to expand replies for post ID ${post.id} ("${post.title.slice(0, 30)}..."):`, errorMessage);
    if (error instanceof Error && error.stack) console.error("Stack:", error.stack);
    return [];
  }

  if (!Array.isArray(commentsListing) || commentsListing.length === 0) {
    console.log(`[getTopComments] No comments found or fetched for post ID ${post.id}.`);
    return [];
  }

  const formattedComments = commentsListing
    .filter((c): c is snoowrap.Comment =>
      Boolean(
        c &&
        typeof c === 'object' &&
        'author' in c &&
        'body' in c &&
        typeof (c as snoowrap.Comment).body === 'string' &&
        !(c as snoowrap.Comment).body.toLowerCase().includes('[removed]') &&
        !(c as snoowrap.Comment).body.toLowerCase().includes('[deleted]') &&
        (c as snoowrap.Comment).body.trim() !== '' &&
        (c as snoowrap.Comment).author?.name !== 'AutoModerator'
      )
    )
    .slice(0, finalLimit)
    .map((c: snoowrap.Comment) => {
      const authorName = c.author.name;
      const cleanBody = c.body.replace(/\n{2,}/g, ' ').replace(/\n/g, ' ').trim().slice(0, 200);
      return `- ${authorName}: ${cleanBody}${c.body.length > 200 ? '...' : ''}`;
    });

  console.log(`[getTopComments] Filtered down to ${formattedComments.length} comments for post ID ${post.id}.`);
  return formattedComments;
}

async function generateSummary(title: string, comments: string[]): Promise<string | null> {
  if (!comments || comments.length === 0) {
    console.log(`[generateSummary] No comments provided for title "${title.slice(0,50)}...". Skipping summary generation.`);
    return null;
  }

  const prompt = `
Summarize the following Reddit post and its top comments in 2-3 concise sentences.

Title: ${title}

Top Comments:
${comments.join('\n')}
`;

  console.log(`[generateSummary] Generating summary for title "${title.slice(0,50)}..." with ${comments.length} comments.`);
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4', // Consider 'gpt-3.5-turbo' for cost/speed
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content;
    if (content) {
      const trimmedContent = content.trim();
      if (trimmedContent) {
        console.log(`[generateSummary] Successfully generated summary for "${title.slice(0,50)}...": "${trimmedContent.slice(0,70)}..."`);
        return trimmedContent;
      } else {
        console.log(`[generateSummary] OpenAI returned empty or whitespace content for title "${title.slice(0,50)}...".`);
        return null;
      }
    } else {
      console.log(`[generateSummary] OpenAI response did not contain expected content structure for title "${title.slice(0,50)}...". Full response choice:`, JSON.stringify(response.choices[0], null, 2));
      return null;
    }
  } catch (error: unknown) {
    let errorMessage = 'An unknown error occurred during OpenAI API call';
    let errorDetails: unknown = null;

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }

    if (typeof error === 'object' && error !== null) {
      const potentialApiError = error as {
        response?: {
          data?: unknown;
          status?: number;
        };
        message?: string;
      };

      if (potentialApiError.response && typeof potentialApiError.response.data !== 'undefined') {
        errorDetails = potentialApiError.response.data;
        if (potentialApiError.response.status) {
          errorMessage = `OpenAI API Error (Status ${potentialApiError.response.status}): ${errorMessage}`;
        }
      }
      if ((errorMessage === 'An unknown error occurred during OpenAI API call' || (error instanceof Error && errorMessage === error.message)) && potentialApiError.message) {
          errorMessage = potentialApiError.message;
      }
    }

    console.error(`❌ [generateSummary] Error calling OpenAI API for title "${title.slice(0,50)}...":`, errorMessage);
    if (errorDetails !== null) {
      try {
        console.error("❌ [generateSummary] OpenAI API Error Details:", JSON.stringify(errorDetails, null, 2));
      } catch { // Correctly prefixed with underscore
        console.error("❌ [generateSummary] Could not stringify OpenAI API Error Details. Raw details:", errorDetails);
      }
    } else if (!(error instanceof Error) && typeof error !== 'string') {
        console.error("❌ [generateSummary] Raw error object:", error);
    }
    return null;
  }
}

export async function GET(req: Request) {
  console.log('🚀 [/api/ingest-trends] CRON Job Invocation Received.');
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    console.warn('⚠️ [/api/ingest-trends] Unauthorized attempt.');
    return new Response('Unauthorized', { status: 401 });
  }

  console.log('✅ [/api/ingest-trends] Authorization successful. Route execution started.');

  if (!redditClientId || !redditClientSecret || !redditUsername || !redditPassword) {
    console.error('❌ [/api/ingest-trends] Missing Reddit credentials.');
    return NextResponse.json({ success: false, error: 'Missing Reddit credentials.' }, { status: 500 });
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ [/api/ingest-trends] Missing OpenAI API Key.');
    return NextResponse.json({ success: false, error: 'Missing OpenAI API Key.' }, { status: 500 });
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ [/api/ingest-trends] Missing Supabase credentials.');
    return NextResponse.json({ success: false, error: 'Missing Supabase credentials.' }, { status: 500 });
  }

  console.log('🔧 [/api/ingest-trends] Initializing Reddit client (snoowrap)...');
  const r = new snoowrap({
    userAgent,
    clientId: redditClientId,
    clientSecret: redditClientSecret,
    username: redditUsername,
    password: redditPassword,
  });
  console.log('👍 [/api/ingest-trends] Reddit client initialized.');

  const userSubreddits = await getActiveSubreddits();
  if (userSubreddits.length === 0) {
    console.log('ℹ️ [/api/ingest-trends] No active subreddits found to process. Exiting.');
    return NextResponse.json({ success: true, message: "No active subreddits to process.", inserted: [], failed: [] });
  }

  const insertedPostTitlesForSubreddits: Record<string, string[]> = {};
  const failedSubredditsProcessing: string[] = [];
  let totalPostsProcessed = 0;
  let totalSummariesGenerated = 0;

  console.log(`⏳ [/api/ingest-trends] Starting processing for ${userSubreddits.length} user-subreddit pairs.`);
  for (const { subreddit, user_id } of userSubreddits) {
    try {
      console.log(`🔄 [Main Loop] Processing /r/${subreddit} for user ${user_id}`);
      const topPostsFromReddit = await r.getSubreddit(subreddit).getTop({ time: 'day', limit: 5 });
      console.log(`🔍 [Main Loop] Fetched ${topPostsFromReddit.length} top posts from /r/${subreddit}.`);

      if (!insertedPostTitlesForSubreddits[subreddit]) {
        insertedPostTitlesForSubreddits[subreddit] = [];
      }

      for (const post of topPostsFromReddit.slice(0, 3)) {
        totalPostsProcessed++;
        console.log(`📄 [Main Loop] Processing post: "${post.title.slice(0,70)}..." (ID: ${post.id}) from /r/${subreddit}`);

        const topComments = await getTopComments(post, 3);
        console.log(`💬 [Main Loop] For post "${post.title.slice(0,50)}...", got ${topComments.length} formatted top comments.`);

        const summary = await generateSummary(post.title, topComments);

        console.log(`💾 [DB Insert] Attempting to insert post "${post.title.slice(0,50)}..." for /r/${subreddit}, user ${user_id}. Summary present: ${!!summary}`);
        const { data: insertedRecord, error: insertError } = await supabase
          .from('user_posts')
          .insert([
            {
              user_id,
              subreddit,
              title: post.title,
              url: post.url,
              score: post.score,
              num_comments: post.num_comments,
              created_utc: new Date(post.created_utc * 1000).toISOString(),
              summary: null,
            },
          ])
          .select('id')
          .single();

        if (insertError || !insertedRecord) {
          console.error(`❌ [DB Insert] Failed for post "${post.title.slice(0,50)}..." of /r/${subreddit}:`, insertError?.message || 'No data returned from insert');
          continue;
        }
        console.log(`✅ [DB Insert] Successfully inserted post, new record ID: ${insertedRecord.id}`);

        if (summary) {
          totalSummariesGenerated++;
          console.log(`🔄 [DB Update] Attempting to update post ID ${insertedRecord.id} with summary: "${summary.slice(0,70)}..."`);
          const { error: updateError } = await supabase
            .from('user_posts')
            .update({ summary: summary })
            .eq('id', insertedRecord.id);

          if (updateError) {
            console.error(`❌ [DB Update] Failed for post ID ${insertedRecord.id}:`, updateError.message);
          } else {
            console.log(`✅ [DB Update] Successfully updated post ID ${insertedRecord.id} with summary.`);
          }
        } else {
          console.log(`ℹ️ [DB Update] No summary generated for post "${post.title.slice(0,50)}..." (ID: ${insertedRecord.id}). Skipping update.`);
        }
        insertedPostTitlesForSubreddits[subreddit].push(post.title.slice(0, 50) + '...');
      }
    } catch (err: unknown) {
      let errorMessage = `An unknown error occurred during processing /r/${subreddit} for user ${user_id}`;
      let errorStack: string | undefined = undefined;

      if (err instanceof Error) {
        errorMessage = err.message;
        errorStack = err.stack;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }

      console.warn(`❌ [Main Loop Error] Failed processing /r/${subreddit} for user ${user_id}:`, errorMessage);
      if (errorStack) {
          console.warn("Stack trace:", errorStack);
      } else if (!(err instanceof Error) && typeof err !== 'string') {
          console.warn("Raw error object for subreddit processing:", err);
      }

      if (!failedSubredditsProcessing.includes(subreddit)) {
        failedSubredditsProcessing.push(subreddit);
      }
    }
  }

  console.log('🏁 [/api/ingest-trends] Processing finished.');
  console.log(`📊 Stats: Total posts aimed to process: ${totalPostsProcessed}, Total summaries generated: ${totalSummariesGenerated}`);
  return NextResponse.json({
    success: true,
    message: "Ingestion process completed.",
    processedSubreddits: Object.keys(insertedPostTitlesForSubreddits),
    postsIngestedBySubreddit: insertedPostTitlesForSubreddits,
    failedSubreddits: failedSubredditsProcessing,
    stats: {
        totalPostsProcessed,
        totalSummariesGenerated
    }
  });
}

export const config = {
  runtime: 'nodejs',
};