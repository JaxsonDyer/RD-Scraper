import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { safeNext } from '@/lib/security';

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const auth = await getAuth();
  const params = await searchParams;
  const next = safeNext(params.next ?? null);
  if (auth.user) redirect(next);
  return (
    <div className="mx-auto max-w-md py-12 sm:py-20">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to RedDeer Scraper</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Browse local analytics without an account. Sign in with Google to access your account; approved admins can manage scraping.
      </p>
      {params.error && (
        <p role="alert" className="mt-6 text-sm text-destructive">We couldn’t complete sign-in. Please try again.</p>
      )}
      {auth.configured ? (
        <form action="/auth/login" method="post" className="mt-8">
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="flex min-h-11 w-full items-center justify-center rounded-md border border-input bg-white px-4 py-3 text-sm font-medium text-neutral-900 transition-colors hover:bg-neutral-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Continue with Google
          </button>
        </form>
      ) : <p role="status" className="mt-8 text-sm text-muted-foreground">Sign-in is being set up. Please try again later.</p>}
      <Link href="/" className="mt-6 inline-block rounded text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Back to overview</Link>
    </div>
  );
}
