import 'server-only'
import type { AdminContext } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase/service'

/** Appends to admin_audit_log on behalf of a verified admin (service role). */
export async function audit(admin: AdminContext, category: string, target: string, action: string, detail: Record<string, unknown> = {}) {
  await createServiceClient().from('admin_audit_log').insert({
    actor: admin.userId,
    actor_label: admin.label,
    category,
    target,
    action,
    detail,
  })
}
