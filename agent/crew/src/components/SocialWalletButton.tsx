import { useEffect, useState } from 'react'
import { SOCIAL_WALLET_LABEL, SOCIAL_WALLET_NOTE } from '../lib/kol-onboarding'
import { connectSocialWallet, getSdk, type SocialProvider, type SocialWallet } from '../lib/phantom-connect'

export function SocialWalletButton(props: {
  appId: string
  disabled?: boolean
  onWallet: (wallet: SocialWallet) => void
  onError?: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<SocialProvider | null>(null)

  useEffect(() => {
    if (!props.appId) return
    void getSdk(props.appId).catch(() => {
      /* hide-on-unset already covers missing config */
    })
  }, [props.appId])

  async function onPick(provider: SocialProvider) {
    setBusy(provider)
    try {
      const wallet = await connectSocialWallet({ appId: props.appId, provider })
      props.onWallet(wallet)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create a wallet.'
      if (/reject|cancel|denied/i.test(msg)) {
        props.onError?.('Wallet sign-in was cancelled.')
      } else {
        props.onError?.(msg)
      }
    } finally {
      setBusy(null)
    }
  }

  if (!props.appId) return null

  return (
    <div className="social-wallet">
      <button
        type="button"
        className="btn btn-ghost btn-sm social-wallet-toggle"
        disabled={props.disabled || Boolean(busy)}
        onClick={() => setOpen((v) => !v)}
      >
        {busy ? 'Creating wallet…' : SOCIAL_WALLET_LABEL}
      </button>
      {open ? (
        <div className="social-wallet-choices">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={props.disabled || Boolean(busy)}
            onClick={() => void onPick('google')}
          >
            {busy === 'google' ? 'Google…' : 'Google'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={props.disabled || Boolean(busy)}
            onClick={() => void onPick('apple')}
          >
            {busy === 'apple' ? 'Apple…' : 'Apple'}
          </button>
        </div>
      ) : null}
      <p className="hint social-wallet-note">{SOCIAL_WALLET_NOTE}</p>
    </div>
  )
}
