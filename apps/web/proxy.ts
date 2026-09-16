import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Every page, except static files, image optimisation, public assets and the /api handler
    // (which refreshes the session itself when it forwards a request).
    '/((?!_next/static|_next/image|api/|favicon.ico|icon.png|apple-icon.png|robots.txt|sitemap.xml|brand/|catalog/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)',
  ],
};
