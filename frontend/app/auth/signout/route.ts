import { NextResponse } from 'next/server';
import { createClient, supabaseConfigured } from '@/lib/supabase/server';
import { sameOrigin, requestOrigin } from '@/lib/security';

export async function POST(request: Request) {
  if (!sameOrigin(request)) return new Response('Forbidden', { status: 403 });
  if (supabaseConfigured()) {
    const client = await createClient();
    const { error } = await client.auth.signOut();
    if (error) return new Response('Could not sign out. Please try again.', { status: 503 });
  }
  return NextResponse.redirect(new URL('/', requestOrigin(request)), 303);
}
