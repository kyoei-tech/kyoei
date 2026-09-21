import { Client } from "pg"
import { readFileSync } from "fs"

const data = JSON.parse(readFileSync(new URL("./result.json", import.meta.url), "utf8"))

const client = new Client({ connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL })
await client.connect()

const res = await client.query(
  `insert into public.dispatch_sheets (blob_url, original_filename, dispatch_date, extracted_data, uploaded_by_staff_id)
   values ($1, $2, $3, $4::jsonb, $5)
   returning id`,
  [
    "test-verification.pdf",
    "test-verification.pdf",
    data.dispatchDate,
    JSON.stringify(data),
    "2feb6c69-4bf5-4041-b5cf-78aeddeb0a29",
  ],
)

console.log("inserted id:", res.rows[0].id)
await client.end()
