import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT_HEAVY, YELLOW, heavyText} from '../theme';
import {fit, pop} from '../util';
export const ChapterCard: React.FC<{pill: string; lines: string[]; start: number}> = ({pill, lines, start}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig();
  const size = fit(lines, 820, 136);
  const p0 = pop(frame, fps, start); const p1 = pop(frame, fps, start + 0.15); const p2 = pop(frame, fps, start + 0.3);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.55) 45%, rgba(0,0,0,0) 72%)'}} />
      <div style={{position: 'absolute', left: 100, top: 0, bottom: 140, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start'}}>
        <div style={{transform: `scale(${0.6 + 0.4 * p0})`, opacity: p0, transformOrigin: 'left center', background: '#0b0b0b', border: '5px solid #fff', borderRadius: 999,
          color: '#fff', fontFamily: FONT_HEAVY, fontSize: 64, padding: '6px 54px 14px', marginBottom: 26, boxShadow: '0 8px 24px rgba(0,0,0,0.5)'}}>{pill}</div>
        {lines.map((l, i) => { const p = i === 0 ? p1 : p2; return (
          <div key={i} style={{...heavyText(YELLOW, Math.max(9, size / 10)), fontSize: size, transform: `scale(${0.55 + 0.45 * p})`, opacity: Math.min(1, p * 1.6), transformOrigin: 'left center', whiteSpace: 'nowrap'}}>{l}</div>); })}
      </div>
    </AbsoluteFill>
  );
};
