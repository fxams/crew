import { useState } from 'react'
import { Link } from 'react-router-dom'
import { KOL_PROGRAM_POINTS_DISCLAIMER, kolProgramCardUrl, type PublicKolCard } from '../lib/kol-program'
import { kolTierDisplayName, kolTierFrameClass } from '../lib/kol-tiers'
import { buildKolGrowthShareTweet } from '../lib/kol-share'
import { referralInvitePath } from '../lib/routes'

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
  const tierClass = kolTierFrameClass(card.tier)
  const pngUrl = kolProgramCardUrl(card.handle, 'png')
  const [imgSrc, setImgSrc] = useState(() => pngUrl)
  const claimTo = referralInvitePath(card.handle)

  const shareUrl = buildKolGrowthShareTweet({
    refLink: card.referralUrl,
    tagHandle: tagHandle || undefined,
    replyToPostId: replyUnderPinned && pinnedPostId ? pinnedPostId : undefined,
  })

  return (
    <section className="section kol-public-card" data-testid="kol-public-card">
      <p className="section-label">{card.unclaimed ? 'Unclaimed card' : 'CrewPay KOL card'}</p>
      <div className={`kol-hub-card-frame kol-hub-card-frame-hero ${tierClass}`}>
        <img
          className="kol-hub-card-img kol-hub-card-img-hero"
          src={imgSrc}
          alt={`KOL card @${card.handle}`}
          width={1200}
          height={630}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            const fallback = card.cardUrl?.includes('.png')
              ? card.cardUrl
              : kolProgramCardUrl(card.handle, 'png')
            if (imgSrc !== fallback) setImgSrc(fallback)
          }}
        />
      </div>
      <p className="kol-hub-card-meta kol-hub-card-meta-hero">
        <strong>@{card.handle}</strong>
        {card.rank ? ` · Rank #${card.rank}` : ''}
        {card.founderNumber ? ` · Founding #${String(card.founderNumber).padStart(3, '0')}` : ''}
        · {kolTierDisplayName(card.tier)} · Reach {card.reachScore}
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
        <a className="btn btn-primary btn-sm" href={shareUrl} target="_blank" rel="noreferrer">
          Share on X
        </a>
      </div>
      <p className="section-sub">{KOL_PROGRAM_POINTS_DISCLAIMER}</p>
    </section>
  )
}
