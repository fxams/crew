/**
 * One-time: provision Node web service for crewpay.dev (dynamic KOL OG).
 * Uses RENDER_API_KEY from env — never log the key.
 *
 * If crewpay is still static_site, creates `crewpay-node` web service and moves
 * custom domains from the static service when verified on the new URL.
 */
const API = 'https://api.render.com/v1'
const STATIC_ID = 'srv-db32invavr4c739imk00'
const OWNER_ID = 'tea-d2m1uvje5dus739alqcg'
const REPO = 'https://github.com/fxams/crew'
const BRANCH = process.env.CREWPAY_RENDER_BRANCH || 'main'

const key = process.env.RENDER_API_KEY
if (!key) {
  console.error('RENDER_API_KEY required')
  process.exit(1)
}

async function api(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text }
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`)
  }
  return json
}

async function findWebService() {
  const list = await api('GET', '/services?name=crewpay-node&limit=20')
  for (const row of list) {
    if (row.service?.name === 'crewpay-node' && row.service?.type === 'web_service') {
      return row.service
    }
  }
  return null
}

async function main() {
  const staticSvc = await api('GET', `/services/${STATIC_ID}`)
  console.log(`static crewpay: type=${staticSvc.type} rootDir=${staticSvc.rootDir || '(repo root)'}`)

  if (staticSvc.type === 'web_service') {
    console.log('crewpay already web_service — patch rootDir/build if needed via dashboard')
    await api('PATCH', `/services/${STATIC_ID}`, {
      rootDir: '',
      serviceDetails: {
        envSpecificDetails: {
          buildCommand:
            'npm ci --legacy-peer-deps && npm test && npm run build && test -f dist/index.html && node scripts/test-kol-og-server.mjs',
          startCommand: 'node scripts/crewpay-static-server.mjs',
        },
      },
    })
    console.log('patched crewpay web service build/start')
    return
  }

  let web = await findWebService()
  if (!web) {
    const created = await api('POST', '/services', {
      type: 'web_service',
      name: 'crewpay-node',
      ownerId: OWNER_ID,
      repo: REPO,
      branch: BRANCH,
      autoDeploy: 'yes',
      rootDir: '',
      serviceDetails: {
        runtime: 'node',
        env: 'node',
        plan: 'starter',
        region: 'oregon',
        healthCheckPath: '/',
        envSpecificDetails: {
          buildCommand:
            'npm ci --legacy-peer-deps && npm test && npm run build && test -f dist/index.html && node scripts/test-kol-og-server.mjs',
          startCommand: 'node scripts/crewpay-static-server.mjs',
        },
      },
    })
    web = created.service ?? created
    console.log(`created crewpay-node id=${web.id} url=${web.serviceDetails?.url}`)
  } else {
    console.log(`reusing crewpay-node id=${web.id}`)
  }

  const domains = await api('GET', `/services/${STATIC_ID}/custom-domains`)
  const names = domains.map((d) => d.customDomain?.name).filter(Boolean)
  console.log(`domains on static: ${names.join(', ') || '(none)'}`)

  for (const name of names) {
    const domainId = domains.find((d) => d.customDomain?.name === name)?.customDomain?.id
    if (!domainId) continue
    console.log(`move domain ${name} → crewpay-node (delete from static, add to web)`)
    await api('DELETE', `/services/${STATIC_ID}/custom-domains/${domainId}`)
    await api('POST', `/services/${web.id}/custom-domains`, { name })
  }

  await api('PATCH', `/services/${STATIC_ID}`, { suspended: 'suspended' })
  console.log('suspended old static crewpay service')
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
