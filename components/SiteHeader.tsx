"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

const navigation = [
  { href: "/methodology", label: "Methodology" },
  { href: "/data", label: "Data" },
  { href: "/support", label: "Support" }
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-charcoal/82 backdrop-blur">
      <nav className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8" aria-label="Main navigation">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2.5 text-lg font-semibold tracking-normal text-white"
            onClick={() => setOpen(false)}
          >
            <Image
              src="/logo/paperstraw-mark-small.png"
              alt=""
              width={36}
              height={38}
              className="h-9 w-auto shrink-0"
              priority
            />
            <span className="truncate">PaperStraw</span>
          </Link>

          <div className="hidden items-center gap-1 text-sm font-medium text-white/68 md:flex">
            {navigation.map((item) => (
              <Link key={item.href} className="px-2 py-2 hover:text-white sm:px-3" href={item.href}>
                {item.label}
              </Link>
            ))}
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-white/15 text-white transition hover:border-paper/60 hover:text-paper md:hidden"
            aria-label={open ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={open}
            aria-controls="mobile-navigation"
            onClick={() => setOpen((value) => !value)}
          >
            <span className="sr-only">{open ? "Close navigation menu" : "Open navigation menu"}</span>
            <span className="flex h-4 w-5 flex-col justify-between" aria-hidden="true">
              <span className={`h-0.5 w-full rounded-full bg-current transition ${open ? "translate-y-[7px] rotate-45" : ""}`} />
              <span className={`h-0.5 w-full rounded-full bg-current transition ${open ? "opacity-0" : ""}`} />
              <span className={`h-0.5 w-full rounded-full bg-current transition ${open ? "-translate-y-[7px] -rotate-45" : ""}`} />
            </span>
          </button>
        </div>

        <div
          id="mobile-navigation"
          className={`overflow-hidden transition-[max-height,opacity] duration-200 md:hidden ${
            open ? "max-h-56 opacity-100" : "max-h-0 opacity-0"
          }`}
        >
          <div className="mt-4 grid gap-1 border-t border-white/10 pt-3 text-sm font-medium text-white/76">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-3 transition hover:bg-white/10 hover:text-white"
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
    </header>
  );
}
