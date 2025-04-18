import { NextResponse } from 'next/server';
import snoowrap from 'snoowrap'; // Import snoowrap
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);


// --- Environment Variable Checks ---
const openaiKey = process.env.OPENAI_API_KEY;
const openaiOrg = process.env.OPENAI_ORG_ID;
const redditClientId = process.env.REDDIT_CLIENT_ID;
const redditClientSecret = process.env.REDDIT_CLIENT_SECRET;
const redditUsername = process.env.REDDIT_USERNAME;
const redditPassword = process.env.REDDIT_PASSWORD;

const openAIUrl = 'https://api.openai.com/v1/chat/completions';
// IMPORTANT: Replace placeholders with your actual contact info
const userAgent = 'web:Nichetracker:v1.1 (contact: baris.mola@gmail.com)'; // <-- *** REPLACE WITH YOUR DETAILS ***

// No longer needed as it was unused
// type RedditPostData = {
//     title: string;
// }

export async function GET(req: Request) {
  // ✅ Cron job authorization check
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  console.log("✅ [/api/ingest-trends] Route execution started.");
  console.log("✅ [/api/ingest-trends] Route execution started.");
  console.log("🔐 ENV Check:");
  console.log(` - OPENAI_API_KEY set: ${!!openaiKey}`);
  console.log(` - OPENAI_ORG_ID set: ${!!openaiOrg}`); // Okay if false/not set
  console.log(` - REDDIT_CLIENT_ID set: ${!!redditClientId}`);
  console.log(` - REDDIT_CLIENT_SECRET set: ${!!redditClientSecret ? 'true (hidden)' : 'false'}`);
  console.log(` - REDDIT_USERNAME set: ${!!redditUsername}`);
  console.log(` - REDDIT_PASSWORD set: ${!!redditPassword ? 'true (hidden)' : 'false'}`);

  // --- Check for Missing Critical Credentials ---
  if (!openaiKey) {
    console.error("❌ FATAL: Missing OpenAI API key environment variable.");
    return NextResponse.json({ success: false, error: 'Server configuration error: Missing OpenAI key.' }, { status: 500 });
  }
  if (!redditClientId || !redditClientSecret || !redditUsername || !redditPassword) {
     console.error("❌ FATAL: Missing Reddit credentials environment variables.");
     return NextResponse.json({ success: false, error: 'Server configuration error: Missing Reddit credentials.' }, { status: 500 });
  }

  let firstRedditTitle = '';

  // --- Step 1: Fetch Reddit posts using snoowrap (Authenticated) ---
  try {
    console.log("[Reddit Auth] Initializing snoowrap...");
    // Initialize snoowrap with credentials
    const r = new snoowrap({
      userAgent: userAgent,
      clientId: redditClientId,
      clientSecret: redditClientSecret,
      username: redditUsername,
      password: redditPassword,
    });

    console.log("[Reddit Fetch] Attempting authenticated fetch for top posts...");
    // Fetch top posts - snoowrap handles authentication automatically
    const topPosts: snoowrap.Listing<snoowrap.Submission> = await r.getSubreddit('Entrepreneur').getTop({ time: 'day', limit: 5 });

    // Extract titles (snoowrap returns Submission objects)
    const posts: string[] = topPosts.map((post: snoowrap.Submission) => post.title);

    if (posts.length > 0) {
        // Basic sanitization
        firstRedditTitle = posts[0].replace(/[\"<>]/g, '').trim();
        if (!firstRedditTitle) {
            console.warn("[Reddit Fetch] First post title was empty after sanitization. Cannot proceed.");
             return NextResponse.json({ success: false, error: 'Failed to extract a valid title from Reddit posts.' }, { status: 500 });
        }
        console.log(`[Reddit Fetch] Success (Authenticated). Using title: "${firstRedditTitle}"`);
    } else {
        console.error("[Reddit Fetch] Success (Authenticated), but no posts found in the response data.");
        return NextResponse.json({ success: false, error: 'No relevant posts found on Reddit via API.' }, { status: 404 });
    }

  // --- Catch block updated to use 'unknown' ---
  } catch (redditError: unknown) {
    console.error("[Reddit Fetch/Auth] Authenticated fetch failed:", redditError);

    let details = 'Unknown Reddit API error';
    let statusCode = 502; // Default status code for upstream failure

    // Safely check the type and properties of the error
    if (typeof redditError === 'object' && redditError !== null) {
        // Check for snoowrap's potential statusCode property
        if ('statusCode' in redditError && typeof redditError.statusCode === 'number') {
            console.error(`[Reddit Fetch/Auth] Status Code: ${redditError.statusCode}`);
            // Use Reddit's status code if available and seems like a client/server error
             if (redditError.statusCode >= 400) {
                 statusCode = redditError.statusCode;
             }
        }
        // Check for a standard message property
        if ('message' in redditError && typeof redditError.message === 'string') {
             details = redditError.message;
        }
        // Add more specific checks here if needed based on snoowrap error types
    } else if (typeof redditError === 'string') {
        details = redditError; // Handle if the error itself is just a string
    }

    return NextResponse.json({
        success: false,
        error: 'Failed to fetch data from Reddit via authenticated API.',
        details: details
    }, { status: statusCode });
  }
  // ----------------------------------------------

  // --- Step 2: Prepare and Send OpenAI Request ---
  const prompt = `You are a trend researcher. Analyze this phrase and return ONLY a valid JSON object (no preamble, no explanation) with this exact structure:\n\n{\n  "title": "a short catchy trend title",\n  "description": "what the trend is and why it’s interesting (1-2 sentences)",\n  "category": "one of: travel, health, finance, tech",\n  "ideas": ["bullet point 1 (blog, YouTube, etc.)", "bullet point 2"]\n}\n\nTrend keyword: "${firstRedditTitle}"`;

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

  console.log(`[OpenAI Request] Preparing to send to ${openAIUrl}`);
  console.log(`[OpenAI Request] Payload: ${JSON.stringify(payload)}`);

  // --- Step 3: Call OpenAI API and Handle Response ---
  try {
    const response = await fetch(openAIUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    const bodyText = await response.text();
    const responseHeaders = Object.fromEntries(response.headers.entries());

    console.log(`[OpenAI Response] Status: ${response.status}`);
    console.log(`[OpenAI Response] Headers: ${JSON.stringify(responseHeaders)}`);

    if (!response.ok) {
      console.error(`[OpenAI Response] Request failed (Status: ${response.status}).`);
      console.error(`[OpenAI Response] FULL Body Text (Failure): \n---\n${bodyText}\n---`);
      return NextResponse.json({
        success: false,
        error: `OpenAI API Error: ${response.status} ${response.statusText}`,
        details: `Received non-JSON response or error from OpenAI. Check logs for full body. Preview: ${bodyText.slice(0, 500)}...`
       }, { status: 502 });
    }

    try {
      const jsonResponse = JSON.parse(bodyText);
      if (!jsonResponse.choices || !jsonResponse.choices[0] || !jsonResponse.choices[0].message || !jsonResponse.choices[0].message.content) {
          console.error('[OpenAI Response] Invalid/Unexpected JSON structure received:', JSON.stringify(jsonResponse));
          return NextResponse.json({ success: false, error: 'Invalid response structure from OpenAI API' }, { status: 500 });
      }
      const contentString = jsonResponse.choices[0].message.content;
      try {
          const contentJson = JSON.parse(contentString);
          console.log("[OpenAI Response] Successfully parsed OpenAI JSON content.");
          const { data, error } = await supabase.from('trends').insert([
            {
              title: contentJson.title,
              description: contentJson.description,
              category: contentJson.category,
              ideas: contentJson.ideas,
              source: 'reddit',
              keyword: firstRedditTitle,
            }
          ]);
          
          if (error) {
            console.error('❌ Supabase insert error:', error);
          } else {
            console.log('✅ Trend inserted into Supabase:', data);
          }
          return NextResponse.json({ success: true, data: contentJson }, { status: 200 });
      } catch (contentParseError) {
          console.error("[OpenAI Response] Failed to parse content JSON within the 'message.content' field.");
          console.error("[OpenAI Response] Content string was:", contentString);
          console.error("[OpenAI Response] Content Parse Error:", contentParseError);
          return NextResponse.json({
              success: false, error: 'Failed to parse JSON content from OpenAI response message', rawContent: contentString
          }, { status: 500 });
      }
    } catch (parseError) {
      console.error('[OpenAI Response] Failed to parse response body as JSON, despite 2xx status.');
      console.error(`[OpenAI Response] FULL Body Text (JSON Parse Failure): \n---\n${bodyText}\n---`);
      console.error('[OpenAI Response] Parse Error:', parseError);
      return NextResponse.json({
          success: false, error: 'Failed to parse JSON response from OpenAI (unexpected format)', details: `Check logs for full body text. Preview: ${bodyText.slice(0, 500)}...`
      }, { status: 500 });
    }
  } catch (networkError: unknown) { // Also use unknown for network errors
    console.error('[OpenAI Request] Network or Fetch Error:', networkError);
    let details = 'Unknown network error';
     if (networkError instanceof Error) {
         details = networkError.message;
     } else if (typeof networkError === 'string') {
         details = networkError;
     }
    return NextResponse.json({
      success: false, error: 'Network error communicating with OpenAI API', details: details,
     }, { status: 504 }); // 504 Gateway Timeout is often suitable here
  }
}