import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';

const openaiApiKey = process.env.OPENAI_API_KEY;
const redditUrl = 'https://www.reddit.com/r/Entrepreneur/top.json?limit=5&t=day';

export async function GET() {
  try {
    // 1. Fetch top Reddit post titles
    const redditRes = await fetch(redditUrl);
    const redditData = await redditRes.json();
    const posts = redditData.data.children.map((post: any) => post.data.title);

    const newTrends = [];

    for (const title of posts) {
      // 2. Generate trend data using OpenAI
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

      if (!content) {
        console.warn(`No content returned for: ${title}`);
        continue;
      }

      // 3. Clean and parse the OpenAI response
      const cleaned = content
        .replace(/^```json\n?/, '')
        .replace(/^```/, '')
        .replace(/```$/, '')
        .trim();

      console.log("Cleaned OpenAI content:", cleaned);

      let parsed;
      try {
        parsed = JSON.parse(cleaned);
        console.log("Parsed object:", parsed);
      } catch (err) {
        console.error("Failed to parse JSON:", err);
        continue;
      }

      // 4. Insert into Supabase
      const { error } = await supabase.from('trends').insert([{
        title: parsed.title,
        description: parsed.description,
        category: parsed.category,
        ideas: parsed.ideas,
      }]);

      if (error) {
        console.error('Supabase insert error:', error);
      } else {
        console.log('Inserted trend:', parsed.title);
        newTrends.push(parsed);
      }
    }

    return NextResponse.json({ success: true, inserted: newTrends.length, trends: newTrends });

  } catch (err: any) {
    console.error('Error in trend ingestion:', err);
    return NextResponse.json({ success: false, error: err.message });
  }
}
