import type {Clip, ClipFocusWindow, ClipRect} from './timeline';
import type {Caption} from './captions';
export function validFocusRect(rect: unknown): rect is ClipRect;
export function retainedFocusWindows(clip: Clip): ClipFocusWindow[];
export type ClipFocusSample = {
  sourceSec: number; opacity: number;
  box: {left: number; top: number; width: number; height: number};
  crop: {left: number; top: number; width: number; height: number};
  playback: {trimBefore: number; trimAfter: number; playbackRate: number; muted: true; volume: 0};
};
export function focusWindowSample(clip: Clip, window: ClipFocusWindow, frame: number, fps: number, width: number, height: number): ClipFocusSample | null;
export function captionsForVisibleClips<T extends Caption>(captions: T[], clips: Clip[]): T[];
