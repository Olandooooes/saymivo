import fs from 'node:fs';
import {MOTIONS} from './script-storyboard.mjs';

const fileUrl = new URL('./whiteboard-style.json', import.meta.url);
const HEX = /^#[0-9a-fA-F]{6}$/;

function isHex(value) {
  return typeof value === 'string' && HEX.test(value);
}

function isBezier(easing) {
  return easing && easing.type === 'bezier' && Array.isArray(easing.values) && easing.values.length === 4 && easing.values.every((n) => Number.isFinite(n));
}

function isEasing(easing) {
  if (!easing || typeof easing !== 'object') return false;
  if (easing.type === 'spring') return Number.isFinite(easing.stiffness) && easing.stiffness > 0 && Number.isFinite(easing.damping) && easing.damping > 0;
  return isBezier(easing);
}

export function validateWhiteboardStyle(style) {
  const issues = [];
  const fail = (message) => issues.push(message);
  if (!style || typeof style !== 'object') return ['风格规范必须是对象'];
  const canvas = style.canvas ?? {};
  if (canvas.aspect !== '16:9' || canvas.width !== 1920 || canvas.height !== 1080) fail('画布必须是 16:9 的 1920×1080');
  if (!isHex(canvas.background)) fail('画布底色无效');
  const grid = canvas.grid ?? {};
  if (grid.kind !== 'dot' || !(grid.spacing > 0) || !(grid.dotRadius > 0) || !isHex(grid.color) || !(grid.opacity > 0 && grid.opacity <= 1)) fail('点阵网格无效');
  const color = style.color ?? {};
  for (const key of ['ink', 'support', 'emphasis', 'highlighter']) if (!isHex(color[key])) fail(`颜色 ${key} 无效`);
  const type = style.type ?? {};
  if (typeof type.fontFamily !== 'string' || !type.fontFamily.trim()) fail('字体无效');
  if (!(type.lineHeight > 0) || !(type.maxLineWidth > 0)) fail('行高或行宽无效');
  for (const role of ['display', 'title', 'body', 'note']) {
    const item = type.roles?.[role];
    if (!item || !(item.size > 0) || !Number.isFinite(item.weight)) fail(`字号 ${role} 无效`);
  }
  const pip = style.pip ?? {};
  if (pip.anchor !== 'bottom-left' || !(pip.diameter > 0) || pip.diameter > 360 || pip.matte !== false || pip.keepVideoBackground !== true) fail('人物小窗必须留在左下角、不要过大，并且保留原视频背景');
  if (!isHex(pip.stroke?.color) || !(pip.stroke?.width > 0)) fail('人物小窗描边无效');
  if (!isHex(pip.shadow?.color) || !(pip.shadow?.opacity >= 0)) fail('人物小窗阴影无效');
  for (const name of ['大字回弹', '画布滑动', '画布推近', '印章落下', '荧光笔划过', '章节转场', '标红', '打字界面']) {
    const motion = style.motion?.[name];
    if (!motion || !Number.isFinite(motion.durationMs) || motion.durationMs < 0 || !isEasing(motion.easing)) fail(`动效 ${name} 的时长或缓动无效`);
  }
  if (style.motion?.['打字界面']?.followSpeech !== true) fail('打字界面必须跟着口播走');
  for (const name of ['stamp', 'sticker']) {
    const item = style[name];
    if (!item || !(item.minScale > 0) || item.maxScale < item.minScale || item.maxDegrees < item.minDegrees) fail(`${name} 的尺寸或角度无效`);
  }
  if (typeof style.stamp?.label !== 'string' || !style.stamp.label) fail('印章文字无效');
  if (!(style.highlighter?.heightRatio > 0) || style.highlighter.maxDegrees < style.highlighter.minDegrees) fail('荧光笔的尺寸或角度无效');
  const align = style.align ?? {};
  if (!Number.isFinite(align.leadMs) || !Number.isFinite(align.leadMinMs) || !Number.isFinite(align.leadMaxMs)) fail('提前量无效');
  else if (align.leadMinMs < -80 || align.leadMaxMs > 0 || align.leadMs < align.leadMinMs || align.leadMs > align.leadMaxMs) fail('提前量必须落在 0 到 -80 毫秒');
  if (!Array.isArray(align.onsetMotions) || !align.onsetMotions.includes('标红') || !align.onsetMotions.includes('荧光笔')) fail('标红和荧光笔必须卡在词出现的时刻');
  const voice = style.audio?.voice ?? {};
  if (!Number.isFinite(voice.integratedLufs) || !Number.isFinite(voice.truePeakDbtp) || !Number.isFinite(voice.lra)) fail('人声响度无效');
  const music = style.audio?.music ?? {};
  if (typeof music.enabled !== 'boolean' || !Number.isFinite(music.gainDb) || !Number.isFinite(music.duckDb) || music.duckDb > 0) fail('背景音乐参数无效');
  if (!(music.duckAttackMs >= 0) || !(music.duckReleaseMs >= 0)) fail('闪避时间无效');
  const sfx = style.audio?.sfx ?? {};
  if (sfx.dir !== 'sfx' || !Number.isFinite(sfx.gainDbMax) || sfx.gainDbMax > 0) fail('音效目录或音量上限无效');
  for (const motion of MOTIONS) if (typeof sfx.slots?.[motion] !== 'string' || !sfx.slots[motion]) fail(`动效 ${motion} 缺少音效槽位`);
  const copy = style.layout?.copy;
  const art = style.layout?.illustration;
  if (!copy || !(copy.width > 0) || !art || !(art.width > 0) || !(art.height > 0)) fail('文字和插画的位置无效');
  return issues;
}

export function readWhiteboardStyle(text = fs.readFileSync(fileUrl, 'utf8')) {
  let style;
  try {
    style = JSON.parse(text);
  } catch {
    return {ok: false, issues: ['风格规范不是有效的 JSON'], style: null};
  }
  const issues = validateWhiteboardStyle(style);
  return {ok: issues.length === 0, issues, style: issues.length ? null : style};
}
