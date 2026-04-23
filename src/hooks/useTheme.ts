import { useCallback, useEffect, useState } from 'react';
import { THEMES } from '../../shared/types';
import type { ThemeId, ThemeLexicon, ThemeMode } from '../../shared/types';

function apply(id: ThemeId, mode: ThemeMode): void {
  const root = document.documentElement;
  root.dataset.theme = id;
  root.dataset.mode = mode;
}

export function useTheme() {
  const [themeId, setThemeIdState] = useState<ThemeId>('default');
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    window.helm
      .getSettings()
      .then((s) => {
        const id = s.themeId || 'default';
        const mode = s.themeMode || 'dark';
        setThemeIdState(id);
        setThemeModeState(mode);
        apply(id, mode);
      })
      .catch(() => apply('default', 'dark'));
  }, []);

  const setThemeId = useCallback((next: ThemeId) => {
    setThemeIdState(next);
    setThemeModeState((mode) => {
      apply(next, mode);
      window.helm.saveSettings({ themeId: next }).catch(() => {});
      return mode;
    });
  }, []);

  const setThemeMode = useCallback((next: ThemeMode) => {
    setThemeModeState(next);
    setThemeIdState((id) => {
      apply(id, next);
      window.helm.saveSettings({ themeMode: next }).catch(() => {});
      return id;
    });
  }, []);

  const toggleMode = useCallback(() => {
    setThemeModeState((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark';
      setThemeIdState((id) => {
        apply(id, next);
        return id;
      });
      window.helm.saveSettings({ themeMode: next }).catch(() => {});
      return next;
    });
  }, []);

  const lexicon: ThemeLexicon =
    THEMES.find((t) => t.id === themeId)?.lexicon || THEMES[0].lexicon;

  return { themeId, themeMode, lexicon, setThemeId, setThemeMode, toggleMode };
}
