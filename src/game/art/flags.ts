/**
 * Country flags, drawn in code: simplified pixel versions for the UI and the
 * main stripe colors for the tiny flags fans wave in the stands.
 */

import type { CountryCode } from '../sim/roster';

export interface FlagDef {
  name: string;
  /** Main colors, top to bottom, for crowd flags. */
  stripes: string[];
  /** Color of pixel (x, y) on a w×h flag. */
  px: (x: number, y: number, w: number, h: number) => string;
}

const hBands = (cols: string[]) => (_x: number, y: number, _w: number, h: number) =>
  cols[Math.min(cols.length - 1, Math.floor((y * cols.length) / h))];
const vBands = (cols: string[]) => (x: number, _y: number, w: number) =>
  cols[Math.min(cols.length - 1, Math.floor((x * cols.length) / w))];

export const FLAGS: Record<CountryCode, FlagDef> = {
  JPN: {
    name: 'Japan',
    stripes: ['#f4f4f0', '#d8263a', '#f4f4f0'],
    px: (x, y, w, h) => {
      const dx = (x + 0.5 - w / 2) / (h * 0.32);
      const dy = (y + 0.5 - h / 2) / (h * 0.32);
      return dx * dx + dy * dy <= 1 ? '#d8263a' : '#f4f4f0';
    },
  },
  GER: {
    name: 'Germany',
    stripes: ['#1a1a1a', '#d8263a', '#f2c230'],
    px: hBands(['#1a1a1a', '#d8263a', '#f2c230']),
  },
  NGA: {
    name: 'Nigeria',
    stripes: ['#1f8a3a', '#f4f4f0', '#1f8a3a'],
    px: vBands(['#1f8a3a', '#f4f4f0', '#1f8a3a']),
  },
  ARG: {
    name: 'Argentina',
    stripes: ['#78b8e8', '#f4f4f0', '#78b8e8'],
    px: (x, y, w, h) => {
      const band = hBands(['#78b8e8', '#f4f4f0', '#78b8e8'])(x, y, w, h);
      const dx = x + 0.5 - w / 2;
      const dy = y + 0.5 - h / 2;
      return band === '#f4f4f0' && Math.abs(dx) < 1 && Math.abs(dy) < 1 ? '#f2c230' : band;
    },
  },
  GBR: {
    name: 'Great Britain',
    stripes: ['#24337a', '#d8263a', '#24337a'],
    px: (x, y, w, h) => {
      const cx = x + 0.5 - w / 2;
      const cy = y + 0.5 - h / 2;
      if (Math.abs(cx) < w * 0.09 || Math.abs(cy) < h * 0.12) return '#d8263a';
      if (Math.abs(cx) < w * 0.16 || Math.abs(cy) < h * 0.24) return '#f4f4f0';
      const diag = Math.abs(Math.abs(cx / w) - Math.abs(cy / h));
      if (diag < 0.07) return '#d8263a';
      if (diag < 0.13) return '#f4f4f0';
      return '#24337a';
    },
  },
  CRO: {
    name: 'Croatia',
    stripes: ['#d8263a', '#f4f4f0', '#24337a'],
    px: (x, y, w, h) => {
      const cx = x + 0.5 - w / 2;
      const cy = y + 0.5 - h / 2;
      if (Math.abs(cx) < w * 0.14 && cy > -h * 0.2 && cy < h * 0.3)
        return (x + y) % 2 ? '#d8263a' : '#f4f4f0';
      return hBands(['#d8263a', '#f4f4f0', '#24337a'])(x, y, w, h);
    },
  },
  USA: {
    name: 'United States',
    stripes: ['#d8263a', '#f4f4f0', '#24337a'],
    px: (x, y, w, h) => {
      if (x < w * 0.45 && y < h * 0.55) return (x + y) % 3 === 0 ? '#f4f4f0' : '#24337a';
      return y % 2 ? '#f4f4f0' : '#d8263a';
    },
  },
  IND: {
    name: 'India',
    stripes: ['#f07d1a', '#f4f4f0', '#1f8a3a'],
    px: (x, y, w, h) => {
      const band = hBands(['#f07d1a', '#f4f4f0', '#1f8a3a'])(x, y, w, h);
      const dx = x + 0.5 - w / 2;
      const dy = y + 0.5 - h / 2;
      return band === '#f4f4f0' && Math.abs(dx) < 1 && Math.abs(dy) < 1 ? '#24337a' : band;
    },
  },
  SWE: {
    name: 'Sweden',
    stripes: ['#2352c4', '#f2d027', '#2352c4'],
    px: (x, y, w, h) => {
      const cx = x + 0.5 - w * 0.38;
      const cy = y + 0.5 - h / 2;
      return Math.abs(cx) < w * 0.09 || Math.abs(cy) < h * 0.12 ? '#f2d027' : '#2352c4';
    },
  },
  FRA: {
    name: 'France',
    stripes: ['#24337a', '#f4f4f0', '#d8263a'],
    px: vBands(['#24337a', '#f4f4f0', '#d8263a']),
  },
};
