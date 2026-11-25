import { COLOR_INDEX, COLOR_RGB, type ColorName } from './palette';

export const SIZE = 32;

/** True when the center of pixel (x, y) lies inside the ellipse. `cos` and `sin` are of its angle. */
export function inEllipse(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  cos = 1,
  sin = 0,
): boolean {
  const dx = x + 0.5 - cx;
  const dy = y + 0.5 - cy;
  const u = dx * cos + dy * sin;
  const v = -dx * sin + dy * cos;
  return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1;
}

/** A 32x32 canvas of palette indexes. Drawing is shifted by (ox, oy), so a part can move as one. */
export class Grid {
  readonly cells = new Uint8Array(SIZE * SIZE);
  ox = 0;
  oy = 0;

  set(x: number, y: number, color: ColorName): void {
    const px = Math.round(x) + this.ox;
    const py = Math.round(y) + this.oy;
    if (px < 0 || py < 0 || px >= SIZE || py >= SIZE) return;
    this.cells[py * SIZE + px] = COLOR_INDEX[color];
  }

  /** The color index at an absolute position (ignores the shift). 0 is transparent. */
  at(x: number, y: number): number {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return 0;
    return this.cells[y * SIZE + x] ?? 0;
  }

  /** Fills every pixel whose center is inside the (optionally rotated) ellipse. */
  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    color: ColorName | ((x: number, y: number) => ColorName | null),
    angleDeg = 0,
    clip?: (x: number, y: number) => boolean,
  ): void {
    const a = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const reach = Math.max(rx, ry) + 1;
    for (let y = Math.floor(cy - reach); y <= Math.ceil(cy + reach); y++) {
      for (let x = Math.floor(cx - reach); x <= Math.ceil(cx + reach); x++) {
        if (!inEllipse(x, y, cx, cy, rx, ry, cos, sin)) continue;
        if (clip && !clip(x, y)) continue;
        const c = typeof color === 'function' ? color(x, y) : color;
        if (c) this.set(x, y, c);
      }
    }
  }

  /** Draws text rows; any character missing from `legend` (such as '.') is transparent. */
  stamp(rows: readonly string[], x: number, y: number, legend: Partial<Record<string, ColorName>>): void {
    rows.forEach((row, dy) => {
      [...row].forEach((ch, dx) => {
        const color = legend[ch];
        if (color) this.set(x + dx, y + dy, color);
      });
    });
  }

  toRgba(): Uint8ClampedArray {
    const out = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let i = 0; i < this.cells.length; i++) {
      const idx = this.cells[i] ?? 0;
      if (idx === 0) continue;
      const rgb = COLOR_RGB[idx] as readonly [number, number, number];
      out[i * 4] = rgb[0];
      out[i * 4 + 1] = rgb[1];
      out[i * 4 + 2] = rgb[2];
      out[i * 4 + 3] = 255;
    }
    return out;
  }
}
