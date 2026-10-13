import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  authenticateWallet,
  hydrateWalletAuth,
  logoutWalletAuth,
  readWalletAuth,
  type WalletAuthRecord,
} from '../lib/wallet-auth'

type WalletAuthState = {
  ready: boolean
  record: WalletAuthRecord | null
  authenticatedWallet: string | null
  authenticate: (opts: {
    wallet: string
    signMessage: (message: Uint8Array) => Promise<Uint8Array>
  }) => Promise<WalletAuthRecord>
  logout: () => Promise<void>
  isAuthenticated: (address: string | null | undefined) => boolean
}

const WalletAuthContext = createContext<WalletAuthState | null>(null)

export function useWalletAuth(): WalletAuthState {
  const ctx = useContext(WalletAuthContext)
  if (!ctx) {
    throw new Error('useWalletAuth must be used inside WalletAuthProvider')
  }
  return ctx
}

export function WalletAuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [record, setRecord] = useState<WalletAuthRecord | null>(() => readWalletAuth())

  useEffect(() => {
    let cancelled = false
    void hydrateWalletAuth()
      .then((next) => {
        if (!cancelled) setRecord(next)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const authenticate = useCallback(
    async (opts: {
      wallet: string
      signMessage: (message: Uint8Array) => Promise<Uint8Array>
    }) => {
      const next = await authenticateWallet(opts)
      setRecord(next)
      return next
    },
    [],
  )

  const logout = useCallback(async () => {
    setRecord(null)
    await logoutWalletAuth()
  }, [])

  const isAuthenticated = useCallback(
    (address: string | null | undefined) => {
      const want = (address || '').trim()
      if (!want || !record) return false
      if (record.expiresAt <= Date.now()) return false
      return record.wallet === want
    },
    [record],
  )

  const value = useMemo<WalletAuthState>(
    () => ({
      ready,
      record,
      authenticatedWallet: record && record.expiresAt > Date.now() ? record.wallet : null,
      authenticate,
      logout,
      isAuthenticated,
    }),
    [authenticate, isAuthenticated, logout, ready, record],
  )

  return <WalletAuthContext.Provider value={value}>{children}</WalletAuthContext.Provider>
}
