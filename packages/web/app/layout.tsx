import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/AppShell";

import "./globals.css";

export const metadata: Metadata = {
  title: "TheOpenTranscribe",
  description: "Self-hosted transcription: upload media, watch it transcribe, read the result.",
};

/* No <meta name="theme-color"> existed before a prior pass added this.
   Without one, iOS Safari (and Chrome/Android) has nothing to theme its
   OWN chrome (status-bar/toolbar strip) with, and falls back to a plain
   white -- which sits directly adjacent to/over our sticky mobile top
   bar, reading as a mismatched strip even when .mobileTopBar's own
   background is correct. This is a literal hex, not a var() -- theme-color
   meta content can't reference a CSS custom property -- so it must be
   kept in sync by hand with --color-bg's value in app/globals.css (the
   canonical beige every primary nav-chrome surface now reuses directly)
   if that token ever changes. */
export const viewport: Viewport = {
  themeColor: "#f6f4ef",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
