"use client";

import { CruiseRouteError } from "@/components/cruises/CruiseRouteError";

export default function CruisesError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <CruiseRouteError reset={reset} />;
}

