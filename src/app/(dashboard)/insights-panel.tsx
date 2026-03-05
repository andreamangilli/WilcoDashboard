import type { Insight } from "@/lib/queries/insights";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  TrendingDown,
  TrendingUp,
  Info,
  PackageX,
  BarChart3,
} from "lucide-react";

interface Props {
  insights: Insight[];
}

const severityClasses: Record<string, string> = {
  high: "border-red-200 bg-red-50 text-red-800",
  medium: "border-orange-200 bg-orange-50 text-orange-800",
  low: "border-blue-200 bg-blue-50 text-blue-800",
};

const typeIcons: Record<string, React.ElementType> = {
  anomaly_negative: AlertTriangle,
  anomaly_positive: TrendingUp,
  trend_negative: TrendingDown,
  platform_comparison: Info,
  stock_alert: PackageX,
  roas_alert: BarChart3,
};

export function InsightsPanel({ insights }: Props) {
  if (insights.length === 0) {
    return (
      <p className="text-sm text-green-600">
        Tutto nella norma — nessun segnale significativo
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {insights.map((insight, i) => {
        const Icon = typeIcons[insight.type];
        return (
          <div
            key={i}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3 py-2.5",
              severityClasses[insight.severity]
            )}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-sm font-medium">{insight.message}</p>
          </div>
        );
      })}
    </div>
  );
}
