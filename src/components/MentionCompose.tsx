import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import type { CommentSegment, WorkspaceMember } from '../../shared/types';
import { useWorkspaceMembers } from '../hooks/useWorkspaceMembers';

interface Props {
  // Surfaces below the textarea wired by the parent. The component owns
  // its own internal text, mentions, and notifyAll state.
  onSubmit: (segments: CommentSegment[], notifyAll: boolean) => Promise<void>;
  onCancel?: () => void;
  placeholder?: string;
  // Distinct copy for the submit button so the same component can be
  // labeled "Post" for new threads and "Reply" for thread replies.
  submitLabel?: string;
  // Distinct copy for the new-thread vs reply context — surfaced as a small
  // header above the textarea so the user knows which post path they're on.
  contextLabel?: string;
  autoFocus?: boolean;
}

const TRIGGER_BOUNDARY_RE = /[\s.,;:!?(){}\[\]<>"'`]/;
const MAX_DROPDOWN_RESULTS = 8;

// Convert raw textarea text + a list of selected mentions into a
// CommentSegment[] suitable for ClickUp's structured `comment` array.
// Walks the text left-to-right. At each `@` that's preceded by start of
// text or punctuation, greedily matches the longest username from the
// mentions list (longer usernames first so "Hugo F." beats "Hugo").
// Matches become mention segments; everything else collects into text.
export function textToSegments(
  text: string,
  mentions: WorkspaceMember[]
): CommentSegment[] {
  if (!mentions.length) {
    return text ? [{ kind: 'text', value: text }] : [];
  }
  const sorted = [...mentions].sort(
    (a, b) => b.username.length - a.username.length
  );

  const out: CommentSegment[] = [];
  let buffer = '';
  let cursor = 0;

  const flushBuffer = () => {
    if (buffer) {
      out.push({ kind: 'text', value: buffer });
      buffer = '';
    }
  };

  while (cursor < text.length) {
    const ch = text[cursor];
    if (ch === '@') {
      const prev = cursor === 0 ? '' : text[cursor - 1];
      const atBoundary = !prev || TRIGGER_BOUNDARY_RE.test(prev);
      if (atBoundary) {
        const remaining = text.slice(cursor + 1);
        const match = sorted.find((m) => remaining.startsWith(m.username));
        if (match) {
          flushBuffer();
          out.push({
            kind: 'mention',
            userId: match.id,
            display: match.username,
          });
          cursor += 1 + match.username.length;
          continue;
        }
      }
    }
    buffer += ch;
    cursor++;
  }
  flushBuffer();
  return out;
}

export function MentionCompose({
  onSubmit,
  onCancel,
  placeholder,
  submitLabel = 'Post',
  contextLabel,
  autoFocus,
}: Props) {
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<WorkspaceMember[]>([]);
  const [notifyAll, setNotifyAll] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [dropdownQuery, setDropdownQuery] = useState('');
  const [dropdownIndex, setDropdownIndex] = useState(0);

  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const { members, error: membersError, search } = useWorkspaceMembers();

  const filtered = useMemo(() => {
    if (!members.length) return [];
    return search(dropdownQuery).slice(0, MAX_DROPDOWN_RESULTS);
  }, [members, dropdownQuery, search]);

  // Recompute @trigger state whenever text or cursor changes. Called from
  // onChange, onKeyUp, onClick — anywhere the cursor might have moved.
  function checkTrigger() {
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? 0;
    const before = text.slice(0, cursor);
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1) {
      setDropdownOpen(false);
      return;
    }
    // `@` must be at start-of-text or preceded by whitespace/punctuation.
    // Otherwise it's an email-like `support@host` and shouldn't trigger.
    const prevChar = atIdx === 0 ? '' : before[atIdx - 1];
    if (prevChar && !TRIGGER_BOUNDARY_RE.test(prevChar)) {
      setDropdownOpen(false);
      return;
    }
    const query = before.slice(atIdx + 1);
    // Bail if the user has moved past the mention via whitespace.
    if (/\s/.test(query)) {
      setDropdownOpen(false);
      return;
    }
    setDropdownQuery(query);
    setDropdownIndex(0);
    setDropdownOpen(true);
  }

  function selectMember(member: WorkspaceMember) {
    const ta = taRef.current;
    if (!ta) return;
    const cursor = ta.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1) return;
    const after = text.slice(cursor);
    const insert = `@${member.username} `;
    const newText = text.slice(0, atIdx) + insert + after;
    setText(newText);
    setMentions((prev) =>
      prev.find((m) => m.id === member.id) ? prev : [...prev, member]
    );
    setDropdownOpen(false);
    // Restore focus + cursor after React's render commits.
    requestAnimationFrame(() => {
      const ta2 = taRef.current;
      if (!ta2) return;
      const newCursor = atIdx + insert.length;
      ta2.focus();
      ta2.setSelectionRange(newCursor, newCursor);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (dropdownOpen && filtered.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setDropdownIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setDropdownIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        const picked = filtered[dropdownIndex];
        if (picked) selectMember(picked);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setDropdownOpen(false);
        return;
      }
    }
    // Cmd/Ctrl+Enter submits from anywhere in the textarea.
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void submit();
    }
  }

  async function submit() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const segments = textToSegments(text, mentions);
      await onSubmit(segments, notifyAll);
      // Parent is responsible for closing/unmounting if desired (e.g.
      // collapsing an inline reply composer). For new-thread case we
      // reset our own state so the user can post another.
      setText('');
      setMentions([]);
      setNotifyAll(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // Close the dropdown when focus leaves the textarea-and-list region.
  useEffect(() => {
    if (!dropdownOpen) return;
    function onDocClick(ev: MouseEvent) {
      const ta = taRef.current;
      const target = ev.target as Node | null;
      if (!ta || !target) return;
      // Click inside the textarea or the dropdown list (handled by their
      // own onMouseDown) is fine; click anywhere else closes.
      const wrap = ta.parentElement;
      if (wrap && wrap.contains(target)) return;
      setDropdownOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [dropdownOpen]);

  const canSubmit = text.trim().length > 0 && !submitting;

  return (
    <div className="flex flex-col gap-2">
      {contextLabel && (
        <div className="text-xs text-inkMuted">{contextLabel}</div>
      )}
      <div className="relative">
        <textarea
          ref={taRef}
          value={text}
          autoFocus={autoFocus}
          placeholder={placeholder}
          disabled={submitting}
          onChange={(e) => {
            setText(e.target.value);
            requestAnimationFrame(checkTrigger);
          }}
          onKeyUp={() => checkTrigger()}
          onClick={() => checkTrigger()}
          onKeyDown={handleKeyDown}
          className="w-full bg-panel border border-border rounded px-3 py-2 min-h-[80px] font-mono text-sm"
        />
        {dropdownOpen && filtered.length > 0 && (
          <div
            className="absolute z-20 mt-1 w-72 bg-panel border border-border rounded shadow-lg overflow-hidden"
            style={{ top: '100%', left: 0 }}
          >
            {filtered.map((m, i) => (
              <button
                key={m.id}
                onMouseDown={(e) => {
                  // Prevent the textarea from blurring (which would dismiss
                  // the dropdown before our click handler fires).
                  e.preventDefault();
                  selectMember(m);
                }}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center gap-2 ${
                  i === dropdownIndex
                    ? 'bg-accent/20 text-accent'
                    : 'hover:bg-panelHi'
                }`}
              >
                <span className="font-mono">@{m.username}</span>
                {m.email && (
                  <span className="text-xs text-inkMuted ml-auto truncate">
                    {m.email}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-xs text-inkMuted cursor-pointer">
          <input
            type="checkbox"
            checked={notifyAll}
            onChange={(e) => setNotifyAll(e.target.checked)}
            disabled={submitting}
          />
          Notify everyone watching this task
        </label>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={submitting}
              className="px-3 py-1 rounded border border-border text-sm hover:bg-panelHi disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="px-3 py-1 rounded bg-accent/20 text-accent border border-accent/40 text-sm hover:bg-accent/30 disabled:opacity-50"
          >
            {submitting ? 'Posting…' : submitLabel}
          </button>
        </div>
      </div>

      {error && <div className="text-danger text-xs">{error}</div>}
      {membersError && !error && (
        <div className="text-inkMuted text-xs">
          @mentions unavailable — {membersError}
        </div>
      )}
    </div>
  );
}
