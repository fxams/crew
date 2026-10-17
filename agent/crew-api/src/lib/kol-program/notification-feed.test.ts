import { describe, expect, it } from 'vitest'
import {
  handlesFromNotificationText,
  pointsFromNotificationText,
  presentNotificationFeed,
  relativeTimeLabel,
} from './notification-feed.js'
import type { KolNotification } from './notifications.js'

function n(partial: Partial<KolNotification> & Pick<KolNotification, 'id' | 'kind' | 'title'>): KolNotification {
  return {
    body: '',
    href: '/kol',
    createdAt: '2026-10-17T08:00:00.000Z',
    readAt: null,
    ...partial,
  }
}

describe('notification feed presentation', () => {
  it('formats relative time', () => {
    const now = Date.parse('2026-10-17T17:00:00.000Z')
    expect(relativeTimeLabel('2026-10-17T08:00:00.000Z', now)).toBe('9h')
    expect(relativeTimeLabel('2026-10-16T17:00:00.000Z', now)).toBe('1d')
    expect(relativeTimeLabel('2026-10-17T16:45:00.000Z', now)).toBe('15m')
  })

  it('parses handles and lime points', () => {
    expect(handlesFromNotificationText('@mubaraqabba registered with your ref link.')).toEqual(['mubaraqabba'])
    expect(pointsFromNotificationText('Task verified: +1,000 pts')).toBe(1000)
  })

  it('groups consecutive referral joins like influence', () => {
    const items = [
      n({ id: '1', kind: 'referral_join', title: 'Joined via your link', body: '@henry registered with your ref link.' }),
      n({ id: '2', kind: 'referral_join', title: 'Joined via your link', body: '@ada registered with your ref link.' }),
      n({
        id: '3',
        kind: 'task_verified',
        title: 'Task verified: +500 pts',
        body: 'today:repost',
        createdAt: '2026-10-17T06:00:00.000Z',
      }),
    ]
    const feed = presentNotificationFeed(items, { henry: 'https://img/h.jpg' }, Date.parse('2026-10-17T17:00:00.000Z'))
    expect(feed[0].icon).toBe('person')
    expect(feed[0].title).toBe('henry and 1 other joined via your link')
    expect(feed[0].avatars[0]).toEqual({ handle: 'henry', url: 'https://img/h.jpg' })
    expect(feed[0].timeAgo).toBe('9h')
    expect(feed[1].icon).toBe('check')
    expect(feed[1].points).toBe(500)
    expect(feed[1].tab).toBe('points')
    expect(feed[1].timeAgo).toBe('11h')
  })
})
