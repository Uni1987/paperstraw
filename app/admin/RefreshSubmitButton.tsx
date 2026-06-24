"use client";

import { useFormStatus } from "react-dom";

export function RefreshSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-ink px-4 py-3 text-sm font-semibold text-white hover:bg-moss disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? "Refreshing latest data..." : "Refresh latest data now"}
    </button>
  );
}
