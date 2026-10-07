import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate } from '../src/lib/db.js'
import { upsertKol, countKols, type ApiKol } from '../src/lib/kols.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function main() {
  await migrate()
  const path =
    process.env.KOL_DB_PATH?.trim() ||
    join(__dirname, '../../crew/src/lib/pump/kol-db.json')
  const raw = JSON.parse(readFileSync(path, 'utf8')) as ApiKol[]
  console.log(`Seeding ${raw.length} KOLs from ${path}`)
  let n = 0
  for (const row of raw) {
    await upsertKol({
      id: row.id,
      rank: row.rank,
      pump: row.pump,
      x: row.x ?? null,
      followers: row.followers,
      wallet: row.wallet,
      aliases: row.aliases || [],
      narratives: row.narratives || [],
      correlated: row.correlated || [],
      roles: row.roles || [],
    })
    n += 1
    if (n % 250 === 0) console.log(`… ${n}`)
  }
  const total = await countKols()
  console.log(`Done. kols table count=${total}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
