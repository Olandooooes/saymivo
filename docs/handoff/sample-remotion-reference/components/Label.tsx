import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT_BOLD, YELLOW} from '../theme';
import {pop} from '../util';
export const Label: React.FC<{t: string; x: number; y: number; at: number}> = ({t, x, y, at}) => {
  const frame = useCurrentFrame(); const {fps, width, height} = useVideoConfig();
  const p = pop(frame, fps, at);
  return (
    <div style={{position: 'absolute', left: x * width, top: y * height, transform: `translate(-50%,-50%) scale(${0.6 + 0.4 * p})`, opacity: Math.min(1, p * 1.5),
      background: 'rgba(58,58,58,0.88)', color: YELLOW, fontFamily: FONT_BOLD, fontSize: 52, padding: '12px 38px 16px', borderRadius: 999,
      border: '2px solid rgba(255,255,255,0.18)', boxShadow: '0 10px 30px rgba(0,0,0,0.35)', whiteSpace: 'nowrap'}}>{t}</div>
  );
};
