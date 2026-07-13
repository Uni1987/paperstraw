"use client";

import { useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { MAX_MANUAL_HISTORICAL_RANGE_DAYS } from "@/lib/ingestion/historicalRequest";

export function HistoricalImportForm({
  action,
  defaultDate,
  maximumDate
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultDate: string;
  maximumDate: string;
}) {
  const [from, setFrom] = useState(defaultDate);
  const [to, setTo] = useState(defaultDate);

  function validate(event: FormEvent<HTMLFormElement>) {
    const fromInput = event.currentTarget.elements.namedItem("from") as HTMLInputElement;
    const toInput = event.currentTarget.elements.namedItem("to") as HTMLInputElement;
    fromInput.setCustomValidity("");
    toInput.setCustomValidity("");
    if (!from || !to) return;
    if (from > to) {
      toInput.setCustomValidity("To date must be on or after From date.");
    } else {
      const dayCount = Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
      if (dayCount > MAX_MANUAL_HISTORICAL_RANGE_DAYS) {
        toInput.setCustomValidity(`Choose no more than ${MAX_MANUAL_HISTORICAL_RANGE_DAYS} inclusive days.`);
      }
    }
    if (!event.currentTarget.checkValidity()) {
      event.preventDefault();
      event.currentTarget.reportValidity();
    }
  }

  return (
    <form action={action} onSubmit={validate} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-semibold text-ink">
          From date
          <input
            name="from"
            type="date"
            required
            max={maximumDate}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm"
          />
        </label>
        <label className="grid gap-2 text-sm font-semibold text-ink">
          To date
          <input
            name="to"
            type="date"
            required
            min={from}
            max={maximumDate}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-full rounded-md border border-ink/15 bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>
      <label className="flex items-start gap-3 rounded-md border border-ink/10 bg-[#f7faf8] p-3 text-sm text-ink/75">
        <input name="force" type="checkbox" className="mt-1 h-4 w-4 accent-ink" />
        <span>
          <strong className="block text-ink">Force reprocess</strong>
          I understand that successfully imported dates will be scanned again. Duplicate flights remain protected and only supported attribution fields are updated.
        </span>
      </label>
      <p className="text-xs leading-5 text-ink/60">
        Dates are inclusive. Successfully imported days are skipped unless force reprocess is enabled. Manual requests are limited to {MAX_MANUAL_HISTORICAL_RANGE_DAYS} days.
      </p>
      <HistoricalImportSubmitButton />
    </form>
  );
}

function HistoricalImportSubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white hover:bg-moss disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "Starting historical import..." : "Start historical import"}
    </button>
  );
}
