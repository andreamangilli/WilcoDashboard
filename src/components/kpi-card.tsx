import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: number;
  format: "currency" | "number" | "percent";
  change?: number;
}

export function KpiCard({ title, value, format, change }: KpiCardProps) {
  const formatted =
    format === "currency"
      ? formatCurrency(value)
      : format === "percent"
        ? `${value.toFixed(1)}%`
        : formatNumber(value);

  return (
    <Card>
      <CardContent className="p-6">
        <p className="text-sm font-medium text-gray-500">{title}</p>
        <p className="mt-1 text-2xl font-bold">{formatted}</p>
        {change !== undefined && (
          <p
            className={cn(
              "mt-1 text-sm font-medium",
              change >= 0 ? "text-green-600" : "text-red-600"
            )}
          >
            {formatPercent(change)} vs periodo prec.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
