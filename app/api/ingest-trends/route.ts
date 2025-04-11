import { NextResponse } from 'next/server';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiOrg = process.env.OPENAI_ORG_ID;

const redditUrl = 'https://www.reddit.com/r/Entrepreneur/top.json?limit=5&t=day';

type RedditPost = {
  data: {
    title: string;
  };
};

export async function GET() {
  console.log("✅ /api/ingest-trends route is alive!");
  console.log("🔐 ENV:", {
    OPENAI_API_KEY: !!openaiApiKey,
    OPENAI_ORG_ID: !!openaiOrg,
  });

  if (!openaiApiKey) {
    return NextResponse.json({ success: false, error: 'Missing OpenAI credentials in environment' });
  }

  try {
    // 1. Fetch Reddit top posts
    const redditRes = await fetch(redditUrl);
    const redditData = await redditRes.json();
    const posts = redditData.data.children.map((post: RedditPost) => post.data.title);

    const prompt = `You are a trend researcher. Analyze this phrase and return a JSON object:\n\n- title: a short catchy trend title\n- description: what the trend is and why it’s interesting (1-2 sentences)\n- category: one of travel, health, finance, tech\n- ideas: 2 bullet content ideas (blog, YouTube, etc.)\n\nTrend keyword: "${posts[0]}"`;

    // 2. Call OpenAI API manually
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
        ...(openaiOrg ? { 'OpenAI-Organization': openaiOrg } : {}),
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      }),
    });

    // 3. Log raw response for debuggingconsole.log("📦 OpenAI response status:", res.status);
    console.log("📦 OpenAI response status:", res.status);
    console.log("📦 OpenAI response headers:", [...res.headers.entries()]);
    const bodyText = await res.text(); // don't parse just yet
    console.log("📄 OpenAI raw response body:", bodyText);

    // 4. Try parsing it
    let aiData;
    try {
      aiData = JSON.parse(bodyText);
    } catch (parseErr) {
      console.error("❌ JSON parse error:", parseErr);
      return NextResponse.json({
        success: false,
        error: 'Failed to parse OpenAI response as JSON.',
        raw: bodyText,
      });
    }

    const content = aiData?.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({ success: false, error: 'No content returned from OpenAI.' });
    }

    return NextResponse.json({
      success: true,
      aiContent: content,
    });

  } catch (err) {
    console.error("❌ Ingest API error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
