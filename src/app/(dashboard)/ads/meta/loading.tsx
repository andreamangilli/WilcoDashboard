export default function MetaAdsLoading() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-5">
        <div className="h-6 w-28 animate-pulse rounded-md bg-gray-200" />
        <div className="h-9 w-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-3 w-20 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-7 w-16 animate-pulse rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="mb-8 rounded-xl border border-gray-200 bg-white p-6">
        <div className="h-40 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 flex gap-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-3 w-16 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex gap-8 px-4 py-3 border-t border-gray-100">
            {Array.from({ length: 6 }).map((_, j) => (
              <div key={j} className="h-4 w-16 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
