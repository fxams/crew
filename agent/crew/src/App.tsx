import { useEffect, useState } from 'react'
import { Hero } from './components/Hero'
import { LaunchDesk } from './components/LaunchDesk'
import { Modes } from './components/Modes'
import { RemitTape } from './components/RemitTape'
import { appendSimulatedRemit, loadBoard, saveLaunch } from './lib/storage'
import type { Coin, Remit } from './lib/types'

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function App() {
  const [coins, setCoins] = useState<Coin[]>([])
  const [remits, setRemits] = useState<Remit[]>([])

  useEffect(() => {
    const board = loadBoard()
    setCoins(board.coins)
    setRemits(board.remits)
  }, [])

  // Soft live tape: occasional simulated remits from existing coins.
  useEffect(() => {
    if (!coins.length) return

    const timer = window.setInterval(() => {
      const coin = coins[Math.floor(Math.random() * coins.length)]
      const member = coin.crew[Math.floor(Math.random() * coin.crew.length)]
      const amountSol = Number((0.002 + Math.random() * 0.03).toFixed(4))
      const remit: Remit = {
        id: `live_${Date.now()}_${member.handle}`,
        coinId: coin.id,
        ticker: coin.ticker,
        handle: member.handle,
        amountSol,
        amountUsd: Number((amountSol * 148.2).toFixed(2)),
        mode: coin.mode,
        at: Date.now(),
      }
      appendSimulatedRemit(remit)
      setRemits((prev) => [remit, ...prev].slice(0, 120))
    }, 14000)

    return () => window.clearInterval(timer)
  }, [coins])

  function handleLaunched(coin: Coin, newRemits: Remit[]) {
    saveLaunch(coin, newRemits)
    setCoins((prev) => [coin, ...prev.filter((c) => c.id !== coin.id)])
    setRemits((prev) => [...newRemits, ...prev].slice(0, 120))
    window.setTimeout(() => scrollToId('tape'), 250)
  }

  return (
    <div className="page" id="top">
      <Hero onLaunch={() => scrollToId('desk')} onTape={() => scrollToId('tape')} />
      <main>
        <LaunchDesk onLaunched={handleLaunched} />
        <RemitTape coins={coins} remits={remits} />
        <Modes />
      </main>
      <footer className="footer">
        <p>
          CREW · Pump.fun desk for CT · demo mint locally · mainnet stub in{' '}
          <code>src/lib/launch.ts</code>
        </p>
      </footer>
    </div>
  )
}
