#!/usr/bin/env node
/**
 * Harvest top Pump.fun users (by followers) into src/lib/pump/kol-db.json
 *
 * Usage (from agent/crew):
 *   node scripts/harvest-kols.mjs
 *
 * Requires curl + network. Writes ~1500 ranked profiles with wallets,
 * narrative tags, and correlation neighbors.
 */
const TARGET = 1500
const MAX_OFFSET = 1950
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const harvestDir = path.join(__dirname, 'harvest')
const outJson = path.join(root, 'src/lib/pump/kol-db.json')

const NARRATIVE_OVERRIDES = {
  slingoor: {
    narratives: ['trench', 'degen', 'meme', 'culture'],
    correlated: ['cupsey', 'cooker', 'daumen', 'oxr'],
    roles: ['caller', 'kol'],
  },
  cooker: {
    narratives: ['trench', 'degen', 'meme'],
    correlated: ['slingoor', 'cupsey', 'smokez'],
    roles: ['caller', 'kol'],
  },
  cupsey: {
    narratives: ['trench', 'degen', 'raid', 'meme'],
    correlated: ['slingoor', 'cooker', 'limfork'],
    roles: ['caller', 'raid'],
  },
  daumen: {
    narratives: ['trench', 'degen', 'culture'],
    correlated: ['slingoor', 'limfork', 'trunoest'],
    roles: ['chart', 'kol'],
  },
  limfork: {
    narratives: ['trench', 'degen', 'meme'],
    correlated: ['cupsey', 'daumen', 'smokez'],
    roles: ['caller', 'kol'],
  },
  smokez: {
    narratives: ['trench', 'degen', 'raid'],
    correlated: ['cooker', 'limfork'],
    roles: ['raid', 'kol'],
  },
  trunoest: {
    narratives: ['trench', 'degen', 'meme'],
    correlated: ['daumen'],
    roles: ['caller', 'chart'],
  },
  '0xwinged': {
    narratives: ['ai', 'culture', 'general'],
    correlated: [],
    roles: ['dev', 'kol'],
  },
  oxr: {
    narratives: ['trench', 'degen', 'meme', 'culture'],
    correlated: ['slingoor', 'ansemconzimp'],
    roles: ['caller', 'kol'],
  },
  ansemconzimp: {
    narratives: ['trench', 'degen', 'meme', 'culture'],
    correlated: ['oxr', 'alonalon'],
    roles: ['caller', 'kol'],
  },
  alonalon: {
    narratives: ['trench', 'degen', 'culture'],
    correlated: ['ansemconzimp', 'oxr'],
    roles: ['caller', 'kol'],
  },
}

function guessNarratives(id, pump, x) {
  const blob = `${id} ${pump} ${x || ''}`.toLowerCase()
  const tags = new Set(['trench', 'degen'])
  if (/ai|gpt|bot|agent|llm|neuro/.test(blob)) tags.add('ai')
  if (/cat|dog|pepe|frog|ape|monkey|bird|fish|whale/.test(blob)) tags.add('animal')
  if (/meme|funny|lol|based/.test(blob)) tags.add('meme')
  if (/raid|shill/.test(blob)) tags.add('raid')
  if (/game|play|npc/.test(blob)) tags.add('gaming')
  if (/trump|maga|vote|politic/.test(blob)) tags.add('politics')
  if (/art|music|culture|stream/.test(blob)) tags.add('culture')
  if (tags.size <= 2) tags.add('meme')
  return [...tags]
}

function guessRoles(narratives) {
  if (narratives.includes('raid')) return ['raid', 'kol']
  if (narratives.includes('ai')) return ['dev', 'kol']
  if (narratives.includes('animal')) return ['kol', 'chart']
  return ['kol', 'caller']
}

fs.mkdirSync(harvestDir, { recursive: true })

for (let offset = 0; offset <= MAX_OFFSET; offset += 50) {
  const out = path.join(harvestDir, `page-${String(offset).padStart(4, '0')}.json`)
  execFileSync(
    'curl',
    [
      '-sS',
      '-o',
      out,
      '--max-time',
      '25',
      '-H',
      'Accept: application/json',
      '-H',
      'Origin: https://pump.fun',
      '-H',
      'Referer: https://pump.fun/',
      `https://frontend-api-v3.pump.fun/users?offset=${offset}&limit=50&sort=followers&order=DESC`,
    ],
    { stdio: 'inherit' },
  )
  console.error('fetched offset', offset)
}

const byWallet = new Map()
const byId = new Set()
for (const f of fs.readdirSync(harvestDir).filter((n) => n.endsWith('.json')).sort()) {
  let page
  try {
    page = JSON.parse(fs.readFileSync(path.join(harvestDir, f), 'utf8'))
  } catch {
    continue
  }
  if (!Array.isArray(page)) continue
  for (const u of page) {
    const wallet = String(u.canonical_svm_wallet || u.address || '').trim()
    const pump = String(u.username || '').trim()
    if (!wallet || !pump || u.is_banned) continue
    if (wallet.length < 32 || wallet.length > 44) continue
    const id = pump.toLowerCase()
    if (byWallet.has(wallet) || byId.has(id)) continue
    const x = u.x_username ? String(u.x_username).replace(/^@+/, '') : null
    byWallet.set(wallet, {
      id,
      pump,
      x,
      followers: Number(u.followers) || 0,
      wallet,
      aliases: x && x.toLowerCase() !== id ? [x.toLowerCase()] : [],
    })
    byId.add(id)
  }
}

const harvested = [...byWallet.values()].sort((a, b) => b.followers - a.followers)
const harvestPath = path.join(__dirname, 'kol-harvest.json')
fs.writeFileSync(harvestPath, JSON.stringify(harvested))

const map = new Map(harvested.map((r) => [r.id, r]))
let top = harvested.slice(0, TARGET)
const have = new Set(top.map((r) => r.id))
for (const id of [...Object.keys(NARRATIVE_OVERRIDES), 'leck', 'gake']) {
  if (!have.has(id) && map.has(id)) {
    top.push(map.get(id))
    have.add(id)
  }
}
top = [...top].sort((a, b) => b.followers - a.followers)
if (top.length > TARGET + 20) top = top.slice(0, TARGET + 20)
const idList = top.map((r) => r.id)

const records = top.map((r, i) => {
  const ov = NARRATIVE_OVERRIDES[r.id] || {}
  const narratives = ov.narratives || guessNarratives(r.id, r.pump, r.x)
  const roles = ov.roles || guessRoles(narratives)
  const corr = new Set(ov.correlated || [])
  for (const delta of [-2, -1, 1, 2, 3]) {
    const n = idList[i + delta]
    if (n && n !== r.id) corr.add(n)
  }
  return {
    id: r.id,
    rank: i + 1,
    pump: r.pump,
    x: r.x,
    followers: r.followers,
    wallet: r.wallet,
    aliases: r.aliases?.length ? r.aliases : undefined,
    narratives,
    correlated: [...corr].filter((id) => have.has(id)).slice(0, 6),
    roles,
  }
})

fs.writeFileSync(outJson, JSON.stringify(records))
console.log(`Wrote ${records.length} KOLs → ${outJson}`)
