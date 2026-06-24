import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperStraw",
  description: "Aggregate private jet CO2 awareness and dataset transparency"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <SiteHeader />
        {children}
        <Analytics />
      </body>
    </html>
  );
}
