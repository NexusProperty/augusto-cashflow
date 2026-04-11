export default function ForecastDetailLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div>
        <div className="h-7 w-40 rounded bg-zinc-200" />
        <div className="mt-1 h-3 w-64 rounded bg-zinc-100" />
      </div>
      <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-zinc-200 bg-white px-4 py-3">
        <div className="h-8 w-36 rounded-md bg-zinc-100" />
        <div className="h-5 w-44 rounded bg-zinc-100" />
      </div>
      <div className="rounded-b-lg border border-zinc-200">
        <div className="space-y-px">
          {Array.from({ length: 14 }).map((_, i) => (
            <div
              key={i}
              className={`flex h-9 items-center gap-4 px-3 ${i % 5 === 0 ? 'bg-zinc-100' : ''}`}
            >
              <div className="h-3 w-40 rounded bg-zinc-200" />
              <div className="ml-auto flex gap-6">
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j} className="h-3 w-14 rounded bg-zinc-100" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
