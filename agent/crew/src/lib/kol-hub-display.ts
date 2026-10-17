import type { KolHubRecentJoiner, KolProgramHub } from './kol-program'

const LOW_MEMBER_THRESHOLD = 10

export function hubMemberLine(hub: KolProgramHub | null): { primary: string; secondary: string } {
  if (!hub) return { primary: '', secondary: '' }
  const show = hub.showMemberCount ?? hub.memberCount >= LOW_MEMBER_THRESHOLD
  if (!show) {
    return { primary: 'Be one of the first', secondary: '' }
  }
  return {
    primary: hub.memberCount.toLocaleString(),
    secondary: 'members',
  }
}

export function hubRecentJoiners(joiners: KolHubRecentJoiner[] | undefined): KolHubRecentJoiner[] {
  if (!joiners?.length) return []
  return joiners.filter((j) => j.handle && j.handle.trim().length > 0)
}
