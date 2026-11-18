import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** The build this server is running. Open tabs poll it to notice a new release. */
export function GET() {
  return NextResponse.json({ build: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev' }, { headers: { 'cache-control': 'no-store' } });
}
