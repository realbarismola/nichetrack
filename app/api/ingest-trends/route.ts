import { NextResponse } from 'next/server';
import snoowrap from 'snoowrap'; // Import snoowrap

// --- Environment Variable Checks ---
const openaiKey = process.env.OPENAI_API_KEY;
const openaiOrg = process.env.OPENAI_ORG_ID;
const redditClientId = process.env.REDDIT_CLIENT_ID;
const redditClientSecret = process.env.REDDIT_CLIENT_SECRET;
const redditUsername = process.env.REDDIT_USERNAME;
const redditPassword = process.env.REDDIT_PASSWORD;

const openAIUrl = 'https://api.openai.com/v1/chat/completions';
const userAgent = 'web:Nichetracker:v1.1 (contact: baris.mola@gmail.com)'; // <-- *** REPLACE WITH YOUR DETAILS ***

type RedditPostData = { // Define a type for the expected data structure from snoowrap
    title: string;
    // Add other fields if needed later (score, url, etc.)
}

export async function GET() {
  console.log("✅ [/api/ingest-trends] Route execution started.");
  console.log("🔐 ENV Check:");
  console.log(` - OPENAI_API_KEY set: ${!!openaiKey}`);
  console.log(` - OPENAI_ORG_ID set: ${!!openaiOrg}`);
  console.log(` - REDDIT_CLIENT_ID set: ${!!redditClientId}`);
  console.log(` - REDDIT_CLIENT_SECRET set: ${!!redditClientSecret ? 'true (hidden)' : 'false'}`); // Don't log secret itself
  console.log(` - REDDIT_USERNAME set: ${!!redditUsername}`);
  console.log(` - REDDIT_PASSWORD set: ${!!redditPassword ? 'true (hidden)' : 'false'}`); // Don't log password

  // --- Check for Missing Credentials ---
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
    // Disable request batching if needed, sometimes helps with serverless
    // r.config({ requestDelay: 1000, continueAfterRatelimitError: true });

    console.log("[Reddit Fetch] Attempting authenticated fetch for top posts...");
    // Fetch top posts - snoowrap handles authentication automatically
    const topPosts: snoowrap.Listing<snoowrap.Submission> = await r.getSubreddit('Entrepreneur').getTop({ time: 'day', limit: 5 });

    // Extract titles (snoowrap returns Submission objects)
    const posts: string[] = topPosts.map((post: snoowrap.Submission) => post.title);

    if (posts.length > 0) {
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

  } catch (redditError: any) { // Catch potential errors from snoowrap
    console.error("[Reddit Fetch/Auth] Authenticated fetch failed:", redditError);
    // Log specific details if available (e.g., rate limit, auth error)
    if (redditError.statusCode) {
        console.error(`[Reddit Fetch/Auth] Status Code: ${redditError.statusCode}`);
    }
    return NextResponse.json({
        success: false,
        error: 'Failed to fetch data from Reddit via authenticated API.',
        details: redditError.message || 'Unknown Reddit API error'
    }, { status: 502 }); // 502 might indicate upstream failure (Reddit)
  }

  // --- Step 2: Prepare and Send OpenAI Request (No changes needed here) ---
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

  // --- Step 3: Call OpenAI API and Handle Response (No changes needed here) ---
  try {
    const response = await fetch(openAIUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });
    // ... (Rest of the OpenAI response handling remains the same as before) ...
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
  } catch (networkError) {
    console.error('[OpenAI Request] Network or Fetch Error:', networkError);
    return NextResponse.json({
      success: false, error: 'Network error communicating with OpenAI API', details: networkError instanceof Error ? networkError.message : String(networkError),
     }, { status: 504 });
  }
}