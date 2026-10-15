"use client";

import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

// The shell owns the header row (sidebar toggle and page title); pages place their
// own controls at its end through this slot.
export const HeaderActionsSlot = createContext<HTMLElement | null>(null);

export function HeaderActions({ children }: { children: ReactNode }) {
  const slot = useContext(HeaderActionsSlot);
  return slot ? createPortal(children, slot) : null;
}
