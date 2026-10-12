import { Timezone } from '@uptime-watchdog/common'
import { Option, Schema } from 'effect'

export type TimezoneOption = Readonly<{ zone: string; label: string }>

export type TimezoneOptionsInput = Readonly<{
  currentTimezone: string
  selectedTimezone: string
}>

const isValidTimezone = (zone: string): boolean => Option.isSome(Schema.decodeUnknownOption(Timezone)(zone))

const supportedTimezones = (): ReadonlyArray<string> => {
  try {
    return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  } catch {
    return []
  }
}

const zoneLabel = (zone: string): string => {
  try {
    const format = new Intl.DateTimeFormat(undefined, { timeZone: zone, timeZoneName: 'shortOffset' })
    const offset = format.formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value

    return offset === undefined ? zone : `${zone} (${offset})`
  } catch {
    return zone
  }
}

export const buildTimezoneOptions = ({
  currentTimezone,
  selectedTimezone,
}: TimezoneOptionsInput): ReadonlyArray<TimezoneOption> => {
  const zones: Array<string> = []
  const seen = new Set<string>()

  const current = currentTimezone.trim()

  if (current !== '' && isValidTimezone(current)) {
    zones.push(current)
    seen.add(current)
  }

  const supported = [...new Set(supportedTimezones())].sort()

  for (const zone of supported) {
    if (!seen.has(zone)) {
      zones.push(zone)
      seen.add(zone)
    }
  }

  const selected = selectedTimezone.trim()

  if (selected !== '' && !seen.has(selected)) {
    zones.push(selected)
  }

  return zones.map((zone) => ({ zone, label: zoneLabel(zone) }))
}
