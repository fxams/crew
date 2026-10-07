import { describe, expect, it } from 'vitest'
import {
  assertSafeRpcUrl,
  sanitizeBoard,
  sanitizeCoin,
  sanitizeDraft,
  sanitizeUiPrefs,
} from './security'

describe('assertSafeRpcUrl', () => {
  it('accepts https mainnet RPC', () => {
    expect(assertSafeRpcUrl('https://api.mainnet-beta.solana.com/')).toBe(
      'https://api.mainnet-beta.solana.com',
    )
  })

  it('rejects http', () => {
    expect(() => assertSafeRpcUrl('http://api.mainnet-beta.solana.com')).toThrow(/HTTPS/)
  })

  it('rejects localhost', () => {
    expect(() => assertSafeRpcUrl('https://localhost:8899')).toThrow(/not allowed/)
  })

  it('rejects embedded credentials', () => {
    expect(() => assertSafeRpcUrl('https://user:pass@rpc.example.com')).toThrow(/credentials/)
  })
})

describe('sanitizeBoard', () => {
  it('drops unknown modes and strips angle brackets', () => {
    const board = sanitizeBoard({
      coins: [
        {
          id: '1',
          mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          name: '<script>x</script>',
          ticker: 'HACK',
          vibe: 'ok',
          mode: 'split',
          crew: [{ handle: '@a', wallet: '11111111111111111111111111111112', share: 100 }],
          signature: 'sig',
          launchedAt: 1,
          launcher: '11111111111111111111111111111111',
          pumpUrl: 'javascript:alert(1)',
        },
        {
          id: '2',
          mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
          name: 'Bad',
          ticker: 'BAD',
          vibe: '',
          mode: 'evil',
          crew: [],
          signature: '',
          launchedAt: 0,
          launcher: '',
          pumpUrl: '',
        },
      ],
      remits: [],
    })
    expect(board.coins).toHaveLength(1)
    expect(board.coins[0].name).not.toContain('<')
    expect(board.coins[0].pumpUrl).toMatch(/^https:\/\/pump\.fun\//)
  })

  it('keeps agent hire metadata', () => {
    const coin = sanitizeCoin({
      id: 'hire',
      mint: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
      name: 'Hire Desk',
      ticker: 'HIRE',
      vibe: 'pay humans',
      mode: 'agent',
      crew: [
        {
          handle: '@caller',
          wallet: '11111111111111111111111111111112',
          share: 100,
          hireRole: 'caller',
        },
      ],
      signature: 'sig',
      launchedAt: 9,
      launcher: '11111111111111111111111111111111',
      pumpUrl: 'https://pump.fun/coin/x',
      agent: {
        name: 'Desk Mind',
        objective: 'Hire KOLs who move the chart.',
        model: 'Claude Sonnet',
      },
    })
    expect(coin?.mode).toBe('agent')
    expect(coin?.agent?.name).toBe('Desk Mind')
    expect(coin?.crew[0].hireRole).toBe('caller')
  })
})

describe('sanitizeDraft', () => {
  it('keeps mode-specific fields and strips image File', () => {
    const draft = sanitizeDraft({
      name: 'Raid Desk',
      ticker: 'raid',
      vibe: 'go',
      mode: 'raid',
      crew: [{ handle: '@lead', wallet: '11111111111111111111111111111112', share: 100, hireRole: 'raid' }],
      initialBuySol: 1,
      imageFile: { name: 'x.png' },
      raidQuests: [{ id: 'q1', title: 'Post proof', bountyBps: 500, proof: 'url' }],
      buybackRule: { dipPct: 10, maxSolPerFire: 1, cooldownHours: 2 },
      agent: { name: 'x', objective: 'y', model: 'z' },
    })
    expect(draft.ticker).toBe('RAID')
    expect(draft.mode).toBe('raid')
    expect(draft.imageFile).toBeNull()
    expect(draft.raidQuests?.[0].title).toBe('Post proof')
    expect(draft.buybackRule).toBeUndefined()
    expect(draft.agent).toBeUndefined()
    expect(draft.crew[0].hireRole).toBe('raid')
  })

  it('falls back safely on garbage input', () => {
    const draft = sanitizeDraft('nope')
    expect(draft.mode).toBe('split')
    expect(draft.crew).toHaveLength(1)
    expect(draft.imageFile).toBeNull()
  })
})

describe('sanitizeUiPrefs', () => {
  it('keeps selectedMint and drops junk', () => {
    expect(sanitizeUiPrefs({ selectedMint: 'Abc123', extra: true }).selectedMint).toBe('Abc123')
    expect(sanitizeUiPrefs(null)).toEqual({})
    expect(sanitizeUiPrefs({ selectedMint: '<script>' }).selectedMint).toBe('script')
    expect(sanitizeUiPrefs({ selectedMint: '' })).toEqual({})
  })
})
