import { formatCurrency, formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { SparklineChart } from "./sparkline-chart";

const variantBorder: Record<string, string> = {
  blue: "border-l-blue-500",
  green: "border-l-emerald-500",
  violet: "border-l-violet-500",
  amber: "border-l-amber-500",
  rose: "border-l-rose-500",
  teal: "border-l-teal-500",
  cyan: "border-l-cyan-500",
};

const variantSparkColor: Record<string, string> = {
  blue: "#3b82f6",
  green: "#10b981",
  violet: "#8b5cf6",
  amber: "#f59e0b",
  rose: "#f43f5e",
  teal: "#14b8a6",
  cyan: "#06b6d4",
};

export type KpiCardVariant = "blue" | "green" | "violet" | "amber" | "rose" | "teal" | "cyan";

interface KpiCardProps {
  title: string;
  value: number;
  format: "currency" | "number" | "percent" | "decimal";
  change?: number;
  variant?: KpiCardVariant;
  sparklineData?: number[];
}

export function KpiCard({ title, value, format, change, variant = "blue", sparklineData }: KpiCardProps) {
  const formatted =
    format === "currency"
      ? formatCurrency(value)
      : format === "percent"
        ? `${value.toFixed(1)}%`
        : format === "decimal"
          ? value.toFixed(2)
          : formatNumber(value);

  return (
    <div
      className={cn(
        "rounded-xl border border-gray-200 border-l-4 bg-white px-5 py-4 shadow-sm",
        variantBorder[variant]
      )}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
          {title}
        </p>
        {sparklineData && sparklineData.length > 1 && (
          <SparklineChart data={sparklineData} color={variantSparkColor[variant]} />
        )}
      </div>
      <p className="mt-2 font-mono text-2xl font-bold tracking-tight text-gray-900">
        {formatted}
      </p>
      {change !== undefined && (
        <div
          className={cn(
            "mt-2 flex items-center gap-1 text-xs font-semibold",
            change >= 0 ? "text-emerald-600" : "text-red-500"
          )}
        >
          {change > 0 ? (
            <TrendingUp className="h-3 w-3" />
          ) : change < 0 ? (
            <TrendingDown className="h-3 w-3" />
          ) : (
            <Minus className="h-3 w-3" />
          )}
          <span>
            {change >= 0 ? "+" : ""}
            {formatPercent(change)} vs periodo prec.
          </span>
        </div>
      )}
    </div>
  );
}
