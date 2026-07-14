"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { isActivePublicRoute, isPublicNavGroup, resolveModuleAwarePublicHref, type PublicSidebarNavItem } from "@/lib/navigation";

export function PublicSidebarNav({ items }: { items: PublicSidebarNavItem[] }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  return (
    <nav className="mt-14 space-y-3" aria-label="Public navigation">
      {items.map((item) =>
        isPublicNavGroup(item) ? (
          <NavGroup key={item.label} item={item} pathname={pathname} pendingHref={pendingHref} onNavigate={setPendingHref} />
        ) : (
          <NavLink key={item.href} item={item} pathname={pathname} pendingHref={pendingHref} onNavigate={setPendingHref} />
        )
      )}
    </nav>
  );
}

function NavGroup({
  item,
  pathname,
  pendingHref,
  onNavigate
}: {
  item: Extract<PublicSidebarNavItem, { children: { href: string; label: string }[] }>;
  pathname: string | null;
  pendingHref: string | null;
  onNavigate: (href: string) => void;
}) {
  return (
    <div>
      <p className="px-4 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/38">{item.label}</p>
      <div className="space-y-1">
        {item.children.map((child) => (
          <NavLink key={child.href} item={child} pathname={pathname} pendingHref={pendingHref} onNavigate={onNavigate} nested />
        ))}
      </div>
    </div>
  );
}

function NavLink({
  item,
  pathname,
  pendingHref,
  onNavigate,
  nested = false
}: {
  item: { href: string; label: string };
  pathname: string | null;
  pendingHref: string | null;
  onNavigate: (href: string) => void;
  nested?: boolean;
}) {
  const href = resolveModuleAwarePublicHref(pathname, item.href);
  const active = isActivePublicRoute(pathname, href);
  const pending = pendingHref === href && !active;
  return (
    <Link
      href={href}
      prefetch={href === "/cruises" ? true : undefined}
      aria-current={active ? "page" : undefined}
      aria-busy={pending || undefined}
      onClick={(event) => {
        if (
          active ||
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        ) {
          return;
        }
        if (href === "/cruises") {
          onNavigate(href);
        }
      }}
      className={`flex items-center justify-between rounded-xl text-sm transition ${
        nested ? "ml-3 px-4 py-2.5 text-[0.82rem]" : "px-4 py-3"
      } ${
        active
          ? "bg-emerald-400/10 text-white ring-1 ring-emerald-300/15"
          : pending
            ? "bg-white/[0.08] text-white ring-1 ring-white/10"
            : "text-white/62 hover:bg-white/[0.08] hover:text-white"
      }`}
    >
      <span>{item.label}</span>
      {active ? <span className="h-2 w-2 rounded-full bg-emerald-300" /> : null}
      {pending ? <span className="h-2 w-2 animate-pulse rounded-full bg-paper" aria-hidden="true" /> : null}
    </Link>
  );
}
