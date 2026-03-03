export default function ProdottiLoading() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-5">
        <div className="h-6 w-24 animate-pulse rounded-md bg-gray-200" />
        <div className="h-9 w-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
      {/* Tab buttons */}
      <div className="mb-5 flex gap-2">
        <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-200" />
        <div className="h-9 w-24 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 flex gap-8">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-3 w-16 animate-pulse rounded bg-gray-200" />
          ))}
        </div>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex gap-8 px-4 py-3 border-t border-gray-100">
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="h-4 w-20 animate-pulse rounded bg-gray-100" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
