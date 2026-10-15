"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Settings } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

export const navItems = [
  { href: "/",        label: "Overview", Icon: LayoutDashboard },
  { href: "/posts",   label: "Posts",    Icon: FileText },
  { href: "/scraper", label: "Manager",  Icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
      {navItems.filter(item => item.href !== "/scraper" || isAdmin).map(({ href, label, Icon }) => {
        const isActive = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring ${
              isActive
                ? "bg-brand/12 font-medium text-sidebar-foreground"
                : "text-sidebar-foreground/60 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground"
            }`}
          >
            <Icon className={`size-4 shrink-0 ${isActive ? "text-brand" : ""}`} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
