import { subDays, subYears, startOfDay, endOfDay } from "date-fns";

export function getDateRange(period: string, from?: string, to?: string) {
  // Custom date range takes precedence
  if (from && to) {
    const start = startOfDay(new Date(from));
    const end = endOfDay(new Date(to));
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      prevStart: startOfDay(subYears(start, 1)).toISOString(),
      prevEnd: endOfDay(subYears(end, 1)).toISOString(),
    };
  }

  const now = new Date();
  let start: Date;

  switch (period) {
    case "today":
      start = startOfDay(now);
      break;
    case "7d":
      start = startOfDay(subDays(now, 7));
      break;
    case "90d":
      start = startOfDay(subDays(now, 90));
      break;
    case "12m":
      start = startOfDay(subDays(now, 365));
      break;
    case "2025":
      start = new Date("2025-01-01T00:00:00Z");
      break;
    case "30d":
    default:
      start = startOfDay(subDays(now, 30));
  }

  // Year-over-year: compare with the same period last year
  return {
    start: start.toISOString(),
    end: endOfDay(now).toISOString(),
    prevStart: startOfDay(subYears(start, 1)).toISOString(),
    prevEnd: endOfDay(subYears(now, 1)).toISOString(),
  };
}
