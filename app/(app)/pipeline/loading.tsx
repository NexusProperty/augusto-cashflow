export default function PipelineLoading() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="flex items-center justify-between">
        <div className="h-7 w-44 rounded bg-zinc-200" />
        <div className="flex gap-2">
          <div className="h-8 w-20 rounded-md bg-zinc-100" />
          <div className="h-8 w-20 rounded-md bg-zinc-100" />
          <div className="h-8 w-28 rounded-md bg-indigo-100" />
        </div>
      </div>
      <div className="rounded-lg border border-zinc-200">
        <div className="space-y-px">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className={`flex h-10 items-center gap-4 px-3 ${i % 4 === 0 ? 'bg-zinc-100' : ''}`}
            >
              <div className="h-3 w-32 rounded bg-zinc-200" />
              <div className="h-3 w-40 rounded bg-zinc-200" />
              <div className="ml-auto flex gap-6">
                {Array.from({ length: 5 }).map((_, j) => (
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
