import { NextResponse } from 'next/server';

const openaiApiKey = process.env.OPENAI_API_KEY;
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
    OPENAI_ORG_ID: !!process.env.OPENAI_ORG_ID,
  });

  if (!openaiApiKey) {
    return NextResponse.json({ success: false, error: 'Missing OpenAI credentials in environment' });
  }

  try {
    const redditRes = await fetch(redditUrl);
    const redditData = await redditRes.json();
    const posts = redditData.data.children.map((post: RedditPost) => post.data.title);

    const results = [];

    for (const title of posts) {
      const prompt = `You are a trend researcher. Analyze this phrase and return a JSON object:\n\n- title: a short catchy trend title\n- description: what the trend is and why it’s interesting (1-2 sentences)\n- category: one of travel, health, finance, tech\n- ideas: 2 bullet content ideas (blog, YouTube, etc.)\n\nTrend keyword: "${title}"`;

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
          ...(process.env.OPENAI_ORG_ID && { 'OpenAI-Organization': process.env.OPENAI_ORG_ID }),
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });

      const text = await res.text();
      console.log("🧠 OpenAI raw response:", text);

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return new Response(text, {
          status: res.status,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      let aiData;
      try {
        aiData = JSON.parse(text);
      } catch {
        return new Response(text, {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const content = aiData?.choices?.[0]?.message?.content;
      console.log("✅ Extracted content:", content);

      results.push(content);
    }

    return NextResponse.json({ success: true, trends: results });
  } catch (err) {
    console.error("Ingest API error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
