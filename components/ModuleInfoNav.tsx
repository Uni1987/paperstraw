import Link from "next/link";

export function ModuleInfoNav({
  hubHref,
  hubLabel,
  currentModule,
  siblingHref,
  siblingLabel
}: {
  hubHref: string;
  hubLabel: string;
  currentModule: string;
  siblingHref: string;
  siblingLabel: string;
}) {
  return (
    <nav className="mb-8 flex flex-wrap items-center gap-3 text-sm" aria-label="Module information navigation">
      <Link href={hubHref} className="rounded-full border border-white/12 bg-white/[0.035] px-4 py-2 font-semibold text-white/68 transition hover:border-paper/40 hover:text-paper">
        {hubLabel}
      </Link>
      <span className="rounded-full border border-paper/30 bg-paper/10 px-4 py-2 font-semibold text-paper">
        {currentModule}
      </span>
      <Link href={siblingHref} className="rounded-full border border-white/12 bg-white/[0.035] px-4 py-2 font-semibold text-white/68 transition hover:border-paper/40 hover:text-paper">
        {siblingLabel}
      </Link>
    </nav>
  );
}
