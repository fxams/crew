import { describe, expect, it } from 'vitest'
import { assertSafeHttpUrl, isPrivateOrLocalIp } from './safe-url.js'

describe('safe-url SSRF guards', () => {
  it('flags private and loopback IPs', () => {
    expect(isPrivateOrLocalIp('127.0.0.1')).toBe(true)
    expect(isPrivateOrLocalIp('10.1.2.3')).toBe(true)
    expect(isPrivateOrLocalIp('192.168.1.1')).toBe(true)
    expect(isPrivateOrLocalIp('169.254.169.254')).toBe(true)
    expect(isPrivateOrLocalIp('172.16.0.1')).toBe(true)
    expect(isPrivateOrLocalIp('8.8.8.8')).toBe(false)
    expect(isPrivateOrLocalIp('::1')).toBe(true)
  })

  it('rejects non-http and localhost URLs', () => {
    expect(() => assertSafeHttpUrl('file:///etc/passwd', 'imageUrl')).toThrow(/http/)
    expect(() => assertSafeHttpUrl('http://localhost/x', 'imageUrl')).toThrow(/not allowed/)
    expect(() => assertSafeHttpUrl('http://127.0.0.1/x', 'imageUrl')).toThrow(/private/)
    expect(() => assertSafeHttpUrl('http://169.254.169.254/latest', 'imageUrl')).toThrow(/private/)
    expect(() => assertSafeHttpUrl('https://user:pass@example.com/a.png', 'imageUrl')).toThrow(
      /credentials/,
    )
    expect(assertSafeHttpUrl('https://example.com/a.png', 'imageUrl').hostname).toBe('example.com')
  })
})
