import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PaperStraw",
  description: "Aggregate private jet CO2 awareness and dataset transparency"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <header className="sticky top-0 z-50 border-b border-white/10 bg-charcoal/82 backdrop-blur">
          <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-normal text-white">
              <Image
                src="/logo/paperstraw-mark-small.png"
                alt=""
                width={36}
                height={38}
                className="h-9 w-auto shrink-0"
                priority
              />
              <span>PaperStraw</span>
            </Link>
            <div className="flex items-center gap-1 text-sm font-medium text-white/68 sm:gap-2">
              <Link className="px-2 py-2 hover:text-white sm:px-3" href="/methodology">
                Methodology
              </Link>
              <Link className="px-2 py-2 hover:text-white sm:px-3" href="/data">
                Data
              </Link>
              <Link className="px-2 py-2 hover:text-white sm:px-3" href="/support">
                Support
              </Link>
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
