import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import {
  fetchSuiLaunchpadConfig,
  fetchSuiPoolDetail,
  fetchSuiTradeUnsigned,
  suiscanObjectUrl,
  suiscanTxUrl,
} from '../../lib/sui-api'
import { formatSui, parseSuiInput, poolDisplayName, shortAddress, stageLabel } from '../../lib/sui-format'
import { SuiTestnetBadge } from './SuiTestnetBadge'
import { SuiWalletButton } from './SuiWalletButton'

export function SuiPoolDetailPage() {
  const { poolId = '' } = useParams()
  const account = useCurrentAccount()
  const { mutateAsync: signExec, isPending } = useSignAndExecuteTransaction()
  const configQ = useQuery({ queryKey: ['sui-config'], queryFn: fetchSuiLaunchpadConfig })
  const detailQ = useQuery({
    queryKey: ['sui-pool', poolId],
    queryFn: () => fetchSuiPoolDetail(poolId),
    enabled: Boolean(poolId) && Boolean(configQ.data?.enabled),
  })

  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [amount, setAmount] = useState('0.1')
  const [slippageBps, setSlippageBps] = useState(300)
  const [memeCoinId, setMemeCoinId] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const cfg = configQ.data
  const network = cfg?.network ?? 'testnet'
  const pool = detailQ.data?.pool
  const trades = detailQ.data?.trades ?? []
  const recipients = detailQ.data?.recipients

  if (!cfg?.enabled) {
    return (
      <div className="app-shell page-sui">
        <p className="section-sub">Sui launchpad is not available.</p>
        <Link to="/sui">← Back</Link>
      </div>
    )
  }

  async function onTrade() {
    if (!account || !pool) return
    setStatus(null)
    try {
      const mist =
        side === 'buy' ? parseSuiInput(amount).toString() : BigInt(amount || '0').toString()
      const step = await fetchSuiTradeUnsigned({
        poolObjectId: pool.poolId,
        memeCoinType: pool.memeCoinType,
        trader: account.address,
        side,
        amount: mist,
        slippageBps,
        memeCoinObjectId: side === 'sell' ? memeCoinId : undefined,
      })
      const res = await signExec({ transaction: step.transactionBase64 })
      setStatus(`Submitted ${res.digest}`)
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e))
    }
  }

  const pct = pool ? Math.min(100, Math.round(pool.progressBps / 100)) : 0

  return (
    <div className="app-shell page-sui">
      <section className="section">
        <div className="launch-page-head-row">
          <Link className="launch-back" to="/sui">← Sui launchpad</Link>
          <SuiTestnetBadge network={network} />
        </div>
        <div className="sui-hero-badges">
          <SuiWalletButton />
        </div>

        {detailQ.isLoading ? <p className="section-sub">Loading pool…</p> : null}
        {pool ? (
          <>
            <h1 className="sui-hero-title">{poolDisplayName(pool)}</h1>
            <p className="section-sub">
              <span className={`sui-stage sui-stage-${pool.stage}`}>{stageLabel(pool.stage)}</span>
              {' · '}
              <a className="sui-link" href={suiscanObjectUrl(network, pool.poolId)} target="_blank" rel="noreferrer">
                Pool on Suiscan
              </a>
            </p>
            <div className="sui-detail-grid">
              <div className="sui-panel">
                <h2 className="sui-section-title">Curve</h2>
                <p>SUI in pool: <strong>{formatSui(pool.suiReserve)}</strong></p>
                <p>Target: {formatSui(pool.targetSui)} SUI</p>
                <div className="sui-progress" aria-hidden>
                  <div className="sui-progress-bar" style={{ width: `${pct}%` }} />
                </div>
                <p className="mono sui-small">{pool.memeCoinType}</p>
              </div>

              <div className="sui-panel">
                <h2 className="sui-section-title">Trade (testnet)</h2>
                {pool.graduated ? (
                  <p className="section-sub">This pool has graduated — bonding buys are closed.</p>
                ) : (
                  <>
                    <div className="sui-trade-tabs">
                      <button
                        type="button"
                        className={side === 'buy' ? 'is-active' : ''}
                        onClick={() => setSide('buy')}
                      >
                        Buy
                      </button>
                      <button
                        type="button"
                        className={side === 'sell' ? 'is-active' : ''}
                        onClick={() => setSide('sell')}
                      >
                        Sell
                      </button>
                    </div>
                    <label className="sui-field">
                      {side === 'buy' ? 'SUI amount' : 'Meme amount (base units)'}
                      <input value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </label>
                    {side === 'sell' ? (
                      <label className="sui-field">
                        Meme coin object id
                        <input value={memeCoinId} onChange={(e) => setMemeCoinId(e.target.value)} placeholder="0x…" />
                      </label>
                    ) : null}
                    <label className="sui-field">
                      Slippage (bps)
                      <input
                        type="number"
                        value={slippageBps}
                        onChange={(e) => setSlippageBps(Number(e.target.value))}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!account || isPending}
                      onClick={() => void onTrade()}
                    >
                      {account ? (isPending ? 'Signing…' : 'Sign & submit') : 'Connect wallet'}
                    </button>
                  </>
                )}
                {status ? <p className="sui-status mono">{status}</p> : null}
              </div>
            </div>

            {recipients ? (
              <div className="sui-panel">
                <h2 className="sui-section-title">On-chain fee split</h2>
                <ul className="sui-fee-list">
                  <li>Crew ({recipients.crew.length} wallets, weights {recipients.crewWeightBps.join(', ')}): 60% of trade fees</li>
                  <li>Agent: {shortAddress(recipients.agent)} — 15%</li>
                  <li>Treasury: {shortAddress(recipients.treasury)} — 25%</li>
                  {recipients.referrer ? <li>Referrer: {shortAddress(recipients.referrer)}</li> : null}
                </ul>
              </div>
            ) : null}

            <div className="sui-panel">
              <h2 className="sui-section-title">Recent trades</h2>
              {trades.length === 0 ? (
                <p className="section-sub">No indexed trades yet.</p>
              ) : (
                <ul className="sui-trades">
                  {trades.map((t, i) => (
                    <li key={`${t.txDigest ?? i}-${t.kind}`}>
                      <span>{t.kind === 'buy' ? 'Buy' : 'Sell'}</span>
                      <span>{formatSui(t.suiAmount)} SUI</span>
                      {t.txDigest ? (
                        <a href={suiscanTxUrl(network, t.txDigest)} target="_blank" rel="noreferrer">
                          tx
                        </a>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}
