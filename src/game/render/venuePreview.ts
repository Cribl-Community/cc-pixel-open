/** Small stadium thumbnails for the venue picker (cached per venue & size). */

import { paintStadium, PAN } from '../art/stadium';
import { Crowd } from '../art/crowd';
import type { VenueDef } from '../sim/venues';

const cache = new Map<string, ImageData>();

export function venuePreview(v: VenueDef, W: number, H: number, goats = false): ImageData {
  const key = `${v.id}:${W}x${H}:${goats ? 'goats' : 'people'}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const st = paintStadium(v, W, H, 5);
  const img = new ImageData(W, H);
  const data = new Uint32Array(img.data.buffer);
  for (let y = 0; y < H; y++) data.set(st.bg.subarray(y * st.bw + PAN, y * st.bw + PAN + W), y * W);
  const crowd = new Crowd(st, ['GBR', 'FRA'], 5, goats);
  crowd.update(0.016, 0, 0, W / 2);
  crowd.draw(data, W, H, -PAN, 0);
  const n = st.net;
  for (let y = 0; y < n.h; y++)
    for (let x = 0; x < n.w; x++) {
      const c = n.data[y * n.w + x];
      const fx = n.x - PAN + x;
      const fy = n.y + y;
      if (c && fx >= 0 && fy >= 0 && fx < W && fy < H) data[fy * W + fx] = c;
    }
  cache.set(key, img);
  return img;
}
