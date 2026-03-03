export default function DashboardLoading() {
  return (
    <div>
      {/* PageHeader skeleton */}
      <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-5">
        <div>
          <div className="h-6 w-32 animate-pulse rounded-md bg-gray-200" />
          <div className="mt-1 h-4 w-48 animate-pulse rounded-md bg-gray-100" />
        </div>
        <div className="h-9 w-64 animate-pulse rounded-lg bg-gray-100" />
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>

      {/* Chart + signals skeleton */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 h-5 w-40 animate-pulse rounded bg-gray-200" />
          <div className="h-52 animate-pulse rounded-lg bg-gray-100" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-6">
          <div className="mb-4 h-5 w-36 animate-pulse rounded bg-gray-200" />
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        </div>
      </div>

      {/* Top products skeleton */}
      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 h-5 w-28 animate-pulse rounded bg-gray-200" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-48 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-20 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
