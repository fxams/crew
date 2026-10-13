import { useEffect, useRef } from 'react'
import { SIWN_CALLBACK_NAME, SIWN_SCRIPT_SRC, type SiwnSuccess } from '../lib/neynar-siwn'

type Props = {
  clientId: string
  onSuccess: (data: SiwnSuccess) => void
}

/**
 * Official Neynar SIWN script button (https://neynarxyz.github.io/siwn).
 * Hidden by the parent when VITE_NEYNAR_CLIENT_ID is unset.
 */
export function NeynarSiwnButton({ clientId, onSuccess }: Props) {
  const onSuccessRef = useRef(onSuccess)
  useEffect(() => {
    onSuccessRef.current = onSuccess
  })

  useEffect(() => {
    const w = window as unknown as Record<string, unknown>
    w[SIWN_CALLBACK_NAME] = (raw: unknown) => {
      onSuccessRef.current(raw as SiwnSuccess)
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-crew-siwn]')
    existing?.remove()
    const script = document.createElement('script')
    script.src = SIWN_SCRIPT_SRC
    script.async = true
    script.dataset.crewSiwn = '1'
    document.body.appendChild(script)

    return () => {
      delete w[SIWN_CALLBACK_NAME]
    }
  }, [clientId])

  return (
    <div className="siwn-wrap">
      <div
        className="neynar_signin"
        data-client_id={clientId}
        data-success-callback={SIWN_CALLBACK_NAME}
        data-theme="dark"
      />
    </div>
  )
}
