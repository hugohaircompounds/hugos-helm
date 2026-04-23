import { useCallback, useEffect, useRef, useState } from 'react';
import type { LayoutState } from '../../shared/types';

const DEFAULT: LayoutState = { leftPct: 40, midPct: 40 };
const SAVE_DEBOUNCE_MS = 400;

export function useLayout() {
  const [layout, setLayout] = useState<LayoutState>(DEFAULT);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.helm
      .getSettings()
      .then((s) => setLayout(s.layout || DEFAULT))
      .catch(() => {
        /* keep defaults */
      });
  }, []);

  const update = useCallback((leftPct: number, midPct: number) => {
    setLayout({ leftPct, midPct });
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      window.helm
        .saveSettings({ layout: { leftPct, midPct } })
        .catch(() => {
          /* non-fatal */
        });
    }, SAVE_DEBOUNCE_MS);
  }, []);

  return { layout, update };
}
