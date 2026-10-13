import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  SIWN_SCRIPT_SRC,
  adminSecretFromSearch,
  connectedAsLabel,
  farcasterAdminHeaders,
  neynarClientId,
  parseSiwnSuccess,
  siwnEnabled,
} from './neynar-siwn'

const here = dirname(fileURLToPath(import.meta.url))

describe('neynar client id', () => {
  it('hides SIWN when VITE_NEYNAR_CLIENT_ID is unset or blank', () => {
    expect(neynarClientId({})).toBe('')
    expect(siwnEnabled({})).toBe(false)
    expect(neynarClientId({ VITE_NEYNAR_CLIENT_ID: '   ' })).toBe('')
    expect(siwnEnabled({ VITE_NEYNAR_CLIENT_ID: '   ' })).toBe(false)
  })

  it('enables SIWN when a client id is set', () => {
    expect(neynarClientId({ VITE_NEYNAR_CLIENT_ID: ' 5228faec-6153-49e8-8503-dcf0a717a075 ' })).toBe(
      '5228faec-6153-49e8-8503-dcf0a717a075',
    )
    expect(siwnEnabled({ VITE_NEYNAR_CLIENT_ID: '5228faec-6153-49e8-8503-dcf0a717a075' })).toBe(true)
  })
})

describe('parseSiwnSuccess', () => {
  const uuid = '11111111-2222-4333-8444-555555555555'

  it('reads signer_uuid, fid, and @username from the SIWN callback', () => {
    expect(
      parseSiwnSuccess({
        signer_uuid: uuid,
        fid: 6131,
        user: { username: '@crewpay', fid: 6131 },
      }),
    ).toEqual({ signer_uuid: uuid, fid: 6131, username: 'crewpay' })
  })

  it('rejects missing or malformed payloads', () => {
    expect(parseSiwnSuccess(null)).toBeNull()
    expect(parseSiwnSuccess({ fid: 1 })).toBeNull()
    expect(parseSiwnSuccess({ signer_uuid: 'not-a-uuid', fid: 1 })).toBeNull()
    expect(parseSiwnSuccess({ signer_uuid: uuid, fid: 0 })).toBeNull()
  })
})

describe('connectedAsLabel', () => {
  it('matches the admin page copy', () => {
    expect(connectedAsLabel('crewpay', 6131)).toBe('Connected as @crewpay, FID 6131')
    expect(connectedAsLabel('@CrewPayHQ', 2)).toBe('Connected as @CrewPayHQ, FID 2')
    expect(connectedAsLabel('', 9)).toBe('Connected as unknown, FID 9')
  })
})

describe('admin secret transport', () => {
  it('reads token or nonce from the unlisted URL', () => {
    expect(adminSecretFromSearch('?token=adm-1')).toEqual({ token: 'adm-1', nonce: '' })
    expect(adminSecretFromSearch('nonce=once-2')).toEqual({ token: '', nonce: 'once-2' })
  })

  it('sends admin token / nonce headers — never an API key', () => {
    const headers = farcasterAdminHeaders({ token: 'adm', nonce: 'n1' })
    expect(headers['x-crew-admin-token']).toBe('adm')
    expect(headers['x-crew-admin-nonce']).toBe('n1')
    expect(JSON.stringify(headers)).not.toMatch(/NEYNAR_API_KEY|x-api-key/i)
  })
})

describe('frontend must not mention NEYNAR_API_KEY', () => {
  it('keeps the API key out of SIWN helpers and the admin page', () => {
    const files = [
      join(here, 'neynar-siwn.ts'),
      join(here, '../components/AdminFarcasterPage.tsx'),
      join(here, '../components/NeynarSiwnButton.tsx'),
    ]
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      expect(src).not.toMatch(/NEYNAR_API_KEY/)
    }
    expect(SIWN_SCRIPT_SRC).toContain('neynarxyz.github.io/siwn')
  })

  it('is unlisted: no nav link, noindex on the page, CSP allows SIWN', () => {
    const app = readFileSync(join(here, '../App.tsx'), 'utf8')
    const nav = app.slice(app.indexOf('<nav className="nav-links"'), app.indexOf('</nav>'))
    expect(nav).not.toContain('/admin/farcaster')
    expect(nav).not.toMatch(/to=["']\/admin\/farcaster/)
    const page = readFileSync(join(here, '../components/AdminFarcasterPage.tsx'), 'utf8')
    expect(page).toContain('noindex, nofollow')
    const html = readFileSync(join(here, '../../index.html'), 'utf8')
    expect(html).toContain('https://neynarxyz.github.io')
  })
})
