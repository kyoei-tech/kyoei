// Links the home tab's 出庫/帰庫 buttons to a `staff_members` row (出勤簿),
// via the 乗務員ID chosen in Settings (lib/settings/settings-context.tsx).
// Best-effort and silent: if no id is set, or the id no longer matches any
// row, `.eq('id', ...)` simply updates zero rows — no error, no side effect.
import { createClient } from '@/lib/supabase/client'

export async function syncStaffMemberStatus(
  staffMemberId: string | null,
  status: 'working' | 'off',
): Promise<void> {
  if (!staffMemberId) return
  try {
    const supabase = createClient()
    await supabase
      .from('staff_members')
      .update({ status })
      .eq('id', staffMemberId)
  } catch {
    // Best-effort; 出庫/帰庫 itself must never fail because of this.
  }
}
