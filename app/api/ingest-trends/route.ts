import { NextResponse } from 'next/server';

export async function GET() {
  console.log("✅ /api/ingest-trends route is alive!");
  return NextResponse.json({ status: "success", message: "API route is working ✅" });
}
