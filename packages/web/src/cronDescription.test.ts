import { Cron } from 'effect'
import { describe, expect, test } from 'vitest'

import { describeCron } from './cronDescription'

const describeExpression = (expression: string): string =>
  describeCron(Cron.parseUnsafe(expression))

describe('describeCron', () => {
  test.each([
    ['* * * * *', 'Every minute'],
    ['*/5 * * * *', 'Every 5 minutes'],
    ['*/15 * * * *', 'Every 15 minutes'],
    ['0 * * * *', 'Every hour'],
    ['30 * * * *', 'Every hour at minute 30'],
    ['*/5 9-17 * * *', 'Every 5 minutes during hours 09 through 17'],
    ['0 */2 * * *', 'Every 2 hours'],
    ['0 0 * * *', 'At 00:00'],
    ['30 4 * * *', 'At 04:30'],
    ['0 9,17 * * *', 'At 09:00 and 17:00'],
    ['0 9 * * 1-5', 'At 09:00 on weekdays'],
    ['0 9 * * 0', 'At 09:00 on Sunday'],
    ['0 9 * * 6,0', 'At 09:00 on weekends'],
    ['0 9 * * 1,3,5', 'At 09:00 on Monday, Wednesday and Friday'],
    ['0 0 1 * *', 'At 00:00 on the 1st of the month'],
    ['0 0 1,15 * *', 'At 00:00 on the 1st and 15th of the month'],
    ['0 0 * 1 *', 'At 00:00 in January'],
    ['0 0 1 1 *', 'At 00:00 on the 1st of January'],
    ['*/30 * * * * *', 'Every 30 seconds'],
    ['* * * * * *', 'Every second'],
  ])('describes %s as %s', (expression, expected) => {
    expect(describeExpression(expression)).toBe(expected)
  })
})
