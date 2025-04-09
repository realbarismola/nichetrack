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
  try {
    // 1. Fetch Reddit post titles
    const redditRes = await fetch(redditUrl);
    const redditData = await redditRes.json();
    const posts = redditData.data.children.map((post: RedditPost) => post.data.title);

    const newTrends = [];

    for (const title of posts) {
      // 2. Generate AI summary with OpenAI
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

      const aiData = await openaiRes.json();
      const content = aiData?.choices?.[0]?.message?.content;

      if (!content) continue;

      // 3. Clean JSON (remove markdown wrappers)
      const cleaned = content
        .replace(/^```json\n?/, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim();

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch {
        continue; // skip this trend if JSON is broken
      }

      // 4. Save to Supabase
      const { error } = await supabase.from('trends').insert([
        {
          title: parsed.title,
          description: parsed.description,
          category: parsed.category,
          ideas: parsed.ideas,
        },
      ]);

      if (!error) {
        newTrends.push(parsed);
      }
    }

    // 5. Return success response
    return NextResponse.json({
      success: true,
      inserted: newTrends.length,
      trends: newTrends,
    });

  } catch (err) {
    console.error("Ingest API error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
