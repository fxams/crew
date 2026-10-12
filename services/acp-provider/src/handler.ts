import { OFFERING_AUTOHIRE, priceForOffering, type AcpConfig } from './config.js'
import { fulfillJob, type Fulfillment } from './fulfill.js'
import { logError, logInfo } from './log.js'
import { parseOfferingId, validateRequirement, type OfferingId } from './offerings.js'

export type JobRoomEntry =
  | { kind: 'system'; event: { type: string } }
  | { kind: 'message'; contentType?: string; content: string; from?: string }

export type JobSession = {
  jobId?: string | number
  chainId: number
  status: string
  job?: {
    description?: string
    clientAddress?: string
    client?: string
    payer?: string
    payerAddress?: string
    buyer?: string
  }
  entries?: JobRoomEntry[]
  setBudget: (token: unknown) => Promise<unknown>
  submit: (deliverable: string) => Promise<unknown>
  sendMessage: (content: string, contentType?: string) => Promise<unknown>
}

export type AssetTokenFactory = {
  usdc: (amount: number, chainId: number) => unknown
}

export type PendingJob = {
  offering: OfferingId
  requirement: unknown
}

function jobKey(session: JobSession): string {
  return `${session.chainId}:${session.jobId ?? 'unknown'}`
}

export function payingAgentWallet(session: JobSession, entry?: JobRoomEntry): string | undefined {
  const job = session.job
  const candidates = [
    job?.clientAddress,
    job?.client,
    job?.payerAddress,
    job?.payer,
    job?.buyer,
    entry && entry.kind === 'message' ? entry.from : undefined,
  ]
  for (const c of candidates) {
    const v = String(c || '').trim()
    if (v) return v
  }
  return undefined
}

export function offeringFromSession(session: JobSession, requirement?: Record<string, unknown>): OfferingId | null {
  return (
    parseOfferingId(session.job?.description) ||
    parseOfferingId(requirement?.offering) ||
    parseOfferingId(requirement?.offeringName)
  )
}

export function parseRequirementContent(content: unknown): unknown {
  if (content && typeof content === 'object') return content
  const text = String(content || '').trim()
  if (!text) throw new Error('empty requirement')
  return JSON.parse(text)
}

function findRequirementEntry(session: JobSession): JobRoomEntry | undefined {
  const entries = session.entries || []
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.kind === 'message' && e.contentType === 'requirement') return e
  }
  return undefined
}

export function createEntryHandler(opts: {
  config: AcpConfig
  fulfillment: Fulfillment
  assetToken: AssetTokenFactory
  pending?: Map<string, PendingJob>
}) {
  const pending = opts.pending ?? new Map<string, PendingJob>()

  return async function onEntry(session: JobSession, entry: JobRoomEntry): Promise<void> {
    if (entry.kind === 'message' && entry.contentType === 'requirement' && session.status === 'open') {
      let raw: unknown
      try {
        raw = parseRequirementContent(entry.content)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'invalid JSON'
        await session.sendMessage(`Requirement is not valid JSON: ${msg}`)
        return
      }
      const offering = offeringFromSession(session, raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined)
      if (!offering) {
        await session.sendMessage(
          `Unknown offering. Use ${OFFERING_AUTOHIRE} or crewpay_launch_with_crew.`,
        )
        return
      }
      const parsed = validateRequirement(offering, raw)
      if (!parsed.ok) {
        await session.sendMessage(parsed.error)
        return
      }
      pending.set(jobKey(session), { offering, requirement: parsed.value })
      const price = priceForOffering(opts.config, offering)
      await session.setBudget(opts.assetToken.usdc(price, session.chainId))
      logInfo(`setBudget ${offering} job=${session.jobId} usd=${price}`)
      return
    }

    if (entry.kind === 'system' && entry.event.type === 'job.funded') {
      let stored = pending.get(jobKey(session))
      if (!stored) {
        const reqEntry = findRequirementEntry(session)
        if (reqEntry && reqEntry.kind === 'message') {
          try {
            const raw = parseRequirementContent(reqEntry.content)
            const offering = offeringFromSession(
              session,
              raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : undefined,
            )
            if (offering) {
              const parsed = validateRequirement(offering, raw)
              if (parsed.ok) stored = { offering, requirement: parsed.value }
            }
          } catch {
            /* fall through */
          }
        }
      }
      if (!stored) {
        await session.sendMessage('No validated requirement on this job — cannot fulfill.')
        return
      }
      const payerWallet = payingAgentWallet(session, findRequirementEntry(session))
      try {
        const result = await fulfillJob(opts.fulfillment, stored.offering, stored.requirement as never, {
          payerWallet,
          offering: stored.offering,
        })
        const deliverable = typeof result === 'string' ? result : JSON.stringify(result)
        await session.submit(deliverable)
        logInfo(`submitted ${stored.offering} job=${session.jobId}`)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'fulfillment failed'
        logError(`fulfill failed job=${session.jobId}`, err)
        await session.sendMessage(`CrewPay could not fulfill this job: ${msg}`)
      }
    }
  }
}
