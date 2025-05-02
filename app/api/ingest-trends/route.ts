import { NextResponse } from 'next/server';
import snoowrap from 'snoowrap';
import { createClient, SupabaseClient } from '@supabase/supabase-js'; // Import SupabaseClient type

// --- Supabase Client ---
const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Environment Variables ---
const openaiKey = process.env.OPENAI_API_KEY;
const openaiOrg = process.env.OPENAI_ORG_ID;
const redditClientId = process.env.REDDIT_CLIENT_ID;
const redditClientSecret = process.env.REDDIT_CLIENT_SECRET;
const redditUsername = process.env.REDDIT_USERNAME;
const redditPassword = process.env.REDDIT_PASSWORD;

// --- Constants ---
const openAIUrl = 'https://api.openai.com/v1/chat/completions';
// Ensure userAgent is defined correctly
const userAgent = 'web:Nichetracker:v1.1 (contact: baris.mola@gmail.com)';

// --- Helper Function: Get Active Subreddits ---
async function getActiveSubreddits(): Promise<string[]> {
  const { data, error } = await supabase
    .from('sources')
    .select('subreddit')
    .eq('is_active', true);

  if (error || !data) {
    console.error('❌ Failed to fetch subreddits from Supabase:', error);
    // Consider returning an empty array or throwing an error if this is critical
    return ['Entrepreneur']; // Fallback or adjust as needed
  }

  return data.map((row) => row.subreddit);
}

// --- Helper Function: Get Error Message Safely ---
function getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === 'string') {
        return error;
    }
    // Attempt to stringify other types, but provide a fallback
    try {
        return JSON.stringify(error);
    } catch {
        return 'An unknown error occurred';
    }
}

// --- Type Definition for Processing Result ---
type ProcessResult =
    | { subreddit: string; status: 'success' }
    | { subreddit: string; status: 'failed'; error: string }; // Store error message as string

// --- Helper Function: Process a Single Subreddit ---
async function processSubreddit(
    subreddit: string,
    redditClient: snoowrap,
    supabaseClient: SupabaseClient // Use imported type for better type checking
): Promise<ProcessResult> { // Return the defined ProcessResult type
    let redditTitle = '';
    const logPrefix = `[/r/${subreddit}]`;

    try {
        // 1. Fetch from Reddit
        console.log(`${logPrefix} [Reddit Fetch] Trying...`);
        const topPosts = await redditClient.getSubreddit(subreddit).getTop({ time: 'day', limit: 5 });
        // Ensure snoowrap types are installed (@types/snoowrap) if available, or handle potential type issues
        const posts = topPosts.map((post: any) => post.title); // Use any if type definitions are missing/incomplete

        if (!posts.length) {
            console.warn(`${logPrefix} [Reddit Fetch] No posts found.`);
            throw new Error('No posts found');
        }

        redditTitle = posts[0].replace(/["<>]/g, '').trim();
        if (!redditTitle) {
             console.warn(`${logPrefix} [Reddit Fetch] Empty or invalid title.`);
             throw new Error('Empty or invalid title after cleaning');
        }
        console.log(`${logPrefix} [Reddit Fetch] Found title: "${redditTitle}"`);

    } catch (err: unknown) { // Catch as unknown
        const errorMessage = getErrorMessage(err);
        console.warn(`${logPrefix} [Reddit Fetch] Failed:`, errorMessage);
        // Throw a new error to reject the promise, ensuring it's caught later
        throw new Error(`Reddit fetch failed: ${errorMessage}`);
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
        'User-Agent': userAgent, // Use the defined userAgent constant
        ...(openaiOrg ? { 'OpenAI-Organization': openaiOrg } : {}),
    };

    try {
        console.log(`${logPrefix} [OpenAI] Sending request...`);
        const response = await fetch(openAIUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(payload),
        });

        const bodyText = await response.text(); // Read text first for debugging

        if (!response.ok) {
            console.error(`${logPrefix} [OpenAI] Request failed: ${response.status}, Body: ${bodyText}`);
            throw new Error(`OpenAI API request failed with status ${response.status}`);
        }

        // Parse the main response JSON
        const jsonResponse = JSON.parse(bodyText);
        // Extract the content string which *should* be JSON
        const contentString = jsonResponse.choices?.[0]?.message?.content;

        if (!contentString) {
            console.error(`${logPrefix} [OpenAI] Missing content string from response.`);
            throw new Error('OpenAI response missing content string');
        }

        console.log(`${logPrefix} [OpenAI] Received content string.`);
        // Parse the nested JSON string from the content
        const contentJson = JSON.parse(contentString);

         // Basic validation of the expected structure from OpenAI
        if (!contentJson.title || !contentJson.description || !contentJson.category || !Array.isArray(contentJson.ideas)) {
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
                ideas: contentJson.ideas, // Assumes 'ideas' is a text[] or jsonb column in Supabase
                source: 'reddit',
                keyword: redditTitle, // Original title from Reddit
                source_subreddit: subreddit,
            }
        ]);

        if (insertError) {
            console.error(`${logPrefix} [Supabase] Insert error:`, insertError);
            // Throw specific error message for easier debugging
            throw new Error(`Supabase insert failed: ${insertError.message}`);
        }

        console.log(`✅ ${logPrefix} Inserted trend successfully.`);
        // Fulfill the promise with success status
        return { subreddit, status: 'success' };

    } catch (err: unknown) { // Catch as unknown
         const errorMessage = getErrorMessage(err);
         console.error(`${logPrefix} [Processing Error] Failed during OpenAI/Supabase step:`, errorMessage);
         // Reject the promise by throwing the error again
         throw new Error(`Processing failed: ${errorMessage}`);
    }
}


// --- Main API Route Handler (GET) ---
export async function GET(req: Request) {
    // 1. Authorization Check
    if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new Response('Unauthorized', { status: 401 });
    }

    console.log("✅ [/api/ingest-trends] Route execution started.");

    // 2. Check for essential environment variables
    if (!openaiKey) {
        console.error("❌ FATAL: Missing OpenAI API key.");
        return NextResponse.json({ success: false, error: 'Missing OpenAI API key.' }, { status: 500 });
    }
    if (!redditClientId || !redditClientSecret || !redditUsername || !redditPassword) {
        console.error("❌ FATAL: Missing Reddit credentials.");
        return NextResponse.json({ success: false, error: 'Missing Reddit credentials.' }, { status: 500 });
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.error("❌ FATAL: Missing Supabase credentials.");
        return NextResponse.json({ success: false, error: 'Missing Supabase credentials.' }, { status: 500 });
    }


    try {
        // 3. Initialize API Clients ONCE
        const r = new snoowrap({
            userAgent: userAgent, // Correctly pass the user agent
            clientId: redditClientId,
            clientSecret: redditClientSecret,
            username: redditUsername,
            password: redditPassword,
        });

        // Supabase client is already initialized globally

        // 4. Get list of subreddits to process
        const subreddits = await getActiveSubreddits();
        if (!subreddits.length) {
             console.warn("[Setup] No active subreddits found to process.");
             return NextResponse.json({ success: true, inserted: [], failed: [] }); // Nothing to do
        }
        console.log(`[Setup] Found ${subreddits.length} active subreddits to process.`);

        // 5. Create an array of promises, one for each subreddit processing task
        const processingPromises = subreddits.map(subreddit =>
            processSubreddit(subreddit, r, supabase) // Pass initialized clients
               // Add a .catch() HERE. This is crucial.
               // It catches errors *thrown* by processSubreddit and converts the rejected promise
               // into a *fulfilled* promise containing the failure details.
               // This prevents Promise.allSettled from seeing it as 'rejected'.
               .catch((error: unknown): ProcessResult => { // Catch unknown, return ProcessResult
                  const errorMessage = getErrorMessage(error);
                  console.error(`[Catch Block /r/${subreddit}] Caught error during processing: ${errorMessage}`);
                  // Return the failure structure
                  return {
                      subreddit: subreddit,
                      status: 'failed' as const, // Use 'as const' for type safety
                      error: errorMessage // Store the extracted message
                  };
               })
        );

        // 6. Execute all promises in parallel and wait for ALL to settle
        console.log('[Execution] Starting parallel processing...');
        // Explicitly type the results for better clarity
        const results: PromiseSettledResult<ProcessResult>[] = await Promise.allSettled(processingPromises);
        console.log('[Execution] Parallel processing finished.');

        // 7. Process the results from Promise.allSettled
        const insertedTrends: string[] = [];
        const failedSubreddits: { subreddit: string; reason: string }[] = [];

        results.forEach((result, index) => {
            // Get the corresponding subreddit name using the index
            const subreddit = subreddits[index];

            if (result.status === 'fulfilled') {
                // The promise resolved successfully. This includes cases where
                // processSubreddit succeeded AND cases where it failed but was caught
                // by the .catch() block added in step 5.
                if (result.value.status === 'success') {
                    insertedTrends.push(subreddit);
                    // Success already logged inside processSubreddit
                } else {
                    // This means status is 'failed', indicating an error caught by the .catch()
                    failedSubreddits.push({ subreddit: subreddit, reason: result.value.error });
                    // Error details already logged by the .catch() block or inside processSubreddit
                }
            } else {
                // Status is 'rejected'. This should ideally NOT happen anymore because of the .catch()
                // added in the .map(). But handle defensively just in case.
                const reason = getErrorMessage(result.reason);
                failedSubreddits.push({ subreddit: subreddit, reason: reason });
                console.error(`❌ Promise rejected UNEXPECTEDLY for /r/${subreddit}:`, reason);
            }
        });

        // 8. Log completion summary
        console.log(`[Completion] Successfully inserted trends for: ${insertedTrends.length} subreddits.`);
        if (failedSubreddits.length > 0) {
            console.warn(`[Completion] Failed to process trends for: ${failedSubreddits.length} subreddits (${failedSubreddits.map(f => f.subreddit).join(', ')})`);
        }

        // 9. Return the final aggregated results
        return NextResponse.json({
            success: true, // Indicates the API route handler itself completed
            inserted: insertedTrends,
            failed: failedSubreddits.map(f => f.subreddit), // Return list of names
            // failedDetails: failedSubreddits // Optional: return full failure details if needed by client
        });

    } catch (error: unknown) {
        // Catch any unexpected errors during setup (e.g., snoowrap init, getActiveSubreddits)
        console.error("❌ UNEXPECTED FATAL ERROR in GET handler:", getErrorMessage(error));
        return NextResponse.json({ success: false, error: 'An unexpected server error occurred.' }, { status: 500 });
    }
}

// --- Vercel Edge/Node.js Runtime Configuration ---
export const config = {
  runtime: 'nodejs', // Ensure Node.js runtime for libraries like snoowrap
  // Consider increasing maxDuration if on a paid Vercel plan
  // maxDuration: 30, // Example: 30 seconds (Requires Pro plan)
};