import { describe, expect, it } from 'vitest'
import {
  FRONTIER_MODELS,
  agentCard,
  agentDiscoveryJson,
  aiPluginManifest,
  llmsFullTxt,
  llmsTxt,
  openApiSpec,
  robotsTxt,
} from './discovery.js'

describe('agent discovery docs', () => {
  it('lists frontier LLM clients', () => {
    expect(FRONTIER_MODELS.length).toBeGreaterThanOrEqual(9)
    expect(llmsTxt()).toContain('MCP')
    expect(llmsTxt()).toContain('pump.fun')
    expect(llmsTxt()).toContain('Anthropic Claude')
    expect(llmsTxt()).toContain('OpenAI GPT')
    expect(llmsTxt()).toContain('Google Gemini')
    expect(llmsTxt()).toContain('xAI Grok')
    expect(llmsTxt()).toContain('/api/agent')
  })

  it('exposes openapi paths for autohire + dry-run + launch + keys/claim', () => {
    const spec = openApiSpec()
    expect(spec.openapi).toBe('3.1.0')
    expect(spec.paths['/api/agent/autohire']).toBeTruthy()
    expect(spec.paths['/api/agent/launch/dry-run']).toBeTruthy()
    expect(spec.paths['/api/agent/launch']).toBeTruthy()
    expect(spec.paths['/api/agent/keys']).toBeTruthy()
    expect(spec.paths['/api/agent/keys/claim']).toBeTruthy()
    expect(spec.paths['/api/agent/wire-fees']).toBeTruthy()
    expect(spec.paths['/api/proof']).toBeTruthy()
    expect(spec.paths['/api/kols']).toBeTruthy()
    expect(spec.paths['/api/coins']).toBeTruthy()
    expect(spec.paths['/api/board']).toBeTruthy()
    expect(spec.paths['/api/remits']).toBeTruthy()
    expect(spec.paths['/api/buybacks']).toBeTruthy()
    expect(spec.paths['/api/agent/crank'].post.security).toEqual(
      expect.arrayContaining([{ CrewApiKey: [] }]),
    )
    expect(spec.components.schemas.LaunchRequest.properties.atomicRequired).toBeTruthy()
  })

  it('exposes build.commit field for deploy identification (CP-10)', () => {
    expect(agentDiscoveryJson().build).toBeTruthy()
    expect(agentDiscoveryJson().build).toHaveProperty('commit')
    expect(agentDiscoveryJson().build).toHaveProperty('commitShort')
  })

  it('ships agent card + ai-plugin + robots allows', () => {
    expect(agentCard('api').skills.map((s) => s.id)).toContain('crew-launch')
    expect(agentCard('api').url).toBe('https://api.crewpay.dev')
    expect(agentCard('site').url).toBe('https://crewpay.dev')
    expect(agentCard('api').capabilities.mcp).toBe('https://mcp.crewpay.dev/mcp')
    expect(aiPluginManifest().api.url).toContain('/openapi.json')
    expect(robotsTxt()).toContain('GPTBot')
    expect(robotsTxt()).toContain('ClaudeBot')
    expect(llmsFullTxt()).toContain('x-launcher-key')
    expect(llmsFullTxt()).toContain('/api/agent/keys/claim')
    expect(agentDiscoveryJson().auth.keys.claim).toMatch(/keys\/claim/)
    expect(agentDiscoveryJson().endpoints['POST /api/agent/keys/claim']).toBeTruthy()
    expect(agentDiscoveryJson().discovery.llms_txt).toContain('/llms.txt')
    expect(agentDiscoveryJson().mcp.tools).toContain('crew_discover')
    expect(agentDiscoveryJson().mcp.tools).toContain('crew_claim_key')
    expect(agentDiscoveryJson().mcp.tools).toContain('crew_launch_dry_run')
    expect(agentDiscoveryJson().mcp.tools).toContain('crew_list_launches')
    expect(agentDiscoveryJson().mcp.tools).toContain('crew_wire_fees')
    expect(agentDiscoveryJson().mcp.tools).toContain('crew_lock_holder_kol')
    expect(agentDiscoveryJson().mcp.tools).toContain('crew_proof')
    expect(agentDiscoveryJson().endpoints['GET /api/agent/launches']).toBeTruthy()
    expect(agentDiscoveryJson().mcp.http).toBe('https://mcp.crewpay.dev/mcp')
    expect(agentDiscoveryJson().api).toBe('https://api.crewpay.dev')
    expect(agentDiscoveryJson().aliases.api).toContain('https://crewpay-api.onrender.com')
    expect(agentDiscoveryJson().aliases.site).toBeUndefined()
    expect(agentDiscoveryJson().homepage).toBe('https://crewpay.dev')
    expect(agentDiscoveryJson().proof.site).toContain('/proof')
    expect(agentDiscoveryJson().limits.initialBuySol).toBe('0–10')
    expect(agentDiscoveryJson().limits.description).toMatch(/204/)
    expect(llmsTxt()).toContain('dry-run')
    expect(llmsTxt()).toContain('≤204')
    expect(llmsFullTxt()).toContain('Never put Solana secrets')
    expect(llmsFullTxt()).toContain('Launched from CrewPay.dev platform')
    expect(llmsFullTxt()).toContain('npx -y crewpay-mcp@1.2.2')
    expect(llmsTxt()).toContain('npx -y crewpay-mcp@1.2.2')
    expect(llmsTxt()).toContain('openclaw skills install @fxams/crewpay')
    expect(llmsTxt()).toContain('/api/agent/crank')
    expect(llmsTxt()).toContain('60%')
    expect(llmsTxt()).toContain('not live yet')
    expect(openApiSpec().components.schemas.LaunchRequest.properties.description.maxLength).toBe(
      204,
    )
  })
})
