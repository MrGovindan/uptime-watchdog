import { Cron } from 'effect'

type Bounds = Readonly<{ min: number; max: number }>

type Spread =
  | { readonly _tag: 'All' }
  | { readonly _tag: 'Every'; readonly step: number; readonly values: ReadonlyArray<number> }
  | { readonly _tag: 'Values'; readonly values: ReadonlyArray<number> }

const bounds = {
  seconds: { min: 0, max: 59 },
  minutes: { min: 0, max: 59 },
  hours: { min: 0, max: 23 },
  days: { min: 1, max: 31 },
  months: { min: 1, max: 12 },
  weekdays: { min: 0, max: 6 },
} satisfies Record<string, Bounds>

const monthNames = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

const pad = (value: number): string => value.toString().padStart(2, '0')

const nameAt = (names: ReadonlyArray<string>, index: number): string =>
  names[index] ?? index.toString()

const ordinal = (value: number): string => {
  const remainder = value % 100
  const suffix =
    remainder >= 11 && remainder <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][value % 10] ?? 'th')
  return `${value}${suffix}`
}

const join = (parts: ReadonlyArray<string>): string => {
  const first = parts[0]
  if (first === undefined) return ''
  if (parts.length === 1) return first
  const last = parts[parts.length - 1] ?? ''
  return `${parts.slice(0, -1).join(', ')} and ${last}`
}

const isUniformStep = (values: ReadonlyArray<number>, step: number): boolean => {
  for (let index = 1; index < values.length; index++) {
    const current = values[index]
    const previous = values[index - 1]
    if (current === undefined || previous === undefined || current - previous !== step) {
      return false
    }
  }
  return true
}

const spread = (values: ReadonlySet<number>, { min, max }: Bounds): Spread => {
  const sorted = [...values].sort((a, b) => a - b)
  if (sorted.length === 0 || sorted.length === max - min + 1) {
    return { _tag: 'All' }
  }

  const first = sorted[0]
  const second = sorted[1]
  const last = sorted[sorted.length - 1]
  if (first === min && second !== undefined && last !== undefined) {
    const step = second - first
    if (step >= 2 && last + step > max && isUniformStep(sorted, step)) {
      return { _tag: 'Every', step, values: sorted }
    }
  }

  return { _tag: 'Values', values: sorted }
}

type Span = Readonly<{ start: number; end: number }>

const toSpans = (values: ReadonlyArray<number>): ReadonlyArray<Span> => {
  const spans: Array<Span> = []
  for (const value of values) {
    const current = spans[spans.length - 1]
    if (current !== undefined && value === current.end + 1) {
      spans[spans.length - 1] = { start: current.start, end: value }
    } else {
      spans.push({ start: value, end: value })
    }
  }
  return spans
}

const describeSequence = (
  values: ReadonlyArray<number>,
  format: (value: number) => string,
): string =>
  join(
    toSpans(values).map(({ start, end }) =>
      start === end ? format(start) : `${format(start)} through ${format(end)}`,
    ),
  )

const formatTime = (hour: number, minute: number): string => `${pad(hour)}:${pad(minute)}`

const timesFrom = (
  hours: ReadonlyArray<number>,
  minutes: ReadonlyArray<number>,
): ReadonlyArray<string> =>
  hours.flatMap((hour) => minutes.map((minute) => formatTime(hour, minute)))

const describeHours = (hours: Spread): string => {
  if (hours._tag === 'All') return 'every hour'
  if (hours._tag === 'Every') return `every ${hours.step} hours`
  const first = hours.values[0]
  return hours.values.length === 1 && first !== undefined
    ? `hour ${pad(first)}`
    : `hours ${describeSequence(hours.values, pad)}`
}

const describeSeconds = (seconds: Spread, minutes: Spread, hours: Spread): string | undefined => {
  if (minutes._tag !== 'All' || hours._tag !== 'All') return undefined
  if (seconds._tag === 'All') return 'Every second'
  if (seconds._tag === 'Every') return `Every ${seconds.step} seconds`
  return undefined
}

const describeTime = (cron: Cron.Cron): string | undefined => {
  const seconds = spread(cron.seconds, bounds.seconds)
  const minutes = spread(cron.minutes, bounds.minutes)
  const hours = spread(cron.hours, bounds.hours)

  const secondsTrivial =
    seconds._tag === 'Values' && seconds.values.length === 1 && seconds.values[0] === 0

  if (!secondsTrivial) {
    return describeSeconds(seconds, minutes, hours)
  }

  const singleMinute =
    minutes._tag === 'Values' && minutes.values.length === 1 ? minutes.values[0] : undefined

  if (minutes._tag === 'All') {
    return hours._tag === 'All' ? 'Every minute' : `Every minute during ${describeHours(hours)}`
  }

  if (minutes._tag === 'Every') {
    return hours._tag === 'All'
      ? `Every ${minutes.step} minutes`
      : `Every ${minutes.step} minutes during ${describeHours(hours)}`
  }

  if (hours._tag === 'All') {
    if (singleMinute === 0) return 'Every hour'
    return singleMinute !== undefined
      ? `Every hour at minute ${pad(singleMinute)}`
      : `Every hour at minutes ${describeSequence(minutes.values, pad)}`
  }

  if (hours._tag === 'Every') {
    if (singleMinute === 0) return `Every ${hours.step} hours`
    return singleMinute !== undefined
      ? `Every ${hours.step} hours at minute ${pad(singleMinute)}`
      : `Every ${hours.step} hours at minutes ${describeSequence(minutes.values, pad)}`
  }

  return `At ${join(timesFrom(hours.values, minutes.values))}`
}

const describeWeekday = (weekdays: Spread): string | undefined => {
  if (weekdays._tag === 'All') return undefined

  const indexes = new Set(weekdays.values)
  if (indexes.size === 5 && [1, 2, 3, 4, 5].every((day) => indexes.has(day))) {
    return 'on weekdays'
  }
  if (indexes.size === 2 && [0, 6].every((day) => indexes.has(day))) {
    return 'on weekends'
  }
  if (weekdays._tag === 'Every') {
    return `every ${weekdays.step} days of the week`
  }

  return `on ${describeSequence(weekdays.values, (day) => nameAt(weekdayNames, day))}`
}

const describeMonths = (months: Spread): string => {
  if (months._tag === 'All') return ''
  if (months._tag === 'Every') return `every ${months.step} months`
  return describeSequence(months.values, (month) => nameAt(monthNames, month - 1))
}

const describeDate = (days: Spread, months: Spread): string => {
  const monthText = months._tag === 'All' ? undefined : describeMonths(months)

  if (days._tag === 'All') {
    return monthText === undefined ? '' : `in ${monthText}`
  }

  if (days._tag === 'Every') {
    const daysText = `every ${days.step} days of the month`
    return monthText === undefined ? daysText : `${daysText} in ${monthText}`
  }

  const daysText = `the ${describeSequence(days.values, ordinal)} of the month`
  return monthText === undefined
    ? `on ${daysText}`
    : `on the ${describeSequence(days.values, ordinal)} of ${monthText}`
}

export const describeCron = (cron: Cron.Cron): string => {
  const time = describeTime(cron)
  if (time === undefined) return Cron.format(cron)

  const parts = [
    time,
    describeWeekday(spread(cron.weekdays, bounds.weekdays)),
    describeDate(spread(cron.days, bounds.days), spread(cron.months, bounds.months)),
  ].filter((part) => part !== undefined && part !== '')

  return parts.join(' ')
}
