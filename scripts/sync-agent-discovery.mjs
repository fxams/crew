/**
 * Materialize llms.txt / OpenAPI / well-known files into the Vite public/
 * folder so frontier LLM crawlers hitting crewpay.dev find the same docs
 * as api.crewpay.dev.
 *
 * Source of truth: agent/crew-api/src/lib/agent/discovery.ts (built JS).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const apiDir = resolve(root, 'agent/crew-api')
const publicDir = resolve(root, 'agent/crew/public')

const build = spawnSync('npm', ['run', 'build'], {
  cwd: apiDir,
  stdio: 'inherit',
  shell: true,
})
if (build.status !== 0) process.exit(build.status ?? 1)

const mod = await import(
  pathToFileURL(resolve(apiDir, 'dist/src/lib/agent/discovery.js')).href
)

mkdirSync(resolve(publicDir, '.well-known'), { recursive: true })

const files = [
  ['llms.txt', mod.llmsTxt()],
  ['llms-full.txt', mod.llmsFullTxt()],
  ['robots.txt', mod.robotsTxt()],
  ['openapi.json', JSON.stringify(mod.openApiSpec(), null, 2) + '\n'],
  ['.well-known/llms.txt', mod.llmsTxt()],
  ['.well-known/agent.json', JSON.stringify(mod.agentCard(), null, 2) + '\n'],
  [
    '.well-known/ai-plugin.json',
    JSON.stringify(mod.aiPluginManifest(), null, 2) + '\n',
  ],
]

for (const [rel, body] of files) {
  const path = resolve(publicDir, rel)
  writeFileSync(path, body)
  console.log('wrote', rel)
}

console.log('synced agent discovery → agent/crew/public/')
