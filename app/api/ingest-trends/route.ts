import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

const openaiApiKey = process.env.OPENAI_API_KEY;
const redditUrl = 'https://www.reddit.com/r/Entrepreneur/top.json?limit=5&t=day';

type RedditPost = {
  data: {
    title: string;
  };
};

export async function GET() {
  console.log("OPENAI_API_KEY loaded:", !!openaiApiKey);

  try {
    // 1. Fetch Reddit post titles
    const redditRes = await fetch(redditUrl);
    const redditData = await redditRes.json();
    const posts = redditData.data.children.map((post: RedditPost) => post.data.title);

    const newTrends = [];

    for (const title of posts) {
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
      console.log("OpenAI raw response:", text);

      // ✅ Return raw HTML if OpenAI does not return JSON
      const contentType = openaiRes.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        console.warn("OpenAI returned HTML instead of JSON.");
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
        return new Response(text, {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        });
      }

      const content = aiData?.choices?.[0]?.message?.content;
      if (!content) continue;

      const cleaned = content
        .replace(/^```json\n?/, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        continue;
      }

      const { error } = await supabase.from('trends').insert([{
        title: parsed.title,
        description: parsed.description,
        category: parsed.category,
        ideas: parsed.ideas,
      }]);

      if (!error) {
        newTrends.push(parsed);
      }
    }

    return NextResponse.json({
      success: true,
      inserted: newTrends.length,
      trends: newTrends,
    });

  } catch (err) {
    // ✅ Fallback for unexpected error (no "any" typing)
    console.error("Ingest API error:", err);

    const htmlLike = typeof err === 'string' && err.includes('<body');

    if (htmlLike) {
      return new Response(err, {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
