import { describe, expect, it } from 'vitest'
import { formatRpcError } from './rpc-errors'

describe('tx expiry errors', () => {
  it('maps block height exceeded into an actionable message', () => {
    const msg = formatRpcError(
      new Error(
        'Signature 52ngPYbrgeLMyGSo9n84hCGykKk9PMZiKaLdh1FnUefbQJMucqyPKMypJgWb8roXfeJepRzV9eJocCEwVxiWQ72v has expired: block height exceeded.',
      ),
    )
    expect(msg).toMatch(/expired|60s|Phantom|Solscan/i)
  })
})
