// On-screen controls for phones and tablets: rows of buttons below the screen, plus swipes or
// relative dragging on the game screen. The page styles #touch, .row, button, .on, .off and .wide.

export interface TouchButton<A extends string = string> {
  id: string;
  label: string;
  a: A;
  /** Typed into a name entry as well, e.g. 'Enter'. */
  typed?: string;
  wide?: boolean;
}

export interface TouchPanel {
  el: HTMLElement;
  /** Each button's element by its id, for games that relabel or grey out buttons. */
  els: Map<string, HTMLButtonElement>;
  /** Shows the music button (id 'music') as on or off. */
  update(musicOn: boolean): void;
}

/** Builds the touch panel on touch devices; returns it, or null elsewhere. */
export function setupTouch<A extends string>(
  rows: TouchButton<A>[][],
  onButton: (b: TouchButton<A>, down: boolean) => void,
): TouchPanel | null {
  if (!matchMedia('(pointer: coarse)').matches) return null;
  const panel = document.createElement('div');
  panel.id = 'touch';
  const els = new Map<string, HTMLButtonElement>();

  for (const row of rows) {
    const r = document.createElement('div');
    r.className = 'row';
    for (const b of row) {
      const el = document.createElement('button');
      el.textContent = b.label;
      if (b.wide) el.classList.add('wide');
      const release = () => {
        el.classList.remove('on');
        onButton(b, false);
      };
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        el.setPointerCapture(e.pointerId);
        el.classList.add('on');
        onButton(b, true);
      });
      el.addEventListener('pointerup', release);
      el.addEventListener('pointercancel', release);
      el.addEventListener('contextmenu', (e) => e.preventDefault());
      els.set(b.id, el);
      r.appendChild(el);
    }
    panel.appendChild(r);
  }
  document.body.appendChild(panel);
  document.body.classList.add('has-touch');

  let last: boolean | null = null;
  return {
    el: panel,
    els,
    update(musicOn) {
      const musicEl = els.get('music');
      if (musicOn === last || !musicEl) return;
      last = musicOn;
      musicEl.textContent = musicOn ? '♪' : '♪ OFF';
      musicEl.classList.toggle('off', !musicOn);
    },
  };
}

/** Calls `onSwipe` with 0-3 (up, right, down, left) as a finger moves across `el`. */
export function setupSwipe(el: HTMLElement, onSwipe: (dir: 0 | 1 | 2 | 3) => void) {
  let ox = 0, oy = 0, active = false;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => {
    active = true;
    ox = e.clientX;
    oy = e.clientY;
  });
  el.addEventListener('pointermove', (e) => {
    if (!active) return;
    const dx = e.clientX - ox, dy = e.clientY - oy;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    onSwipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0);
    // Keep tracking from here so one drag can make several turns.
    ox = e.clientX;
    oy = e.clientY;
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(ev, () => (active = false));
}

/** Relative dragging on `el`: `onMove` gets screen-pixel deltas, `onHold` whether a finger is down. */
export function setupDrag(el: HTMLElement, onMove: (dx: number, dy: number) => void, onHold: (down: boolean) => void) {
  el.style.touchAction = 'none';
  let id = -1, ox = 0, oy = 0;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    id = e.pointerId;
    ox = e.clientX;
    oy = e.clientY;
    el.setPointerCapture(id);
    onHold(true);
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    onMove(e.clientX - ox, e.clientY - oy);
    ox = e.clientX;
    oy = e.clientY;
  });
  for (const ev of ['pointerup', 'pointercancel'])
    el.addEventListener(ev, (e) => {
      if ((e as PointerEvent).pointerId !== id) return;
      id = -1;
      onHold(false);
    });
}
