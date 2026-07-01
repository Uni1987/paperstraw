export type DateInput = Date | string | number | null | undefined;

export function normalizeDate(value: DateInput) {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isSameCalendarDay(left: DateInput, right: DateInput) {
  const leftDate = normalizeDate(left);
  const rightDate = normalizeDate(right);
  if (!leftDate || !rightDate) return false;

  return (
    leftDate.getFullYear() === rightDate.getFullYear() &&
    leftDate.getMonth() === rightDate.getMonth() &&
    leftDate.getDate() === rightDate.getDate()
  );
}
