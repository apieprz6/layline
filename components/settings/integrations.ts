/**
 * The copy of Settings' Integrations section: the apps a crew member can connect to the **MCP
 * Server**, and what to ask once one is.
 */

export type IntegrationKey = 'claude' | 'chatgpt' | 'other'

export interface Integration {
  key: IntegrationKey
  title: string
  subtitle: string
  /** The icon tile's glyph. */
  glyph: string
  /** Who opens Layline's sign-in, on the last step. */
  opener: string
}

export const INTEGRATIONS: Integration[] = [
  { key: 'claude', title: 'Connect Claude', subtitle: 'Web, desktop and phone', glyph: '✳', opener: 'Claude' },
  {
    key: 'chatgpt',
    title: 'Connect ChatGPT',
    subtitle: 'Plus, Pro or Business, on the web',
    glyph: '◎',
    opener: 'ChatGPT',
  },
  {
    key: 'other',
    title: 'Using another app?',
    subtitle: 'Claude Code, Cursor, VS Code…',
    glyph: '⋯',
    opener: 'Your app',
  },
]

export const CLAUDE_CONNECTORS_URL = 'https://claude.ai/settings/connectors'

export const CHATGPT_URL = 'https://chatgpt.com'

/**
 * Each names the tool that answers it, and only a tool registered today, so the sheet never
 * promises what the MCP Server cannot yet do (LAY-186, LAY-187 and LAY-190 add more).
 */
export const EXAMPLE_QUESTIONS: { question: string; tool: string }[] = [
  { question: 'What’s the wind doing at the race circle right now?', tool: 'current_conditions' },
  { question: 'Has CHII2 been building or easing over the last six hours?', tool: 'buoy_history' },
  { question: 'How did we sail in our last race?', tool: 'race_summary' },
]

export function claudeCodeCommand(url: string): string {
  return `claude mcp add --transport http layline ${url}`
}
