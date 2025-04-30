import { NextResponse } from 'next/server';
import snoowrap from 'snoowrap';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const openaiKey = process.env.OPENAI_API_KEY;
const openaiOrg = process.env.OPENAI_ORG_ID;
const redditClientId = process.env.REDDIT_CLIENT_ID;
const redditClientSecret = process.env.REDDIT_CLIENT_SECRET;
const redditUsername = process.env.REDDIT_USERNAME;
const redditPassword = process.env.REDDIT_PASSWORD;

const openAIUrl = 'https://api.openai.com/v1/chat/completions';
const userAgent = 'web:Nichetracker:v1.1 (contact: baris.mola@gmail.com)';

async function getActiveSubreddits(): Promise<string[]> {
  const { data, error } = await supabase
    .from('sources')
    .select('subreddit')
    .eq('is_active', true);

  if (error || !data) {
    console.error('❌ Failed to fetch subreddits from Supabase:', error);
    return ['Entrepreneur'];
  }

  return data.map((row) => row.subreddit);
}

export async function GET(req: Request) {
  if (req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  console.log("✅ [/api/ingest-trends] Route execution started.");

  if (!openaiKey) {
    console.error("❌ FATAL: Missing OpenAI API key.");
    return NextResponse.json({ success: false, error: 'Missing OpenAI API key.' }, { status: 500 });
  }

  if (!redditClientId || !redditClientSecret || !redditUsername || !redditPassword) {
    console.error("❌ FATAL: Missing Reddit credentials.");
    return NextResponse.json({ success: false, error: 'Missing Reddit credentials.' }, { status: 500 });
  }

  let firstRedditTitle = '';
  let usedSubreddit = '';

  try {
    const r = new snoowrap({
      userAgent: userAgent,
      clientId: redditClientId,
      clientSecret: redditClientSecret,
      username: redditUsername,
      password: redditPassword,
    });

    const subreddits = await getActiveSubreddits();

    for (const subreddit of subreddits) {
      try {
        console.log(`[Reddit Fetch] Trying /r/${subreddit}...`);
        const topPosts = await r.getSubreddit(subreddit).getTop({ time: 'day', limit: 5 });

        const posts = topPosts.map((post) => post.title);
        if (posts.length > 0) {
          const cleanTitle = posts[0].replace(/["<>]/g, '').trim();
          if (cleanTitle) {
            firstRedditTitle = cleanTitle;
            usedSubreddit = subreddit;
            break;
          }
        }
      } catch (err) {
        console.warn(`[Reddit Fetch] Error fetching from /r/${subreddit}:`, err);
      }
    }

    if (!firstRedditTitle) {
      return NextResponse.json({
        success: false,
        error: 'No valid post found from any subreddit.'
      }, { status: 500 });
    }

    console.log(`[Reddit Fetch] Using post from /r/${usedSubreddit}: "${firstRedditTitle}"`);

  } catch (redditError: unknown) {
    console.error("[Reddit Fetch/Auth] Authenticated fetch failed:", redditError);
    return NextResponse.json({
      success: false,
      error: 'Failed to authenticate or fetch Reddit data.',
    }, { status: 502 });
  }

  const prompt = `You are a trend researcher. Analyze this phrase and return ONLY a valid JSON object (no preamble, no explanation) with this exact structure:\n\n{\n  "title": "a short catchy trend title",\n  "description": "what the trend is and why it’s interesting (1-2 sentences)",\n  "category": "one of: travel, health, finance, tech",\n  "ideas": ["bullet point 1 (blog, YouTube, etc.)", "bullet point 2"]\n}\n\nTrend keyword: "${firstRedditTitle}"`;

  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
  };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${openaiKey}`,
    'User-Agent': userAgent,
    ...(openaiOrg ? { 'OpenAI-Organization': openaiOrg } : {}),
  };

  try {
    const response = await fetch(openAIUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
    });

    const bodyText = await response.text();

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: `OpenAI API Error: ${response.status} ${response.statusText}`,
        details: bodyText.slice(0, 500),
      }, { status: 502 });
    }

    const jsonResponse = JSON.parse(bodyText);
    const contentString = jsonResponse.choices?.[0]?.message?.content;

    if (!contentString) {
      return NextResponse.json({ success: false, error: 'Missing content from OpenAI response' }, { status: 500 });
    }

    const contentJson = JSON.parse(contentString);

    const { data, error: insertError } = await supabase.from('trends').insert([
      {
        title: contentJson.title,
        description: contentJson.description,
        category: contentJson.category,
        ideas: contentJson.ideas,
        source: 'reddit',
        keyword: firstRedditTitle,
        source_subreddit: usedSubreddit,
      }
    ]);

    if (insertError) {
      console.error('❌ Supabase insert error:', insertError);
      return NextResponse.json({ success: false, error: 'Failed to insert trend into Supabase' }, { status: 500 });
    }

    console.log('✅ Trend inserted:', data);
    return NextResponse.json({ success: true, data: contentJson }, { status: 200 });

  } catch (err) {
    console.error('[OpenAI Request] Error:', err);
    return NextResponse.json({ success: false, error: 'Error communicating with OpenAI' }, { status: 504 });
  }
}
