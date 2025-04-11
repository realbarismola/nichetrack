import { NextResponse } from 'next/server';

export async function GET() {
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiOrg = process.env.OPENAI_ORG_ID;

  console.log("🔐 ENV:");
  console.log(" - OPENAI_API_KEY set:", !!openaiKey);
  console.log(" - OPENAI_ORG_ID set:", !!openaiOrg);

  if (!openaiKey) {
    return NextResponse.json({ error: 'Missing OpenAI API key' }, { status: 500 });
  }

  const payload = {
    model: 'gpt-3.5-turbo',
    messages: [{ role: 'user', content: "Say hello like a pirate." }],
    temperature: 0.7,
  };

  try {
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
    const body = await res.text();

    console.log("📦 Status:", status);
    console.log("📦 Headers:", headers);
    console.log("📄 Body:", body);

    return NextResponse.json({
      success: status === 200,
      status,
      headers,
      body,
    });
  } catch (err) {
    console.error("❌ Fetch error:", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
