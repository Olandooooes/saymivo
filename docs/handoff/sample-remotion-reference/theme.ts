export const YELLOW = '#FFE21F';
export const ORANGE = '#F36F21';
export const PINK = '#FF5C93';
export const FONT_HEAVY = 'NotoSansSC-Black';
export const FONT_BOLD = 'NotoSansSC-Bold';
export const FONT_MED = 'NotoSansSC-Medium';
export const heavyText = (color: string, stroke = 12): React.CSSProperties => ({
  fontFamily: FONT_HEAVY, color, WebkitTextStroke: `${stroke}px #000`, paintOrder: 'stroke fill',
  textShadow: '0 8px 0 rgba(0,0,0,0.55), 0 12px 24px rgba(0,0,0,0.35)', lineHeight: 1.12, letterSpacing: 2,
} as React.CSSProperties);
