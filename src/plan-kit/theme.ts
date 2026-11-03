import type {CSSProperties} from 'react';

export const YELLOW = '#FFE21F';
export const ORANGE = '#F36F21';
export const FONT_HEAVY = 'Noto Sans SC Black';
export const FONT_BOLD = 'Noto Sans SC Bold';
export const FONT_MED = 'Noto Sans SC Medium';

export const heavyText = (color: string, stroke = 8): CSSProperties => ({
  fontFamily: FONT_HEAVY,
  color,
  WebkitTextStroke: `${stroke}px #000`,
  paintOrder: 'stroke fill',
  lineHeight: 1.12,
});
