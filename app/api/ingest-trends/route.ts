import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

const BUILD_ID = 'build-20250411-1'; // 🔧 helps us confirm which version is running
const openaiApiKey = process.env.OPENAI_API_KEY;
const redditUrl = 'https://www.reddit.com/r/Entrepreneur/top.json?limit=5&t=day';

type RedditPost = {
  data: {
    title: string;
  };
};

export async function GET() {
  console.log("🚀 Ingest endpoint HIT");
  console.log("🛠️ BUILD_ID:", BUILD_ID);
  console.log("🔐 OPENAI_API_KEY loaded:", !!openaiApiKey);

  try {
    // 1. Fetch Reddit post titles
    const redditRes = await fetch(redditUrl);
    const redditData = await redditRes.json();
    const posts = redditData.data.children.map((post: RedditPost) => post.data.title);
    console.log("🧵 Reddit posts fetched:", posts.length);

    const newTrends: any[] = [];

    for (const title of posts) {
      console.log(`⚡ Processing trend for: "${title}"`);

      const prompt = `You are a trend researcher. Analyze this phrase and return a JSON object:\n\n- title: a short catchy trend title\n- description: what the trend is and why it’s interesting (1-2 sentences)\n- category: one of travel, health, finance, tech\n- ideas: 2 bullet content ideas (blog, YouTube, etc.)\n\nTrend keyword: "${title}"`;

      const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        }),
      });

      const text = await openaiRes.text();
      const contentType = openaiRes.headers.get('content-type') || '';

      console.log("📦 OpenAI response content-type:", contentType);

      // Return raw HTML if OpenAI didn’t return JSON
      if (!contentType.includes('application/json')) {
        console.log("🧨 OpenAI returned HTML. Returning raw response.");
        return new Response(text, {
          status: openaiRes.status,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      // Try to parse JSON
      let aiData;
      try {
        aiData = JSON.parse(text);
      } catch {
        console.log("❌ Failed to parse OpenAI JSON. Returning raw fallback.");
        return new Response(text, {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const content = aiData?.choices?.[0]?.message?.content;
      if (!content) {
        console.log("⚠️ No content in OpenAI response. Skipping.");
        continue;
      }

      const cleaned = content
        .replace(/^```json\n?/, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        console.log("⚠️ Failed to parse cleaned JSON. Skipping.");
        continue;
      }

      const { error } = await supabase.from('trends').insert([
        {
          title: parsed.title,
          description: parsed.description,
          category: parsed.category,
          ideas: parsed.ideas,
        },
      ]);

      if (!error) {
        console.log("✅ Trend inserted:", parsed.title);
        newTrends.push(parsed);
      } else {
        console.log("❌ Supabase insert error:", error);
      }
    }

    console.log("📤 Returning success response with", newTrends.length, "trends");
    return NextResponse.json({
      success: true,
      inserted: newTrends.length,
      trends: newTrends,
      buildId: BUILD_ID,
    });

  } catch (err) {
    console.error("🔥 Uncaught error in ingest route:", err);

    // As a fallback, show raw error if it's HTML-like
    if (typeof err === 'string' && err.includes('<body')) {
      console.log("⚠️ Catch block triggered: returning raw HTML.");
      return new Response(err, {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    console.log("📤 Returning JSON error response.");
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
      buildId: BUILD_ID,
    });
  }
}
