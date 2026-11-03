import React from 'react';
import {AbsoluteFill} from 'remotion';
import {FONT_BOLD, FONT_HEAVY, ORANGE} from './theme';

type Item = {id?: string; title: string; atMs?: number | null; status?: string};

export function activeItem(items: Item[], timeMs: number) {
  const ready = items.filter(item => item.status === 'aligned' && Number.isFinite(item.atMs));
  return ready.filter(item => (item.atMs ?? 0) <= timeMs).sort((a, b) => (a.atMs ?? 0) - (b.atMs ?? 0)).at(-1) ?? null;
}

export function Slides({kind, items, timeMs}: {kind: string; items: Item[]; timeMs: number}) {
  const current = activeItem(items, timeMs);
  return (
    <AbsoluteFill style={{background: '#F7F4EE', padding: '8% 8% 18%'}} data-slide-kind={kind}>
      <div style={{fontFamily: FONT_HEAVY, fontSize: 42, marginBottom: 28}}>{kind}</div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
        {items.map(item => {
          const on = current?.title === item.title && current?.atMs === item.atMs;
          const dim = item.status !== 'aligned';
          return (
            <div key={item.id ?? item.title} data-active={on ? 'true' : 'false'} style={{fontFamily: FONT_BOLD, fontSize: 36, padding: '16px 22px', borderRadius: 16, background: '#fff', opacity: dim ? 0.45 : on ? 1 : 0.62, outline: on ? `4px solid ${ORANGE}` : '1px solid #ece7df'}}>
              {item.title}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
