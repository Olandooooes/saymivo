import React from 'react';
import {AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig} from 'remotion';
import {FONT_BOLD, FONT_HEAVY, FONT_MED, ORANGE, PINK} from '../theme';
import {pop} from '../util';

const activeStyle: React.CSSProperties = {outline: `4px dashed ${PINK}`, outlineOffset: 10, boxShadow: `0 0 0 14px rgba(255,92,147,0.10), 0 0 46px 10px rgba(255,92,147,0.38), 0 18px 40px rgba(0,0,0,0.08)`};
const card: React.CSSProperties = {background: '#fff', borderRadius: 26, boxShadow: '0 14px 36px rgba(40,30,20,0.08)', border: '1px solid #ece7df'};

const Frame: React.FC<{kicker: string; title: string[]; start: number; children: React.ReactNode}> = ({kicker, title, start, children}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig();
  const f0 = Math.round(start * fps);
  const o = interpolate(frame, [f0, f0 + 5], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const s = interpolate(frame, [f0, f0 + 6], [0.975, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{background: '#F7F4EE', opacity: o, transform: `scale(${s})`}}>
      <div style={{position: 'absolute', left: 120, top: 78, fontFamily: FONT_BOLD, fontSize: 24, letterSpacing: 5, color: '#8a837a'}}>{kicker}</div>
      <div style={{position: 'absolute', right: 120, top: 76, fontFamily: FONT_HEAVY, fontSize: 26, letterSpacing: 3, color: '#222', display: 'flex', alignItems: 'center', gap: 12}}>
        <span style={{width: 14, height: 14, borderRadius: 7, background: ORANGE, display: 'inline-block'}} />AI 口播工作台</div>
      <div style={{position: 'absolute', left: 116, top: 118, fontFamily: FONT_HEAVY, fontSize: 66, color: '#141414', letterSpacing: 1}}>
        {title[0]}<span style={{color: ORANGE}}>{title[1]}</span></div>
      <div style={{position: 'absolute', left: 120, top: 222, width: 120, height: 8, background: ORANGE, borderRadius: 4}} />
      {children}
    </AbsoluteFill>
  );
};

const Appear: React.FC<{at: number; children: React.ReactNode; style?: React.CSSProperties}> = ({at, children, style}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig();
  if (frame < Math.round(at * fps)) return <div style={{...style, visibility: 'hidden'}}>{children}</div>;
  const p = pop(frame, fps, at);
  return <div style={{...style, opacity: Math.min(1, p * 1.5), transform: `translateY(${(1 - p) * 24}px) scale(${0.9 + 0.1 * p})`}}>{children}</div>;
};

export const CompareSlide: React.FC<{d: any; start: number}> = ({d, start}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig(); const t = frame / fps;
  const [a, b] = d.cards;
  const isA = t >= a.activeFrom && t < a.activeTo; const isB = t >= b.activeFrom && t < b.activeTo;
  const head = (c: any, active: boolean) => (
    <div style={{display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 26}}>
      <div style={{fontFamily: FONT_HEAVY, fontSize: 54, color: '#151515'}}>{c.name}</div>
      <div style={{fontFamily: FONT_BOLD, fontSize: 24, color: active ? ORANGE : '#9a9389', border: `2px solid ${active ? ORANGE : '#d8d1c6'}`, borderRadius: 999, padding: '2px 16px 4px'}}>{c.tag}</div>
    </div>);
  return (
    <Frame kicker={d.kicker} title={d.title} start={start}>
      <div style={{position: 'absolute', left: 120, top: 300, width: 640, height: 500, padding: '40px 44px', boxSizing: 'border-box', ...card, ...(isA ? activeStyle : {}), opacity: isA || t < a.activeFrom ? 1 : 0.55, transition: 'none'}}>
        {head(a, isA)}
        {a.items.map((it: any, i: number) => (
          <Appear key={i} at={it.at} style={{fontFamily: FONT_BOLD, fontSize: 36, color: it.warn ? '#d9480f' : '#2a2a2a', padding: '18px 22px', marginBottom: 16, borderRadius: 14, background: it.warn ? '#fff1e6' : '#f6f3ee'}}>{it.t}</Appear>
        ))}
      </div>
      <div style={{position: 'absolute', left: 820, top: 300, width: 640, height: 500, padding: '40px 44px', boxSizing: 'border-box', ...card, ...(isB ? activeStyle : {}), opacity: t < b.activeFrom ? 0.45 : 1}}>
        {head(b, isB)}
        <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18}}>
          {b.steps.map((s: any, i: number) => (
            <Appear key={i} at={s.at} style={{gridColumn: i === 3 ? 'span 2' : undefined, fontFamily: FONT_BOLD, fontSize: 34, color: '#fff', background: i === 3 ? ORANGE : '#1c1c1c', borderRadius: 14, padding: '20px 22px', display: 'flex', alignItems: 'center', gap: 14}}>
              <span style={{fontFamily: FONT_HEAVY, fontSize: 24, color: i === 3 ? '#fff' : ORANGE}}>{'0' + (i + 1)}</span>{s.t}
            </Appear>
          ))}
        </div>
      </div>
    </Frame>
  );
};

export const ChecklistSlide: React.FC<{d: any; start: number}> = ({d, start}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig(); const t = frame / fps;
  return (
    <Frame kicker={d.kicker} title={d.title} start={start}>
      {d.items.map((it: any, i: number) => {
        const next = d.items[i + 1]?.at ?? 999; const active = t >= it.at && t < next; const done = t >= next;
        return (
          <Appear key={i} at={it.at} style={{position: 'absolute', left: 120, top: 300 + i * 178, width: 1300, height: 140, boxSizing: 'border-box', ...card, ...(active ? activeStyle : {}), display: 'flex', alignItems: 'center', padding: '0 44px', gap: 36, opacity: done ? 0.7 : 1}}>
            <div style={{fontFamily: FONT_HEAVY, fontSize: 64, color: active ? ORANGE : '#c9c1b5', width: 110}}>{it.n}</div>
            <div style={{fontFamily: FONT_HEAVY, fontSize: 50, color: '#141414'}}>{it.t}</div>
            <div style={{fontFamily: FONT_MED, fontSize: 30, color: '#8a837a', marginLeft: 'auto'}}>{done ? '✓ ' : ''}{it.sub}</div>
          </Appear>
        );
      })}
    </Frame>
  );
};

export const WorkflowSlide: React.FC<{d: any; start: number}> = ({d, start}) => {
  const frame = useCurrentFrame(); const {fps} = useVideoConfig(); const t = frame / fps;
  const W = 232, G = 34;
  return (
    <Frame kicker={d.kicker} title={d.title} start={start}>
      {d.steps.map((s: any, i: number) => {
        const next = d.steps[i + 1]?.at ?? 999; const active = t >= s.at && t < next; const done = t >= next;
        return (
          <React.Fragment key={i}>
            <Appear at={s.at} style={{position: 'absolute', left: 120 + i * (W + G), top: 360, width: W, height: 300, boxSizing: 'border-box', ...card, ...(active ? activeStyle : {}),
              background: done ? '#fff4ec' : '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 26}}>
              <div style={{width: 84, height: 84, borderRadius: 42, background: active || done ? ORANGE : '#1c1c1c', color: '#fff', fontFamily: FONT_HEAVY, fontSize: 40, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>{i + 1}</div>
              <div style={{fontFamily: FONT_HEAVY, fontSize: 38, color: '#141414', textAlign: 'center', padding: '0 12px'}}>{s.t}</div>
            </Appear>
            {i < d.steps.length - 1 ? <Appear at={d.steps[i + 1].at} style={{position: 'absolute', left: 120 + i * (W + G) + W + 4, top: 494, width: G - 8, height: 6, background: ORANGE, borderRadius: 3}}><span /></Appear> : null}
          </React.Fragment>
        );
      })}
    </Frame>
  );
};
