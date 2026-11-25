// The floating pet window's page (PRD section 11). The window is transparent and click-through;
// this page tells main when the pointer is over the bird, handles dragging, and shows a speech
// bubble while the pointer is over the bird.
import { useEffect, useRef, useState } from 'react';
import type { TodayView } from '../../../bridge/contract';
import type { Mood } from '../../../core/types';
import { api } from '../../bridge';
import { Sprite } from '../../components/Sprite';
import { SpeechBubble } from '../../components/SpeechBubble';
import { PLATFORM_LABELS, problemTitle } from '../../lib/format';
import { useBridgeQuery } from '../../lib/useBridgeQuery';

/** Pointer travel, in screen points, before a press becomes a drag instead of a click. */
const DRAG_THRESHOLD = 4;
const BIRD_SIZE = 128;

/** Moods that are a short show of their own: Para speaks without waiting to be hovered. */
const SPEAKS_UNASKED: readonly Mood[] = ['checking', 'eating', 'nibbling', 'missed_you'];

/**
 * What the bubble says. `line` is in Para's voice. `detail` is the plain fact the PRD asks for:
 * today's problem and platform when not fed, the streak when fed. It is left out when the line
 * already says it, and during the short shows after a report or a return.
 */
export function bubbleParts(today: TodayView): { line: string; detail: string | null } {
  const open = today.assignment && !today.assignment.completed ? today.assignment.problem : null;
  const streak = Math.max(today.streak.current, 1);
  const fact = today.fed
    ? `${streak}-day streak`
    : open
      ? // Platform first, so a long title is what gets cut short, never the platform.
        `${PLATFORM_LABELS[open.platform]} · ${problemTitle(open)}`
      : 'Any problem feeds me';
  const line = today.pet.line;
  if (line === null) return { line: fact, detail: null };
  if (SPEAKS_UNASKED.includes(today.pet.mood)) return { line, detail: null };
  // A long title is cut short inside a line, so its opening words are enough to count as said.
  const alreadySaid = today.fed
    ? line.includes(String(streak))
    : open !== null && line.includes(open.title.slice(0, 16));
  return { line, detail: alreadySaid ? null : fact };
}

export function PetWindow() {
  const today = useBridgeQuery(() => api().getToday());
  const [hovering, setHovering] = useState(false);
  const interactive = useRef(false);
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null);

  // The window lets clicks through except while the pointer is over something marked data-hit
  // (the bird).
  useEffect(() => {
    function setInteractive(next: boolean): void {
      if (interactive.current === next) return;
      interactive.current = next;
      void api().setPetInteractive({ interactive: next });
    }
    function onMove(event: MouseEvent): void {
      const over = event.target instanceof Element && event.target.closest('[data-hit]') !== null;
      // Stay interactive for the whole drag, even if the pointer outruns the window.
      setInteractive(over || press.current !== null);
    }
    function onLeave(): void {
      if (press.current === null) setInteractive(false);
    }
    window.addEventListener('mousemove', onMove);
    document.addEventListener('mouseleave', onLeave);
    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  function onPointerDown(event: React.PointerEvent): void {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    press.current = { x: event.screenX, y: event.screenY, dragging: false };
  }

  /** Ends a press. A drag that was under way is finished, so its position is kept. */
  function release(): { dragging: boolean } | null {
    const state = press.current;
    press.current = null;
    if (state?.dragging) void api().endPetDrag();
    return state;
  }

  function onPointerMove(event: React.PointerEvent): void {
    const state = press.current;
    if (!state) return;
    // The button was let go without this page hearing of it (a menu or another window took the
    // release): stop following the pointer.
    if ((event.buttons & 1) === 0) {
      release();
      return;
    }
    const dx = Math.round(event.screenX - state.x);
    const dy = Math.round(event.screenY - state.y);
    if (!state.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    state.dragging = true;
    if (dx === 0 && dy === 0) return;
    state.x += dx;
    state.y += dy;
    void api().movePetWindowBy({ dx, dy });
  }

  function onPointerUp(event: React.PointerEvent): void {
    if (event.button !== 0) return;
    const state = release();
    if (state && !state.dragging) {
      sawGreeting();
      void api().showMainWindow({ screen: null });
    }
  }

  const data = today.data;
  const mood = data?.pet.mood ?? null;
  const speaking = data !== undefined && data !== null && (hovering || (mood !== null && SPEAKS_UNASKED.includes(mood)));
  const parts = data ? bubbleParts(data) : null;

  /** Pointing at Para or clicking it is how the "missed you" greeting is seen. */
  function sawGreeting(): void {
    if (mood === 'missed_you') void api().acknowledgeGreeting();
  }

  return (
    <div className="flex h-full flex-col items-center justify-end pb-2">
      {speaking && parts && (
        // The bubble only informs: clicks on it pass through to whatever is underneath.
        <div className="mb-3" data-testid="pet-bubble" data-mood={mood ?? undefined}>
          <SpeechBubble>
            <span className="line-clamp-4" data-testid="pet-bubble-line">
              {parts.line}
            </span>
            {parts.detail !== null && (
              <span className="mt-1.5 line-clamp-3 text-fg-secondary" data-testid="pet-bubble-detail">
                {parts.detail}
              </span>
            )}
          </SpeechBubble>
        </div>
      )}
      <button
        type="button"
        data-hit
        data-testid="pet-bird"
        aria-label="Para. Click to open ParaLeet, drag to move."
        className="block size-32 cursor-grab touch-none border-0 bg-transparent p-0 outline-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onPointerEnter={() => setHovering(true)}
        onPointerLeave={() => {
          setHovering(false);
          sawGreeting();
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          void api().showPetMenu();
        }}
      >
        {data && (
          <Sprite
            seed={data.pet.seed}
            stage={data.pet.stage}
            mood={data.pet.mood}
            accessories={data.pet.equippedAccessories}
            size={BIRD_SIZE}
            animated
            decorative
          />
        )}
      </button>
    </div>
  );
}
