"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Settings } from "lucide-react";

const navItems = [
  { href: "/",        label: "Overview", Icon: LayoutDashboard },
  { href: "/posts",   label: "Posts",    Icon: FileText },
  { href: "/scraper", label: "Manager",  Icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
      {navItems.map(({ href, label, Icon }) => {
        const isActive = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors text-sm ${
              isActive
                ? "bg-sidebar-foreground/10 text-sidebar-foreground font-medium"
                : "text-sidebar-foreground/60 hover:bg-sidebar-foreground/5 hover:text-sidebar-foreground"
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
