import { CREW_TELEGRAM_COMMUNITY_URL, CREW_TELEGRAM_URL } from '../lib/config'
import { TelegramIcon } from './SocialIcons'

/** Compact channel + community links for register / tasks pages. */
export function JoinTelegramBox() {
  return (
    <aside className="join-telegram-box" data-testid="join-telegram-box">
      <div className="join-telegram-icon" aria-hidden>
        <TelegramIcon />
      </div>
      <div className="join-telegram-copy">
        <p className="join-telegram-title">Join our Telegram</p>
        <p className="join-telegram-lead">Announcements and community chat for KOLs and agents.</p>
        <p className="join-telegram-links">
          <a href={CREW_TELEGRAM_URL} target="_blank" rel="noopener noreferrer">
            Channel @CrewPayHQ
          </a>
          <span aria-hidden> · </span>
          <a href={CREW_TELEGRAM_COMMUNITY_URL} target="_blank" rel="noopener noreferrer">
            Group @crewpay_hq
          </a>
        </p>
      </div>
    </aside>
  )
}
