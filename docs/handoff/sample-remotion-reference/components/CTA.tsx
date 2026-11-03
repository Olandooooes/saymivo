import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT_BOLD, ORANGE, PINK, YELLOW, heavyText} from '../theme';
import {pop} from '../util';
const icons: Record<string, React.ReactNode> = {
  点赞: <path d="M8 22V11l5-8c1.5 0 2.5 1 2.2 2.6L14.5 10H21c1.2 0 2 1 1.8 2.2l-1.6 8C21 21.3 20.2 22 19 22H8zM2 11h4v11H2z" fill="currentColor" />,
  收藏: <path d="M12 2l3 6.5 7 .8-5.2 4.8 1.4 7L12 17.6 5.8 21l1.4-7L2 9.3l7-.8z" fill="currentColor" />,
  关注: <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" fill="currentColor" />,
};
const colors = ['#46d2ff', PINK, YELLOW];
export const CTA: React.FC<{d: any}> = ({d}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig();
  const p = pop(frame, fps, d.start);
  return (
    <AbsoluteFill>
      <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.45) 50%, rgba(0,0,0,0.1) 80%)', opacity: Math.min(1, p * 2)}} />
      <div style={{position: 'absolute', left: 100, top: 230, transform: `scale(${0.6 + 0.4 * p})`, transformOrigin: 'left center', opacity: Math.min(1, p * 1.6)}}>
        <div style={{...heavyText(YELLOW, 14), fontSize: 150}}>{d.title}</div>
        <div style={{fontFamily: FONT_BOLD, fontSize: 52, color: '#fff', marginTop: 12, textShadow: '0 3px 8px rgba(0,0,0,0.6)'}}>{d.sub}</div>
        <div style={{display: 'flex', gap: 34, marginTop: 48}}>
          {d.chips.map((c: string, i: number) => { const q = pop(frame, fps, d.start + 0.2 + i * 0.12); return (
            <div key={c} style={{display: 'flex', alignItems: 'center', gap: 14, transform: `scale(${q})`, border: `3px solid ${colors[i]}`, color: colors[i], borderRadius: 999, padding: '10px 30px 12px 22px',
              boxShadow: `0 0 22px ${colors[i]}88, inset 0 0 14px ${colors[i]}55`, background: 'rgba(0,0,0,0.45)'}}>
              <svg width="44" height="44" viewBox="0 0 24 24">{icons[c]}</svg>
              <span style={{fontFamily: FONT_BOLD, fontSize: 42, color: '#fff'}}>{c}</span>
            </div>); })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
