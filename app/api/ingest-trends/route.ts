import { NextResponse } from 'next/server';

const openaiKey = process.env.OPENAI_API_KEY;
const openaiOrg = process.env.OPENAI_ORG_ID;
const redditUrl = 'https://www.reddit.com/r/Entrepreneur/top.json?limit=5&t=day';
const openAIUrl = 'https://api.openai.com/v1/chat/completions';

// Define a User-Agent (Good Practice & helps avoid some simple bot blocks)
const userAgent = 'Nichetracker-API/1.0 (https://your-saas-domain.com)'; // Replace with your actual domain if possible

type RedditPost = {
  data: {
    title: string;
  };
};

export async function GET() {
  console.log("✅ [/api/ingest-trends] Route execution started.");
  console.log("🔐 ENV Check:");
  console.log(` - OPENAI_API_KEY set: ${!!openaiKey}`);
  console.log(` - OPENAI_ORG_ID set: ${!!openaiOrg}`);

  if (!openaiKey) {
    console.error("❌ FATAL: Missing OpenAI API key environment variable.");
    return NextResponse.json({ success: false, error: 'Server configuration error: Missing API key.' }, { status: 500 });
  }

  let firstRedditTitle = 'Default fallback title'; // Default in case Reddit fetch fails

  try {
    // 1. Fetch Reddit posts
    console.log(`[Reddit Fetch] Fetching top posts from ${redditUrl}`);
    const redditRes = await fetch(redditUrl, {
        headers: {
            // Some APIs are picky, mimic a browser slightly
            'User-Agent': userAgent
        }
    });

    if (!redditRes.ok) {
      console.error(`[Reddit Fetch] Failed. Status: ${redditRes.status}, StatusText: ${redditRes.statusText}`);
      // Try to get body text even on failure for clues
      const errorBody = await redditRes.text().catch(() => 'Could not read error body');
      console.error(`[Reddit Fetch] Error Body: ${errorBody.slice(0, 500)}...`);
      // Don't stop execution, proceed with the default title maybe? Or return error? Let's proceed for now.
      console.warn("[Reddit Fetch] Proceeding with default title due to fetch failure.");
    } else {
      const redditData = await redditRes.json();
      const posts = redditData?.data?.children?.map((post: RedditPost) => post.data?.title) || [];
      if (posts.length > 0) {
          // Basic sanitization - remove potential HTML/JSON breaking chars from title
          firstRedditTitle = posts[0].replace(/[\"<>]/g, '').trim();
          console.log(`[Reddit Fetch] Success. Using title: "${firstRedditTitle}"`);
      } else {
          console.warn("[Reddit Fetch] Success, but no posts found. Using default title.");
      }
    }

  } catch (err) {
    console.error("[Reddit Fetch] Unexpected error:", err);
    // Decide if you want to stop or continue with default title
    console.warn("[Reddit Fetch] Proceeding with default title due to unexpected error.");
     // Optional: return an error immediately if Reddit data is critical
     // return NextResponse.json({ success: false, error: 'Failed to fetch data from Reddit' }, { status: 502 });
  }


  // 2. Prepare OpenAI Request
  const prompt = `You are a trend researcher. Analyze this phrase and return ONLY a valid JSON object (no preamble, no explanation) with this exact structure:\n\n{\n  "title": "a short catchy trend title",\n  "description": "what the trend is and why it’s interesting (1-2 sentences)",\n  "category": "one of: travel, health, finance, tech",\n  "ideas": ["bullet point 1 (blog, YouTube, etc.)", "bullet point 2"]\n}\n\nTrend keyword: "${firstRedditTitle}"`;

  const payload = {
    model: 'gpt-3.5-turbo',
    // Ensure response is JSON - sometimes helpful, sometimes ignored by model
    // response_format: { type: "json_object" }, // Requires gpt-3.5-turbo-1106 or later
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${openaiKey}`,
    'User-Agent': userAgent, // Send User-Agent to OpenAI as well
    ...(openaiOrg ? { 'OpenAI-Organization': openaiOrg } : {}),
  };

  console.log(`[OpenAI Request] Preparing to send to ${openAIUrl}`);
  console.log(`[OpenAI Request] Headers: ${JSON.stringify(headers)}`); // Log headers (API key is masked in Vercel logs)
  console.log(`[OpenAI Request] Payload: ${JSON.stringify(payload)}`);

  // 3. Call OpenAI API and Handle Response
  try {
    const response = await fetch(openAIUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    // ALWAYS get text first, as response might not be JSON
    const bodyText = await response.text();
    const responseHeaders = Object.fromEntries(response.headers.entries());

    console.log(`[OpenAI Response] Status: ${response.status}`);
    console.log(`[OpenAI Response] Headers: ${JSON.stringify(responseHeaders)}`);

    if (!response.ok) {
      // This is where the Cloudflare HTML error will likely end up
      console.error(`[OpenAI Response] Request failed (Status: ${response.status}).`);
      console.error(`[OpenAI Response] FULL Body Text (Failure): \n---\n${bodyText}\n---`); // Log the FULL body
      return NextResponse.json({
        success: false,
        error: `OpenAI API Error: ${response.status} ${response.statusText}`,
        details: `Received non-JSON response, check logs for full body. Preview: ${bodyText.slice(0, 500)}...`
       }, { status: 502 }); // 502 Bad Gateway is appropriate for upstream failure
    }

    // If response.ok, attempt to parse JSON
    try {
      const jsonResponse = JSON.parse(bodyText);

      // Optional: Basic validation of the response structure
      if (!jsonResponse.choices || !jsonResponse.choices[0] || !jsonResponse.choices[0].message || !jsonResponse.choices[0].message.content) {
          console.error('[OpenAI Response] Invalid JSON structure received:', JSON.stringify(jsonResponse));
          return NextResponse.json({ success: false, error: 'Invalid response structure from OpenAI' }, { status: 500 });
      }

      // Attempt to parse the actual content JSON
      try {
          const contentJson = JSON.parse(jsonResponse.choices[0].message.content);
          console.log("[OpenAI Response] Successfully parsed OpenAI JSON content.");
          return NextResponse.json({ success: true, data: contentJson }, { status: 200 });
      } catch (contentParseError) {
          console.error("[OpenAI Response] Failed to parse content JSON within the 'message.content' field.");
          console.error("[OpenAI Response] Content string was:", jsonResponse.choices[0].message.content);
          console.error("[OpenAI Response] Content Parse Error:", contentParseError);
          return NextResponse.json({
              success: false,
              error: 'Failed to parse JSON content from OpenAI response',
              rawContent: jsonResponse.choices[0].message.content // Send raw content back for debugging
          }, { status: 500 });
      }


    } catch (parseError) {
      // This catches errors if bodyText itself is not valid JSON (e.g., HTML)
      console.error('[OpenAI Response] Failed to parse response body as JSON.');
      // Log the FULL body text again, this is critical if it was HTML
      console.error(`[OpenAI Response] FULL Body Text (JSON Parse Failure): \n---\n${bodyText}\n---`);
      console.error('[OpenAI Response] Parse Error:', parseError);
      return NextResponse.json({
          success: false,
          error: 'Failed to parse JSON response from OpenAI',
          details: `Check logs for full body text. Preview: ${bodyText.slice(0, 500)}...`
      }, { status: 500 });
    }

  } catch (networkError) {
    // Catches fetch() specific errors (DNS, connection refused, etc.)
    console.error('[OpenAI Request] Network or Fetch Error:', networkError);
    return NextResponse.json({
      success: false,
      error: 'Network error communicating with OpenAI API',
      details: networkError instanceof Error ? networkError.message : String(networkError),
     }, { status: 504 }); // 504 Gateway Timeout might be suitable
  }
}