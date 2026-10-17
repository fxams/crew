import {
  CREW_FARCASTER_URL,
  CREW_GITHUB_URL,
  CREW_TELEGRAM_COMMUNITY_URL,
  CREW_TELEGRAM_URL,
  CREW_X_URL,
} from '../lib/config'
import { XLink } from './XLink'

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

/** Official GitHub mark — same box as X / Telegram. */
export function GitHubIcon() {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="currentColor"
        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 10.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
      />
    </svg>
  )
}

/** Header socials: X (in-app on mobile), Farcaster, Telegram, GitHub. */
export function NavSocialLinks() {
  return (
    <span className="nav-socials">
      <XLink
        className="nav-icon-link nav-link-x"
        href={CREW_X_URL}
        aria-label="X @CrewPayHQ"
      >
        <XIcon />
      </XLink>
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
      <a
        className="nav-icon-link nav-link-gh"
        href={CREW_GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="GitHub fxams/crew"
        data-testid="nav-link-github"
      >
        <GitHubIcon />
      </a>
    </span>
  )
}

/** Footer handles: @CrewPayHQ · @crewpay · Telegram · Community · GitHub. */
export function FooterSocials() {
  return (
    <>
      <XLink href={CREW_X_URL}>
        @CrewPayHQ
      </XLink>
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
      {' · '}
      <a
        href={CREW_GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="GitHub fxams/crew"
        data-testid="footer-link-github"
      >
        GitHub
      </a>
    </>
  )
}
