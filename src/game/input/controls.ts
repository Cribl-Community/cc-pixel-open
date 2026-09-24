/**
 * Keyboard, mouse, gamepad and touch, merged into one HumanInput. Presses
 * and releases are latched until the simulation consumes them, so a tap
 * between two sim steps is never lost.
 *
 * Mouse: hold the left button for topspin, right for slice, middle for a
 * lob; the cursor on the court is the aim point.
 */

import type { HumanInput } from '../sim/match';
import type { ShotKind } from '../sim/shots';

/** How long the mouse aim stays live without mouse activity (ms). */
const AIM_STALE = 6000;

const MOUSE_SHOTS: Record<number, ShotKind> = { 0: 'topspin', 1: 'lob', 2: 'slice' };

const SHOT_KEYS: Record<string, ShotKind> = {
  KeyJ: 'topspin',
  KeyZ: 'topspin',
  KeyK: 'slice',
  KeyX: 'slice',
  KeyL: 'lob',
  KeyC: 'lob',
};

export interface ControlEdges {
  pause: boolean;
  anyKey: boolean;
}

export class Controls {
  private keys = new Set<string>();
  private heldShots: ShotKind[] = [];
  private pressed: ShotKind | null = null;
  private released = false;
  private power = false;
  private pause = false;
  private skip = false;
  private anyKey = false;
  private padPrev: boolean[] = [];
  /** Touch UI writes here. */
  touch = { x: 0, y: 0, sprint: false };
  private touchShot: ShotKind | null = null;
  private mouseShot: ShotKind | null = null;
  /** Cursor position in canvas pixels; turned into a court point on demand. */
  private aimScr: { sx: number; sy: number } | null = null;
  private aimAt = 0;
  /**
   * Canvas pixel → court point, provided by the match controller. Resolving
   * late (not when the mouse moved) keeps the target under the cursor even
   * while the camera pans.
   */
  resolveAim: ((sx: number, sy: number) => { x: number; y: number } | null) | null = null;

  private onDown = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
    const code = e.code;
    if (
      code.startsWith('Arrow') ||
      code === 'Space' ||
      SHOT_KEYS[code] ||
      code === 'KeyW' ||
      code === 'KeyA' ||
      code === 'KeyS' ||
      code === 'KeyD'
    )
      e.preventDefault();
    if (e.repeat) return;
    this.keys.add(code);
    this.anyKey = true;
    const shot = SHOT_KEYS[code];
    if (shot) {
      this.pressed = shot;
      this.heldShots = [...this.heldShots.filter((s) => s !== shot), shot];
    }
    if (code === 'Space') this.power = true;
    if (code === 'Escape' || code === 'KeyP') this.pause = true;
    if (code === 'Enter') this.skip = true;
  };

  private onUp = (e: KeyboardEvent) => {
    const code = e.code;
    this.keys.delete(code);
    const shot = SHOT_KEYS[code];
    if (shot) {
      // Only a release if no other key for that shot is still down.
      const still = Object.entries(SHOT_KEYS).some(([k, s]) => s === shot && this.keys.has(k));
      if (!still) {
        this.heldShots = this.heldShots.filter((s) => s !== shot);
        this.released = true;
      }
    }
  };

  private onBlur = () => {
    this.keys.clear();
    this.heldShots = [];
    this.mouseShot = null;
  };

  attach() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  detach() {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }

  /** Touch stick (x right, y up; magnitude ≤ 1). */
  setStick(x: number, y: number) {
    this.touch.x = x;
    this.touch.y = y;
  }

  setSprint(on: boolean) {
    this.touch.sprint = on;
  }

  /** Mouse button down over the court. Also skips changeovers. */
  mouseDown(button: number) {
    const kind = MOUSE_SHOTS[button];
    if (!kind) return;
    this.pressed = kind;
    this.mouseShot = kind;
    this.anyKey = true;
    this.skip = true;
    this.aimAt = performance.now();
  }

  mouseUp() {
    if (this.mouseShot) this.released = true;
    this.mouseShot = null;
  }

  /** Where the cursor is over the canvas (logical pixels). */
  setAimScreen(sx: number, sy: number) {
    this.aimScr = { sx, sy };
    this.aimAt = performance.now();
  }

  clearAim() {
    this.aimScr = null;
  }

  /** Live mouse aim on the court (null for keyboard-only players or when stale). */
  get aim(): { x: number; y: number } | null {
    if (!this.aimScr || !this.resolveAim || performance.now() - this.aimAt > AIM_STALE) return null;
    return this.resolveAim(this.aimScr.sx, this.aimScr.sy);
  }

  /** Touch buttons. */
  shotDown(kind: ShotKind | 'power') {
    this.anyKey = true;
    if (kind === 'power') {
      this.power = true;
      return;
    }
    this.pressed = kind;
    this.touchShot = kind;
  }

  shotUp() {
    if (this.touchShot) this.released = true;
    this.touchShot = null;
  }

  private pollPad(): { x: number; y: number; sprint: boolean; held: ShotKind | null } | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    let pads: (Gamepad | null)[];
    try {
      pads = navigator.getGamepads();
    } catch {
      // Inside Cribl's iframe the gamepad permission may be withheld.
      return null;
    }
    const pad = pads && Array.from(pads).find((p) => p && p.connected);
    if (!pad) return null;
    const b = (i: number) => !!pad.buttons[i]?.pressed;
    const edge = (i: number) => b(i) && !this.padPrev[i];
    const map: [number, ShotKind][] = [
      [0, 'topspin'],
      [1, 'slice'],
      [3, 'lob'],
    ];
    let held: ShotKind | null = null;
    for (const [i, s] of map) {
      if (edge(i)) {
        this.pressed = s;
        this.anyKey = true;
      }
      if (b(i)) held = s;
      if (!b(i) && this.padPrev[i]) this.released = true;
    }
    if (edge(2)) this.power = true;
    if (edge(9)) this.pause = true;
    if (edge(8)) this.skip = true;
    this.padPrev = pad.buttons.map((x) => x.pressed);
    let x = pad.axes[0] ?? 0;
    let y = -(pad.axes[1] ?? 0);
    if (b(14)) x = -1;
    if (b(15)) x = 1;
    if (b(12)) y = 1;
    if (b(13)) y = -1;
    const dead = 0.2;
    if (Math.hypot(x, y) < dead) {
      x = 0;
      y = 0;
    }
    return { x, y, sprint: b(5) || b(7) || b(4) || b(6), held };
  }

  /** Current input; `consume` clears the latched edges. */
  sample(consume: boolean): HumanInput & ControlEdges {
    const k = this.keys;
    let mx =
      (k.has('ArrowRight') || k.has('KeyD') ? 1 : 0) -
      (k.has('ArrowLeft') || k.has('KeyA') ? 1 : 0);
    let my =
      (k.has('ArrowUp') || k.has('KeyW') ? 1 : 0) - (k.has('ArrowDown') || k.has('KeyS') ? 1 : 0);
    let sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    let held: ShotKind | null =
      this.heldShots[this.heldShots.length - 1] ?? this.mouseShot ?? this.touchShot;
    const pad = this.pollPad();
    if (pad) {
      if (pad.x || pad.y) {
        mx = pad.x;
        my = pad.y;
      }
      sprint = sprint || pad.sprint;
      held = held ?? pad.held;
    }
    if (this.touch.x || this.touch.y) {
      mx = this.touch.x;
      my = this.touch.y;
    }
    sprint = sprint || this.touch.sprint;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    const out = {
      mx,
      my,
      sprint,
      held,
      pressed: this.pressed,
      released: this.released,
      power: this.power,
      skip: this.skip,
      pause: this.pause,
      anyKey: this.anyKey,
      aim: this.aim,
    };
    if (consume) {
      this.pressed = null;
      this.released = false;
      this.power = false;
      this.skip = false;
      this.pause = false;
      this.anyKey = false;
    }
    return out;
  }
}
