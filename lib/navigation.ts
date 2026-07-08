export type PublicNavLink = {
  href: string;
  label: string;
};

export type PublicSidebarNavItem =
  | PublicNavLink
  | {
      label: string;
      children: PublicNavLink[];
    };

export function getPublicSidebarNavigation({ cruisesEnabled }: { cruisesEnabled: boolean }): PublicSidebarNavItem[] {
  return [
    {
      label: "Overview",
      children: [
        { href: "/", label: "Private Jets" },
        ...(cruisesEnabled ? [{ href: "/cruises", label: "Cruises" }] : [])
      ]
    },
    { href: "/comparisons", label: "Comparisons" },
    { href: "/data", label: "Data" },
    { href: "/methodology", label: "Methodology" },
    { href: "/support", label: "Support" }
  ];
}

export const publicDesktopNavigation = [
  { href: "/comparisons", label: "Comparisons" },
  { href: "/methodology", label: "Methodology" },
  { href: "/data", label: "Data" },
  { href: "/support", label: "Support" }
] as const;

export function getPublicMobileNavigation({ cruisesEnabled }: { cruisesEnabled: boolean }) {
  return getPublicSidebarNavigation({ cruisesEnabled });
}

export function isPublicNavGroup(item: PublicSidebarNavItem): item is Extract<PublicSidebarNavItem, { children: PublicNavLink[] }> {
  return "children" in item;
}

export function isActivePublicRoute(pathname: string | null, href: string) {
  if (href === "/") return pathname === "/" || pathname === "/dashboard";
  return pathname === href || Boolean(pathname?.startsWith(`${href}/`));
}

export function resolveModuleAwarePublicHref(pathname: string | null, href: string) {
  if (href !== "/comparisons" && href !== "/data" && href !== "/methodology") return href;
  const moduleSegment = getActivePublicModuleSegment(pathname);
  return moduleSegment ? `${href}/${moduleSegment}` : href;
}

export function getActivePublicModuleSegment(pathname: string | null): "private-jets" | "cruises" | null {
  if (!pathname) return null;
  if (
    pathname === "/" ||
    pathname === "/dashboard" ||
    pathname.startsWith("/comparisons/private-jets") ||
    pathname.startsWith("/data/private-jets") ||
    pathname.startsWith("/methodology/private-jets")
  ) {
    return "private-jets";
  }
  if (
    pathname === "/cruises" ||
    pathname.startsWith("/cruises/") ||
    pathname.startsWith("/comparisons/cruises") ||
    pathname.startsWith("/data/cruises") ||
    pathname.startsWith("/methodology/cruises")
  ) {
    return "cruises";
  }
  return null;
}
