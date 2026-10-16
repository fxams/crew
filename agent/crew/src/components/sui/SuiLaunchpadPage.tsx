import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CREW_VERSION } from '../../lib/config'
import {
  DISABLED_SUI_LAUNCHPAD_CONFIG,
  fetchSuiLaunchpadConfig,
  fetchSuiPools,
  suiscanObjectUrl,
  type SuiPoolSummary,
} from '../../lib/sui-api'
import { formatSui, poolDisplayName, stageLabel } from '../../lib/sui-format'
import { SuiWalletButton } from './SuiWalletButton'
import { SuiLaunchForm } from './SuiLaunchForm'
import { SuiPageShell } from './SuiPageShell'

function PoolCard({ pool, network }: { pool: SuiPoolSummary; network: string | null }) {
  const name = poolDisplayName(pool)
  const pct = Math.min(100, Math.round(pool.progressBps / 100))
  return (
    <Link className="sui-pool-card" to={`/sui/pool/${pool.poolId}`}>
      <div className="sui-pool-card-head">
        <strong>{name}</strong>
        <span className={`sui-stage sui-stage-${pool.stage}`}>{stageLabel(pool.stage)}</span>
      </div>
      <p className="sui-pool-meta mono">
        {formatSui(pool.suiReserve)} / {formatSui(pool.targetSui)} SUI
      </p>
      <div className="sui-progress" aria-label="Progress to graduation target">
        <div className="sui-progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="sui-pool-foot">
        {pool.migrated ? (
          <span>LP locked on Cetus</span>
        ) : pool.graduated ? (
          <span>Ready for migration</span>
        ) : (
          <span>Bonding curve live</span>
        )}
        <a
          className="sui-link"
          href={suiscanObjectUrl(network, pool.poolId)}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          Suiscan
        </a>
      </p>
    </Link>
  )
}

function PoolSection({
  title,
  pools,
  network,
}: {
  title: string
  pools: SuiPoolSummary[]
  network: string | null
}) {
  if (!pools.length) return null
  return (
    <section className="sui-pool-section">
      <h2 className="sui-section-title">{title}</h2>
      <div className="sui-pool-grid">{pools.map((p) => <PoolCard key={p.poolId} pool={p} network={network} />)}</div>
    </section>
  )
}

export function SuiLaunchpadPage() {
  const configQ = useQuery({
    queryKey: ['sui-config'],
    queryFn: fetchSuiLaunchpadConfig,
    retry: 1,
    staleTime: 30_000,
  })
  const cfg = configQ.data ?? DISABLED_SUI_LAUNCHPAD_CONFIG
  const network = cfg.network ?? 'testnet'

  const poolsQ = useQuery({
    queryKey: ['sui-pools'],
    queryFn: fetchSuiPools,
    enabled: cfg.enabled,
    retry: 1,
    staleTime: 30_000,
  })

  const grouped = useMemo(() => {
    const pools = poolsQ.data ?? []
    return {
      new: pools.filter((p) => p.stage === 'new'),
      near: pools.filter((p) => p.stage === 'near_graduation'),
      graduated: pools.filter((p) => p.stage === 'graduated'),
      migrated: pools.filter((p) => p.stage === 'migrated'),
    }
  }, [poolsQ.data])

  const loadingConfig = configQ.isPending && !configQ.data

  if (loadingConfig) {
    return (
      <SuiPageShell network="testnet">
        <p className="section-sub">Loading Sui launchpad…</p>
      </SuiPageShell>
    )
  }

  if (!cfg.enabled) {
    return (
      <SuiPageShell network={network}>
        <section className="section">
          <h1 className="sui-hero-title">Sui launchpad</h1>
          <p className="section-sub">
            Coming soon — CrewPay Sui testnet is not enabled on the API yet (check{' '}
            <code>api.crewpay.dev/api/sui/launchpad/config</code>).
          </p>
          <Link className="btn btn-secondary" to="/coins">← Coins</Link>
        </section>
      </SuiPageShell>
    )
  }

  return (
    <SuiPageShell network={network}>
      <section className="section section-sui-hero">
        <div className="launch-page-head-row">
          <Link className="launch-back" to="/coins">← Coins</Link>
          <p className="section-label">Sui launchpad · v{CREW_VERSION}</p>
        </div>
        <div className="sui-hero-badges">
          <SuiWalletButton />
        </div>
        <h1 className="sui-hero-title">Launch on Sui testnet</h1>
        <p className="section-sub sui-hero-copy">
          Agents open bonding-curve pools with a KOL crew paid on-chain. Trade fees follow the CrewPay map
          (60% crew / 15% launching agent / 25% platform treasury, enforced in the launchpad contract).
          When a pool graduates, reserves migrate to Cetus CLMM with LP locked — not held in a treasury wallet.
        </p>
      </section>

      {poolsQ.isError ? (
        <p className="section-sub sui-error">{(poolsQ.error as Error).message}</p>
      ) : null}

      <PoolSection title="New pools" pools={grouped.new} network={network} />
      <PoolSection title="Near graduation" pools={grouped.near} network={network} />
      <PoolSection title="Graduated" pools={grouped.graduated} network={network} />
      <PoolSection title="Migrated to Cetus" pools={grouped.migrated} network={network} />

      {poolsQ.isPending ? <p className="section-sub">Loading pools…</p> : null}

      {!poolsQ.isPending && !poolsQ.data?.length ? (
        <p className="section-sub">No pools indexed yet. Be the first to launch below.</p>
      ) : null}

      <SuiLaunchForm network={network} />
    </SuiPageShell>
  )
}
