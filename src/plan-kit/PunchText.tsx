import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {layoutRects, punchProgress, punchScaleFactor} from '../plan.mjs';
import {FONT_HEAVY, YELLOW, heavyText} from './theme';

export function PunchText({text, atMs, shot = 'punch', style}: {text: string; atMs: number; shot?: string; style?: Parameters<typeof layoutRects>[1]}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const popped = punchProgress(frame, fps, atMs);
  if (popped <= 0) return null;
  const placed = layoutRects(shot, style).punch;
  const rect = shot === 'shift-right' ? {x: 0.06, y: 0.18, w: 0.4} : shot === 'medium' ? {x: 0.52, y: 0.18, w: 0.4} : {x: placed.x, y: 0.16, w: Math.max(placed.w, 0.42)};
  return (
    <div style={{position: 'absolute', left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, ...heavyText(YELLOW, 8), fontFamily: FONT_HEAVY, fontSize: shot === 'shift-right' ? 72 : 64, transform: `scale(${punchScaleFactor(popped)})`, opacity: popped, textAlign: shot === 'shift-right' ? 'left' : 'center'}}>
      {text}
    </div>
  );
}
