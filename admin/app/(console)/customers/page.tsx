import { requireAdmin } from '@/lib/auth'
import type { CustomerRecord } from '@/lib/customers'
import { createClient } from '@/lib/supabase/server'
import { CustomersClient } from './CustomersClient'

export default async function CustomersPage() {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase
    .from('customers')
    .select('id, name, kana, updated_at, customer_numbers(id, venue, member_number)')
    .order('kana')
    .order('name')
  return <CustomersClient customers={(data ?? []) as CustomerRecord[]} />
}
