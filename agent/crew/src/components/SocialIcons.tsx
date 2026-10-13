import { CREW_FARCASTER_URL, CREW_X_URL } from '../lib/config'

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

/** Header socials: X then Farcaster, both new-tab icon links. */
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
    </span>
  )
}

/** Footer handles: @CrewPayHQ then @crewpay. */
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
    </>
  )
}
