import React from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT_BOLD, ORANGE} from '../theme';
export const ProgressBar: React.FC<{chapters: {label: string; start: number; end: number}[]; total: number}> = ({chapters, total}) => {
  const frame = useCurrentFrame(); const {fps, width} = useVideoConfig(); const t = frame / fps;
  const H = 64;
  return (
    <div style={{position: 'absolute', left: 0, right: 0, bottom: 0, height: H, background: '#050505'}}>
      <div style={{position: 'absolute', left: 0, top: 0, height: 6, width: (t / total) * width, background: ORANGE, boxShadow: `0 0 12px ${ORANGE}`}} />
      {chapters.map((c, i) => {
        const l = (c.start / total) * width; const w = ((c.end - c.start) / total) * width; const cur = t >= c.start && t < c.end;
        return (
          <div key={i} style={{position: 'absolute', left: l, width: w, top: 6, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
            {i > 0 ? <div style={{position: 'absolute', left: 0, top: 14, bottom: 14, width: 4, background: '#fff'}} /> : null}
            <div style={{fontFamily: FONT_BOLD, fontSize: 25, color: cur ? '#fff' : '#8d8d8d', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', padding: '0 14px'}}>{c.label}</div>
          </div>
        );
      })}
    </div>
  );
};
