import type { KolHubRecentJoiner, KolLeaderboardRow, KolProgramHub } from './kol-program'

const LOW_MEMBER_THRESHOLD = 10

export function hubMemberLine(hub: KolProgramHub | null): { primary: string; secondary: string } {
  if (!hub) return { primary: '', secondary: '' }
  const show = hub.showMemberCount ?? hub.memberCount >= LOW_MEMBER_THRESHOLD
  if (!show) {
    return { primary: 'Be one of the first', secondary: 'this season' }
  }
  return {
    primary: hub.memberCount.toLocaleString(),
    secondary: 'members',
  }
}

export function hubCountdownParts(
  iso: string | null | undefined,
  endedLabel: string,
): { value: string; label: string } | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return { value: endedLabel, label: endedLabel }
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  return { value: `${d}d ${h}h`, label: endedLabel }
}

export function hubStatTiles(hub: KolProgramHub | null): Array<{ value: string; label: string }> {
  if (!hub) return []
  const members = hubMemberLine(hub)
  const season = hubCountdownParts(hub.seasonEndsAt, 'Season ending soon')
  const founding = hubCountdownParts(hub.foundingSnapshotAt ?? null, 'Founding snapshot')
  return [
    { value: members.primary, label: members.secondary || 'this season' },
    {
      value: season && season.value !== 'Season ending soon' ? season.value : 'Soon',
      label: 'Season ending soon',
    },
    {
      value: founding && founding.value !== 'Founding snapshot' ? founding.value : 'TBA',
      label: 'Founding snapshot',
    },
  ]
}

export function hubRecentJoiners(joiners: KolHubRecentJoiner[] | undefined): KolHubRecentJoiner[] {
  if (!joiners?.length) return []
  return joiners.filter((j) => j.handle && j.handle.trim().length > 0)
}

export type PodiumSlot = {
  place: 1 | 2 | 3
  row: KolLeaderboardRow | null
}

/** Visual podium order: #2, #1, #3. Empty slots stay placeholders — never invent people. */
export function podiumSlots(rows: KolLeaderboardRow[] | null | undefined): PodiumSlot[] {
  const list = rows ?? []
  const byRank = (n: number) => list.find((r) => r.rank === n) ?? list[n - 1] ?? null
  return [
    { place: 2, row: byRank(2) },
    { place: 1, row: byRank(1) },
    { place: 3, row: byRank(3) },
  ]
}

export function founderLabel(n: number | null | undefined): string | null {
  if (n == null || n < 1) return null
  return `#${String(n).padStart(3, '0')}`
}
