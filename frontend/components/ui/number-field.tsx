"use client";

import { useState } from "react";
import { Input, Label, Text, TextField } from "react-aria-components";
import { cn } from "@/lib/utils";
import { inputClass, labelClass } from "@/components/ui/styles";

type NumberFieldProps = {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max?: number;
  label?: string;
  /** Helper text under the input, read out with it. */
  description?: string;
  "aria-label"?: string;
  isDisabled?: boolean;
  className?: string;
  inputClassName?: string;
  suffix?: React.ReactNode;
};

/**
 * A whole-number input that can be cleared while typing. The text being edited is kept
 * separately from the saved number: only valid numbers are passed up, clamped to range,
 * and leaving the field restores the last valid value instead of forcing one mid-edit.
 */
export function NumberField({ value, onChange, min, max = Number.MAX_SAFE_INTEGER, label, description, suffix,
  className, inputClassName, ...props }: NumberFieldProps) {
  const [draft, setDraft] = useState(String(value));
  const [committed, setCommitted] = useState(value);
  // Follow changes made elsewhere, such as loading saved settings or "Select All".
  if (value !== committed) {
    setCommitted(value);
    setDraft(String(value));
  }

  const edit = (text: string) => {
    setDraft(text);
    const parsed = Number.parseInt(text, 10);
    if (Number.isNaN(parsed)) return;
    const next = Math.min(max, Math.max(min, parsed));
    setCommitted(next);
    onChange(next);
  };

  return (
    <TextField value={draft} onChange={edit} onBlur={() => setDraft(String(committed))}
      isDisabled={props.isDisabled} aria-label={props["aria-label"]} className={cn("flex flex-col gap-1.5", className)}>
      {label && <Label className={labelClass}>{label}</Label>}
      <Input type="number" inputMode="numeric" min={min} max={max === Number.MAX_SAFE_INTEGER ? undefined : max}
        className={inputClassName ?? inputClass} />
      {suffix}
      {description && <Text slot="description" className="text-xs text-muted-foreground">{description}</Text>}
    </TextField>
  );
}
