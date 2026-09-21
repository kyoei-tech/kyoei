import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
)

const extractedData = JSON.parse(
  fs.readFileSync('/vercel/share/v0-project/.scratch/sample3-result.json', 'utf8'),
)

const { error } = await supabase.from('dispatch_sheets').insert({
  blob_url: 'test-verification-3.pdf',
  original_filename: 'test-verification-3.pdf',
  dispatch_date: extractedData.dispatchDate,
  extracted_data: extractedData,
  uploaded_by_staff_id: '2feb6c69-4bf5-4041-b5cf-78aeddeb0a29',
})

if (error) {
  console.error('insert failed', error)
  process.exit(1)
}
console.log('inserted ok')
