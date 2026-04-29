import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (next: string) => void;
}

// Small search input that sits above the chip-filter bar in TaskList.
// Live filter, no debounce — substring match across ~500 in-memory tasks
// is sub-millisecond, no need for it. `/` focuses from anywhere in the app
// as long as no other input/textarea/contenteditable is focused.
export function TaskSearchBar({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement;
      if (active) {
        const tag = active.tagName.toLowerCase();
        if (tag === 'input' || tag === 'textarea') return;
        if ((active as HTMLElement).isContentEditable) return;
      }
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="border-b border-border flex-shrink-0 px-3 py-1.5">
      <div className="relative flex items-center">
        <span className="absolute left-2 text-inkMuted text-xs pointer-events-none">⌕</span>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && value) {
              e.preventDefault();
              onChange('');
            }
          }}
          placeholder="Search tasks…  (press / to focus)"
          className="w-full bg-panel border border-border rounded pl-7 pr-7 py-1 text-xs"
        />
        {value && (
          <button
            onClick={() => onChange('')}
            title="Clear search (Esc)"
            className="absolute right-1 text-inkMuted hover:text-ink text-sm leading-none px-1"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
}
