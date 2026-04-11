export default function SettingsLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-7 w-28 rounded bg-zinc-200"></div>
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-zinc-200 p-4">
            <div className="h-4 w-36 rounded bg-zinc-200"></div>
            <div className="mt-2 h-3 w-48 rounded bg-zinc-100"></div>
          </div>
        ))}
      </div>
    </div>
  )
}
