import { Link } from 'react-router-dom'
import { KOL_PROGRAM_POINTS_DISCLAIMER, type PublicKolCard } from '../lib/kol-program'
import { referralInvitePath } from '../lib/routes'
import { KolInfluenceCard } from './KolInfluenceCard'

type Props = {
  card: PublicKolCard
  pinnedPostId?: string | null
  tagHandle: string
  onTagHandleChange: (v: string) => void
  replyUnderPinned: boolean
  onReplyUnderPinnedChange: (v: boolean) => void
}

export function KolPublicCardView({
  card,
  pinnedPostId,
  tagHandle,
  onTagHandleChange,
  replyUnderPinned,
  onReplyUnderPinnedChange,
}: Props) {
  const claimTo = referralInvitePath(card.handle)

  return (
    <section className="section kol-public-card" data-testid="kol-public-card">
      <p className="section-label">{card.unclaimed ? 'Unclaimed card' : 'CrewPay KOL card'}</p>
      <KolInfluenceCard card={card} portrait />
      <p className="kol-hub-card-meta kol-hub-card-meta-hero">
        <strong>@{card.handle}</strong>
        {card.rank ? ` · Rank #${card.rank}` : ''}
        {card.founderNumber ? ` · Founding #${String(card.founderNumber).padStart(3, '0')}` : ''}
        · Reach {card.reachScore}
      </p>
      {card.unclaimed ? (
        <div className="register-actions kol-hub-cta kol-hub-cta-primary">
          <Link className="btn btn-primary btn-wide" to={claimTo} data-testid="claim-kol-card">
            Claim your card
          </Link>
        </div>
      ) : null}
      <div className="kol-share-row">
        <label className="kol-share-tag">
          Tag a friend
          <input
            type="text"
            placeholder="@handle"
            value={tagHandle}
            onChange={(e) => onTagHandleChange(e.target.value)}
            data-testid="kol-share-tag-input"
          />
        </label>
        {pinnedPostId ? (
          <label className="kol-share-reply">
            <input
              type="checkbox"
              checked={replyUnderPinned}
              onChange={(e) => onReplyUnderPinnedChange(e.target.checked)}
            />
            Reply under pinned @CrewPayHQ post
          </label>
        ) : null}
      </div>
      <p className="section-sub">{KOL_PROGRAM_POINTS_DISCLAIMER}</p>
    </section>
  )
}
