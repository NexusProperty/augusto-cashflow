export default function DocumentsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-7 w-32 rounded bg-zinc-200"></div>
      <div className="h-32 rounded-lg border-2 border-dashed border-zinc-200"></div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between rounded-lg border border-zinc-200 p-3">
            <div className="space-y-1.5">
              <div className="h-4 w-40 rounded bg-zinc-200"></div>
              <div className="h-3 w-24 rounded bg-zinc-100"></div>
            </div>
            <div className="h-5 w-16 rounded-md bg-zinc-100"></div>
          </div>
        ))}
      </div>
    </div>
  )
}
