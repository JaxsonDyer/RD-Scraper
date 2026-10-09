import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import ScraperManager from '@/components/scraper-manager';

export const metadata = { title: 'Manager | RedDeer Scraper', robots: { index: false, follow: false } };
export default async function ScraperPage() {
  const auth = await getAuth();
  if (!auth.user) redirect('/login?next=/scraper');
  if (!auth.isAdmin) return (
    <div className="max-w-md py-12">
      <h1 className="text-2xl font-semibold">Admin access required</h1>
      <p className="mt-3 text-sm text-muted-foreground">Your account can browse analytics. An administrator must grant access to Manager.</p>
      <Link href="/" className="mt-6 inline-block text-sm underline underline-offset-4">Back to overview</Link>
    </div>
  );
  return <ScraperManager />;
}
