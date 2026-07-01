"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { publicSidebarNavigation } from "@/lib/navigation";

export function PublicSidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="mt-14 space-y-2" aria-label="Public navigation">
      {publicSidebarNavigation.map((item) => {
        const active = isActiveRoute(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm transition ${
              active ? "bg-emerald-400/10 text-white ring-1 ring-emerald-300/15" : "text-white/62 hover:bg-white/[0.08] hover:text-white"
            }`}
          >
            <span>{item.label}</span>
            {active ? <span className="h-2 w-2 rounded-full bg-emerald-300" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function isActiveRoute(pathname: string | null, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/dashboard";
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}
