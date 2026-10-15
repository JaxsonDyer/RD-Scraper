import { NextResponse } from 'next/server';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';
import { devLoginEnabled, safeNext, sameOrigin, requestOrigin } from '@/lib/security';

export async function POST(request: Request) {
  if (!devLoginEnabled()) return new Response('Not found', { status: 404 });
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  const origin = requestOrigin(request);
  if (!supabaseConfigured()) return NextResponse.redirect(`${origin}/login?error=unavailable`, 303);
  const form = await request.formData();
  const next = safeNext(String(form.get('next') ?? '/'));
  const client = await createClient();
  // A real Supabase session, so database permissions apply exactly as they do for Google users.
  const { error } = await client.auth.signInWithPassword({
    email: String(form.get('email') ?? '').trim(), password: String(form.get('password') ?? ''),
  });
  if (error) {
    const retry = new URL('/login', origin);
    retry.searchParams.set('error', 'password');
    retry.searchParams.set('next', next);
    return NextResponse.redirect(retry, 303);
  }
  return NextResponse.redirect(new URL(next, origin), 303);
}
