"use client";

import { useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";

export function AppShell({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const ToggleIcon = sidebarOpen ? PanelLeftClose : PanelLeftOpen;
  const toggleLabel = sidebarOpen ? "Close sidebar" : "Open sidebar";

  return (
    <div className="relative flex h-dvh overflow-hidden bg-sidebar p-3 sm:p-4">
      <aside
        id="app-sidebar"
        aria-label="Main navigation"
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
        className={`shrink-0 overflow-hidden transition-[width,opacity] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
          sidebarOpen ? "w-68 opacity-100" : "w-0 opacity-0"
        }`}
      >
        <div className="flex h-full w-68 flex-col overflow-y-auto pr-3">
          <h2 className="mb-6 shrink-0 whitespace-nowrap px-2 pt-2 text-2xl font-semibold tracking-tight text-sidebar-foreground">
            RedDeer Scraper
          </h2>
          <SidebarNav />
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[28px] bg-background">
        <div className="shrink-0 px-5 pt-4 lg:px-9">
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            aria-label={toggleLabel}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            title={toggleLabel}
            className="inline-flex size-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          >
            <ToggleIcon className="size-5" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-6 pt-4 lg:p-10 lg:pt-4">
          <div className="mx-auto max-w-7xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
