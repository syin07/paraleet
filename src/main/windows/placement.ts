// Where a small floating window may sit. Pure geometry, so it is unit-tested without Electron.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** How much of the visible part must stay on a screen for the user to see and grab it. */
export const MIN_VISIBLE = 48;

/** Bottom-right corner of a screen's usable area, with a margin. */
export function defaultPosition(workArea: Rect, size: Size, margin = 24): Point {
  return {
    x: Math.round(workArea.x + workArea.width - size.width - margin),
    y: Math.round(workArea.y + workArea.height - size.height - margin),
  };
}

function overlap(a: Rect, b: Rect): Size {
  return {
    width: Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
    height: Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

/** How far a point is from a rectangle; 0 when it is inside. */
function distance(point: Point, area: Rect): number {
  const dx = Math.max(area.x - point.x, 0, point.x - (area.x + area.width));
  const dy = Math.max(area.y - point.y, 0, point.y - (area.y + area.height));
  return Math.hypot(dx, dy);
}

/**
 * Keeps a remembered window position usable.
 *
 * `body` is the part of the window that is actually drawn (the bird), relative to the window's
 * top-left corner; the rest of the window is transparent and may hang off a screen freely. If
 * enough of the body is on some screen the window stays where the user left it. Otherwise (a
 * display was unplugged, a resolution changed, the bird was dragged past an edge) it moves the
 * shortest way that puts the whole body on the nearest screen.
 *
 * `workAreas` lists the usable area of every screen, primary first. With nothing remembered the
 * window goes to the bottom-right corner of the primary screen.
 */
export function keepOnScreen(
  position: Point | null,
  size: Size,
  workAreas: readonly Rect[],
  body: Rect = { x: 0, y: 0, ...size },
): Point {
  const primary = workAreas[0];
  if (!primary) return position ?? { x: 0, y: 0 };
  if (position === null || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return defaultPosition(primary, size);
  }
  const drawn: Rect = { x: position.x + body.x, y: position.y + body.y, width: body.width, height: body.height };
  const needed = { width: Math.min(MIN_VISIBLE, body.width), height: Math.min(MIN_VISIBLE, body.height) };
  const visible = workAreas.some((area) => {
    const shared = overlap(drawn, area);
    return shared.width >= needed.width && shared.height >= needed.height;
  });
  if (visible) return { x: Math.round(position.x), y: Math.round(position.y) };

  const centre = { x: drawn.x + drawn.width / 2, y: drawn.y + drawn.height / 2 };
  let nearest = primary;
  for (const area of workAreas) {
    if (distance(centre, area) < distance(centre, nearest)) nearest = area;
  }
  return {
    x: Math.round(clamp(drawn.x, nearest.x, nearest.x + nearest.width - body.width) - body.x),
    y: Math.round(clamp(drawn.y, nearest.y, nearest.y + nearest.height - body.height) - body.y),
  };
}
