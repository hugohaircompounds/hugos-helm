// Deterministic per-task color for timeline segments.
//
// Each task id hashes to a hue in [0, 360). Saturation and lightness come
// from CSS custom properties (`--entry-sat`, `--entry-light`) defined per
// theme in index.css, so the palette stays visually consistent with the
// active theme while giving each task a unique hue.

function hashString(s: string): number {
  let h = 2166136261 >>> 0; // FNV-1a 32-bit
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}

export function hueForTaskId(taskId: string): number {
  return hashString(taskId) % 360;
}

export interface EntryColor {
  /** Full background color, e.g. `hsl(217 72% 58%)`. */
  bg: string;
  /** Slightly dimmer variant for borders. */
  border: string;
  /** CSS-ready `hsl(...)` for use inside linear-gradient() etc. */
  hsl: string;
}

export function colorForTaskId(taskId: string | null): EntryColor {
  if (!taskId) {
    // Untracked — neutral tint via theme var.
    return {
      bg: 'rgb(var(--ink-muted) / 0.4)',
      border: 'rgb(var(--ink-muted) / 0.6)',
      hsl: 'rgb(var(--ink-muted) / 0.4)',
    };
  }
  const hue = hueForTaskId(taskId);
  const base = `hsl(${hue} var(--entry-sat) var(--entry-light))`;
  const border = `hsl(${hue} var(--entry-sat) calc(var(--entry-light) - 10%))`;
  return { bg: base, border, hsl: base };
}
