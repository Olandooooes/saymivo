export function easingProgress(easing, elapsedMs, durationMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 0;
  if (!(durationMs > 0)) return 1;
  const t = Math.min(1, elapsedMs / durationMs);
  if (easing?.type === 'spring') {
    const seconds = elapsedMs / 1000;
    const omega = Math.sqrt(easing.stiffness);
    const zeta = easing.damping / (2 * omega);
    if (zeta >= 1) return 1 - Math.exp(-omega * seconds);
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    const envelope = Math.exp(-zeta * omega * seconds);
    return 1 - envelope * (Math.cos(wd * seconds) + (zeta * omega / wd) * Math.sin(wd * seconds));
  }
  const [x1, y1, x2, y2] = easing.values;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const atX = (u) => ((ax * u + bx) * u + cx) * u;
  const atY = (u) => ((ay * u + by) * u + cy) * u;
  let u = t;
  for (let i = 0; i < 6; i += 1) {
    const slope = (3 * ax * u + 2 * bx) * u + cx;
    if (Math.abs(slope) < 1e-5) break;
    u = Math.min(1, Math.max(0, u - (atX(u) - t) / slope));
  }
  return atY(u);
}

function escapeXml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'}[char]));
}

function nestSvg(svg, box) {
  if (!svg) return '';
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 320 240';
  const inner = svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return `<svg x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet">${inner}</svg>`;
}

function cueOf(shot, motion) {
  return (shot.cues ?? []).find((item) => item.motion === motion) ?? null;
}

function progressOf(style, shot, motion, timeMs, specName = motion) {
  const cue = cueOf(shot, motion);
  const spec = style.motion[specName];
  if (!cue || !spec || timeMs < cue.atMs) return {on: false, p: 0, cue};
  return {on: true, p: easingProgress(spec.easing, timeMs - cue.atMs, spec.durationMs), cue};
}

export function renderWhiteboardFrame({style, shot, timeMs, assetSvg = '', portraitSvg = '', chapter = ''}) {
  const {width, height, background, grid} = style.canvas;
  const font = escapeXml(style.type.fontFamily);
  const dots = [];
  for (let y = grid.spacing / 2; y < height; y += grid.spacing) {
    for (let x = grid.spacing / 2; x < width; x += grid.spacing) {
      dots.push(`<circle cx="${x}" cy="${y}" r="${grid.dotRadius}" fill="${grid.color}" opacity="${grid.opacity}"/>`);
    }
  }
  const headline = (shot.screenKeeps || '').trim();
  const bounce = progressOf(style, shot, '大字回弹', timeMs);
  const stampRoom = (shot.cues ?? []).some((item) => item.motion === '印章') ? 170 : 0;
  const lineBudget = Math.max(240, Math.min(style.type.maxLineWidth, style.layout.copy.width) - stampRoom);
  const fitted = Math.min(style.type.roles.display.size, lineBudget / Math.max(1, [...headline].length));
  const displaySize = fitted * (bounce.on ? 0.86 + 0.2 * Math.max(0, bounce.p) : 1);
  const red = progressOf(style, shot, '标红', timeMs);
  const mark = progressOf(style, shot, '荧光笔', timeMs, '荧光笔划过');
  const ink = red.on ? style.color.emphasis : style.color.ink;
  const textWidth = Math.min(style.type.maxLineWidth, style.layout.copy.width, Math.max(fitted, [...headline].length * displaySize));
  const highlightWidth = mark.on ? textWidth * Math.max(0, Math.min(1, mark.p)) : 0;
  const stamp = progressOf(style, shot, '印章', timeMs, '印章落下');
  const stampTurn = style.stamp.minDegrees + (style.stamp.maxDegrees - style.stamp.minDegrees) * Math.max(0, Math.min(1, stamp.p));
  const stampScale = style.stamp.minScale + (style.stamp.maxScale - style.stamp.minScale) * Math.max(0, Math.min(1.15, stamp.p));
  const chapterMotion = progressOf(style, shot, '章节转场', timeMs);
  const typing = (shot.typing ?? []).filter((step) => step.atMs <= timeMs).map((step) => step.text).join('');
  const pip = style.pip;
  const pipY = height - pip.bottom - pip.diameter;
  const pipCenter = pip.diameter / 2;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${background}"/>`,
    dots.join(''),
    nestSvg(assetSvg, style.layout.illustration),
    highlightWidth > 0 ? `<rect x="${style.layout.copy.x}" y="${style.layout.copy.y + style.type.roles.display.size * 0.45}" width="${highlightWidth}" height="${style.type.roles.display.size * style.highlighter.heightRatio}" fill="${style.color.highlighter}" transform="rotate(${style.highlighter.minDegrees} ${style.layout.copy.x} ${style.layout.copy.y})" opacity="0.9"/>` : '',
    headline ? `<text x="${style.layout.copy.x}" y="${style.layout.copy.y + displaySize}" fill="${ink}" font-family="${font}" font-size="${displaySize}" font-weight="${style.type.roles.display.weight}">${escapeXml(headline)}</text>` : '',
    stamp.on ? `<g transform="translate(${style.layout.copy.x + textWidth + 28} ${style.layout.copy.y - 10}) rotate(${stampTurn}) scale(${stampScale})"><circle cx="70" cy="70" r="64" fill="none" stroke="${style.color.emphasis}" stroke-width="8"/><text x="70" y="80" text-anchor="middle" fill="${style.color.emphasis}" font-family="${font}" font-size="${style.type.roles.title.size}" font-weight="${style.type.roles.title.weight}">${escapeXml(style.stamp.label)}</text></g>` : '',
    typing ? `<g><rect x="${style.layout.copy.x}" y="${style.layout.copy.y + 220}" width="${Math.min(style.type.maxLineWidth, 760)}" height="120" rx="16" fill="${background}" stroke="${style.color.support}" stroke-width="3"/><text x="${style.layout.copy.x + 28}" y="${style.layout.copy.y + 292}" fill="${style.color.ink}" font-family="${font}" font-size="${style.type.roles.body.size}" font-weight="${style.type.roles.body.weight}">${escapeXml(typing)}</text></g>` : '',
    chapter && chapterMotion.on ? `<text x="${width - 220}" y="180" fill="${style.color.support}" font-family="${font}" font-size="${style.type.roles.display.size}" font-weight="${style.type.roles.display.weight}" opacity="${Math.max(0, Math.min(1, chapterMotion.p))}">${escapeXml(chapter)}</text>` : '',
    `<defs><filter id="pip-shadow"><feDropShadow dx="0" dy="${pip.shadow.dy}" stdDeviation="${pip.shadow.blur / 2}" flood-color="${pip.shadow.color}" flood-opacity="${pip.shadow.opacity}"/></filter><clipPath id="pip-clip"><circle cx="${pip.x + pipCenter}" cy="${pipY + pipCenter}" r="${pipCenter - pip.stroke.width}"/></clipPath></defs>`,
    `<g filter="url(#pip-shadow)"><circle cx="${pip.x + pipCenter}" cy="${pipY + pipCenter}" r="${pipCenter}" fill="${background}" stroke="${pip.stroke.color}" stroke-width="${pip.stroke.width}"/>`,
    `<g clip-path="url(#pip-clip)">${nestSvg(portraitSvg, {x: pip.x, y: pipY, width: pip.diameter, height: pip.diameter})}</g></g>`,
    `</svg>`,
  ];
  return parts.filter(Boolean).join('');
}
