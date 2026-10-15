import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-provider";
import { ToastProvider } from "@/components/toast";
import { getAuth } from "@/lib/auth";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Scraper Analytics",
  description: "Dashboard for RedDeer Social Metrics",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const auth = await getAuth();
  return (
    <html
      lang="en"
      className={`dark ${dmSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="h-full overflow-hidden text-foreground bg-sidebar">
        <AuthProvider value={auth}><ToastProvider><AppShell>{children}</AppShell></ToastProvider></AuthProvider>
      </body>
    </html>
  );
}
