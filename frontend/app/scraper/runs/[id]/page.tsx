import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getAuth } from "@/lib/auth";
import { getRunErrorSummary } from "@/lib/run-history";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Run details | RedDeer Scraper", robots: { index: false, follow: false } };

function formatTime(value: string | null): string {
  return value ? new Date(value).toLocaleString("en-CA", {
    timeZone: "America/Edmonton", dateStyle: "medium", timeStyle: "medium",
  }) : "—";
}

type AccountResult = { username: string; status: string; error?: string };

export default async function RunDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await getAuth();
  if (!auth.user) redirect(`/login?next=${encodeURIComponent(`/scraper/runs/${id}`)}`);
  if (!auth.isAdmin) redirect("/scraper");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();

  const client = await createClient();
  const { data: run, error } = await client.from("jobs")
    .select("id,kind,status,error,created_at,started_at,completed_at,result")
    .eq("id", id).maybeSingle();
  if (error) return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Could not load run details</h1>
      <p role="alert" className="text-sm text-muted-foreground">Please try again in a moment.</p>
      <a href={`/scraper/runs/${id}`} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Try again</a>
      <Link href="/scraper#run-history" className="ml-4 inline-flex min-h-11 items-center text-sm underline underline-offset-4">Back to Run History</Link>
    </div>
  );
  if (!run) notFound();

  const accountResults: AccountResult[] = Array.isArray(run.result?.accounts)
    ? run.result.accounts.filter((account: unknown): account is AccountResult =>
      typeof account === "object" && account !== null &&
      "username" in account && typeof account.username === "string" &&
      "status" in account && typeof account.status === "string")
    : [];
  const failedAccounts = accountResults.filter(account => account.status === "error");
  const task = run.kind.replaceAll("_", " ");

  return (
    <div className="max-w-3xl space-y-8">
      <Link href="/scraper#run-history" className="inline-flex min-h-11 items-center gap-2 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to Run History
      </Link>
      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Run details</h1>
          <Badge className="capitalize" variant={run.status === "error" ? "destructive" : run.status === "success" ? "success" : "outline"}>{run.status === "error" ? "Failed" : run.status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground capitalize">{task}</p>
      </header>

      {(run.error || run.status === "error") && (
        <section className="space-y-3" aria-labelledby="error-heading">
          <h2 id="error-heading" className="text-lg font-medium">{getRunErrorSummary(run.error)}</h2>
          <p className="rounded-lg bg-muted/40 p-4 text-sm leading-relaxed text-foreground whitespace-pre-wrap [overflow-wrap:anywhere]">
            {run.error || "No error message was recorded for this run."}
          </p>
        </section>
      )}

      {failedAccounts.length > 0 && (
        <section aria-labelledby="accounts-heading">
          <h2 id="accounts-heading" className="mb-3 text-base font-medium">Failed accounts</h2>
          <ul className="divide-y divide-border">
            {failedAccounts.map((account, index) => (
              <li key={`${account.username}:${index}`} className="space-y-1 py-3 first:pt-0">
                <p className="text-sm font-medium [overflow-wrap:anywhere]">@{account.username}</p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">{typeof account.error === "string" ? account.error : "No account-level error message was recorded."}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="run-heading" className="space-y-4">
        <h2 id="run-heading" className="text-base font-medium">Run information</h2>
        <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
          {[
            ["Queued", formatTime(run.created_at)],
            ["Started", formatTime(run.started_at)],
            ["Completed", formatTime(run.completed_at)],
            ["Accounts scraped", String(run.result?.accounts_scraped ?? 0)],
            ["Run ID", run.id],
          ].map(([label, value]) => (
            <div key={label} className="space-y-1">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="text-sm tabular-nums [overflow-wrap:anywhere]">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted-foreground">Times shown in America/Edmonton.</p>
      </section>
    </div>
  );
}
