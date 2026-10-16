import { useState } from 'react'
import { useCurrentAccount, useSignAndExecuteTransaction } from '@mysten/dapp-kit'
import { CREW_AGENT_API_URL } from '../../lib/config'

type LaunchPlan = {
  steps: Array<{ transactionBase64: string; note?: string }>
}

export function SuiLaunchForm({ network }: { network: string | null }) {
  const account = useCurrentAccount()
  const { mutateAsync: signExec, isPending } = useSignAndExecuteTransaction()
  const [name, setName] = useState('')
  const [ticker, setTicker] = useState('')
  const [treasuryCap, setTreasuryCap] = useState('')
  const [publishedPkg, setPublishedPkg] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function onLaunch() {
    if (!account) return
    setMsg(null)
    const res = await fetch(`${CREW_AGENT_API_URL}/api/sui/launchpad/launch/unsigned`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        ticker,
        launcherPubkey: account.address,
        treasuryCapObjectId: treasuryCap || undefined,
        publishedPackageId: publishedPkg || undefined,
      }),
    })
    const plan = (await res.json()) as LaunchPlan & { error?: string }
    if (!res.ok) throw new Error(plan.error || 'Launch build failed')
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i]!
      const out = await signExec({ transaction: step.transactionBase64 })
      setMsg(`Step ${i + 1}/${plan.steps.length}: ${out.digest}`)
      if (i === 0 && !treasuryCap) {
        setMsg(
          `${msg ?? ''} Copy TreasuryCap + package id from publish effects, then run step 2.`,
        )
        break
      }
    }
  }

  return (
    <section className="section sui-launch-form">
      <h2 className="sui-section-title">Launch a coin ({network ?? 'testnet'})</h2>
      <p className="section-sub">
        Two-step unsigned flow: publish meme package, then open pool. Step 2 needs TreasuryCap id from step 1 effects.
      </p>
      <div className="sui-form-grid">
        <label className="sui-field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="sui-field">
          Ticker
          <input value={ticker} onChange={(e) => setTicker(e.target.value)} />
        </label>
        <label className="sui-field">
          TreasuryCap object (step 2)
          <input value={treasuryCap} onChange={(e) => setTreasuryCap(e.target.value)} placeholder="0x…" />
        </label>
        <label className="sui-field">
          Published package id (step 2)
          <input value={publishedPkg} onChange={(e) => setPublishedPkg(e.target.value)} placeholder="0x…" />
        </label>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        disabled={!account || isPending || !name || !ticker}
        onClick={() => void onLaunch().catch((e) => setMsg(String(e)))}
      >
        {account ? 'Build & sign launch txs' : 'Connect wallet to launch'}
      </button>
      {msg ? <p className="sui-status mono">{msg}</p> : null}
    </section>
  )
}
