import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
)

const result = JSON.parse(fs.readFileSync('.scratch/sample4-result.json', 'utf8'))

const { data, error } = await supabase
  .from('dispatch_sheets')
  .insert({
    uploaded_by_staff_id: '6b421c15-6022-4023-b30c-eda96c8869b0',
    blob_url: 'test-verification-sample4.pdf',
    original_filename: 'test-verification-sample4.pdf',
    dispatch_date: 'テスト検証用（ナンバー修正確認）',
    extracted_data: result,
  })
  .select('id')

if (error) {
  console.error('insert error:', error)
  process.exit(1)
}
console.log('inserted:', data)
