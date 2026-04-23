import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from 'next/link';
import { LayoutDashboard, FileText, Settings, Rabbit } from "lucide-react";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Scraper Analytics",
  description: "Dashboard for RedDeer Social Metrics",
};

const navItems = [
  { href: "/",        label: "Overview", Icon: LayoutDashboard },
  { href: "/posts",   label: "Posts",    Icon: FileText },
  { href: "/scraper", label: "Manager",  Icon: Settings },
];

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full min-h-screen text-foreground bg-background">

        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0 bg-card border-r border-border flex flex-col z-10">
          <div className="px-5 py-5 border-b border-border flex items-center gap-2.5">
            <Rabbit className="w-6 h-6 text-primary shrink-0" />
            <h2 className="text-base font-semibold text-card-foreground tracking-tight">
              RedDeer Scraper
            </h2>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-0.5">
            {navItems.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-sm"
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            ))}
          </nav>
        </aside>

        {/* Content Region */}
        <main className="flex-1 overflow-auto bg-background p-10">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>

      </body>
    </html>
  );
}
