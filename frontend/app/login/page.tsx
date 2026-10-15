import Image from 'next/image';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import { devLoginEnabled, safeNext } from '@/lib/security';
import { Card } from '@/components/ui/card';
import { Notice } from '@/components/ui/notice';
import { buttonVariants, inputClass, labelClass } from '@/components/ui/styles';

export default async function LoginPage({ searchParams }: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const auth = await getAuth();
  const params = await searchParams;
  const next = safeNext(params.next ?? null);
  if (auth.user) redirect(next);
  return (
    <div className="mx-auto max-w-md py-12 sm:py-20">
      <Image src="/logo.png" alt="" width={56} height={56} priority className="mb-6 size-14" />
      <h1 className="text-2xl font-semibold tracking-tight">Sign in to RedDeer Scraper</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Browse local analytics without an account. Sign in with Google to access your account; approved admins can manage scraping.
      </p>
      {params.error && (
        <Notice tone="error" className="mt-6">
          {params.error === 'password'
            ? 'Email or password is incorrect, or email sign-in is turned off in Supabase.'
            : 'We couldn’t complete sign-in. Please try again.'}
        </Notice>
      )}
      {auth.configured ? (
        <form action="/auth/login" method="post" className="mt-8">
          <input type="hidden" name="next" value={next} />
          <button type="submit" className="flex min-h-11 w-full cursor-pointer items-center justify-center gap-3 rounded-lg border border-neutral-300 bg-white px-4 py-3 text-sm font-medium text-neutral-900 shadow-sm transition-[background-color,border-color,box-shadow,transform] duration-150 hover:-translate-y-px hover:border-neutral-400 hover:bg-neutral-100 hover:shadow-md active:translate-y-0 active:bg-neutral-200 active:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5 shrink-0">
              <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
              <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2c-2 1.5-4.5 2.4-7.2 2.4-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
            </svg>
            Continue with Google
          </button>
        </form>
      ) : <p role="status" className="mt-8 text-sm text-muted-foreground">Sign-in is being set up. Please try again later.</p>}
      {auth.configured && devLoginEnabled() && (
        <Card as="section" aria-labelledby="dev-login-heading" className="mt-8">
          <h2 id="dev-login-heading" className="text-base font-semibold text-foreground">Debug sign-in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Email and password, available only on the development server.</p>
          <form action="/auth/dev-login" method="post" className="mt-4 space-y-3">
            <input type="hidden" name="next" value={next} />
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Email</span>
              <input name="email" type="email" required autoComplete="username" className={inputClass} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Password</span>
              <input name="password" type="password" required autoComplete="current-password" className={inputClass} />
            </label>
            <button type="submit" className={buttonVariants({ variant: 'primary', className: 'w-full' })}>Sign in with email</button>
          </form>
        </Card>
      )}
      <Link href="/" className={buttonVariants({ variant: 'ghost', size: 'sm', className: 'mt-6 -ml-2.5' })}>Back to Overview</Link>
    </div>
  );
}
