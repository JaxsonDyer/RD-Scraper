import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, Section } from "@/components/ui/card";
import { DetailList } from "@/components/ui/detail-list";
import { Notice } from "@/components/ui/notice";
import { buttonVariants } from "@/components/ui/styles";
import { Table, TableFrame, TableHead, Td, Th, Tr } from "@/components/ui/table";
import { getAuth } from "@/lib/auth";
import { getRunErrorSummary } from "@/lib/run-history";
import { formatDateTime } from "@/lib/format-date";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Run details | RedDeer Scraper", robots: { index: false, follow: false } };

// Rendered on the server, so pin the schedule's timezone rather than the host's.
function formatTime(value: string | null): string {
  return value ? formatDateTime(value, { timeZone: "America/Edmonton", seconds: true }) : "—";
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
      <Notice tone="error" action={<a href={`/scraper/runs/${id}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>Try again</a>}>
        Could not load run details. Please try again in a moment.
      </Notice>
      <Link href="/scraper#run-history" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2.5" })}>
        <ArrowLeft aria-hidden="true" /> Back to Run History
      </Link>
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
    <div className="max-w-4xl space-y-10">
      <div className="space-y-3">
        <Link href="/scraper#run-history" className={buttonVariants({ variant: "ghost", size: "sm", className: "-ml-2.5" })}>
          <ArrowLeft aria-hidden="true" /> Back to Run History
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-base font-semibold text-foreground first-letter:uppercase">{task}</p>
          <Badge className="capitalize" variant={run.status === "error" ? "destructive" : run.status === "success" ? "success" : "muted"}>
            {run.status === "error" ? "Failed" : run.status}
          </Badge>
        </div>
      </div>

      {(run.error || run.status === "error") && (
        <Section title="Error" id="error-heading">
          <Card>
            <h3 className="text-base font-semibold leading-snug text-foreground">{getRunErrorSummary(run.error)}</h3>
            <p className="mt-2.5 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-foreground/80 [overflow-wrap:anywhere]">
              {run.error || "No error message was recorded for this run."}
            </p>
          </Card>
        </Section>
      )}

      {failedAccounts.length > 0 && (
        <Section title="Failed accounts" id="accounts-heading">
          <TableFrame>
            <Table>
              <TableHead>
                <Th className="w-1/3">Account</Th>
                <Th>Error</Th>
              </TableHead>
              <tbody>
                {failedAccounts.map((account, index) => (
                  <Tr key={`${account.username}:${index}`}>
                    <Td className="align-top font-medium [overflow-wrap:anywhere]">@{account.username}</Td>
                    <Td className="whitespace-pre-wrap leading-relaxed text-muted-foreground [overflow-wrap:anywhere]">
                      {typeof account.error === "string" ? account.error : "No account-level error message was recorded."}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </TableFrame>
        </Section>
      )}

      <Section title="Run information" id="run-heading">
        <Card>
          <DetailList items={[
            { label: "Queued", value: formatTime(run.created_at) },
            { label: "Started", value: formatTime(run.started_at) },
            { label: "Completed", value: formatTime(run.completed_at) },
            { label: "Accounts scraped", value: String(run.result?.accounts_scraped ?? 0) },
            { label: "Run ID", value: run.id, mono: true },
          ]} />
          <p className="mt-5 text-xs text-muted-foreground">Times shown in America/Edmonton.</p>
        </Card>
      </Section>
    </div>
  );
}
