import { subDays, startOfDay, endOfDay } from "date-fns";

export function getDateRange(period: string) {
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
    case "30d":
    default:
      start = startOfDay(subDays(now, 30));
  }

  return {
    start: start.toISOString(),
    end: endOfDay(now).toISOString(),
    prevStart: startOfDay(
      subDays(start, Math.ceil((now.getTime() - start.getTime()) / 86400000))
    ).toISOString(),
    prevEnd: start.toISOString(),
  };
}
