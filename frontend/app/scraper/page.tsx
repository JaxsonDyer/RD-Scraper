import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuth } from '@/lib/auth';
import ScraperManager from '@/components/scraper-manager';
import { Card } from '@/components/ui/card';
import { buttonVariants } from '@/components/ui/styles';

export const metadata = { title: 'Manager | RedDeer Scraper', robots: { index: false, follow: false } };
export default async function ScraperPage() {
  const auth = await getAuth();
  if (!auth.user) redirect('/login?next=/scraper');
  if (!auth.isAdmin) return (
    <Card className="max-w-xl">
      <h2 className="text-base font-semibold text-foreground">Admin access required</h2>
      <p className="mt-2 text-sm text-muted-foreground">Your account can browse analytics. An administrator must grant access to Manager.</p>
      <Link href="/" className={buttonVariants({ variant: "secondary", className: "mt-5" })}>Back to Overview</Link>
    </Card>
  );
  return <ScraperManager />;
}
