import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT_MED} from '../theme';
export const Subtitles: React.FC<{subs: {s: number; e: number; t: string}[]}> = ({subs}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig(); const t = frame / fps;
  const cur = subs.find((x) => t >= x.s && t < x.e);
  if (!cur) return null;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 88, display: 'flex', justifyContent: 'center'}}>
      <div style={{background: 'rgba(48,48,48,0.62)', color: '#fff', fontFamily: FONT_MED, fontSize: 46, lineHeight: 1.3, padding: '6px 26px 10px', borderRadius: 10, maxWidth: 1300, textAlign: 'center', textShadow: '0 2px 4px rgba(0,0,0,0.5)'}}>{cur.t}</div>
    </div>
  );
};
