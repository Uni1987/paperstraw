"use client";

import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";

type AnimatedValueProps = {
  value: number;
  format?: "integer" | "compact" | "tonnes" | "kilometers";
  className?: string;
};

export function AnimatedValue({ value, format = "integer", className }: AnimatedValueProps) {
  const motionValue = useMotionValue(0);
  const displayValue = useTransform(motionValue, (latest) => formatValue(latest, format));

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 1.2,
      ease: [0.16, 1, 0.3, 1]
    });

    return controls.stop;
  }, [motionValue, value]);

  return <motion.span className={className}>{displayValue}</motion.span>;
}

function formatValue(value: number, format: AnimatedValueProps["format"]) {
  if (format === "compact") return compact(value);
  if (format === "tonnes") return `${Math.round(value / 1000).toLocaleString()} tonnes CO2`;
  if (format === "kilometers") return `${Math.round(value).toLocaleString()} km`;
  return Math.round(value).toLocaleString();
}

function compact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: value >= 1000000 ? 1 : 0
  }).format(value);
}
