export function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
      <div className="text-sm font-medium text-ink/62">{label}</div>
      <div className="mt-3 text-2xl font-bold tracking-normal text-ink">{value}</div>
      <div className="mt-2 text-xs leading-5 text-ink/55">{detail}</div>
    </div>
  );
}
