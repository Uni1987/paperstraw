"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { publicSidebarNavigation } from "@/lib/navigation";

export function PublicShell({
  children,
  sidebarFooter
}: {
  children: ReactNode;
  sidebarFooter?: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#050908] text-white">
      <div className="mx-auto flex max-w-[1800px]">
        <PublicSidebar footer={sidebarFooter} />
        <section className="min-w-0 flex-1 px-4 py-4 sm:px-6 md:py-6 lg:px-8 xl:px-10">{children}</section>
      </div>
    </main>
  );
}

function PublicSidebar({ footer }: { footer?: ReactNode }) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-white/10 bg-[#08100f] p-6 lg:block">
      <Link href="/" className="flex items-center gap-3">
        <Image src="/logo/paperstraw-mark-small.png" alt="" width={34} height={36} className="h-9 w-auto" />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.12em] text-white">PaperStraw</p>
          <p className="mt-1 text-xs text-white/45">Aggregate emissions</p>
        </div>
      </Link>

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

      {footer ? <div className="absolute bottom-6 left-6 right-6">{footer}</div> : null}
    </aside>
  );
}

function isActiveRoute(pathname: string | null, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/dashboard";
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}
