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
    // 1. Get Reddit trend
    const redditRes = await fetch(redditUrl);
    const redditData = await redditRes.json();
    const posts = redditData.data.children.map((post: RedditPost) => post.data.title);
    const keyword = JSON.stringify(posts[0] || 'Default keyword').slice(1, -1);
    console.log("📰 First Reddit title:", keyword);

    // 2. Create prompt
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
    const headers = Object.fromEntries(res.headers.entries());
    const bodyText = await res.text();

    console.log("📦 OpenAI response status:", status);
    console.log("📦 OpenAI content-type:", contentType);
    console.log("📄 OpenAI raw body (preview):", bodyText.slice(0, 300));

    // 4. Handle non-JSON responses safely
    if (!contentType.includes('application/json')) {
      return NextResponse.json({
        success: false,
        error: 'OpenAI returned non-JSON response (likely HTML error page)',
        status,
        contentType,
        preview: bodyText.slice(0, 500),
      }, { status });
    }

    // 5. Parse and return content
    let aiData;
    try {
      aiData = JSON.parse(bodyText);
    } catch (err) {
      console.error("❌ JSON parse error:", err);
      return NextResponse.json({
        success: false,
        error: 'Failed to parse OpenAI response.',
        raw: bodyText,
      }, { status });
    }

    const content = aiData?.choices?.[0]?.message?.content;

    return NextResponse.json({
      success: true,
      aiContent: content || null,
      raw: aiData,
    });

  } catch (err) {
    console.error("❌ Ingest route error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
