import { NextResponse } from 'next/server';

const openaiKey = process.env.OPENAI_API_KEY;
const openaiOrg = process.env.OPENAI_ORG_ID;
const redditUrl = 'https://www.reddit.com/r/Entrepreneur/top.json?limit=5&t=day';
const openAIUrl = 'https://api.openai.com/v1/chat/completions';

// --- Updated User-Agent ---
// IMPORTANT: Replace placeholders with your actual info for better compliance.
// Format: <platform>:<app ID>:<version string> (by /u/YourUsername or contact@yourdomain.com)
// Example: 'web:Nichetracker:v1.1 (by /u/YourRedditUsername)'
// Example: 'server:com.yourdomain.nichetracker:v1.1 (contact: admin@yourdomain.com)'
// Using a generic browser-like one can sometimes work too if the specific one gets blocked, but try the specific one first.
const userAgent = 'web:Nichetracker:v1.0 (contact: baris.mola@googlemail.com)'; // <-- *** REPLACE WITH YOUR DETAILS ***

type RedditPost = {
  data: {
    title: string;
  };
};

// Setting Vercel Edge function configuration (optional but can sometimes help with network)
// export const config = {
//   runtime: 'edge', // or 'nodejs' (default)
// };


export async function GET() {
  console.log("✅ [/api/ingest-trends] Route execution started.");
  console.log("🔐 ENV Check:");
  console.log(` - OPENAI_API_KEY set: ${!!openaiKey}`);
  console.log(` - OPENAI_ORG_ID set: ${!!openaiOrg}`);

  if (!openaiKey) {
    console.error("❌ FATAL: Missing OpenAI API key environment variable.");
    return NextResponse.json({ success: false, error: 'Server configuration error: Missing API key.' }, { status: 500 });
  }

  let firstRedditTitle = ''; // Initialize empty

  // --- Step 1: Fetch Reddit posts with Updated User-Agent and Error Handling ---
  try {
    console.log(`[Reddit Fetch] Fetching top posts from ${redditUrl}`);
    const redditRes = await fetch(redditUrl, {
        headers: {
            // Using the updated, more specific User-Agent
            'User-Agent': userAgent
        }
    });

    if (!redditRes.ok) {
      console.error(`[Reddit Fetch] Failed. Status: ${redditRes.status}, StatusText: ${redditRes.statusText}`);
      const errorBody = await redditRes.text().catch(() => 'Could not read error body');
      // Log only a preview of the body, it might be large HTML
      console.error(`[Reddit Fetch] Error Body Preview: ${errorBody.slice(0, 500)}...`);
      // --- Stop Execution on Reddit Failure ---
      return NextResponse.json({
          success: false,
          error: `Failed to fetch data from Reddit. Status: ${redditRes.status}`,
          details: `Reddit API returned non-OK status. Check logs for error body preview.`
        }, { status: 502 }); // 502 Bad Gateway: Server acting as gateway got invalid response from upstream server
    }

    // If Reddit fetch is OK, proceed to parse
    const redditData = await redditRes.json();
    const posts = redditData?.data?.children?.map((post: RedditPost) => post.data?.title) || [];

    if (posts.length > 0) {
        // Basic sanitization - remove potential HTML/JSON breaking chars from title
        firstRedditTitle = posts[0].replace(/[\"<>]/g, '').trim();
        if (!firstRedditTitle) {
            console.warn("[Reddit Fetch] First post title was empty after sanitization. Cannot proceed.");
             return NextResponse.json({ success: false, error: 'Failed to extract a valid title from Reddit posts.' }, { status: 500 });
        }
        console.log(`[Reddit Fetch] Success. Using title: "${firstRedditTitle}"`);
    } else {
        console.error("[Reddit Fetch] Success, but no posts found in the response data.");
        // --- Stop Execution if No Posts Found ---
        return NextResponse.json({ success: false, error: 'No relevant posts found on Reddit.' }, { status: 404 }); // 404 Not Found might be appropriate
    }

  } catch (err) {
    // Catches network errors during fetch or JSON parsing errors for the Reddit response
    console.error("[Reddit Fetch] Unexpected error during fetch or JSON parse:", err);
     // --- Stop Execution on Unexpected Reddit Error ---
    return NextResponse.json({
        success: false,
        error: 'Server error while fetching or parsing data from Reddit.',
        details: err instanceof Error ? err.message : String(err)
    }, { status: 500 });
  }

  // If we reach here, Reddit fetch was successful and we have a title.

  // --- Step 2: Prepare and Send OpenAI Request ---
  const prompt = `You are a trend researcher. Analyze this phrase and return ONLY a valid JSON object (no preamble, no explanation) with this exact structure:\n\n{\n  "title": "a short catchy trend title",\n  "description": "what the trend is and why it’s interesting (1-2 sentences)",\n  "category": "one of: travel, health, finance, tech",\n  "ideas": ["bullet point 1 (blog, YouTube, etc.)", "bullet point 2"]\n}\n\nTrend keyword: "${firstRedditTitle}"`;

  const payload = {
    model: 'gpt-3.5-turbo',
    // Consider uncommenting if using gpt-3.5-turbo-1106 or later and want to enforce JSON output
    // response_format: { type: "json_object" },
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${openaiKey}`,
    'User-Agent': userAgent, // Also send the User-Agent to OpenAI
    ...(openaiOrg ? { 'OpenAI-Organization': openaiOrg } : {}),
  };

  console.log(`[OpenAI Request] Preparing to send to ${openAIUrl}`);
  // Avoid logging full headers in production if sensitive, Vercel masks Authorization but good practice.
  // console.log(`[OpenAI Request] Headers: ${JSON.stringify(headers)}`);
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
      // Log the FULL body text if it's a failure (could be Cloudflare HTML, OpenAI error JSON, etc.)
      console.error(`[OpenAI Response] FULL Body Text (Failure): \n---\n${bodyText}\n---`);
      return NextResponse.json({
        success: false,
        error: `OpenAI API Error: ${response.status} ${response.statusText}`,
        details: `Received non-JSON response or error from OpenAI. Check logs for full body. Preview: ${bodyText.slice(0, 500)}...`
       }, { status: 502 }); // 502 Bad Gateway: Upstream error
    }

    // Attempt to parse the successful response body as JSON
    try {
      const jsonResponse = JSON.parse(bodyText);

      // Basic validation of the expected OpenAI structure
      if (!jsonResponse.choices || !jsonResponse.choices[0] || !jsonResponse.choices[0].message || !jsonResponse.choices[0].message.content) {
          console.error('[OpenAI Response] Invalid/Unexpected JSON structure received:', JSON.stringify(jsonResponse));
          return NextResponse.json({ success: false, error: 'Invalid response structure from OpenAI API' }, { status: 500 });
      }

      // Attempt to parse the actual trend JSON *within* the content string
      const contentString = jsonResponse.choices[0].message.content;
      try {
          const contentJson = JSON.parse(contentString);
          console.log("[OpenAI Response] Successfully parsed OpenAI JSON content.");
          // *** SUCCESS *** Return the parsed trend data
          return NextResponse.json({ success: true, data: contentJson }, { status: 200 });

      } catch (contentParseError) {
          console.error("[OpenAI Response] Failed to parse content JSON within the 'message.content' field.");
          console.error("[OpenAI Response] Content string was:", contentString);
          console.error("[OpenAI Response] Content Parse Error:", contentParseError);
          return NextResponse.json({
              success: false,
              error: 'Failed to parse JSON content from OpenAI response message',
              rawContent: contentString // Send raw content back for debugging frontend if needed
          }, { status: 500 });
      }

    } catch (parseError) {
      // This catches errors if bodyText itself (from a 2xx response) is not valid JSON
      console.error('[OpenAI Response] Failed to parse response body as JSON, despite 2xx status.');
      console.error(`[OpenAI Response] FULL Body Text (JSON Parse Failure): \n---\n${bodyText}\n---`);
      console.error('[OpenAI Response] Parse Error:', parseError);
      return NextResponse.json({
          success: false,
          error: 'Failed to parse JSON response from OpenAI (unexpected format)',
          details: `Check logs for full body text. Preview: ${bodyText.slice(0, 500)}...`
      }, { status: 500 });
    }

  } catch (networkError) {
    // Catches fetch() specific errors (DNS, connection timeout, etc.) for the OpenAI call
    console.error('[OpenAI Request] Network or Fetch Error:', networkError);
    return NextResponse.json({
      success: false,
      error: 'Network error communicating with OpenAI API',
      details: networkError instanceof Error ? networkError.message : String(networkError),
     }, { status: 504 }); // 504 Gateway Timeout is often suitable here
  }
}