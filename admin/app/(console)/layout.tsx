import { IdleLogout } from '@/components/IdleLogout'
import { Sidebar } from '@/components/Sidebar'
import { requireAdmin } from '@/lib/auth'

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin()
  return (
    <div className="shell">
      <Sidebar label={admin.label} loginId={admin.loginId} />
      <main className="main">{children}</main>
      <IdleLogout />
    </div>
  )
}
