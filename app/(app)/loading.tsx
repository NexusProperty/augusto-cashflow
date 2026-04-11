export default function Loading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-7 w-48 rounded bg-zinc-200"></div>
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-zinc-200 p-4">
            <div className="h-3 w-24 rounded bg-zinc-200"></div>
            <div className="mt-2 h-8 w-32 rounded bg-zinc-200"></div>
            <div className="mt-2 h-3 w-20 rounded bg-zinc-100"></div>
          </div>
        ))}
      </div>
      <div className="h-64 rounded-lg border border-zinc-200 bg-zinc-50"></div>
    </div>
  )
}
