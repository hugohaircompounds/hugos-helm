import { useEffect, useRef, useState } from 'react';
import type { ThemeId, ThemeInfo } from '../../shared/types';
import { THEMES } from '../../shared/types';

interface Props {
  themeId: ThemeId;
  onChange: (next: ThemeId) => void;
}

const GROUP_LABEL: Record<ThemeInfo['group'], string> = {
  subtle: 'Subtle',
  'sci-fi': 'Sci-Fi',
  game: 'Game-inspired',
};

export function ThemePicker({ themeId, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = THEMES.find((t) => t.id === themeId) || THEMES[0];

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [open]);

  const grouped = new Map<ThemeInfo['group'], ThemeInfo[]>();
  for (const t of THEMES) {
    const arr = grouped.get(t.group) || [];
    arr.push(t);
    grouped.set(t.group, arr);
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-1 rounded border border-border text-xs text-inkMuted hover:text-ink hover:bg-panelHi transition-colors"
        title="Change theme"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a9 9 0 0 0 0 18c1.657 0 3-1.343 3-3 0-.878.356-1.672.93-2.247A3.182 3.182 0 0 1 18 15h2a2 2 0 0 0 2-2 10 10 0 0 0-10-10z" />
          <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
          <circle cx="12" cy="7.5" r="1" fill="currentColor" />
          <circle cx="16.5" cy="10.5" r="1" fill="currentColor" />
        </svg>
        <span>{current.label}</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 z-50 bg-panel border border-border rounded shadow-2xl overflow-hidden">
          {Array.from(grouped.entries()).map(([group, items]) => (
            <div key={group}>
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-inkMuted bg-panelHi border-b border-border">
                {GROUP_LABEL[group]}
              </div>
              <ul>
                {items.map((t) => {
                  const active = t.id === themeId;
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => {
                          onChange(t.id);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-panelHi transition-colors ${
                          active ? 'bg-panelHi' : ''
                        }`}
                      >
                        <ThemeSwatch id={t.id} />
                        <div className="flex-1 min-w-0">
                          <div
                            className={`text-sm ${active ? 'text-accent font-medium' : 'text-ink'}`}
                          >
                            {t.label}
                          </div>
                          <div className="text-[11px] text-inkMuted truncate">{t.blurb}</div>
                        </div>
                        {active && <span className="text-accent text-xs">●</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 4-stop color preview. Signature palette for each theme id (dark mode).
 * Hardcoded so the swatch looks correct no matter which theme is applied.
 */
const SWATCHES: Record<ThemeId, [string, string, string, string]> = {
  default: ['#0f1115', '#161a21', '#7aa2ff', '#4ade80'],
  'tactical-hud': ['#0a0e14', '#0f141c', '#00e0ff', '#ff9e00'],
  ethereal: ['#0a0f1c', '#7aa2ff', '#c4a7ff', '#5fe3d1'],
  neon: ['#08060d', '#ff00aa', '#00e5ff', '#fff33a'],
  cyberpunk: ['#0d0d0d', '#fcee0a', '#ff003c', '#00f0ff'],
  terraria: ['#5cabff', '#8b5a2b', '#f0dcb3', '#ffdc00'],
  factorio: ['#1a1a1a', '#2a2a2a', '#ff9d3f', '#6ec848'],
  ror2: ['#0a1628', '#0f1f33', '#5cccff', '#ffd000'],
};

function ThemeSwatch({ id }: { id: ThemeId }) {
  const [a, b, c, d] = SWATCHES[id];
  return (
    <div className="flex h-6 w-10 rounded-sm overflow-hidden shrink-0 border border-border">
      <div className="flex-1" style={{ background: a }} />
      <div className="flex-1" style={{ background: b }} />
      <div className="flex-1" style={{ background: c }} />
      <div className="flex-1" style={{ background: d }} />
    </div>
  );
}
