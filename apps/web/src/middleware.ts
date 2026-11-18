import { NextResponse, type NextRequest } from 'next/server';

/** The /dev board playgrounds are for local work only; hide them on the live site. */
export function middleware(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') return new NextResponse('Not found', { status: 404 });
  return NextResponse.next();
}

export const config = { matcher: ['/dev/:path*'] };
