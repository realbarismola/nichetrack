import { NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.OPENAI_ORG_ID,
  project: process.env.OPENAI_PROJECT_ID,
});

const redditUrl = 'https://www.reddit.com/r/Entrepreneur/top.json?limit=5&t=day';

type RedditPost = {
  data: {
    title: string;
  };
};

export async function GET() {
  console.log("✅ /api/ingest-trends route is alive!");
  console.log("🔐 ENV:", {
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    OPENAI_ORG_ID: !!process.env.OPENAI_ORG_ID,
    OPENAI_PROJECT_ID: !!process.env.OPENAI_PROJECT_ID,
  });

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ success: false, error: 'Missing OpenAI credentials in environment' });
  }

  try {
    const redditRes = await fetch(redditUrl);
    const redditData = await redditRes.json();
    const posts = redditData.data.children.map((post: RedditPost) => post.data.title);

    for (const title of posts) {
      const prompt = `You are a trend researcher. Analyze this phrase and return a JSON object:\n\n- title: a short catchy trend title\n- description: what the trend is and why it’s interesting (1-2 sentences)\n- category: one of travel, health, finance, tech\n- ideas: 2 bullet content ideas (blog, YouTube, etc.)\n\nTrend keyword: "${title}"`;

      const chat = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
      });

      const content = chat.choices[0]?.message?.content;
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
