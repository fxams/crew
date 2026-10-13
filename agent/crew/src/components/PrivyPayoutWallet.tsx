import { useEffect, useRef, useState } from 'react'
import { PrivyProvider, usePrivy } from '@privy-io/react-auth'
import { useCreateWallet, useSignMessage, useWallets } from '@privy-io/react-auth/solana'
import { SOCIAL_WALLET_LABEL, SOCIAL_WALLET_NOTE } from '../lib/kol-onboarding'
import { isPayoutWallet } from '../lib/payout-wallet'
import { PRIVY_CLIENT_CONFIG } from '../lib/privy-config'

export type PrivyPayoutReady = {
  address: string
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  getAccessToken: () => Promise<string | null>
}

export function PrivyPayoutWallet(props: {
  appId: string
  autoStart?: boolean
  disabled?: boolean
  onWallet: (wallet: PrivyPayoutReady) => void
  onError?: (message: string) => void
}) {
  if (!props.appId) return null
  return (
    <PrivyProvider appId={props.appId} config={PRIVY_CLIENT_CONFIG}>
      <PrivyPayoutWalletInner {...props} />
    </PrivyProvider>
  )
}

function PrivyPayoutWalletInner(props: {
  appId: string
  autoStart?: boolean
  disabled?: boolean
  onWallet: (wallet: PrivyPayoutReady) => void
  onError?: (message: string) => void
}) {
  const { ready, authenticated, login, getAccessToken } = usePrivy()
  const { ready: walletsReady, wallets } = useWallets()
  const { createWallet } = useCreateWallet()
  const { signMessage } = useSignMessage()
  const [busy, setBusy] = useState(false)
  const started = useRef(false)
  const creating = useRef(false)
  const handed = useRef('')

  const solana = wallets.find((w) => isPayoutWallet(w.address))

  useEffect(() => {
    if (!ready || !props.autoStart || authenticated || started.current || props.disabled) return
    started.current = true
    setBusy(true)
    void login()
  }, [authenticated, login, props.autoStart, props.disabled, ready])

  useEffect(() => {
    if (!authenticated || !walletsReady || solana || creating.current) return
    creating.current = true
    void createWallet()
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'Could not create a wallet.'
        if (!/already|exist/i.test(msg)) props.onError?.(msg)
      })
      .finally(() => {
        creating.current = false
      })
  }, [authenticated, createWallet, props, solana, walletsReady])

  useEffect(() => {
    if (!authenticated || !solana || handed.current === solana.address) return
    handed.current = solana.address
    setBusy(false)
    props.onWallet({
      address: solana.address,
      getAccessToken,
      signMessage: async (message) => {
        const { signature } = await signMessage({
          message,
          wallet: solana,
          options: { uiOptions: { showWalletUIs: false } },
        })
        return signature
      },
    })
  }, [authenticated, getAccessToken, props, signMessage, solana])

  async function onCreate() {
    if (props.disabled || busy) return
    setBusy(true)
    try {
      if (!authenticated) {
        started.current = true
        login()
        return
      }
      if (!solana) {
        creating.current = true
        await createWallet()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not create a wallet.'
      if (/reject|cancel|denied/i.test(msg)) {
        props.onError?.('Wallet sign-in was cancelled.')
      } else {
        props.onError?.(msg)
      }
      setBusy(false)
    }
  }

  if (!props.appId) return null

  return (
    <div className="social-wallet">
      <button
        type="button"
        className="btn btn-ghost btn-sm social-wallet-toggle"
        disabled={props.disabled || busy || !ready}
        onClick={() => {
          if (authenticated && solana) {
            handed.current = ''
            setBusy(true)
            props.onWallet({
              address: solana.address,
              getAccessToken,
              signMessage: async (message) => {
                const { signature } = await signMessage({
                  message,
                  wallet: solana,
                  options: { uiOptions: { showWalletUIs: false } },
                })
                return signature
              },
            })
            setBusy(false)
            return
          }
          void onCreate()
        }}
      >
        {busy || (authenticated && !solana)
          ? 'Creating wallet…'
          : authenticated && solana
            ? 'Save payout wallet'
            : SOCIAL_WALLET_LABEL}
      </button>
      <p className="hint social-wallet-note">{SOCIAL_WALLET_NOTE}</p>
    </div>
  )
}
