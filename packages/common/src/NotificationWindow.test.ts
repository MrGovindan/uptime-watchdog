import { describe, expect, it } from '@effect/vitest'
import { DateTime, Schema } from 'effect'
import { isWithinWindow, NotificationWindow, type Weekday } from './NotificationWindow'

const window = (input: {
  readonly timezone?: string
  readonly days: ReadonlyArray<Weekday>
  readonly startTime: string
  readonly endTime: string
}) =>
  Schema.decodeUnknownSync(NotificationWindow)({
    timezone: input.timezone ?? 'UTC',
    days: input.days,
    startTime: input.startTime,
    endTime: input.endTime,
  })

const at = (iso: string) => DateTime.makeUnsafe(iso)

const weekdays: ReadonlyArray<Weekday> = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']

describe('isWithinWindow', () => {
  it('is open between the start (inclusive) and end (exclusive) on a listed day', () => {
    const businessHours = window({ days: weekdays, startTime: '07:00', endTime: '17:00' })

    expect(isWithinWindow(businessHours, at('2026-01-05T06:59:00Z'))).toBe(false)
    expect(isWithinWindow(businessHours, at('2026-01-05T07:00:00Z'))).toBe(true)
    expect(isWithinWindow(businessHours, at('2026-01-05T16:59:00Z'))).toBe(true)
    expect(isWithinWindow(businessHours, at('2026-01-05T17:00:00Z'))).toBe(false)
  })

  it('is closed on days that are not listed', () => {
    const businessHours = window({ days: weekdays, startTime: '07:00', endTime: '17:00' })

    expect(isWithinWindow(businessHours, at('2026-01-03T12:00:00Z'))).toBe(false)
    expect(isWithinWindow(businessHours, at('2026-01-04T12:00:00Z'))).toBe(false)
  })

  it('treats an overnight window as belonging to the day it starts on', () => {
    const onCall = window({ days: ['Saturday'], startTime: '22:00', endTime: '06:00' })

    expect(isWithinWindow(onCall, at('2026-01-03T21:59:00Z'))).toBe(false)
    expect(isWithinWindow(onCall, at('2026-01-03T22:00:00Z'))).toBe(true)
    expect(isWithinWindow(onCall, at('2026-01-03T23:30:00Z'))).toBe(true)
    expect(isWithinWindow(onCall, at('2026-01-04T05:59:00Z'))).toBe(true)
    expect(isWithinWindow(onCall, at('2026-01-04T06:00:00Z'))).toBe(false)
  })

  it('does not carry an overnight window into a day that is not listed', () => {
    const onCall = window({ days: ['Saturday'], startTime: '22:00', endTime: '06:00' })

    expect(isWithinWindow(onCall, at('2026-01-05T02:00:00Z'))).toBe(false)
    expect(isWithinWindow(onCall, at('2026-01-04T22:00:00Z'))).toBe(false)
  })

  it('evaluates the window in its own time zone', () => {
    const newYork = window({
      timezone: 'America/New_York',
      days: ['Monday'],
      startTime: '09:00',
      endTime: '17:00',
    })

    expect(isWithinWindow(newYork, at('2026-01-05T13:59:00Z'))).toBe(false)
    expect(isWithinWindow(newYork, at('2026-01-05T14:00:00Z'))).toBe(true)
    expect(isWithinWindow(newYork, at('2026-01-05T21:59:00Z'))).toBe(true)
    expect(isWithinWindow(newYork, at('2026-01-05T22:00:00Z'))).toBe(false)
  })
})
