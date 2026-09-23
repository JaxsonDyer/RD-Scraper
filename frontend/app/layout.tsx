import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { SidebarNav } from "@/components/sidebar-nav";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${dmSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex h-full min-h-screen text-foreground bg-background">

        {/* Sidebar */}
        <aside className="w-60 flex-shrink-0 bg-sidebar border-r border-sidebar-border flex flex-col z-10">
          <div className="px-5 py-5 border-b border-sidebar-border">
            <h2 className="text-base font-semibold text-sidebar-foreground tracking-tight">
              RedDeer Scraper
            </h2>
          </div>

          <SidebarNav />
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
