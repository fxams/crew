export function kolProgramEnabled(): boolean {
  const v = (process.env.KOL_PROGRAM_ENABLED || '').trim().toLowerCase()
  return v === '1' || v === 'true'
}

export const KOL_PROGRAM_FOUNDER_CAP = Number(process.env.KOL_PROGRAM_FOUNDER_CAP || 100)

export const CREWPAY_HQ_X_HANDLE = (
  process.env.CREWPAY_HQ_X_HANDLE || 'CrewPayHQ'
).replace(/^@+/, '')
