export default function AdsLoading() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-5">
        <div className="h-6 w-24 animate-pulse rounded-md bg-gray-200" />
        <div className="h-9 w-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
      {/* 3 KPI cards */}
      <div className="mb-6 grid grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
      {/* 2 platform cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 h-5 w-32 animate-pulse rounded bg-gray-200" />
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-4 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
