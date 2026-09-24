/**
 * Court surfaces. Restitution sets how high the ball sits up; friction sets
 * how much pace it keeps (low friction = fast court). Values follow the ITF
 * court pace classification: clay is slow and high, grass fast and low.
 */

import type { Surface } from './ball';

export type SurfaceId = 'hard' | 'clay' | 'grass' | 'indoor';

export interface SurfaceDef extends Surface {
  id: SurfaceId;
  name: string;
  /** Player footing: clay lets you slide, grass is slick. */
  grip: number;
  /** Court pace label for the UI. */
  pace: 'Slow' | 'Medium' | 'Medium-fast' | 'Fast';
}

export const SURFACES: Record<SurfaceId, SurfaceDef> = {
  hard: { id: 'hard', name: 'Hard court', e: 0.8, mu: 0.6, grip: 1, pace: 'Medium' },
  clay: { id: 'clay', name: 'Red clay', e: 0.84, mu: 0.82, grip: 0.8, pace: 'Slow' },
  grass: { id: 'grass', name: 'Grass', e: 0.72, mu: 0.42, grip: 0.9, pace: 'Fast' },
  indoor: { id: 'indoor', name: 'Indoor hard', e: 0.78, mu: 0.5, grip: 1, pace: 'Medium-fast' },
};
