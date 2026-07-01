"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isActivePublicRoute, isPublicNavGroup, type PublicSidebarNavItem } from "@/lib/navigation";

export function PublicSidebarNav({ items }: { items: PublicSidebarNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="mt-14 space-y-3" aria-label="Public navigation">
      {items.map((item) => (isPublicNavGroup(item) ? <NavGroup key={item.label} item={item} pathname={pathname} /> : <NavLink key={item.href} item={item} pathname={pathname} />))}
    </nav>
  );
}

function NavGroup({
  item,
  pathname
}: {
  item: Extract<PublicSidebarNavItem, { children: { href: string; label: string }[] }>;
  pathname: string | null;
}) {
  return (
    <div>
      <p className="px-4 pb-1 text-[0.68rem] font-semibold uppercase tracking-[0.18em] text-white/38">{item.label}</p>
      <div className="space-y-1">
        {item.children.map((child) => (
          <NavLink key={child.href} item={child} pathname={pathname} nested />
        ))}
      </div>
    </div>
  );
}

function NavLink({
  item,
  pathname,
  nested = false
}: {
  item: { href: string; label: string };
  pathname: string | null;
  nested?: boolean;
}) {
  const active = isActivePublicRoute(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between rounded-xl text-sm transition ${
        nested ? "ml-3 px-4 py-2.5 text-[0.82rem]" : "px-4 py-3"
      } ${active ? "bg-emerald-400/10 text-white ring-1 ring-emerald-300/15" : "text-white/62 hover:bg-white/[0.08] hover:text-white"}`}
    >
      <span>{item.label}</span>
      {active ? <span className="h-2 w-2 rounded-full bg-emerald-300" /> : null}
    </Link>
  );
}
