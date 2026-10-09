"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, FileText, Settings } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

const navItems = [
  { href: "/",        label: "Overview", Icon: LayoutDashboard },
  { href: "/posts",   label: "Posts",    Icon: FileText },
  { href: "/scraper", label: "Manager",  Icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();

  return (
    <nav className="flex flex-1 flex-col gap-2 px-3 py-4">
      {navItems.filter(item => item.href !== "/scraper" || isAdmin).map(({ href, label, Icon }) => {
        const isActive = pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            className={`flex min-h-11 items-center gap-3 px-3 py-2.5 rounded-md transition-colors text-sm ${
              isActive
                ? "bg-white text-sidebar font-medium shadow-sm"
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
