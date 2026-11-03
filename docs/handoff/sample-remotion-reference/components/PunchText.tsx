import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {YELLOW, heavyText} from '../theme';
import {fit, pop} from '../util';
type Line = {t: string; at: number; c?: string};
export const PunchText: React.FC<{lines: Line[]; pos: 'left' | 'lower'}> = ({lines, pos}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const t = frame / fps;
  const maxW = pos === 'left' ? 760 : 1500;
  const size = fit(lines.map((l) => l.t), maxW, pos === 'left' ? 132 : 100);
  const box: React.CSSProperties = pos === 'left'
    ? {position: 'absolute', left: 96, top: 170, display: 'flex', flexDirection: 'column', alignItems: 'flex-start'}
    : {position: 'absolute', left: 0, right: 0, bottom: 160, display: 'flex', flexDirection: 'column', alignItems: 'center'};
  return (
    <div style={box}>
      {lines.map((l, i) => {
        if (t < l.at) return <div key={i} style={{height: size * 1.12}} />;
        const p = pop(frame, fps, l.at);
        return (
          <div key={i} style={{...heavyText(l.c === 'white' ? '#fff' : YELLOW, Math.max(8, size / 10)), fontSize: size, transform: `scale(${0.55 + 0.45 * p})`, opacity: Math.min(1, p * 1.6), transformOrigin: pos === 'left' ? 'left center' : 'center', whiteSpace: 'nowrap'}}>{l.t}</div>
        );
      })}
    </div>
  );
};
