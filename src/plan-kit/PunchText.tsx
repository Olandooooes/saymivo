import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {PUNCH_SPRING_MS} from '../plan.mjs';
import {FONT_HEAVY, YELLOW, heavyText} from './theme';

export function punchScale(frame: number, fps: number, atMs: number) {
  const at = Math.round(atMs / 1000 * fps);
  return spring({frame: frame - at, fps, config: {damping: 13, stiffness: 260, mass: 0.6}, durationInFrames: Math.max(1, Math.round(PUNCH_SPRING_MS / 1000 * fps))});
}

export function PunchText({text, atMs, place}: {text: string; atMs: number; place: 'left' | 'lower'}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const popped = punchScale(frame, fps, atMs);
  if (frame < Math.round(atMs / 1000 * fps)) return null;
  const box: React.CSSProperties = place === 'left'
    ? {position: 'absolute', left: '5%', top: '16%', maxWidth: '36%'}
    : {position: 'absolute', left: 0, right: 0, top: '4%', textAlign: 'center'};
  return (
    <div style={{...box, ...heavyText(YELLOW, 8), fontFamily: FONT_HEAVY, fontSize: place === 'left' ? 92 : 72, transform: `scale(${0.55 + 0.45 * popped})`, opacity: Math.min(1, popped * 1.6), transformOrigin: place === 'left' ? 'left center' : 'center'}}>
      {text}
    </div>
  );
}
