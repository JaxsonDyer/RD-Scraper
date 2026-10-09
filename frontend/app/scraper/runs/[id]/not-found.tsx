import Link from "next/link";

export default function RunNotFound() {
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Run not found</h1>
      <p className="text-sm text-muted-foreground">This run may have been removed. Return to Run History to see the available runs.</p>
      <Link href="/scraper#run-history" className="inline-flex min-h-11 items-center rounded-sm text-sm underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        Back to Run History
      </Link>
    </div>
  );
}
