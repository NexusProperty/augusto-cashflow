import { requireAuth } from '@/lib/auth'
import { Sidebar } from '@/components/ui/sidebar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireAuth()

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-zinc-50 p-8">{children}</main>
    </div>
  )
}
