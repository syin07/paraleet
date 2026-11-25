// The floating pet window's page (PRD section 11). The window is transparent and click-through;
// this page tells main when the pointer is over the bird, handles dragging, and shows a speech
// bubble while the pointer is over the bird.
import { useEffect, useRef, useState } from 'react';
import type { TodayView } from '../../../bridge/contract';
import { api } from '../../bridge';
import { Sprite } from '../../components/Sprite';
import { SpeechBubble } from '../../components/SpeechBubble';
import { PLATFORM_LABELS, problemTitle } from '../../lib/format';
import { useBridgeQuery } from '../../lib/useBridgeQuery';

/** Pointer travel, in screen points, before a press becomes a drag instead of a click. */
const DRAG_THRESHOLD = 4;
const BIRD_SIZE = 128;

/** What the bubble says: today's problem and platform when not fed, the streak when fed. */
export function bubbleText(today: TodayView): string {
  if (today.pet.line) return today.pet.line;
  if (today.fed) return `${Math.max(today.streak.current, 1)}-day streak!`;
  const assignment = today.assignment;
  if (assignment && !assignment.completed) {
    return `${problemTitle(assignment.problem)} on ${PLATFORM_LABELS[assignment.problem.platform]}?`;
  }
  return 'Log any problem and I get fed!';
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
    if (state && !state.dragging) void api().showMainWindow({ screen: null });
  }

  const data = today.data;
  return (
    <div className="flex h-full flex-col items-center justify-end pb-2">
      {data && hovering && (
        // The bubble only informs: clicks on it pass through to whatever is underneath.
        <div className="mb-3" data-testid="pet-bubble">
          <SpeechBubble>{bubbleText(data)}</SpeechBubble>
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
        onPointerLeave={() => setHovering(false)}
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
