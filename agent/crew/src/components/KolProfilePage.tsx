import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useWallet } from '@solana/wallet-adapter-react'
import { useAccount } from 'wagmi'
import bs58 from 'bs58'
import {
  CREW_VERSION,
  KOL_REFERRAL_CUT_PCT,
  REFERRAL_POINTS_HIRE,
  REFERRAL_POINTS_MIN_FOLLOWERS,
  REFERRAL_POINTS_REGISTER,
  REFERRAL_POINTS_REGISTER_DAILY_CAP,
} from '../lib/config'
import { formatSol } from '../lib/format-sol'
import { useOwnRegisteredHandle } from '../lib/registered-kol'
import { kolHandleFromPath, referralInvitePath } from '../lib/routes'
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
  registeredAt: string
  rank: number
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
  const ownHandle = useOwnRegisteredHandle(wallet.publicKey?.toBase58())
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
  const justRegistered = params.get('registered') === '1'
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
  const isOwner = Boolean(desk && connected && desk.profile.wallet === connected)

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

  async function saveEvmWallet() {
    if (!wallet.publicKey || !wallet.signMessage || !desk) return
    setEvmBusy(true)
    setEvmMsg(null)
    try {
      const ts = Date.now()
      const w = wallet.publicKey.toBase58()
      const evm = evmInput.trim()
      const message = `crew-kol-evm:${w}:${evm}:${ts}`
      const sig = await wallet.signMessage(new TextEncoder().encode(message))
      const res = await fetch(`${API}/api/kols/register/evm`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-crew-wallet': w,
          'x-crew-timestamp': String(ts),
          'x-crew-signature': bs58.encode(sig),
        },
        body: JSON.stringify({ evmWallet: evm }),
      })
      const body = (await res.json()) as Desk & { error?: string }
      if (!res.ok) throw new Error(body.error || 'Could not save EVM wallet.')
      setDesk((prev) =>
        prev
          ? {
              ...prev,
              profile: {
                ...prev.profile,
                evmWallet: body.profile?.evmWallet ?? (evm || null),
              },
            }
          : prev,
      )
      setEvmMsg(evm ? 'Saved. Needed for Zora / Base payouts.' : 'Cleared EVM wallet.')
    } catch (err) {
      setEvmMsg(err instanceof Error ? err.message : 'Could not save EVM wallet.')
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
    window.open(
      `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  return (
    <div className="app-shell page-kols page-desk">
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
          <p className="register-ok">Registered. This desk is yours.</p>
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

        {missing && !paidPitch ? (
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
                <a
                  className="desk-handle"
                  href={`https://x.com/${desk.profile.xUsername}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  @{desk.profile.xUsername}
                </a>
                <div className="desk-wallet-row">
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
                  {desk.profile.evmWallet ? (
                    <a
                      className="btn btn-ghost btn-sm"
                      href={`https://basescan.org/address/${desk.profile.evmWallet}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Base
                    </a>
                  ) : null}
                  <a
                    className="btn btn-ghost btn-sm"
                    href={`https://x.com/${desk.profile.xUsername}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    X
                  </a>
                </div>
                {isOwner || viewingOwnDesk ? (
                  <div className="desk-evm-row">
                    <label className="register-ref register-evm">
                      <span>EVM wallet (optional)</span>
                      <input
                        type="text"
                        value={evmInput}
                        onChange={(e) => setEvmInput(e.target.value)}
                        placeholder="0x… Base address"
                        autoComplete="off"
                        spellCheck={false}
                        maxLength={42}
                      />
                      <em className="desk-evm-hint">
                        Needed to be paid on Zora / Base launches. Pump.fun and Bags.fm still use
                        Solana.
                      </em>
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={evmBusy || !wallet.signMessage}
                      onClick={() => void saveEvmWallet()}
                    >
                      {evmBusy ? 'Signing…' : 'Save EVM wallet'}
                    </button>
                    {evmMsg ? <p className="hint">{evmMsg}</p> : null}
                  </div>
                ) : desk.profile.evmWallet ? (
                  <p className="desk-evm-hint">Base · {shortAddr(desk.profile.evmWallet)}</p>
                ) : null}
              </div>
              <div className="desk-rank" aria-label="Follower rank">
                <span>Rank</span>
                <strong>#{desk.profile.rank || '—'}</strong>
              </div>
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
                Creator fees across the linked wallet
                {desk.profile.priorWallets?.length
                  ? ' and prior / directory wallets'
                  : ''}
                .
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
