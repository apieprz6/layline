'use client'

/**
 * PROTOTYPE — LAY-191. Throwaway. Only the pieces every variant needs identically: the URL (from
 * the page's own origin, as `requestOrigin` + `MCP_PATH` would give it) and a copy action. Layout
 * stays in each variant.
 */

import { useState, useSyncExternalStore } from 'react'
import { MCP_PATH } from '@/lib/mcp/resource'

const noSubscribe = () => () => undefined

export function useMcpUrl(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => `${window.location.origin}${MCP_PATH}`,
    () => `https://…${MCP_PATH}`
  )
}

export function useCopy(): { copied: string | null; copy: (key: string, text: string) => void } {
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (key: string, text: string) => {
    void navigator.clipboard?.writeText(text).catch(() => undefined)
    setCopied(key)
    window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 1600)
  }
  return { copied, copy }
}

export const sectionHeading: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-base)',
  fontWeight: 'var(--weight-semibold)',
  color: 'var(--text-secondary)',
  margin: '0 0 12px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}

export const body: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-secondary)',
  lineHeight: 1.45,
  margin: 0,
}

export const mono: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--text-sm)',
  color: 'var(--text-primary)',
  overflowWrap: 'anywhere',
}

export function formatGranted(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Stand-in for the auth sheet (ADR 0004); the prototype doesn't open the real one. */
export function stubSignIn(): void {
  window.alert('PROTOTYPE: this would open the sign-in sheet.')
}
