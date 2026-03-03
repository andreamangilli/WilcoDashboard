export default function AmazonLoading() {
  return (
    <div>
      <div className="mb-8 flex items-center justify-between border-b border-gray-200 pb-5">
        <div className="h-6 w-24 animate-pulse rounded-md bg-gray-200" />
        <div className="h-9 w-64 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="h-3 w-24 animate-pulse rounded bg-gray-200" />
            <div className="mt-3 h-7 w-20 animate-pulse rounded bg-gray-200" />
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-gray-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
