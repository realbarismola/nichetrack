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
    // 1. Get Reddit post
    const redditRes = await fetch(redditUrl);
    const redditData = await redditRes.json();
    const posts = redditData.data.children.map((post: RedditPost) => post.data.title);
    const keyword = JSON.stringify(posts[0] || 'Default keyword').slice(1, -1);
    console.log("📰 Reddit keyword:", keyword);

    // 2. Create OpenAI prompt
    const prompt = `Say hello in pirate style.`;

    // 3. Prepare OpenAI request
    const payload = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    };

    const openaiUrl = 'https://api.openai.com/v1/chat/completions';
    console.log("🌐 Calling OpenAI at:", openaiUrl);

    const res = await fetch(openaiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiKey}`,
        ...(openaiOrg ? { 'OpenAI-Organization': openaiOrg } : {}),
      },
      body: JSON.stringify(payload),
    });

    const status = res.status;
    const headers = Object.fromEntries(res.headers.entries());
    const bodyText = await res.text();

    console.log("📦 OpenAI response status:", status);
    console.log("📦 OpenAI headers:", headers);
    console.log("📄 OpenAI raw body preview:", bodyText.slice(0, 300));

    // 4. Skip parsing and return for inspection
    return NextResponse.json({
      success: false,
      note: 'Raw OpenAI response for debugging',
      status,
      headers,
      preview: bodyText.slice(0, 300),
    }, { status });

  } catch (err) {
    console.error("❌ Ingest route error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
