/**
 * PROTOTYPE — LAY-191. Throwaway. The copy and stub data the three Connect Claude variants share.
 *
 * Every example question names the registered MCP Tool that answers it, so none points at a tool
 * still in progress (LAY-186, LAY-187, LAY-190).
 */

export const VARIANT_KEYS = ['A', 'B', 'C'] as const
export type VariantKey = (typeof VARIANT_KEYS)[number]

export const VARIANT_NAMES: Record<VariantKey, string> = {
  A: 'Inline section, client tabs',
  B: 'Integrations rows, each opens a sheet',
  C: 'Questions first, steps folded',
}

export const EXAMPLE_QUESTIONS: { question: string; tool: string }[] = [
  { question: 'What’s the wind doing at the race circle right now?', tool: 'current_conditions' },
  { question: 'Has CHII2 been building or easing over the last six hours?', tool: 'buoy_history' },
  { question: 'How did we sail in our last race?', tool: 'race_summary' },
  { question: 'Where are we slowest against the polar this season?', tool: 'polar_performance' },
  { question: 'What was the rig set to for the Fall Closer?', tool: 'boat_setup' },
]

/** LAY-192's list, stubbed so the layout leaves room for it. Nothing here is real. */
export const STUB_GRANTS: { client: string; grantedAt: string }[] = [
  { client: 'Claude', grantedAt: '2026-10-17T21:04:00Z' },
]

export const PRIVACY_LINE =
  'Read-only. Claude sees what your account sees on Layline, and nothing else.'

export const MOBILE_NOTE =
  'Add it once on a computer at claude.ai. It then shows up in the Claude app on your phone.'

export function claudeCodeCommand(url: string): string {
  return `claude mcp add --transport http layline ${url}`
}
