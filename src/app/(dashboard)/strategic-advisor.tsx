import type { StrategicRecommendation, Framework, Priority } from "@/lib/queries/strategic";
import { cn } from "@/lib/utils";

interface Props {
  recommendations: StrategicRecommendation[];
}

const frameworkColors: Record<Framework, string> = {
  loss_aversion: "bg-red-100 text-red-700",
  pareto: "bg-violet-100 text-violet-700",
  anchoring: "bg-blue-100 text-blue-700",
  theory_of_constraints: "bg-amber-100 text-amber-700",
  second_order: "bg-orange-100 text-orange-700",
  barbell: "bg-teal-100 text-teal-700",
};

const priorityIndicator: Record<Priority, { color: string; label: string }> = {
  high: { color: "bg-red-500", label: "Alta" },
  medium: { color: "bg-amber-500", label: "Media" },
  low: { color: "bg-blue-500", label: "Bassa" },
};

export function StrategicAdvisor({ recommendations }: Props) {
  if (recommendations.length === 0) {
    return (
      <p className="text-sm text-green-600">
        Nessuna raccomandazione strategica — performance nella norma.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {recommendations.map((rec, i) => {
        const priority = priorityIndicator[rec.priority];
        return (
          <div
            key={i}
            className="rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm"
          >
            <div className="flex items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", frameworkColors[rec.framework])}>
                {rec.framework_label}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-gray-500">
                <span className={cn("inline-block h-2 w-2 rounded-full", priority.color)} />
                {priority.label}
              </span>
              {rec.metric && (
                <span className="ml-auto font-mono text-sm font-bold text-gray-800">
                  {rec.metric}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-sm font-semibold text-gray-900">{rec.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-600">{rec.description}</p>
          </div>
        );
      })}
    </div>
  );
}
