export default function ForecastLoading() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 rounded bg-zinc-200"></div>
        <div className="flex gap-2">
          <div className="h-9 w-36 rounded-md bg-zinc-100"></div>
          <div className="h-9 w-32 rounded-md bg-zinc-100"></div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-zinc-200 p-4">
            <div className="h-3 w-24 rounded bg-zinc-200"></div>
            <div className="mt-2 h-8 w-32 rounded bg-zinc-200"></div>
            <div className="mt-2 h-3 w-20 rounded bg-zinc-100"></div>
          </div>
        ))}
      </div>
      <div className="flex gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 w-28 rounded-t-md bg-zinc-100"></div>
        ))}
      </div>
      <div className="rounded-b-lg border border-zinc-200">
        <div className="space-y-px">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={`flex h-8 items-center px-3 ${i % 4 === 0 ? 'bg-zinc-100' : ''}`}>
              <div className="h-3 w-40 rounded bg-zinc-200"></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
