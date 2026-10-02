import { requireAdmin } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ItemsClient, type ItemView } from './ItemsClient'

export default async function InspectionItemsPage() {
  await requireAdmin()
  const supabase = await createClient()
  const { data } = await supabase.from('inspection_items').select('id, section, label, frequency, scope, classes, sort_order, active').order('sort_order').order('label')
  const items: ItemView[] = (data ?? []).map((i) => ({ id: i.id, section: i.section, label: i.label, frequency: i.frequency, scope: i.scope, classes: i.classes, sortOrder: i.sort_order, active: i.active }))
  return <ItemsClient items={items} />
}
