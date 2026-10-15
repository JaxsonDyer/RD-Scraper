import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/styles";

export default function RunNotFound() {
  return (
    <Card className="max-w-xl">
      <h2 className="text-base font-semibold text-foreground">Run not found</h2>
      <p className="mt-2 text-sm text-muted-foreground">This run may have been removed. Return to Run History to see the available runs.</p>
      <Link href="/scraper#run-history" className={buttonVariants({ variant: "secondary", className: "mt-5" })}>
        <ArrowLeft aria-hidden="true" /> Back to Run History
      </Link>
    </Card>
  );
}
