export type RelativeDateRange = "today" | "yesterday" | "7days" | "30days" | "month" | "lastMonth";

export function relativeDates(range: RelativeDateRange, now = new Date()) {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(to);
  if (range === "yesterday") { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1); }
  if (range === "7days") from.setDate(from.getDate() - 6);
  if (range === "30days") from.setDate(from.getDate() - 29);
  if (range === "month") from.setDate(1);
  if (range === "lastMonth") { from.setMonth(from.getMonth() - 1, 1); to.setDate(0); }
  const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { from: iso(from), to: iso(to) };
}
