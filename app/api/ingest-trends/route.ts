import { NextResponse } from 'next/server';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openaiProject = process.env.OPENAI_PROJECT_ID;
const openaiOrg = process.env.OPENAI_ORG_ID;
const redditUrl = 'https://www.reddit.com/r/Entrepreneur/top.json?limit=5&t=day';

type RedditPost = {
  data: {
    title: string;
  };
};

export async function GET() {
  console.log("✅ /api/ingest-trends route is alive!");

  if (!openaiApiKey || !openaiProject || !openaiOrg) {
    return NextResponse.json({ success: false, error: 'Missing OpenAI credentials in environment' });
  }

  try {
    const redditRes = await fetch(redditUrl);
    const redditData = await redditRes.json();
    const posts = redditData.data.children.map((post: RedditPost) => post.data.title);

    for (const title of posts) {
      const prompt = `You are a trend researcher. Analyze this phrase and return a JSON object:\n\n- title: a short catchy trend title\n- description: what the trend is and why it’s interesting (1-2 sentences)\n- category: one of travel, health, finance, tech\n- ideas: 2 bullet content ideas (blog, YouTube, etc.)\n\nTrend keyword: "${title}"`;

      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
          'OpenAI-Project': openaiProject,
          'OpenAI-Organization': openaiOrg,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });

      const text = await openaiRes.text();
      console.log("🔍 OpenAI raw response:", text);

      const contentType = openaiRes.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        return new Response(text, {
          status: openaiRes.status,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      let aiData;
      try {
        aiData = JSON.parse(text);
      } catch {
        return new Response(`<html><body><h1>🚨 JSON PARSE ERROR</h1><pre>${text.slice(0, 1000)}</pre></body></html>`, {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const content = aiData?.choices?.[0]?.message?.content;
      console.log("✅ Extracted content:", content);

      return NextResponse.json({ success: true, aiContent: content });
    }

    return NextResponse.json({
      success: true,
      inserted: 0,
      trends: [],
    });

  } catch (err) {
    console.error("Ingest API error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
