import type { ReactElement } from 'react'

interface LogoMarkProps {
  size?: number
}

/**
 * The layline mark: two laylines and the boat between them.
 *
 * Inline rather than an `<img>` of an SVG file, because an image can't read a token and so the
 * mark stayed cyan on navy after dark (LAY-194). `--logo-mark` and `--logo-ground` hold its
 * daylight colours and turn to the theme's accent on its own ground in night vision.
 */
export default function LogoMark({ size = 24 }: LogoMarkProps): ReactElement {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      role="img"
      aria-label="L"
      data-testid="logo-mark"
      style={{ flexShrink: 0 }}
    >
      <rect width="32" height="32" rx="6" style={{ fill: 'var(--logo-ground)' }} />
      <line
        x1="6"
        y1="26"
        x2="20"
        y2="6"
        strokeWidth="2.25"
        strokeLinecap="round"
        style={{ stroke: 'var(--logo-mark)' }}
      />
      <line
        x1="11"
        y1="26"
        x2="25"
        y2="6"
        strokeWidth="1.75"
        strokeLinecap="round"
        opacity="0.4"
        style={{ stroke: 'var(--logo-mark)' }}
      />
      <circle cx="13" cy="16" r="2" style={{ fill: 'var(--logo-mark)' }} />
    </svg>
  )
}
