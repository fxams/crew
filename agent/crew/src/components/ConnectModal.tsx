import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { useWallet, type Wallet } from '@solana/wallet-adapter-react'
import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import {
  detectInjected,
  evmChainIdForVenue,
  injectedEvmLabel,
  isMobileUserAgent,
  matchesListedWallet,
  networkForLaunch,
  phantomBrowseUrl,
  shortAddr,
  solflareBrowseUrl,
  walletConnectEnabled,
  EVM_LISTED_WALLETS,
  SOLANA_LISTED_WALLETS,
  WALLETCONNECT_LISTED,
  type LaunchAction,
  type WalletNetwork,
} from '../lib/wallet'
import { persistExplicitDisconnect, rememberWalletConnect } from '../lib/wallet-session'
import { completeSolanaAppConnect } from '../lib/wallet-auth'
import { setBoardWallet } from '../lib/store'
import { useWalletAuth } from './WalletAuthProvider'

export type ConnectPreferred = WalletNetwork | 'any'

export type OpenConnectOpts = {
  preferred?: ConnectPreferred
  /** Launch venue chain (base / base-sepolia / robinhood). */
  evmChain?: string
  platform?: LaunchAction | string
}

type ConnectModalState = {
  visible: boolean
  preferred: ConnectPreferred
  evmChainId: number
  open: (opts?: OpenConnectOpts | boolean) => void
  close: () => void
  setVisible: (visible: boolean) => void
}

const ConnectModalContext = createContext<ConnectModalState | null>(null)

export function useConnectModal(): ConnectModalState {
  const ctx = useContext(ConnectModalContext)
  if (!ctx) {
    throw new Error('useConnectModal must be used inside ConnectModalProvider')
  }
  return ctx
}

export function ConnectModalProvider({ children }: { children: ReactNode }) {
  const [visible, setVisibleState] = useState(false)
  const [preferred, setPreferred] = useState<ConnectPreferred>('any')
  const [evmChainId, setEvmChainId] = useState(evmChainIdForVenue('base'))

  const close = useCallback(() => setVisibleState(false), [])
  const open = useCallback((opts?: OpenConnectOpts | boolean) => {
    if (opts === false) {
      setVisibleState(false)
      return
    }
    const next = opts === true || opts === undefined ? ({} as OpenConnectOpts) : opts
    const fromPlatform = next.platform ? networkForLaunch(next.platform) : undefined
    setPreferred(next.preferred || fromPlatform || 'any')
    setEvmChainId(evmChainIdForVenue(next.evmChain))
    setVisibleState(true)
  }, [])

  const setVisible = useCallback(
    (value: boolean) => {
      if (value) open()
      else close()
    },
    [open, close],
  )

  const value = useMemo(
    () => ({ visible, preferred, evmChainId, open, close, setVisible }),
    [visible, preferred, evmChainId, open, close, setVisible],
  )

  return (
    <ConnectModalContext.Provider value={value}>
      {children}
      {visible ? <ConnectModal /> : null}
    </ConnectModalContext.Provider>
  )
}

type SolRow = {
  key: string
  name: string
  icon?: string
  installed: boolean
  mobile: boolean
  wallet?: Wallet
  listedId?: string
}

type EvmRow = {
  key: string
  name: string
  icon?: string
  installed: boolean
  connectorUid?: string
  listedId?: string
  walletConnect?: boolean
}

function ConnectModal() {
  const { preferred, evmChainId, close } = useConnectModal()
  const solana = useWallet()
  const { authenticate, logout, isAuthenticated } = useWalletAuth()
  const { address: evmAddress, isConnected: evmConnected, connector: activeEvm } = useAccount()
  const { connectors, connectAsync, isPending: evmPending } = useConnect()
  const { disconnectAsync: disconnectEvm } = useDisconnect()
  const { switchChainAsync } = useSwitchChain()
  const [busy, setBusy] = useState<string | null>(null)
  const [signing, setSigning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const solAuthed = Boolean(solana.publicKey && isAuthenticated(solana.publicKey.toBase58()))

  const mobile = isMobileUserAgent(typeof navigator === 'undefined' ? '' : navigator.userAgent)
  const injected = detectInjected(typeof window === 'undefined' ? null : window)
  const showWalletConnect = walletConnectEnabled()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [close])

  const solanaRows = useMemo<SolRow[]>(() => {
    const rows: SolRow[] = []
    const seen = new Set<string>()
    for (const wallet of solana.wallets) {
      const name = wallet.adapter.name
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      if (/burner|unsafe/i.test(name)) continue
      seen.add(key)
      rows.push({
        key,
        name,
        icon: wallet.adapter.icon,
        installed: wallet.readyState === WalletReadyState.Installed,
        mobile: /mobile|mwa|android/i.test(name),
        wallet,
      })
    }
    for (const listed of SOLANA_LISTED_WALLETS) {
      if (rows.some((r) => matchesListedWallet(listed, r.name))) continue
      rows.push({
        key: listed.id,
        name: listed.name,
        installed: false,
        mobile: Boolean(listed.mobile),
        listedId: listed.id,
      })
    }
    rows.sort((a, b) => Number(b.installed) - Number(a.installed))
    return rows
  }, [solana.wallets])

  const evmRows = useMemo<EvmRow[]>(() => {
    const rows: EvmRow[] = []
    const seen = new Set<string>()
    for (const connector of connectors) {
      const name = connector.name
      const rdns = ((connector as { rdns?: string }).rdns || '').toLowerCase()
      const key = (rdns || connector.id || name).toLowerCase()
      if (seen.has(key)) continue
      const isWc = /walletconnect/i.test(name) || connector.id === 'walletConnect'
      if (isWc && !showWalletConnect) continue
      const isGenericInjected = connector.id === 'injected'
      if (isGenericInjected) continue
      const isSdk =
        connector.id === 'coinbaseWallet' ||
        connector.id === 'walletConnect' ||
        connector.type === 'coinbaseWallet'
      const isEip6963 = Boolean(rdns) && !isSdk
      seen.add(key)
      rows.push({
        key,
        name: isWc ? WALLETCONNECT_LISTED.name : name,
        icon: typeof connector.icon === 'string' ? connector.icon : undefined,
        installed: isEip6963,
        connectorUid: connector.uid,
        walletConnect: isWc,
      })
    }
    if (injected.evm) {
      const injectedConnector = connectors.find((c) => c.id === 'injected')
      const already = rows.some((r) => r.installed && !r.walletConnect)
      if (injectedConnector && !already) {
        rows.unshift({
          key: 'injected',
          name: injectedEvmLabel(typeof window === 'undefined' ? null : window),
          installed: true,
          connectorUid: injectedConnector.uid,
        })
      }
    }
    for (const listed of EVM_LISTED_WALLETS) {
      if (rows.some((r) => matchesListedWallet(listed, r.name) || matchesListedWallet(listed, r.key))) {
        continue
      }
      rows.push({
        key: listed.id,
        name: listed.name,
        installed: false,
        listedId: listed.id,
      })
    }
    if (showWalletConnect && !rows.some((r) => r.walletConnect)) {
      const wc = connectors.find((c) => c.id === 'walletConnect')
      rows.push({
        key: 'walletconnect',
        name: WALLETCONNECT_LISTED.name,
        installed: Boolean(wc),
        connectorUid: wc?.uid,
        walletConnect: true,
      })
    }
    rows.sort((a, b) => Number(b.installed) - Number(a.installed) || Number(b.walletConnect) - Number(a.walletConnect))
    return rows
  }, [connectors, injected.evm, showWalletConnect])

  async function onSolana(row: SolRow) {
    setError(null)
    setBusy(row.key)
    try {
      if (row.wallet) {
        solana.select(row.wallet.adapter.name as WalletName)
        if (!row.wallet.adapter.connected) {
          await row.wallet.adapter.connect()
        }
        const adapter = row.wallet.adapter as typeof row.wallet.adapter & {
          signMessage?: (message: Uint8Array) => Promise<Uint8Array>
        }
        const wallet = adapter.publicKey?.toBase58() || ''
        const signMessage =
          (typeof adapter.signMessage === 'function'
            ? adapter.signMessage.bind(adapter)
            : undefined) ||
          solana.signMessage ||
          undefined
        setSigning(true)
        await completeSolanaAppConnect({
          wallet,
          signMessage,
          alreadyAuthenticated: isAuthenticated(wallet),
          authenticate,
        })
        rememberWalletConnect()
        close()
        return
      }
      if (mobile && (row.listedId === 'phantom' || row.name === 'Phantom')) {
        window.location.assign(phantomBrowseUrl(window.location.href, window.location.origin))
        return
      }
      if (mobile && (row.listedId === 'solflare' || row.name === 'Solflare')) {
        window.location.assign(solflareBrowseUrl(window.location.href, window.location.origin))
        return
      }
      const listed = SOLANA_LISTED_WALLETS.find((w) => w.id === row.listedId || w.name === row.name)
      if (listed) window.open(listed.installUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      if (row.wallet) {
        try {
          await solana.disconnect()
        } catch {
          /* ignore */
        }
        try {
          solana.select(null)
        } catch {
          /* ignore */
        }
        await logout()
        await persistExplicitDisconnect()
      }
      const text = err instanceof Error ? err.message : 'Could not connect Solana wallet.'
      if (/reject|cancel|deny/i.test(text)) setError('Connection cancelled.')
      else setError(text)
    } finally {
      setSigning(false)
      setBusy(null)
    }
  }

  async function onEvm(row: EvmRow) {
    setError(null)
    setBusy(row.key)
    try {
      const connector = connectors.find((c) => c.uid === row.connectorUid)
      if (connector) {
        await connectAsync({ connector })
        try {
          await switchChainAsync({ chainId: evmChainId })
        } catch {
          /* user may reject the switch; still connected */
        }
        close()
        return
      }
      if (mobile && row.name === 'Phantom') {
        window.location.assign(phantomBrowseUrl(window.location.href, window.location.origin))
        return
      }
      const listed = EVM_LISTED_WALLETS.find((w) => w.id === row.listedId || w.name === row.name)
      if (listed) window.open(listed.installUrl, '_blank', 'noopener,noreferrer')
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Could not connect EVM wallet.'
      if (/reject|cancel|deny/i.test(text)) setError('Connection cancelled.')
      else setError(text)
    } finally {
      setBusy(null)
    }
  }

  async function onDisconnectSolana() {
    setError(null)
    await logout()
    await persistExplicitDisconnect()
    try {
      await solana.disconnect()
    } catch {
      /* ignore */
    }
    try {
      solana.select(null)
    } catch {
      /* ignore */
    }
    await logout()
    await persistExplicitDisconnect()
    setBoardWallet(null)
  }

  async function onDisconnectEvm() {
    setError(null)
    try {
      await disconnectEvm()
    } catch {
      /* ignore */
    }
  }

  const solanaFirst = preferred !== 'evm'
  const hint =
    preferred === 'evm'
      ? 'Zora uses Base. Connect an EVM wallet — then Solana if you also launch Pump.fun or Bags.'
      : preferred === 'solana'
        ? 'Pump.fun and Bags.fm use Solana. Connect a Solana wallet — then Base for Zora.'
        : 'Pump.fun and Bags.fm use Solana. Zora uses Base.'

  const sheet = (
    <div className="crew-connect-backdrop" onClick={close} role="presentation">
      <div
        className="crew-connect-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crew-connect-title"
        data-testid="connect-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="crew-connect-handle" aria-hidden />
        <header className="crew-connect-head">
          <div>
            <h2 id="crew-connect-title">Connect wallet</h2>
            <p>{hint}</p>
          </div>
          <button type="button" className="crew-connect-x" onClick={close} aria-label="Close">
            ×
          </button>
        </header>

        {solAuthed || evmConnected ? (
          <section className="crew-connect-session" aria-label="Connected">
            {solAuthed && solana.publicKey ? (
              <div className="crew-connect-session-row">
                <span>
                  <strong>Solana</strong> {shortAddr(solana.publicKey.toBase58())}
                  {solana.wallet?.adapter.name ? ` · ${solana.wallet.adapter.name}` : ''}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onDisconnectSolana()}>
                  Disconnect
                </button>
              </div>
            ) : null}
            {evmAddress ? (
              <div className="crew-connect-session-row">
                <span>
                  <strong>EVM</strong> {shortAddr(evmAddress)}
                  {activeEvm?.name ? ` · ${activeEvm.name}` : ''}
                </span>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void onDisconnectEvm()}>
                  Disconnect
                </button>
              </div>
            ) : null}
          </section>
        ) : null}

        {signing ? (
          <p className="crew-connect-caption">Approve the sign-in message in your wallet.</p>
        ) : null}
        {error ? <p className="crew-connect-error">{error}</p> : null}

        <div className={`crew-connect-cols${solanaFirst ? '' : ' is-evm-first'}`}>
          <section className="crew-connect-group" aria-label="Solana wallets">
            <h3>Solana</h3>
            <p className="crew-connect-caption">Pump.fun · Bags.fm</p>
            <ul>
              {solanaRows.map((row) => (
                <li key={`sol-${row.key}`}>
                  <button
                    type="button"
                    className="crew-connect-row"
                    data-testid={`solana-wallet-${row.key}`}
                    disabled={busy === row.key || solana.connecting}
                    onClick={() => void onSolana(row)}
                  >
                    <WalletMark src={row.icon} name={row.name} />
                    <span className="crew-connect-row-name">{row.name}</span>
                    {row.installed ? <em>Detected</em> : row.mobile && mobile ? <em>Mobile</em> : <em>Get</em>}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="crew-connect-group" aria-label="EVM wallets">
            <h3>Base</h3>
            <p className="crew-connect-caption">Zora{evmChainId === 4663 ? ' · Robinhood Chain' : ''}</p>
            <ul>
              {evmRows.map((row) => (
                <li key={`evm-${row.key}`}>
                  <button
                    type="button"
                    className="crew-connect-row"
                    data-testid={row.walletConnect ? 'walletconnect-row' : `evm-wallet-${row.key}`}
                    disabled={busy === row.key || evmPending}
                    onClick={() => void onEvm(row)}
                  >
                    <WalletMark src={row.icon} name={row.name} />
                    <span className="crew-connect-row-name">{row.name}</span>
                    {row.walletConnect ? (
                      <em>{mobile ? 'Deep link' : 'QR'}</em>
                    ) : row.installed ? (
                      <em>Detected</em>
                    ) : (
                      <em>Get</em>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {mobile && !injected.solana ? (
          <p className="crew-connect-mobile">
            On a phone without an extension?{' '}
            <a href={phantomBrowseUrl(window.location.href, window.location.origin)}>Open in Phantom</a>
            {' · '}
            <a href={solflareBrowseUrl(window.location.href, window.location.origin)}>Open in Solflare</a>
          </p>
        ) : null}

        <p className="crew-connect-foot">Non-custodial. CrewPay never holds your keys.</p>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return null
  return createPortal(sheet, document.body)
}

function WalletMark({ src, name }: { src?: string; name: string }) {
  if (src) {
    return <img className="crew-connect-icon" src={src} alt="" width={28} height={28} />
  }
  return (
    <span className="crew-connect-icon crew-connect-icon-fallback" aria-hidden>
      {name.slice(0, 1)}
    </span>
  )
}
