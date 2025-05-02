import { NextResponse } from 'next/server';
import snoowrap from 'snoowrap';
import { createClient } from '@supabase/supabase-js';

// --- Supabase Client (Keep as is) ---
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Environment Variables (Keep as is) ---
const openaiKey = process.env.OPENAI_API_KEY;
const openaiOrg = process.env.OPENAI_ORG_ID;
const redditClientId = process.env.REDDIT_CLIENT_ID;
const redditClientSecret = process.env.REDDIT_CLIENT_SECRET;
const redditUsername = process.env.REDDIT_USERNAME;
const redditPassword = process.env.REDDIT_PASSWORD;

// --- Constants (Keep as is) ---
const openAIUrl = 'https://api.openai.com/v1/chat/completions';
const userAgent = 'web:Nichetracker:v1.1 (contact: baris.mola@gmail.com)';

// --- getActiveSubreddits (Keep as is) ---
async function getActiveSubreddits(): Promise<string[]> {
  const { data, error } = await supabase
    .from('sources')
    .select('subreddit')
    .eq('is_active', true);

  if (error || !data) {
    console.error('❌ Failed to fetch subreddits from Supabase:', error);
    return ['Entrepreneur']; // Keep fallback or adjust as needed
  }

  return data.map((row) => row.subreddit);
}

// --- NEW: Function to process a single subreddit ---
async function processSubreddit(
    subreddit: string,
    redditClient: snoowrap, // Pass initialized client
    supabaseClient: typeof supabase // Pass initialized client
): Promise<{ subreddit: string; status: 'success' | 'failed'; error?: any }> {
    let redditTitle = '';
    const logPrefix = `[/r/${subreddit}]`;

    try {
        // 1. Fetch from Reddit
        console.log(`${logPrefix} [Reddit Fetch] Trying...`);
        const topPosts = await redditClient.getSubreddit(subreddit).getTop({ time: 'day', limit: 5 });
        const posts = topPosts.map((post) => post.title);

        if (!posts.length) {
            console.warn(`${logPrefix} [Reddit Fetch] No posts found.`);
            // Throw specific error for rejection handling
            throw new Error('No posts found');
        }

        redditTitle = posts[0].replace(/["<>]/g, '').trim();
        if (!redditTitle) {
             console.warn(`${logPrefix} [Reddit Fetch] Empty or invalid title.`);
             // Throw specific error for rejection handling
             throw new Error('Empty or invalid title after cleaning');
        }
        console.log(`${logPrefix} [Reddit Fetch] Found title: "${redditTitle}"`);

    } catch (err: any) {
        console.warn(`${logPrefix} [Reddit Fetch] Failed:`, err.message || err);
         // Throw error to make the promise reject
        throw new Error(`Reddit fetch failed: ${err.message || err}`);
    }

    // 2. Analyze with OpenAI
    const prompt = `You are a trend researcher. Analyze this phrase and return ONLY a valid JSON object (no preamble, no explanation) with this exact structure:\n\n{\n  "title": "a short catchy trend title",\n  "description": "what the trend is and why it’s interesting (1-2 sentences)",\n  "category": "one of: travel, health, finance, tech",\n  "ideas": ["bullet point 1 (blog, YouTube, etc.)", "bullet point 2"]\n}\n\nTrend keyword: "${redditTitle}"`;

    const payload = {
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
    };

    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
        'User-Agent': userAgent,
        ...(openaiOrg ? { 'OpenAI-Organization': openaiOrg } : {}),
    };

    try {
        console.log(`${logPrefix} [OpenAI] Sending request...`);
        const response = await fetch(openAIUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
        });

        const bodyText = await response.text(); // Read text first for better debugging

        if (!response.ok) {
            console.error(`${logPrefix} [OpenAI] Request failed: ${response.status}, Body: ${bodyText}`);
             // Throw specific error for rejection handling
            throw new Error(`OpenAI API request failed with status ${response.status}`);
        }

        const jsonResponse = JSON.parse(bodyText); // Parse after checking response.ok
        const contentString = jsonResponse.choices?.[0]?.message?.content;

        if (!contentString) {
            console.error(`${logPrefix} [OpenAI] Missing content string from response.`);
            // Throw specific error for rejection handling
            throw new Error('OpenAI response missing content string');
        }

        console.log(`${logPrefix} [OpenAI] Received content string.`);
        const contentJson = JSON.parse(contentString); // Parse the content string itself

         // Validate expected structure (basic check)
        if (!contentJson.title || !contentJson.description || !contentJson.category || !contentJson.ideas) {
            console.error(`${logPrefix} [OpenAI] Invalid JSON structure in content string:`, contentString);
            throw new Error('OpenAI returned invalid JSON structure');
        }

        // 3. Insert into Supabase
        console.log(`${logPrefix} [Supabase] Inserting trend...`);
        const { error: insertError } = await supabaseClient.from('trends').insert([
            {
                title: contentJson.title,
                description: contentJson.description,
                category: contentJson.category,
                ideas: contentJson.ideas,
                source: 'reddit',
                keyword: redditTitle, // Original title from Reddit
                source_subreddit: subreddit,
            }
        ]);

        if (insertError) {
            console.error(`${logPrefix} [Supabase] Insert error:`, insertError);
            // Throw specific error for rejection handling
            throw new Error(`Supabase insert failed: ${insertError.message}`);
        }

        console.log(`✅ ${logPrefix} Inserted trend successfully.`);
        return { subreddit, status: 'success' }; // Return success indicator

    } catch (err: any) {
         console.error(`${logPrefix} [Processing Error] Failed during OpenAI/Supabase step:`, err.message || err);
         // Ensure the error propagates to Promise.allSettled
         throw new Error(`Processing failed: ${err.message || err}`); // Re-throw or throw a new summarizing error
    }
}


// --- REFACTORED: GET Handler ---
export async function GET(req: Request) {
    // --- Auth Check (Keep as is) ---
    if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    console.log("✅ [/api/ingest-trends] Route execution started.");

    // --- Credential Checks (Keep as is) ---
    if (!openaiKey) {
        console.error("❌ FATAL: Missing OpenAI API key.");
        return NextResponse.json({ success: false, error: 'Missing OpenAI API key.' }, { status: 500 });
    }
    if (!redditClientId || !redditClientSecret || !redditUsername || !redditPassword) {
        console.error("❌ FATAL: Missing Reddit credentials.");
        return NextResponse.json({ success: false, error: 'Missing Reddit credentials.' }, { status: 500 });
    }

    // --- Initialize Clients ONCE ---
    const r = new snoowrap({
        userAgent: userAgent,
        clientId: redditClientId,
        clientSecret: redditClientSecret,
        username: redditUsername,
        password: redditPassword,
    });

    const subreddits = await getActiveSubreddits();
    console.log(`[Setup] Found ${subreddits.length} active subreddits to process.`);

    // --- Create Promises for each subreddit processing task ---
    const processingPromises = subreddits.map(subreddit =>
        processSubreddit(subreddit, r, supabase) // Pass initialized clients
           // Add a catch block HERE to prevent an unhandled rejection in processSubreddit
           // from stopping Promise.allSettled. Instead, return a structured error.
           .catch(error => ({
              subreddit: subreddit,
              status: 'failed' as const, // Type assertion
              error: error?.message || 'Unknown processing error'
           }))
    );


    // --- Execute all promises in parallel and wait for all to settle ---
    console.log('[Execution] Starting parallel processing...');
    const results = await Promise.allSettled(processingPromises);
    console.log('[Execution] Parallel processing finished.');

    // --- Process Results ---
    const insertedTrends: string[] = [];
    const failedSubreddits: { subreddit: string; reason: any }[] = [];

    results.forEach((result, index) => {
        const subreddit = subreddits[index]; // Get subreddit name from original list

        if (result.status === 'fulfilled') {
            // Check the status returned *from* processSubreddit
            // This handles cases where processSubreddit caught its own error but returned a failure object
             if (result.value.status === 'success') {
                insertedTrends.push(subreddit);
                // Optional: Log success here if not logged inside processSubreddit
            } else {
                 // This case handles errors caught within processSubreddit's .catch() block
                 failedSubreddits.push({ subreddit: subreddit, reason: result.value.error });
                 console.error(`❌ Processing failed for /r/${subreddit} (handled): ${result.value.error}`);
            }
        } else {
            // Status is 'rejected' - Should ideally be caught by the .catch in the map now
            // but good to handle just in case.
            failedSubreddits.push({ subreddit: subreddit, reason: result.reason?.message || result.reason || 'Unknown rejection reason' });
            console.error(`❌ Promise rejected for /r/${subreddit}:`, result.reason?.message || result.reason);
        }
    });

    console.log(`[Completion] Successfully inserted: ${insertedTrends.length}, Failed: ${failedSubreddits.length}`);

    // --- Return Combined Results ---
    return NextResponse.json({
        success: true, // Indicates the API route itself completed
        inserted: insertedTrends,
        failed: failedSubreddits.map(f => f.subreddit), // Just return names if details aren't needed client-side
        // failedDetails: failedSubreddits // Optionally return full details
    });
}

// --- Config (Keep as is) ---
export const config = {
  runtime: 'nodejs',
};