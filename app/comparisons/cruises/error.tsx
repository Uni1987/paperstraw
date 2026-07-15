"use client";

import { CruiseRouteError } from "@/components/cruises/CruiseRouteError";

export default function CruiseComparisonsError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CruiseRouteError reset={reset} />;
}

