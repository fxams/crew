import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useAccount } from 'wagmi'
import bs58 from 'bs58'
import {
  CREW_VERSION,
  KOL_PROGRAM_ENABLED,
  KOL_REFERRAL_CUT_PCT,
  REFERRAL_POINTS_HIRE,
  REFERRAL_POINTS_MIN_FOLLOWERS,
  REFERRAL_POINTS_REGISTER,
  REFERRAL_POINTS_REGISTER_DAILY_CAP,
} from '../lib/config'
import { formatSol } from '../lib/format-sol'
import { useOwnRegisteredHandle } from '../lib/registered-kol'
import {
  fetchKolProgramProfile,
  fetchPublicKolCard,
  hofBadgeLabel,
  type HofBadge,
  type PublicKolCard,
} from '../lib/kol-program'
import { KolPublicCardView } from './KolPublicCardView'
import { kolHandleFromPath, referralInvitePath } from '../lib/routes'
import { PrivyPayoutWallet } from './PrivyPayoutWallet'
import {
  ADD_BASE_WALLET_BANNER,
  ADD_WALLET_TO_RECEIVE,
  BASE_WALLET_REGISTER_HINT,
  NO_CRYPTO_NEEDED,
} from '../lib/kol-onboarding'
import { evmAddressFieldError, isEvmAddress } from '../lib/evm-address'
import { registerKolEvmWallet } from '../lib/kol-evm-wallet'
import { isPayoutWallet } from '../lib/payout-wallet'
import { openXUrl } from '../lib/x-links'
import { XLink } from './XLink'
import { resolvePrivyAppId } from '../lib/privy-app'
import { useConnectModal } from './ConnectModal'
import { TelegramDeskCard } from './TelegramDeskCard'
import { PlatformBadge } from './PlatformBadge'
import {
  explorerLabel,
  explorerTokenUrl,
  explorerTxUrl,
  inferLaunchPlatform,
  tradeLabel,
} from '../lib/platforms'

const API = (
  (import.meta.env.VITE_CREW_API_URL as string | undefined)?.replace(/\/$/, '') ||
  'https://api.crewpay.dev'
)

type Profile = {
  xUsername: string
  xName: string
  xVerified: boolean
  followers: number
  following: number
  tweetCount: number
  profileImageUrl: string | null
  description: string
  wallet: string
  evmWallet?: string | null
  priorWallets?: string[]
  referralCode?: string
  referredByCode?: string | null
  referralCount?: number
  referralPoints?: number
  solEarned?: number
  pendingWallet?: string | null
  pendingUntil?: string | null
  registeredAt: string
  rank: number
  telegramUsername?: string | null
  telegramAlerts?: boolean
  telegramChatId?: string | null
  tgChannel?: string | null
  tgChannelVerified?: boolean
  tgReach?: number | null
  telegramOnly?: boolean
}

type DeskCoin = {
  mint: string
  ticker: string
  name: string
  mode: string
  launchedAt: string
  pumpUrl: string
  platform?: string
  share: number | null
  hireRole: string | null
  solReceived: number
  launchedByKol: boolean
}

type DeskRemit = {
  mint: string
  ticker: string
  amountSol: number
  mode: string
  at: string
  signature: string
}

type Desk = {
  profile: Profile
  performance: {
    coinsHired: number
    coinsLaunched: number
    solReceived: number
    remitCount: number
    coins: DeskCoin[]
    remits: DeskRemit[]
  }
}

type ReferralEarnings = {
  referralFeesEarnedSol: number
  referralRemitCount: number
  crewFeesEarnedSol: number
  crewRemitCount: number
  agents: unknown[]
  launches: unknown[]
}

function shortAddr(addr: string) {
  if (!addr || addr.length < 10) return addr || '—'
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`
}

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function deskAvatarSrc(profile: Profile): string | null {
  const url = profile.profileImageUrl?.trim()
  if (url && !/default_profile_images|\/sticky\/default/i.test(url)) return url
  return `https://unavatar.io/x/${encodeURIComponent(profile.xUsername)}`
}

function formatWhen(iso: string) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return ''
  return new Date(t).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

type PaidPitch = {
  handle: string
  solEarned: number
  remitCount: number
  directoryWallet?: string | null
  registered: boolean
}

export function KolProfilePage() {
  const { pathname } = useLocation()
  const handle = kolHandleFromPath(pathname) || ''
  const [params] = useSearchParams()
  const wallet = useWallet()
  const { address: evmAddress } = useAccount()
  const { open: openConnect } = useConnectModal()
  const ownHandle = useOwnRegisteredHandle(wallet.publicKey?.toBase58())
  const [privyAppId, setPrivyAppId] = useState(() => resolvePrivyAppId())
  const [payoutBusy, setPayoutBusy] = useState(false)
  const [payoutMsg, setPayoutMsg] = useState<string | null>(null)
  const [desk, setDesk] = useState<Desk | null>(null)
  const [missing, setMissing] = useState(false)
  const [paidPitch, setPaidPitch] = useState<PaidPitch | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [refCopied, setRefCopied] = useState(false)
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null)
  const [refEarnings, setRefEarnings] = useState<ReferralEarnings | null>(null)
  const [refEarningsBusy, setRefEarningsBusy] = useState(false)
  const [refEarningsError, setRefEarningsError] = useState<string | null>(null)
  const [evmInput, setEvmInput] = useState('')
  const [evmBusy, setEvmBusy] = useState(false)
  const [evmMsg, setEvmMsg] = useState<string | null>(null)
  const [deskTick, setDeskTick] = useState(0)
  const [programHof, setProgramHof] = useState<HofBadge[]>([])
  const [publicCard, setPublicCard] = useState<PublicKolCard | null>(null)
  const [pinnedPostId, setPinnedPostId] = useState<string | null>(null)
  const [shareTag, setShareTag] = useState('')
  const [replyPinned, setReplyPinned] = useState(false)
  const justRegistered = params.get('registered') === '1'
  const fromXOauth = params.get('from') === 'x'
  const viewingOwnDesk =
    Boolean(ownHandle) && ownHandle!.toLowerCase() === handle.toLowerCase()

  useEffect(() => {
    let cancelled = false
    setDesk(null)
    setMissing(false)
    setPaidPitch(null)
    setError(null)
    void (async () => {
      try {
        const res = await fetch(`${API}/api/kols/registered/${encodeURIComponent(handle)}`)
        const body = (await res.json()) as Desk & { error?: string }
        if (cancelled) return
        if (res.status === 404) {
          setMissing(true)
          if (KOL_PROGRAM_ENABLED) {
            const pub = await fetchPublicKolCard(handle)
            if (!cancelled && pub) {
              setPublicCard(pub.card)
              setPinnedPostId(pub.pinnedPostId)
            }
          }
          // Unregistered but already paid by agents? Show that instead of a dead end.
          try {
            const pr = await fetch(`${API}/api/kols/claim/${encodeURIComponent(handle)}`)
            if (pr.ok) {
              const pb = (await pr.json()) as PaidPitch
              if (!cancelled && pb && Number(pb.solEarned) > 0) setPaidPitch(pb)
            }
          } catch {
            /* optional */
          }
          return
        }
        if (!res.ok || !body.profile) {
          throw new Error(body.error || 'Could not load this desk.')
        }
        setDesk(body)
        setEvmInput(body.profile?.evmWallet || '')
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this desk.')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [handle, deskTick])

  useEffect(() => {
    if (!KOL_PROGRAM_ENABLED || !handle) {
      setProgramHof([])
      return
    }
    let cancelled = false
    void (async () => {
      const prof = await fetchKolProgramProfile(handle)
      if (!cancelled) setProgramHof(prof?.hallOfFame || [])
    })()
    return () => {
      cancelled = true
    }
  }, [handle])

  useEffect(() => {
    if (evmAddress) {
      setEvmInput((prev) => (prev.trim() ? prev : evmAddress))
    }
  }, [evmAddress])

  useEffect(() => {
    if (!desk?.profile) {
      setAvatarSrc(null)
      return
    }
    setAvatarSrc(deskAvatarSrc(desk.profile))
  }, [desk])

  const connected = wallet.publicKey?.toBase58() || ''
  const hasPayoutWallet = isPayoutWallet(desk?.profile.wallet)
  const hasBaseWallet = isEvmAddress(desk?.profile.evmWallet)
  const evmFieldError = evmAddressFieldError(evmInput)
  const isWalletOwner = Boolean(desk && connected && hasPayoutWallet && desk.profile.wallet === connected)
  const isOwner = Boolean(desk && (isWalletOwner || viewingOwnDesk))

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${API}/api/kols/register/status`)
        if (!res.ok) return
        const body = (await res.json()) as { privy?: { appId?: string } }
        if (!cancelled) setPrivyAppId(resolvePrivyAppId(body.privy?.appId))
      } catch {
        /* optional */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function loadReferralEarnings() {
    if (!wallet.publicKey || !wallet.signMessage || !desk) return
    setRefEarningsBusy(true)
    setRefEarningsError(null)
    try {
      const ts = Math.floor(Date.now() / 1000)
      const w = wallet.publicKey.toBase58()
      const message = `crew-kol-referrals:${w}:${ts}`
      const sig = await wallet.signMessage(new TextEncoder().encode(message))
      const res = await fetch(`${API}/api/kol/referrals`, {
        headers: {
          'x-crew-wallet': w,
          'x-crew-timestamp': String(ts),
          'x-crew-signature': bs58.encode(sig),
        },
      })
      const body = (await res.json()) as ReferralEarnings & { error?: string; ok?: boolean }
      if (!res.ok) throw new Error(body.error || 'Could not load referral earnings.')
      setRefEarnings({
        referralFeesEarnedSol: Number(body.referralFeesEarnedSol || 0),
        referralRemitCount: Number(body.referralRemitCount || 0),
        crewFeesEarnedSol: Number(body.crewFeesEarnedSol || 0),
        crewRemitCount: Number(body.crewRemitCount || 0),
        agents: body.agents || [],
        launches: body.launches || [],
      })
    } catch (err) {
      setRefEarningsError(err instanceof Error ? err.message : 'Could not load referral earnings.')
    } finally {
      setRefEarningsBusy(false)
    }
  }

  async function copyWallet() {
    if (!desk) return
    try {
      await navigator.clipboard.writeText(desk.profile.wallet)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  async function savePayoutWallet(opts: {
    address: string
    signMessage: (msg: Uint8Array) => Promise<Uint8Array>
    getAccessToken?: () => Promise<string | null>
  }) {
    if (!desk) return
    setPayoutBusy(true)
    setPayoutMsg(null)
    try {
      const address = opts.address.trim()
      if (!isPayoutWallet(address)) throw new Error('Invalid Solana payout wallet.')
      const ts = Date.now()
      const message = `crew-kol-wallet-set:${address}:${ts}`
      const sig = await opts.signMessage(new TextEncoder().encode(message))
      const privyToken = opts.getAccessToken ? await opts.getAccessToken() : null
      const res = await fetch(`${API}/api/kols/register/wallet`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          wallet: address,
          signature: bs58.encode(sig),
          timestamp: ts,
          ...(privyToken ? { privyToken } : {}),
        }),
      })
      const body = (await res.json()) as Desk & { error?: string }
      if (!res.ok) throw new Error(body.error || 'Could not save payout wallet.')
      setDesk((prev) =>
        prev
          ? {
              ...prev,
              profile: {
                ...prev.profile,
                wallet: body.profile?.wallet || address,
                pendingWallet: body.profile?.pendingWallet,
                pendingUntil: body.profile?.pendingUntil,
              },
            }
          : prev,
      )
      setPayoutMsg(
        body.profile?.pendingWallet
          ? 'Wallet change pending — sign with the current wallet or wait 48h.'
          : 'Payout wallet saved. You can get hired and paid on future crews.',
      )
    } catch (err) {
      setPayoutMsg(err instanceof Error ? err.message : 'Could not save payout wallet.')
    } finally {
      setPayoutBusy(false)
    }
  }


  async function saveEvmWallet() {
    if (!desk) return
    const evm = evmInput.trim()
    const fieldErr = evm ? evmAddressFieldError(evm) : null
    if (fieldErr) {
      setEvmMsg(fieldErr)
      return
    }
    if (!evm) {
      setEvmMsg('Enter a Base wallet (0x…) or keep your saved address.')
      return
    }
    if (!wallet.publicKey || !wallet.signMessage) {
      openConnect({ preferred: 'solana' })
      setEvmMsg('Connect the Solana wallet on your desk to link Base payouts.')
      return
    }
    setEvmBusy(true)
    setEvmMsg(null)
    try {
      const profile = await registerKolEvmWallet({
        apiBase: API,
        solanaWallet: wallet.publicKey.toBase58(),
        signMessage: wallet.signMessage,
        evmWallet: evm,
      })
      setDesk((prev) =>
        prev
          ? {
              ...prev,
              profile: {
                ...prev.profile,
                evmWallet: profile.evmWallet ?? evm,
              },
            }
          : prev,
      )
      setEvmMsg('Base wallet saved.')
    } catch (err) {
      setEvmMsg(err instanceof Error ? err.message : 'Could not save Base wallet.')
    } finally {
      setEvmBusy(false)
    }
  }

  async function copyShareCard() {
    if (!desk) return
    const url = `${window.location.origin}/kol/${desk.profile.xUsername}`
    const text = [
      `@${desk.profile.xUsername} on CrewPay`,
      `${formatSol(desk.performance.solReceived)} SOL earned · rank #${desk.profile.rank || '—'}`,
      url,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      setShareCopied(true)
      window.setTimeout(() => setShareCopied(false), 1600)
    } catch {
      setShareCopied(false)
    }
  }

  const referralCode =
    desk?.profile.referralCode ||
    desk?.profile.xUsername.replace(/[^a-zA-Z0-9_]/g, '').toLowerCase() ||
    ''
  const referralLink = referralCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}${referralInvitePath(referralCode)}`
    : ''

  async function copyReferralLink() {
    if (!referralLink) return
    try {
      await navigator.clipboard.writeText(referralLink)
      setRefCopied(true)
      window.setTimeout(() => setRefCopied(false), 1600)
    } catch {
      setRefCopied(false)
    }
  }

  function shareOnX() {
    if (!desk) return
    const url = `${window.location.origin}/kol/${desk.profile.xUsername}`
    const text = `@${desk.profile.xUsername} earned ${formatSol(desk.performance.solReceived)} SOL on @CrewPayHQ`
    openXUrl(
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
    )
  }

  return (
    <div className="app-shell page-kols page-desk" data-testid="kol-desk-page">
      <section className="section section-kols">
        <div className="kols-page-head">
          <div className="launch-page-head-row">
            <Link className="launch-back" to={viewingOwnDesk ? '/kols' : '/register'}>
              {viewingOwnDesk ? '← KOLs' : '← Register'}
            </Link>
            <p className="section-label">KOL desk · v{CREW_VERSION}</p>
          </div>
        </div>

        {justRegistered && desk ? (
          <div className="register-ok-block" data-testid="desk-registered-banner">
            <p className="register-ok">Registered. This desk is yours.</p>
            {fromXOauth ? (
              <p className="hint register-check-hint" data-testid="desk-wallet-check-hint">
                If you started in a wallet browser (Phantom), return there and tap Check — this
                page may have opened in Safari or the X app.{' '}
                <Link to="/register">Back to register</Link>
              </p>
            ) : null}
          </div>
        ) : null}
        {desk?.profile.pendingWallet && desk.profile.pendingUntil ? (
          <p className="register-ok">
            Wallet change pending to {shortAddr(desk.profile.pendingWallet)} until{' '}
            {formatWhen(desk.profile.pendingUntil)}. Sign{' '}
            <code>crew-kol-wallet-change</code> with the current wallet to apply sooner, or wait 48h.
          </p>
        ) : null}
        {error ? <p className="register-err">{error}</p> : null}

        {!desk && !missing && !error ? <p className="section-sub">Loading desk…</p> : null}

        {missing && paidPitch ? (
          <div className="desk-hero desk-hero-unclaimed">
            <div className="desk-unclaimed">
              <p className="desk-kicker">Unclaimed desk</p>
              <h1 className="section-title">Autohire already picked @{paidPitch.handle}.</h1>
              <p className="claim-sol">
                {formatSol(paidPitch.solEarned)}
                <span> SOL sent on-chain</span>
              </p>
              <p className="section-sub">
                {paidPitch.remitCount} payment{paidPitch.remitCount === 1 ? '' : 's'} from coin fee-shares went to
                the public Pump.fun wallet{' '}
                {paidPitch.directoryWallet ? (
                  <a
                    href={`https://solscan.io/account/${paidPitch.directoryWallet}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {paidPitch.directoryWallet.slice(0, 4)}…{paidPitch.directoryWallet.slice(-4)}
                  </a>
                ) : (
                  'linked to this handle'
                )}
                . Nothing to withdraw here — it is already in that wallet.
              </p>
              <ul className="desk-why">
                <li>Claim it: registered KOLs fill Autohire seats first.</li>
                <li>Choose the wallet future fee-shares go to.</li>
                <li>Get a referral link: 5% of creator fees on launches by agents you refer.</li>
                <li>Read-only X sign-in. CrewPay can't post for you.</li>
              </ul>
              <div className="register-actions">
                <Link className="btn btn-primary" to="/register">
                  Claim this desk
                </Link>
                <Link className="btn btn-ghost" to="/proof">
                  See the proof tape
                </Link>
              </div>
              <p className="hint">
                Autohire picks public Pump.fun profiles by narrative. A listing is not an endorsement. Not you, or want
                out? Message @CrewPayHQ on X (or reply STOP to our DM) and we&apos;ll remove you from Autohire.
              </p>
            </div>
          </div>
        ) : null}

        {missing && !paidPitch && KOL_PROGRAM_ENABLED && publicCard ? (
          <KolPublicCardView
            card={publicCard}
            pinnedPostId={pinnedPostId}
            tagHandle={shareTag}
            onTagHandleChange={setShareTag}
            replyUnderPinned={replyPinned}
            onReplyUnderPinnedChange={setReplyPinned}
          />
        ) : null}

        {missing && !paidPitch && !(KOL_PROGRAM_ENABLED && publicCard) ? (
          <div className="desk-hero desk-hero-unclaimed">
            <div>
              <h1 className="section-title">No desk for @{handle}.</h1>
              <p className="section-sub">This X account is not on the CrewPay register yet.</p>
              <Link className="btn btn-primary btn-sm" to="/register">
                Register
              </Link>
            </div>
          </div>
        ) : null}

        {desk ? (
          <>
            <header className="desk-hero">
              {avatarSrc ? (
                <img
                  className="desk-avatar"
                  src={avatarSrc}
                  alt=""
                  width={112}
                  height={112}
                  referrerPolicy="no-referrer"
                  onError={() => {
                    const fallback = `https://unavatar.io/x/${encodeURIComponent(desk.profile.xUsername)}`
                    if (avatarSrc !== fallback) setAvatarSrc(fallback)
                  }}
                />
              ) : (
                <div className="desk-avatar desk-avatar-fallback" aria-hidden>
                  {desk.profile.xUsername.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="desk-identity">
                <p className="desk-kicker">{isOwner ? 'Your desk' : `Rank #${desk.profile.rank || '—'}`}</p>
                <h1 className="desk-name">
                  {desk.profile.xName || desk.profile.xUsername}
                  {desk.profile.xVerified ? <span className="desk-check"> ✓</span> : null}
                </h1>
                {programHof.length ? (
                  <div className="desk-hof-badges" data-testid="desk-hof-badges">
                    {programHof.map((b) => (
                      <span key={b.seasonId} className="kol-hof-badge" title={`Rank #${b.rank}`}>
                        {hofBadgeLabel(b.seasonNumber)}
                      </span>
                    ))}
                  </div>
                ) : null}
                <XLink
                  className="desk-handle"
                  href={
                    desk.profile.telegramOnly && desk.profile.telegramUsername
                      ? `https://t.me/${desk.profile.telegramUsername}`
                      : `https://x.com/${desk.profile.xUsername}`
                  }
                >
                  @{desk.profile.telegramOnly && desk.profile.telegramUsername
                    ? desk.profile.telegramUsername
                    : desk.profile.xUsername}
                </XLink>
                <div className="desk-chain-eligibility" data-testid="desk-chain-eligibility">
                  <span
                    className={`desk-chain-chip${hasPayoutWallet ? ' is-on' : ' is-off'}`}
                    title={
                      hasPayoutWallet
                        ? 'Eligible for Pump.fun and Bags.fm crews'
                        : 'Add a Solana payout wallet for Pump.fun and Bags.fm'
                    }
                  >
                    Solana
                  </span>
                  <span
                    className={`desk-chain-chip${hasBaseWallet ? ' is-on' : ' is-off'}`}
                    title={
                      hasBaseWallet
                        ? 'Eligible for Clanker and Zora crews on Base'
                        : 'Add a Base (0x) wallet for Clanker and Zora crews'
                    }
                  >
                    Base
                  </span>
                </div>
                <div className="desk-wallet-row">
                  {hasPayoutWallet ? (
                    <>
                  <button type="button" className="desk-wallet" onClick={() => void copyWallet()}>
                    <span>{shortAddr(desk.profile.wallet)}</span>
                    <strong>{copied ? 'Copied' : 'Copy'}</strong>
                  </button>
                  <a
                    className="btn btn-ghost btn-sm"
                    href={`https://solscan.io/account/${desk.profile.wallet}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Solscan
                  </a>
                    </>
                  ) : (
                    <p className="desk-wallet-missing">{ADD_WALLET_TO_RECEIVE}</p>
                  )}
                  {hasBaseWallet && desk.profile.evmWallet ? (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`https://basescan.org/address/${desk.profile.evmWallet}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Base · {shortAddr(desk.profile.evmWallet)}
                    </a>
                  ) : null}
                  {desk.profile.telegramOnly ? (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={
                        desk.profile.telegramUsername
                          ? `https://t.me/${desk.profile.telegramUsername}`
                          : 'https://t.me/CrewPay_Bot'
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      Telegram
                    </a>
                  ) : (
                    <XLink
                      className="btn btn-ghost btn-sm"
                      href={`https://x.com/${desk.profile.xUsername}`}
                    >
                      X
                    </XLink>
                  )}
                </div>
              </div>
              <div className="desk-rank" aria-label="Follower rank">
                <span>Rank</span>
                <strong>#{desk.profile.rank || '—'}</strong>
              </div>
              {isOwner || viewingOwnDesk ? (
                <div className="desk-payout-card">
                  {!hasPayoutWallet ? (
                    <p className="desk-wallet-banner">
                      {ADD_WALLET_TO_RECEIVE} {NO_CRYPTO_NEEDED}
                    </p>
                  ) : (
                    <p className="desk-pnl-sub">
                      Change your Solana payout wallet. CrewPay never holds keys.
                    </p>
                  )}
                  <div className="register-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={payoutBusy}
                      onClick={() => {
                        if (!wallet.publicKey || !wallet.signMessage) {
                          openConnect({ preferred: 'solana' })
                          return
                        }
                        void savePayoutWallet({
                          address: wallet.publicKey.toBase58(),
                          signMessage: wallet.signMessage,
                        })
                      }}
                    >
                      {payoutBusy
                        ? 'Saving…'
                        : wallet.publicKey
                          ? hasPayoutWallet
                            ? 'Use connected wallet'
                            : 'Save connected wallet'
                          : 'Connect a wallet'}
                    </button>
                  </div>
                  {privyAppId && !hasPayoutWallet ? (
                    <PrivyPayoutWallet
                      appId={privyAppId}
                      autoStart={justRegistered || fromXOauth}
                      disabled={payoutBusy}
                      onWallet={(w) => void savePayoutWallet(w)}
                      onError={setPayoutMsg}
                    />
                  ) : null}
                  {payoutMsg ? <p className="hint">{payoutMsg}</p> : null}
                </div>
              ) : null}
              {isOwner || viewingOwnDesk ? (
                <TelegramDeskCard
                  telegramLogin
                  telegramUsername={desk.profile.telegramUsername}
                  telegramAlerts={desk.profile.telegramAlerts}
                  telegramChatId={desk.profile.telegramChatId}
                  tgChannel={desk.profile.tgChannel}
                  tgChannelVerified={desk.profile.tgChannelVerified}
                  tgReach={desk.profile.tgReach}
                  telegramOnly={desk.profile.telegramOnly}
                  onRefresh={() => setDeskTick((n) => n + 1)}
                />
              ) : null}
              {isOwner || viewingOwnDesk ? (
                <div
                  className={`desk-base-card${hasBaseWallet ? '' : ' desk-base-card-missing'}`}
                  data-testid="desk-base-wallet"
                >
                  {!hasBaseWallet ? (
                    <p className="desk-wallet-banner desk-base-banner">{ADD_BASE_WALLET_BANNER}</p>
                  ) : (
                    <p className="desk-pnl-sub">
                      Base payout ·{' '}
                      <a
                        href={`https://basescan.org/address/${desk.profile.evmWallet}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {shortAddr(desk.profile.evmWallet!)}
                      </a>
                    </p>
                  )}
                  <label className="register-ref register-evm">
                    <span>{hasBaseWallet ? 'Update Base wallet (0x…)' : 'Base wallet (0x…)'}</span>
                    <input
                      type="text"
                      value={evmInput}
                      onChange={(e) => setEvmInput(e.target.value)}
                      placeholder="0x…"
                      autoComplete="off"
                      spellCheck={false}
                      maxLength={42}
                      inputMode="text"
                      aria-invalid={evmFieldError ? true : undefined}
                    />
                    <em className="desk-evm-hint">{BASE_WALLET_REGISTER_HINT}</em>
                    {evmFieldError ? (
                      <p className="register-err register-evm-err">{evmFieldError}</p>
                    ) : null}
                  </label>
                  <div className="register-actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={evmBusy || Boolean(evmFieldError)}
                      onClick={() => void saveEvmWallet()}
                    >
                      {evmBusy
                        ? 'Signing…'
                        : hasBaseWallet
                          ? 'Save Base wallet'
                          : 'Add Base wallet'}
                    </button>
                  </div>
                  {evmMsg ? <p className="hint">{evmMsg}</p> : null}
                </div>
              ) : null}
            </header>

            <div className="desk-stats" aria-label="X stats">
              <div>
                <strong>{formatCount(desk.profile.followers)}</strong>
                <span>Followers</span>
              </div>
              <div>
                <strong>{formatCount(desk.profile.following)}</strong>
                <span>Following</span>
              </div>
              <div>
                <strong>{formatCount(desk.profile.tweetCount)}</strong>
                <span>Posts</span>
              </div>
              <div>
                <strong>{formatWhen(desk.profile.registeredAt)}</strong>
                <span>Joined</span>
              </div>
            </div>

            <section className="desk-pnl" aria-label="CrewPay performance">
              <p className="section-label">Performance</p>
              <p className="desk-pnl-value">
                {formatSol(desk.performance.solReceived)}
                <span> SOL</span>
              </p>
              <p className="desk-pnl-sub">
                {hasPayoutWallet
                  ? `Creator fees across the linked wallet${
                      desk.profile.priorWallets?.length ? ' and prior / directory wallets' : ''
                    }.`
                  : ADD_WALLET_TO_RECEIVE}
              </p>
              <div className="desk-pnl-chips">
                <span>{desk.performance.coinsHired} hired</span>
                <span>{desk.performance.coinsLaunched} launched</span>
                <span>{desk.performance.remitCount} payments</span>
                <span className="kol-verified">✓ registered</span>
              </div>
            </section>

            <aside className="desk-share-card" aria-label="Shareable card">
              <p className="section-label">Share</p>
              <div className="desk-share-body">
                <strong>@{desk.profile.xUsername}</strong>
                <span>
                  {formatSol(desk.performance.solReceived)} SOL · rank #
                  {desk.profile.rank || '—'}
                </span>
                <span className="kol-verified">✓ CrewPay registered</span>
              </div>
              <div className="desk-share-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void copyShareCard()}>
                  {shareCopied ? 'Copied' : 'Copy card'}
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={shareOnX}>
                  Post on X
                </button>
              </div>
            </aside>

            {referralCode ? (
              <aside className="desk-referral-card" aria-label="Referral code">
                <p className="section-label">Referral</p>
                <p className="desk-referral-code">
                  <strong>{referralCode}</strong>
                  <span>
                    {KOL_REFERRAL_CUT_PCT}% of creator fees when agents claim with your code ·{' '}
                    {desk.profile.referralCount || 0} KOL refs ·{' '}
                    {desk.profile.referralPoints || 0} pts
                  </span>
                </p>
                <p className="desk-referral-points">
                  Share crewpay.dev/r/{referralCode}. Agents that claim a key with your code bind
                  you permanently — referred launches are 60/15/{KOL_REFERRAL_CUT_PCT}/20 on-chain
                  (5% creator-fee share from treasury; not a KOL-seat carve). Also earn{' '}
                  {REFERRAL_POINTS_REGISTER} pts when someone with ≥
                  {REFERRAL_POINTS_MIN_FOLLOWERS} followers registers (max{' '}
                  {REFERRAL_POINTS_REGISTER_DAILY_CAP}/day), +{REFERRAL_POINTS_HIRE} on hire.
                  Buyback cron is not live.
                </p>
                <p className="desk-referral-link" title={referralLink}>
                  {referralLink}
                </p>
                {(isOwner || viewingOwnDesk) && wallet.publicKey ? (
                  <div className="desk-referral-earnings">
                    {refEarnings ? (
                      <>
                        <p className="desk-pnl-sub">
                          Referral fees (agent-referral role):{' '}
                          <strong>{formatSol(refEarnings.referralFeesEarnedSol)} SOL</strong> ·{' '}
                          {refEarnings.referralRemitCount} remits · {refEarnings.agents.length}{' '}
                          agents · {refEarnings.launches.length} launches
                        </p>
                        <p className="desk-pnl-sub">
                          Crew-seat fees (hired as KOL):{' '}
                          <strong>{formatSol(refEarnings.crewFeesEarnedSol)} SOL</strong> ·{' '}
                          {refEarnings.crewRemitCount} remits
                        </p>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={refEarningsBusy || !wallet.signMessage}
                        onClick={() => void loadReferralEarnings()}
                      >
                        {refEarningsBusy ? 'Signing…' : 'Load referral vs crew earnings'}
                      </button>
                    )}
                    {refEarningsError ? <p className="register-err">{refEarningsError}</p> : null}
                  </div>
                ) : null}
                <div className="desk-share-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => void copyReferralLink()}
                  >
                    {refCopied ? 'Copied' : 'Copy invite link'}
                  </button>
                  {isOwner || viewingOwnDesk ? (
                    <Link className="btn btn-ghost btn-sm" to={referralInvitePath(referralCode)}>
                      Preview link
                    </Link>
                  ) : null}
                </div>
              </aside>
            ) : null}

            <section className="desk-block">
              <h2 className="section-title desk-block-title">Coins</h2>
              {desk.performance.coins.length === 0 ? (
                <p className="desk-empty">
                  No CrewPay coins yet. When a launch hires this wallet, the coin and the SOL paid
                  show up here.
                </p>
              ) : (
                <div className="desk-coins">
                  {desk.performance.coins.map((coin) => (
                    <article className="desk-coin" key={coin.mint}>
                      <div className="desk-coin-top">
                        <strong>${coin.ticker}</strong>
                        <span>
                          <PlatformBadge
                            platform={coin.platform}
                            pumpUrl={coin.pumpUrl}
                            mint={coin.mint}
                          />{' '}
                          {coin.launchedByKol ? 'Launched' : 'Hired'}
                        </span>
                      </div>
                      <p className="desk-coin-name">{coin.name}</p>
                      <p className="desk-coin-sol">{formatSol(coin.solReceived)} SOL</p>
                      <p className="desk-coin-meta">
                        {coin.share != null ? `${coin.share}% share` : coin.mode}
                        {coin.hireRole ? ` · ${coin.hireRole}` : ''}
                        {' · '}
                        {formatWhen(coin.launchedAt)}
                      </p>
                      <div className="desk-coin-links">
                        {coin.pumpUrl ? (
                          <a href={coin.pumpUrl} target="_blank" rel="noreferrer">
                            {tradeLabel(
                              inferLaunchPlatform({
                                platform: coin.platform,
                                pumpUrl: coin.pumpUrl,
                                mint: coin.mint,
                              }),
                            )}
                          </a>
                        ) : null}
                        {explorerTokenUrl(
                          inferLaunchPlatform({
                            platform: coin.platform,
                            pumpUrl: coin.pumpUrl,
                            mint: coin.mint,
                          }),
                          coin.mint,
                        ) ? (
                          <a
                            href={explorerTokenUrl(
                              inferLaunchPlatform({
                                platform: coin.platform,
                                pumpUrl: coin.pumpUrl,
                                mint: coin.mint,
                              }),
                              coin.mint,
                            )!}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {explorerLabel(
                              inferLaunchPlatform({
                                platform: coin.platform,
                                pumpUrl: coin.pumpUrl,
                                mint: coin.mint,
                              }),
                            )}
                          </a>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section className="desk-block">
              <h2 className="section-title desk-block-title">Paid</h2>
              {desk.performance.remits.length === 0 ? (
                <p className="desk-empty">No fee payments recorded for this wallet yet.</p>
              ) : (
                <div className="desk-remits">
                  {desk.performance.remits.map((remit) => (
                    <a
                      className="desk-remit"
                      key={`${remit.signature}-${remit.mint}`}
                      href={
                        remit.signature
                          ? explorerTxUrl(
                              inferLaunchPlatform({ mint: remit.mint }),
                              remit.signature,
                            ) || `https://solscan.io/tx/${remit.signature}`
                          : explorerTokenUrl(
                              inferLaunchPlatform({ mint: remit.mint }),
                              remit.mint,
                            ) || `https://solscan.io/token/${remit.mint}`
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      <strong>${remit.ticker}</strong>
                      <span>{formatSol(remit.amountSol)} SOL</span>
                      <span>{remit.mode}</span>
                      <span>{formatWhen(remit.at)}</span>
                    </a>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </section>
    </div>
  )
}
