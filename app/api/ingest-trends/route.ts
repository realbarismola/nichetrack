import { NextResponse } from 'next/server';

const openaiKey = process.env.OPENAI_API_KEY;
const openaiOrg = process.env.OPENAI_ORG_ID;

const redditUrl = 'https://www.reddit.com/r/Entrepreneur/top.json?limit=5&t=day';

type RedditPost = {
  data: {
    title: string;
  };
};

export async function GET() {
  console.log("✅ /api/ingest-trends route is alive!");
  console.log("🔐 ENV:");
  console.log(" - OPENAI_API_KEY set:", !!openaiKey);
  console.log(" - OPENAI_ORG_ID set:", !!openaiOrg);

  if (!openaiKey) {
    return NextResponse.json({ success: false, error: 'Missing OpenAI API key' }, { status: 500 });
  }

  try {
    // 1. Get keyword from Reddit
    const redditRes = await fetch(redditUrl);
    const redditData = await redditRes.json();
    const posts = redditData.data.children.map((post: RedditPost) => post.data.title);
    const keyword = JSON.stringify(posts[0] || 'Default keyword').slice(1, -1);
    console.log("📰 Reddit keyword:", keyword);

    // 2. Prompt
    const prompt = `You are a trend researcher. Analyze this phrase and return a JSON object:\n\n- title: a short catchy trend title\n- description: what the trend is and why it’s interesting (1-2 sentences)\n- category: one of travel, health, finance, tech\n- ideas: 2 bullet content ideas (blog, YouTube, etc.)\n\nTrend keyword: "${keyword}"`;

    const payload = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    };

    // 3. Call OpenAI
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
        ...(openaiOrg ? { 'OpenAI-Organization': openaiOrg } : {}),
      },
      body: JSON.stringify(payload),
    });

    const status = res.status;
    const contentType = res.headers.get('content-type') || '';
    const bodyText = await res.text();
    const headers = Object.fromEntries(res.headers.entries());

    console.log("📦 OpenAI response status:", status);
    console.log("📦 OpenAI headers:", headers);
    console.log("📄 OpenAI raw body:", bodyText.slice(0, 300));

    // 4. Validate response type
    if (!contentType.includes('application/json')) {
      return NextResponse.json({
        success: false,
        error: 'Non-JSON response from OpenAI',
        status,
        preview: bodyText.slice(0, 300),
        headers,
      }, { status });
    }

    // 5. Try parse
    let aiData;
    try {
      aiData = JSON.parse(bodyText);
    } catch (err) {
      return NextResponse.json({
        success: false,
        error: 'Failed to parse JSON from OpenAI',
        status,
        preview: bodyText.slice(0, 300),
        headers,
      }, { status });
    }

    const content = aiData?.choices?.[0]?.message?.content;
    if (!content) {
      return NextResponse.json({
        success: false,
        error: 'OpenAI returned no content',
        status,
        aiData,
      }, { status });
    }

    return NextResponse.json({
      success: true,
      promptUsed: prompt,
      aiContent: content,
    }, { status });
  } catch (err) {
    console.error("❌ Ingest route error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
