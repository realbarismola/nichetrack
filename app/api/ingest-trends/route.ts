import { NextResponse } from 'next/server';

const openaiKey = process.env.OPENAI_API_KEY;
const openaiOrg = process.env.OPENAI_ORG_ID;

export async function GET() {
  console.log("✅ /api/ingest-trends route is alive!");
  console.log("🔐 ENV:");
  console.log(" - OPENAI_API_KEY set:", !!openaiKey);
  console.log(" - OPENAI_ORG_ID set:", !!openaiOrg);

  if (!openaiKey) {
    return NextResponse.json({
      success: false,
      error: 'Missing OpenAI API key',
    }, { status: 500 });
  }

  try {
    const prompt = 'Say "Ahoy matey, greetings to ye!"';

    const payload = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    };

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
    const headers = Object.fromEntries(res.headers.entries());
    const bodyText = await res.text(); // Do not parse yet

    console.log("📦 OpenAI response status:", status);
    console.log("📦 OpenAI headers:", headers);
    console.log("📄 OpenAI raw body:", bodyText.slice(0, 500));

    return NextResponse.json({
      success: false,
      note: 'Raw OpenAI response for debugging',
      status,
      headers,
      preview: bodyText.slice(0, 500),
    }, { status });

  } catch (err) {
    console.error("❌ Ingest route error:", err);
    return NextResponse.json({
      success: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}
