import {spring} from 'remotion';
export const pop = (frame: number, fps: number, atSec: number) => spring({frame: frame - Math.round(atSec * fps), fps, config: {damping: 13, stiffness: 260, mass: 0.6}, durationInFrames: 4});
export const inRange = (t: number, s: number, e: number) => t >= s && t < e;
// rough width estimate in em units for CJK/latin mixed text
export const emWidth = (s: string) => [...s].reduce((a, ch) => a + (/[\x00-\x7F]/.test(ch) ? (ch === ' ' ? 0.3 : 0.62) : 1.0), 0);
export const fit = (lines: string[], maxW: number, maxSize: number) => Math.min(maxSize, ...lines.map((l) => maxW / Math.max(1, emWidth(l) + 0.4)));
