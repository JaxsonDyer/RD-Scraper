"use client";

import * as React from "react";
import { Checkbox as RACCheckbox, Input, Label, TextField as RACTextField } from "react-aria-components";
import { cn } from "@/lib/utils";
import { inputClass, labelClass } from "@/components/ui/styles";

export function TextField({ label, value, onChange, placeholder, description, onEnter, className, ...props }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  description?: string;
  /** Runs on Enter, for single-field forms like "add account". */
  onEnter?: () => void;
  className?: string;
  "aria-label"?: string;
  hideLabel?: boolean;
}) {
  return (
    <RACTextField value={value} onChange={onChange} className={cn("flex flex-col gap-1.5", className)}
      aria-label={props.hideLabel ? label : undefined}>
      {!props.hideLabel && <Label className={labelClass}>{label}</Label>}
      <Input placeholder={placeholder} className={inputClass}
        onKeyDown={event => { if (event.key === "Enter" && onEnter) { event.preventDefault(); onEnter(); } }} />
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </RACTextField>
  );
}

/** A native select: the platform picker is the right control for a long, grouped list. */
export function SelectField({ label, className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  const id = React.useId();
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select id={id} className={cn(inputClass, "cursor-pointer pr-8")} {...props}>{children}</select>
    </div>
  );
}

export function Checkbox({ isSelected, onChange, children, className }: {
  isSelected: boolean;
  onChange: (selected: boolean) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <RACCheckbox isSelected={isSelected} onChange={onChange}
      className={cn("group flex min-h-10 cursor-pointer items-center gap-2.5 text-sm text-foreground", className)}>
      <span className="flex size-4 shrink-0 items-center justify-center rounded border border-input bg-background transition-colors group-data-[selected]:border-primary group-data-[selected]:bg-primary group-data-[focus-visible]:ring-2 group-data-[focus-visible]:ring-ring">
        <svg className="size-2.5 text-primary-foreground opacity-0 group-data-[selected]:opacity-100" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M3 8L6 11L11 3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {children}
    </RACCheckbox>
  );
}
