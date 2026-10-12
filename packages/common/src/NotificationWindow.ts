import { DateTime, Option, Schema } from 'effect'

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export const Weekday = Schema.Literals(WEEKDAY_NAMES)
export type Weekday = typeof Weekday.Type

export const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const TimeOfDay = Schema.String.pipe(Schema.check(Schema.isPattern(TIME_OF_DAY_PATTERN)))
export type TimeOfDay = typeof TimeOfDay.Type

export const Timezone = Schema.String.pipe(
  Schema.check(
    Schema.makeFilter((value) =>
      Option.isSome(DateTime.zoneFromString(value)) ? undefined : `"${value}" is not a valid IANA time zone`,
    ),
  ),
)
export type Timezone = typeof Timezone.Type

const timesDiffer = Schema.makeFilter(
  (window: { readonly startTime: string; readonly endTime: string }) =>
    window.startTime !== window.endTime || 'start and end time must differ',
)

export const NotificationWindow = Schema.Struct({
  timezone: Timezone,
  days: Schema.NonEmptyArray(Weekday),
  startTime: TimeOfDay,
  endTime: TimeOfDay,
}).check(timesDiffer)
export type NotificationWindow = typeof NotificationWindow.Type

export const NotificationWindowDefinition = Schema.Struct({
  timezone: Schema.optional(Timezone),
  days: Schema.NonEmptyArray(Weekday),
  startTime: TimeOfDay,
  endTime: TimeOfDay,
}).check(timesDiffer)
export type NotificationWindowDefinition = typeof NotificationWindowDefinition.Type

export const NOTIFICATION_WINDOW_DEFAULT_TIMEZONE = 'UTC'

export const resolveNotificationWindow = (
  definition: NotificationWindowDefinition,
  defaultTimezone: string,
): NotificationWindow => ({
  timezone: definition.timezone ?? defaultTimezone,
  days: definition.days,
  startTime: definition.startTime,
  endTime: definition.endTime,
})

export const minutesOfDay = (time: TimeOfDay): number => {
  const [hours, minutes] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

const weekdayName = (index: number): Weekday => {
  const name = WEEKDAY_NAMES[index]
  if (name === undefined) {
    throw new Error(`invalid weekday index ${index}`)
  }
  return name
}

export const isWithinWindow = (window: NotificationWindow, at: DateTime.DateTime): boolean => {
  const parts = DateTime.toParts(DateTime.setZoneNamedUnsafe(at, window.timezone))
  const now = parts.hour * 60 + parts.minute
  const start = minutesOfDay(window.startTime)
  const end = minutesOfDay(window.endTime)
  const today = weekdayName(parts.weekDay)
  const yesterday = weekdayName((parts.weekDay + 6) % 7)

  if (start < end) {
    return window.days.includes(today) && now >= start && now < end
  }

  return (window.days.includes(today) && now >= start) || (window.days.includes(yesterday) && now < end)
}
