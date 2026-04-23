import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  left: ReactNode;
  middle: ReactNode;
  right: ReactNode;
  leftPct: number;
  midPct: number;
  onChange: (leftPct: number, midPct: number) => void;
  minPct?: number;
}

const DEFAULT_MIN = 15;

// Three-pane horizontal layout with two drag handles. Widths are in % so the
// layout stays sensible across window resizes. Parent persists leftPct/midPct.
export function ResizableColumns({
  left,
  middle,
  right,
  leftPct,
  midPct,
  onChange,
  minPct = DEFAULT_MIN,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<0 | 1 | null>(null);

  const leftWidthRef = useRef(leftPct);
  const midWidthRef = useRef(midPct);
  useEffect(() => {
    leftWidthRef.current = leftPct;
  }, [leftPct]);
  useEffect(() => {
    midWidthRef.current = midPct;
  }, [midPct]);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (dragging === null) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;

      if (dragging === 0) {
        // Drag of the left/middle divider. leftPct = pct, constrained.
        const maxLeft = 100 - midWidthRef.current - minPct;
        const newLeft = Math.max(minPct, Math.min(maxLeft, pct));
        onChange(newLeft, midWidthRef.current);
      } else {
        // Drag of the middle/right divider. midPct = pct - leftPct, constrained.
        const proposedMid = pct - leftWidthRef.current;
        const maxMid = 100 - leftWidthRef.current - minPct;
        const newMid = Math.max(minPct, Math.min(maxMid, proposedMid));
        onChange(leftWidthRef.current, newMid);
      }
    },
    [dragging, minPct, onChange]
  );

  const stopDrag = useCallback(() => setDragging(null), []);

  useEffect(() => {
    if (dragging === null) return;
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', stopDrag);
    // Prevent text-selection weirdness while dragging.
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = 'none';
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', stopDrag);
      document.body.style.userSelect = prevUserSelect;
    };
  }, [dragging, onMouseMove, stopDrag]);

  const rightPct = Math.max(minPct, 100 - leftPct - midPct);

  return (
    <div ref={containerRef} className="flex-1 min-h-0 flex">
      <div style={{ width: `${leftPct}%` }} className="min-h-0 overflow-hidden">
        {left}
      </div>
      <Handle onMouseDown={() => setDragging(0)} active={dragging === 0} />
      <div style={{ width: `${midPct}%` }} className="min-h-0 overflow-hidden">
        {middle}
      </div>
      <Handle onMouseDown={() => setDragging(1)} active={dragging === 1} />
      <div style={{ width: `${rightPct}%` }} className="min-h-0 overflow-hidden">
        {right}
      </div>
    </div>
  );
}

function Handle({
  onMouseDown,
  active,
}: {
  onMouseDown: () => void;
  active: boolean;
}) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={`w-1 cursor-col-resize shrink-0 transition-colors ${
        active ? 'bg-accent' : 'bg-border hover:bg-accent/60'
      }`}
    />
  );
}
