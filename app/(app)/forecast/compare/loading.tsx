export default function CompareLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="h-7 w-56 rounded bg-zinc-200" />
      <div className="rounded-lg border border-zinc-200">
        <div className="space-y-px">
          <div className="flex h-10 items-center gap-8 border-b border-zinc-200 bg-zinc-50 px-4">
            <div className="h-3 w-24 rounded bg-zinc-200" />
            <div className="ml-auto flex gap-10">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-3 w-20 rounded bg-zinc-200" />
              ))}
            </div>
          </div>
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex h-9 items-center gap-8 px-4">
              <div className="h-3 w-28 rounded bg-zinc-100" />
              <div className="ml-auto flex gap-10">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-3 w-16 rounded bg-zinc-100" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
