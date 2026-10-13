"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Menu, PanelLeftClose, PanelLeftOpen, X } from "lucide-react";
import { SidebarNav } from "@/components/sidebar-nav";
import { SidebarAccount } from "@/components/sidebar-account";

// Matches Tailwind's `lg` breakpoint: below it the sidebar becomes an overlay drawer.
const DESKTOP_QUERY = "(min-width: 64rem)";

function subscribeToDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function AppShell({ children }: { children: ReactNode }) {
  const isDesktop = useSyncExternalStore(
    subscribeToDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
  const [desktopOpen, setDesktopOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const toggleButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  const sidebarOpen = isDesktop ? desktopOpen : mobileOpen;
  const drawerOpen = !isDesktop && mobileOpen;
  const ToggleIcon = desktopOpen ? PanelLeftClose : PanelLeftOpen;
  const toggleLabel = sidebarOpen ? "Close sidebar" : "Open sidebar";

  useEffect(() => {
    if (!drawerOpen) return;
    const toggle = toggleButton.current;
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      // Runs after the drawer closes and the main area is no longer inert.
      toggle?.focus();
    };
  }, [drawerOpen]);

  return (
    <div className="relative flex h-dvh overflow-hidden bg-sidebar p-2 sm:p-4">
      {drawerOpen && (
        <div
          aria-hidden="true"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <aside
        id="app-sidebar"
        aria-label="Main navigation"
        aria-hidden={!sidebarOpen}
        inert={!sidebarOpen}
        // Close the mobile drawer once a link inside it is followed.
        onClick={(event) => {
          if (!isDesktop && (event.target as HTMLElement).closest("a")) setMobileOpen(false);
        }}
        className={`fixed inset-y-0 left-0 z-40 shrink-0 overflow-hidden bg-sidebar py-3 pl-3 shadow-xl transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none lg:static lg:z-auto lg:translate-x-0 lg:p-0 lg:shadow-none lg:transition-[width,opacity] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${desktopOpen ? "lg:w-68 lg:opacity-100" : "lg:w-0 lg:opacity-0"}`}
      >
        <div className="flex h-full w-68 flex-col overflow-y-auto pr-3">
          <div className="mb-6 flex shrink-0 items-center justify-between gap-2 px-2 pt-2">
            <h2 className="whitespace-nowrap text-2xl font-semibold tracking-tight text-sidebar-foreground">
              RedDeer Scraper
            </h2>
            <button
              ref={closeButton}
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close sidebar"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring lg:hidden"
            >
              <X className="size-5" aria-hidden="true" />
            </button>
          </div>
          <SidebarNav />
          <div className="mx-3 py-4">
            <SidebarAccount />
          </div>
        </div>
      </aside>

      <main
        inert={drawerOpen}
        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-[20px] bg-background sm:rounded-[28px]"
      >
        <div className="flex shrink-0 items-center gap-2 px-3 pt-3 sm:px-5 sm:pt-4 lg:px-9">
          <button
            ref={toggleButton}
            type="button"
            onClick={() => (isDesktop ? setDesktopOpen((open) => !open) : setMobileOpen(true))}
            aria-label={toggleLabel}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            title={toggleLabel}
            className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none lg:size-10"
          >
            <Menu className="size-5 lg:hidden" aria-hidden="true" />
            <ToggleIcon className="hidden size-5 lg:block" aria-hidden="true" />
          </button>
          <span className="truncate text-base font-semibold tracking-tight text-foreground lg:hidden">
            RedDeer Scraper
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-4 pb-8 pt-3 sm:px-6 sm:pt-4 lg:p-10 lg:pt-4">
          <div className="mx-auto max-w-7xl">{children}</div>
        </div>
      </main>
    </div>
  );
}
