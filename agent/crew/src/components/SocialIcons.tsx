import {
  CREW_FARCASTER_URL,
  CREW_TELEGRAM_COMMUNITY_URL,
  CREW_TELEGRAM_URL,
  CREW_X_URL,
} from '../lib/config'

/** Official X mark — same box as the Farcaster arch. */
export function XIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.725-8.835L1.254 2.25H8.08l4.713 5.615L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"
      />
    </svg>
  )
}

/** Official Farcaster Arch (CC0 brand mark). */
export function FarcasterArchIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 1000 1000" aria-hidden>
      <path
        fill="currentColor"
        d="M257.778 155.556H742.222V844.445H671.111V528.889H670.414C662.554 441.677 589.258 373.333 500 373.333C410.742 373.333 337.446 441.677 329.586 528.889H328.889V844.445H257.778V155.556Z"
      />
    </svg>
  )
}

/** Telegram paper plane — same box as X / Farcaster. */
export function TelegramIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M21.8 3.2 2.9 10.5c-1.3.5-1.3 1.2-.2 1.5l4.8 1.5 1.9 5.8c.2.7.8.9 1.3.5l2.7-2.2 4.9 3.6c.9.5 1.5.2 1.8-.8l3.3-16.1c.3-1.2-.4-1.7-1.6-1.3zM9.4 13.6l8.4-5.2c.4-.2.8 0 .5.3l-6.8 6.2-.3 3.3-1.8-4.6z"
      />
    </svg>
  )
}

/** Header socials: X, Farcaster, Telegram — new-tab icon links. */
export function NavSocialLinks() {
  return (
    <span className="nav-socials">
      <a
        className="nav-icon-link nav-link-x"
        href={CREW_X_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="X @CrewPayHQ"
      >
        <XIcon />
      </a>
      <a
        className="nav-icon-link nav-link-fc"
        href={CREW_FARCASTER_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Farcaster @crewpay"
      >
        <FarcasterArchIcon />
      </a>
      <a
        className="nav-icon-link nav-link-tg"
        href={CREW_TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Telegram @CrewPayHQ"
      >
        <TelegramIcon />
      </a>
    </span>
  )
}

/** Footer handles: @CrewPayHQ · @crewpay · Telegram · Community. */
export function FooterSocials() {
  return (
    <>
      <a href={CREW_X_URL} target="_blank" rel="noreferrer">
        @CrewPayHQ
      </a>
      {' · '}
      <a href={CREW_FARCASTER_URL} target="_blank" rel="noreferrer" aria-label="Farcaster @crewpay">
        @crewpay
      </a>
      {' · '}
      <a href={CREW_TELEGRAM_URL} target="_blank" rel="noreferrer" aria-label="Telegram @CrewPayHQ">
        Telegram
      </a>
      {' · '}
      <a
        href={CREW_TELEGRAM_COMMUNITY_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Telegram Community"
      >
        Community
      </a>
    </>
  )
}
