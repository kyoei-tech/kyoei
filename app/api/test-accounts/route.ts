import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Lists / deletes accounts that testers created via マイページ・配車表's
// email+password sign-up (auth-form.tsx) while 試験運転モード was on.
// Gated client-side by the same PIN as 試験運転モード itself (see
// settings-view.tsx). Uses the service-role client since deleting an
// auth.users row requires the Admin API and staff_members.auth_user_id is
// only writable by its own linked user under RLS.
export async function GET() {
  try {
    const admin = createAdminClient()

    const { data: staff, error: staffError } = await admin
      .from('staff_members')
      .select('id, name, auth_user_id')
      .not('auth_user_id', 'is', null)
    if (staffError) throw staffError

    const rows = staff ?? []
    const accounts = await Promise.all(
      rows.map(async (row) => {
        const authUserId = row.auth_user_id as string
        const { data, error } = await admin.auth.admin.getUserById(
          authUserId,
        )
        if (error || !data.user) {
          return {
            staffId: row.id as string,
            staffName: row.name as string,
            authUserId,
            email: null,
            createdAt: null,
          }
        }
        return {
          staffId: row.id as string,
          staffName: row.name as string,
          authUserId,
          email: data.user.email ?? null,
          createdAt: data.user.created_at ?? null,
        }
      }),
    )

    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('[v0] test-accounts list error:', error)
    return NextResponse.json({ error: 'Failed to load accounts' }, {
      status: 500,
    })
  }
}

export async function DELETE(request: Request) {
  try {
    const { authUserId } = (await request.json()) as { authUserId?: string }
    if (!authUserId) {
      return NextResponse.json({ error: 'authUserId required' }, {
        status: 400,
      })
    }

    const admin = createAdminClient()

    // Unlink first so no staff_members row is left pointing at a
    // soon-to-be-nonexistent auth user.
    const { error: unlinkError } = await admin
      .from('staff_members')
      .update({ auth_user_id: null })
      .eq('auth_user_id', authUserId)
    if (unlinkError) throw unlinkError

    const { error: deleteError } = await admin.auth.admin.deleteUser(
      authUserId,
    )
    if (deleteError) throw deleteError

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[v0] test-accounts delete error:', error)
    return NextResponse.json({ error: 'Failed to delete account' }, {
      status: 500,
    })
  }
}
