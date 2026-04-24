import { useState } from 'react';
import type { TaskFiltersState } from '../../shared/types';

interface Props {
  filters: TaskFiltersState;
  onChange: (next: TaskFiltersState) => void;
  availableStatuses: string[];
  availableListNames: string[];
}

const PRIORITY_CHIPS: { value: number; label: string; key: string }[] = [
  { value: 1, label: 'Urgent', key: 'urgent' },
  { value: 2, label: 'High', key: 'high' },
  { value: 3, label: 'Normal', key: 'normal' },
  { value: 4, label: 'Low', key: 'low' },
];

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function activeCount(f: TaskFiltersState): number {
  return (
    f.statuses.length +
    f.listNames.length +
    f.priorities.length +
    (f.dueFrom !== null ? 1 : 0) +
    (f.dueTo !== null ? 1 : 0)
  );
}

function toDateInput(ts: number | null): string {
  if (ts === null) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromDateInput(s: string): number | null {
  if (!s) return null;
  return new Date(s).getTime();
}

export function TaskFilterBar({
  filters,
  onChange,
  availableStatuses,
  availableListNames,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const count = activeCount(filters);
  const hasAny = count > 0;

  return (
    <div className="border-b border-border flex-shrink-0">
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs">
        <button
          onClick={() => setExpanded((e) => !e)}
          className={`px-2 py-1 rounded border ${
            hasAny
              ? 'border-accent/50 text-accent bg-accent/5'
              : 'border-border text-inkMuted hover:text-ink'
          }`}
        >
          {expanded ? '▾' : '▸'} Filters
          {hasAny && ` · ${count}`}
        </button>
        {hasAny && !expanded && (
          <button
            onClick={() =>
              onChange({
                statuses: [],
                listNames: [],
                priorities: [],
                dueFrom: null,
                dueTo: null,
              })
            }
            className="text-inkMuted hover:text-danger"
          >
            Clear
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-3 text-xs">
          <FilterGroup label="Status">
            {availableStatuses.length === 0 ? (
              <span className="text-inkMuted/60">No statuses yet</span>
            ) : (
              availableStatuses.map((s) => (
                <Chip
                  key={s}
                  active={filters.statuses.includes(s)}
                  onClick={() =>
                    onChange({ ...filters, statuses: toggle(filters.statuses, s) })
                  }
                >
                  {s}
                </Chip>
              ))
            )}
          </FilterGroup>

          <FilterGroup label="Work category">
            {availableListNames.length === 0 ? (
              <span className="text-inkMuted/60">No lists yet</span>
            ) : (
              availableListNames.map((n) => (
                <Chip
                  key={n}
                  active={filters.listNames.includes(n)}
                  onClick={() =>
                    onChange({ ...filters, listNames: toggle(filters.listNames, n) })
                  }
                >
                  {n}
                </Chip>
              ))
            )}
          </FilterGroup>

          <FilterGroup label="Priority">
            {PRIORITY_CHIPS.map((p) => (
              <Chip
                key={p.value}
                active={filters.priorities.includes(p.value)}
                dataPriority={p.key}
                onClick={() =>
                  onChange({ ...filters, priorities: toggle(filters.priorities, p.value) })
                }
              >
                {p.label}
              </Chip>
            ))}
          </FilterGroup>

          <FilterGroup label="Due date">
            <label className="flex items-center gap-1">
              from
              <input
                type="date"
                value={toDateInput(filters.dueFrom)}
                onChange={(e) =>
                  onChange({ ...filters, dueFrom: fromDateInput(e.target.value) })
                }
                className="bg-panel border border-border rounded px-1.5 py-0.5"
              />
            </label>
            <label className="flex items-center gap-1">
              to
              <input
                type="date"
                value={toDateInput(filters.dueTo)}
                onChange={(e) =>
                  onChange({ ...filters, dueTo: fromDateInput(e.target.value) })
                }
                className="bg-panel border border-border rounded px-1.5 py-0.5"
              />
            </label>
            {(filters.dueFrom !== null || filters.dueTo !== null) && (
              <button
                onClick={() => onChange({ ...filters, dueFrom: null, dueTo: null })}
                className="text-inkMuted hover:text-danger"
              >
                clear
              </button>
            )}
          </FilterGroup>

          {hasAny && (
            <div>
              <button
                onClick={() =>
                  onChange({
                    statuses: [],
                    listNames: [],
                    priorities: [],
                    dueFrom: null,
                    dueTo: null,
                  })
                }
                className="text-inkMuted hover:text-danger"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-inkMuted/80 w-24 flex-shrink-0">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
  dataPriority,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  dataPriority?: string;
}) {
  return (
    <button
      onClick={onClick}
      data-slot="task-pill"
      data-priority={active ? dataPriority : undefined}
      data-active={active ? 'true' : undefined}
      className={`cursor-pointer ${
        active ? '' : 'opacity-60 hover:opacity-100'
      }`}
      style={{
        textTransform: 'none',
        letterSpacing: 0,
        fontSize: 11,
      }}
    >
      {children}
    </button>
  );
}
