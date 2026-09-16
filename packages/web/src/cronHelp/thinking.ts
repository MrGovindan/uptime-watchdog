const THINKING_VERBS = [
  'Pondering',
  'Analyzing',
  'Mulling',
  'Interpreting',
  'Ruminating',
  'Deciphering',
  'Contemplating',
  'Translating',
  'Percolating',
  'Reasoning',
  'Deliberating',
  'Unraveling',
  'Considering',
  'Composing',
  'Daydreaming',
  'Synthesizing',
  'Brewing',
  'Weighing',
  'Imagining',
  'Crystallizing',
] as const

export const randomThinkingVerb = (): string =>
  THINKING_VERBS[Math.floor(Math.random() * THINKING_VERBS.length)] ?? 'Pondering'
