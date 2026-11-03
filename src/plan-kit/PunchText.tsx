import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {layoutRects, punchProgress} from '../plan.mjs';
import {FONT_HEAVY, YELLOW, heavyText} from './theme';

export function PunchText({text, atMs, shot = 'punch', style}: {text: string; atMs: number; shot?: string; style?: Parameters<typeof layoutRects>[1]}) {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const popped = punchProgress(frame, fps, atMs);
  if (popped <= 0) return null;
  const rect = layoutRects(shot, style).punch;
  return (
    <div style={{position: 'absolute', left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.w * 100}%`, ...heavyText(YELLOW, 8), fontFamily: FONT_HEAVY, fontSize: shot === 'shift-right' ? 72 : 64, transform: `scale(${0.82 + 0.18 * popped})`, opacity: popped, textAlign: shot === 'shift-right' ? 'left' : 'center'}}>
      {text}
    </div>
  );
}
