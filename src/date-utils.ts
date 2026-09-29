export function dateKey(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parseDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000"))
    return null;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && dateKey(date) === value ? date : null;
}

export function shiftMonth(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(1);
  next.setMonth(next.getMonth() + amount);
  const last = new Date(next);
  last.setMonth(last.getMonth() + 1, 0);
  next.setDate(Math.min(date.getDate(), last.getDate()));
  return next;
}

export function monthDays(date: Date) {
  const start = new Date(date);
  start.setDate(1);
  start.setDate(1 - ((start.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}
