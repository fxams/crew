import { Link } from 'react-router-dom'
import {
  KOL_PROGRAM_REFERRAL_MILESTONES,
  KOL_PROGRAM_REFERRAL_POINTS_REFERRED,
  KOL_PROGRAM_REFERRAL_POINTS_REFERRER,
  KOL_SEASON_TIER_POINTS,
  nextSeasonTierKey,
} from '../lib/kol-referral-rewards'
import { kolTierDisplayName } from '../lib/kol-tiers'
import type { KolProgramHub, KolProgramProfile, KolProgramTask } from '../lib/kol-program'
import { kolProgramCardUrl } from '../lib/kol-program'
import { buildKolGrowthShareTweet } from '../lib/kol-share'
import { XLink } from './XLink'

type Props = {
  profile: KolProgramProfile
  hub: KolProgramHub | null
  tasks: KolProgramTask[]
  taskBusy: string | null
  taskError: string | null
  onVerify: (taskId: string) => void
  shareTag: string
  replyPinned: boolean
  pinnedPostId: string | null
}

export function KolHubDashboard({
  profile,
  hub,
  tasks,
  taskBusy,
  taskError,
  onVerify,
  shareTag,
  replyPinned,
  pinnedPostId,
}: Props) {
  const milestones = hub?.referralMilestones?.length
    ? hub.referralMilestones
    : [...KOL_PROGRAM_REFERRAL_MILESTONES]
  const refCount = profile.referralCount ?? 0
  const nextMilestone = milestones.find((m) => refCount < m.referrals)
  const nextTier = nextSeasonTierKey(profile.tier)
  const nextFloor = nextTier ? KOL_SEASON_TIER_POINTS[nextTier] ?? 0 : null
  const ptsToGo =
    nextFloor != null ? Math.max(0, nextFloor - profile.seasonPoints) : 0
  const tierProgress =
    nextFloor != null && nextFloor > 0
      ? Math.min(100, Math.round((profile.seasonPoints / nextFloor) * 100))
      : 100

  const refProgress = nextMilestone
    ? Math.min(100, Math.round((refCount / nextMilestone.referrals) * 100))
    : 100
  const moreForBonus = nextMilestone ? nextMilestone.referrals - refCount : 0

  const shareUrl = buildKolGrowthShareTweet({
    refLink: profile.referralUrl,
    tagHandle: shareTag || undefined,
    replyToPostId: replyPinned && pinnedPostId ? pinnedPostId : undefined,
  })

  const png = kolProgramCardUrl(profile.handle, 'png')
  const foundingEligible = profile.founderNumber != null && profile.founderNumber > 0

  async function copyRef() {
    try {
      await navigator.clipboard.writeText(profile.referralUrl)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="kol-influence-dashboard" data-testid="kol-hub-dashboard">
      <section className="kol-inf-panel kol-inf-share">
        <h2>Share</h2>
        <div className="kol-inf-ref-row">
          <input className="input" readOnly value={profile.referralUrl} aria-label="Referral link" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copyRef()}>
            Copy
          </button>
        </div>
        <div className="kol-inf-share-actions">
          <XLink className="btn btn-primary kol-inf-share-x" href={shareUrl} data-testid="kol-hub-share-x">
            Share on X
          </XLink>
          <a className="btn btn-ghost" href={png} download={`crewpay-kol-${profile.handle}.png`}>
            Download
          </a>
        </div>
        <p className="kol-inf-ref-copy">
          +{KOL_PROGRAM_REFERRAL_POINTS_REFERRER} pts per referral, +{KOL_PROGRAM_REFERRAL_POINTS_REFERRED} for them.
        </p>
      </section>

      <section className="kol-inf-panel kol-inf-milestones">
        <h2>Milestones</h2>
        <div className="kol-inf-mile-row">
          <span>Referrals <strong>{refCount}</strong></span>
          {nextMilestone ? (
            <span className="kol-inf-mile-next">
              {moreForBonus} more for +{nextMilestone.bonusPoints.toLocaleString()}
            </span>
          ) : (
            <span className="kol-inf-mile-next">All referral bonuses unlocked</span>
          )}
        </div>
        <div className="kol-inf-tick-bar" aria-hidden>
          <div className="kol-inf-tick-fill" style={{ width: `${refProgress}%` }} />
          {milestones.map((m) => (
            <span
              key={m.referrals}
              className="kol-inf-tick"
              style={{ left: `${(m.referrals / 100) * 100}%` }}
              title={`${m.referrals} referrals`}
            >
              {m.referrals}
            </span>
          ))}
        </div>
        <ul className="kol-inf-bonus-labels">
          {milestones.map((m) => (
            <li key={m.referrals}>+{m.bonusPoints.toLocaleString()}</li>
          ))}
        </ul>
        {nextTier ? (
          <>
            <div className="kol-inf-mile-row kol-inf-tier-row">
              <span>Next tier {kolTierDisplayName(nextTier)}</span>
              <span>{ptsToGo.toLocaleString()} pts to go</span>
            </div>
            <div className="kol-inf-tier-bar" aria-hidden>
              <div style={{ width: `${tierProgress}%` }} />
            </div>
            <p className="kol-inf-tier-labels">
              {kolTierDisplayName(profile.tier)} {profile.seasonPoints.toLocaleString()} ·{' '}
              {kolTierDisplayName(nextTier)} {nextFloor?.toLocaleString()}
            </p>
          </>
        ) : null}
      </section>

      <section className="kol-inf-panel kol-inf-founding">
        <h2>Founding KOL pass</h2>
        {foundingEligible ? (
          <>
            <p className="kol-inf-founding-status">Eligible</p>
            <p className="muted">Founding #{String(profile.founderNumber).padStart(3, '0')}</p>
          </>
        ) : (
          <>
            <p className="kol-inf-founding-status dim">Not eligible yet</p>
            <p className="muted">Join before the founding snapshot locks.</p>
          </>
        )}
        <Link className="btn btn-ghost btn-sm" to="/kol/founders">Founding list</Link>
      </section>

      <section className="kol-inf-panel kol-inf-tasks">
        <h2>Today&apos;s tasks</h2>
        <ul className="kol-inf-task-list">
          {tasks.length === 0 ? (
            <li className="muted">No tasks configured today.</li>
          ) : (
            tasks.map((t, idx) => {
              const locked = Boolean((t as KolProgramTask & { locked?: boolean }).locked)
              return (
                <li key={t.id} className={t.completed ? 'is-done' : locked ? 'is-locked' : ''}>
                  <div className="kol-inf-task-head">
                    <strong>{t.title}</strong>
                    <span className="kol-inf-pts">+{t.points}</span>
                  </div>
                  {locked && idx > 0 ? (
                    <p className="kol-inf-unlock">Unlocks after the task above — verify that one first.</p>
                  ) : (
                    <p className="hint">{t.instructions}</p>
                  )}
                  {!t.completed && !locked ? (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={taskBusy === t.id}
                      onClick={() => onVerify(t.id)}
                    >
                      {taskBusy === t.id ? 'Checking…' : 'Verify'}
                    </button>
                  ) : null}
                  {t.completed ? <p className="register-ok">Done today</p> : null}
                </li>
              )
            })
          )}
        </ul>
        {taskError ? <p className="register-err">{taskError}</p> : null}
      </section>
    </div>
  )
}
