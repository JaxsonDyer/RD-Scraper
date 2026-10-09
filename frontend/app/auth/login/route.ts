import { NextResponse } from 'next/server';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';
import { safeNext, sameOrigin, requestOrigin } from '@/lib/security';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const origin = requestOrigin(request);
  if (!supabaseConfigured()) return NextResponse.redirect(`${origin}/login?error=unavailable`, 303);
  const form = await request.formData();
  const next = safeNext(String(form.get('next') ?? '/'));
  const callback = new URL('/auth/callback', origin);
  callback.searchParams.set('next', next);
  const client = await createClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google', options: { redirectTo: callback.toString(), skipBrowserRedirect: true },
  });
  if (error || !data.url) return NextResponse.redirect(`${origin}/login?error=oauth`, 303);
  return NextResponse.redirect(data.url, 303);
}
