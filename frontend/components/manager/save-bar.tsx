"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** The footer of a section whose fields save together: says whether there's anything to save. */
export function SaveBar({ dirty, saving, onSave, onDiscard, saveLabel, children }: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  saveLabel: string;
  /** Extra actions placed after Save. */
  children?: ReactNode;
}) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
      <p role="status" className={`mr-auto text-xs ${dirty ? "font-medium text-foreground" : "text-muted-foreground"}`}>
        {saving ? "Saving..." : dirty ? "Unsaved changes" : "All changes saved"}
      </p>
      {dirty && <Button variant="ghost" onPress={onDiscard} isDisabled={saving}>Discard</Button>}
      <Button variant={dirty ? "primary" : "secondary"} onPress={onSave} isDisabled={!dirty} loading={saving}>{saveLabel}</Button>
      {children}
    </div>
  );
}
