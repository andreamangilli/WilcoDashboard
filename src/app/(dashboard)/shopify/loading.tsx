export default function ShopifyLoading() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-5">
        <div className="h-6 w-24 animate-pulse rounded-md bg-gray-200" />
        <div className="h-9 w-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-6">
            <div className="mb-4 h-5 w-32 animate-pulse rounded bg-gray-200" />
            <div className="space-y-3">
              <div className="h-4 w-full animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-gray-100" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-gray-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
