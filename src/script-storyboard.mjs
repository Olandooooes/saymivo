// Script-level shot list (稿子 → 分镜). This is not the visual scene storyboard
// in storyboard.mjs. Matching is local keyword overlap: no paid API, no
// script-specific copy. Version 2 adds the three planning columns. timeRange
// stays empty until alignStoryboard fills it from the fine-cut clock.
export const ROLES = ['开场', '痛点', '方案', '结尾'];
export const MOTIONS = ['大字回弹', '标红', '荧光笔', '印章', '打字界面', '章节转场'];
export const EMPHASIS_STYLES = ['标红', '荧光笔'];
const PICTURE_BY_ROLE = {
  开场: '用一个口播里没有写出来的画面把话题摊开',
  痛点: '补出这句话没说完的麻烦，不要把原句再写一遍',
  方案: '补一个步骤、界面或结果，口播里没出现的那一层',
  结尾: '留下一个收束，而不是把最后一句再贴一遍',
};

export function defaultShotCopy(shot = {}) {
  const emphasis = (shot.emphasis ?? []).map((item) => item?.text).filter((text) => typeof text === 'string' && text.trim());
  return {
    voiceSaid: typeof shot.text === 'string' ? shot.text : '',
    pictureAdds: PICTURE_BY_ROLE[shot.role] ?? PICTURE_BY_ROLE.方案,
    screenKeeps: emphasis.join(' · '),
  };
}

function withCopy(shot) {
  const copy = defaultShotCopy(shot);
  return {
    ...shot,
    voiceSaid: typeof shot.voiceSaid === 'string' ? shot.voiceSaid : copy.voiceSaid,
    pictureAdds: typeof shot.pictureAdds === 'string' ? shot.pictureAdds : copy.pictureAdds,
    screenKeeps: typeof shot.screenKeeps === 'string' ? shot.screenKeeps : copy.screenKeeps,
    cues: Array.isArray(shot.cues) ? shot.cues : [],
    typing: Array.isArray(shot.typing) ? shot.typing : null,
  };
}

function freshCopy(shot) {
  return {...withCopy({...shot, voiceSaid: undefined, pictureAdds: undefined, screenKeeps: undefined}), ...defaultShotCopy(shot), cues: [], typing: null, timeRange: null};
}
const REUSE_PENALTY = 3;
const ENDING_MARK = /总结|最后|到这里|下期|收尾|结尾/;
const PAIN_MARK = /痛点|麻烦|问题是|还是得|误区|难在|卡住|不够|焦虑/;
const SOLUTION_MARK = /办法|方法|步骤|方案|可以先|试试|建议|做法|关键是|清单/;
const UI_MARK = /界面|窗口|输入|打字|聊天|浏览器/;

export function splitSentences(sourceText) {
  const text = String(sourceText ?? '').replace(/\r\n/g, '\n').trim();
  const out = [];
  let start = 0;
  const push = (from, to) => {
    const raw = text.slice(from, to);
    const leading = raw.match(/^\s*/)?.[0].length ?? 0;
    const core = raw.trim();
    if (!core) return;
    const coreStart = from + leading;
    out.push({text: core, start: coreStart, end: coreStart + core.length});
  };
  for (let i = 0; i < text.length; i++) {
    if (!/[。！？!?\n]/.test(text[i])) continue;
    push(start, i + 1);
    start = i + 1;
  }
  push(start, text.length);
  return out;
}

export function suggestRole(index, total, text) {
  if (total <= 1) return ENDING_MARK.test(text) ? '结尾' : '开场';
  if (index <= 0) return '开场';
  if (index >= total - 1) return '结尾';
  const pain = PAIN_MARK.test(text);
  const solution = SOLUTION_MARK.test(text);
  if (pain && !solution) return '痛点';
  if (solution && !pain) return '方案';
  return index < Math.ceil(total / 2) ? '痛点' : '方案';
}

export function suggestEmphasis(text, assets = []) {
  const pool = [];
  for (const asset of assets) {
    if (!asset || asset.deprecated) continue;
    for (const keyword of [...(asset.keywords ?? []), asset.title]) {
      if (typeof keyword === 'string' && keyword.trim().length >= 2) pool.push(keyword.trim());
    }
  }
  for (const match of String(text).matchAll(/[「『“"]([^」』”"]{1,16})[」』”"]/g)) pool.push(match[1]);
  for (const match of String(text).matchAll(/[A-Za-z][A-Za-z0-9.+-]{1,}/g)) pool.push(match[0]);
  const unique = [...new Set(pool)].filter((keyword) => text.includes(keyword)).sort((a, b) => b.length - a.length || text.indexOf(a) - text.indexOf(b));
  const selected = [];
  for (const keyword of unique) {
    if (selected.some((item) => item.includes(keyword) || keyword.includes(item))) continue;
    selected.push(keyword);
    if (selected.length >= 3) break;
  }
  selected.sort((a, b) => text.indexOf(a) - text.indexOf(b));
  return selected.map((item, index) => ({text: item, style: index % 2 === 0 ? '标红' : '荧光笔'}));
}

export function suggestMotions(shot, previousRole) {
  const motions = [];
  if (shot.role === '开场' || shot.role === '结尾') motions.push('大字回弹');
  if (shot.emphasis.some((item) => item.style === '标红')) motions.push('标红');
  if (shot.emphasis.some((item) => item.style === '荧光笔')) motions.push('荧光笔');
  if (shot.role === '痛点') motions.push('印章');
  if (UI_MARK.test(shot.text)) motions.push('打字界面');
  if (previousRole && previousRole !== shot.role) motions.push('章节转场');
  return motions;
}

export function scoreAsset(text, role, motions, asset) {
  if (!asset || asset.deprecated) return {score: 0, keywords: []};
  const pool = [...(asset.keywords ?? [])];
  if (asset.title) pool.push(asset.title);
  const sorted = [...new Set(pool.filter((keyword) => typeof keyword === 'string').map((keyword) => keyword.trim()).filter((keyword) => keyword.length >= 2))].sort((a, b) => b.length - a.length);
  const keywords = [];
  let score = 0;
  for (const keyword of sorted) {
    if (!text.includes(keyword)) continue;
    if (keywords.some((item) => item.includes(keyword))) continue;
    keywords.push(keyword);
    score += Math.min(keyword.length, 12);
  }
  if (!keywords.length) return {score: 0, keywords: []};
  if ((asset.usages ?? []).includes(role)) score += 2;
  if ((motions ?? []).includes('打字界面') && asset.type === '界面') score += 3;
  else if ((motions ?? []).includes('印章') && asset.type === '贴纸印章') score += 2;
  else if ((motions ?? []).includes('章节转场') && asset.type === '章节卡') score += 2;
  else if (asset.type === '插画') score += 1;
  return {score, keywords};
}

export function matchShots(shots, assets, {onlyMissing = false} = {}) {
  const usable = (assets ?? []).filter((asset) => asset && !asset.deprecated);
  const used = new Set(onlyMissing ? shots.filter((shot) => shot.assetId).map((shot) => shot.assetId) : []);
  return shots.map((shot) => {
    if (onlyMissing && shot.assetId) return shot;
    const ranked = usable
      .map((asset) => ({asset, ...scoreAsset(shot.text, shot.role, shot.motions, asset)}))
      .filter((row) => row.score > 0)
      .map((row) => ({...row, rank: row.score - (used.has(row.asset.id) ? REUSE_PENALTY : 0)}))
      .sort((a, b) => b.rank - a.rank || b.score - a.score || b.keywords[0].length - a.keywords[0].length || a.asset.id.localeCompare(b.asset.id));
    const best = ranked[0];
    if (!best) return {...shot, assetId: null, match: null};
    used.add(best.asset.id);
    return {...shot, assetId: best.asset.id, match: {score: best.score, keywords: best.keywords}};
  });
}

function wordRangesFromChars(doc, start, end) {
  const words = doc.words ?? [];
  if (!words.length || words.map((word) => word.text).join('') !== doc.sourceText) return null;
  let cursor = 0;
  const indexes = [];
  words.forEach((word, index) => {
    const wordStart = cursor;
    cursor += word.text.length;
    if (cursor > start && wordStart < end) indexes.push(index);
  });
  if (!indexes.length) return null;
  return {start: indexes[0], end: indexes.at(-1) + 1};
}

export function draftScriptStoryboard({sourceText, words = [], assets = [], source} = {}) {
  const text = String(sourceText ?? '').replace(/\r\n/g, '\n').trim();
  const usableWords = Array.isArray(words) ? words.filter((word) => word && typeof word.text === 'string' && word.text.length > 0).map((word) => ({
    text: word.text,
    startMs: Number.isFinite(word.startMs) ? word.startMs : null,
    endMs: Number.isFinite(word.endMs) ? word.endMs : null,
  })) : [];
  const useWords = usableWords.length > 0 && usableWords.map((word) => word.text).join('') === text;
  const sentences = splitSentences(text);
  const draftWords = useWords ? usableWords : [];
  const base = {version: 2, kind: 'script-storyboard', source: source === 'transcript' || source === 'script' ? source : (useWords ? 'transcript' : 'script'), sourceText: text, words: draftWords, align: null, shots: []};
  let shots = sentences.map((sentence, index) => ({
    id: `s${index + 1}`,
    text: sentence.text,
    role: suggestRole(index, sentences.length, sentence.text),
    emphasis: suggestEmphasis(sentence.text, assets),
    assetId: null,
    match: null,
    motions: [],
    note: '',
    charRange: {start: sentence.start, end: sentence.end},
    wordRange: null,
    timeRange: null,
    cues: [],
    typing: null,
  }));
  shots = shots.map((shot, index) => ({...shot, motions: suggestMotions(shot, index > 0 ? shots[index - 1].role : null)}));
  shots = matchShots(shots, assets);
  shots = shots.map((shot) => withCopy({...shot, wordRange: shot.charRange ? wordRangesFromChars({...base, shots}, shot.charRange.start, shot.charRange.end) : null}));
  return {...base, shots};
}

export function upgradeScriptStoryboard(doc) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return doc;
  return {...doc, version: 2, align: doc.align ?? null, shots: (doc.shots ?? []).map((shot) => withCopy(shot ?? {}))};
}

export function captionsToDraftInput(captions) {
  const sorted = [...(captions ?? [])].filter(Boolean).sort((a, b) => (a.startMs ?? 0) - (b.startMs ?? 0));
  const words = [];
  for (const caption of sorted) {
    for (const word of caption.words ?? []) {
      if (!word || typeof word.text !== 'string' || !word.text) continue;
      words.push({text: word.text, startMs: Number.isFinite(word.startMs) ? word.startMs : null, endMs: Number.isFinite(word.endMs) ? word.endMs : null});
    }
  }
  return {sourceText: words.map((word) => word.text).join(''), words, source: 'transcript'};
}

function validRange(range, length) {
  return !!range && Number.isInteger(range.start) && Number.isInteger(range.end) && range.start >= 0 && range.end >= range.start && range.end <= length;
}

export function validateScriptStoryboard(doc) {
  const issues = [];
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return {ok: false, issues: ['分镜必须是对象']};
  if (doc.version !== 1 && doc.version !== 2) issues.push('分镜版本必须是 1 或 2');
  if (doc.kind !== 'script-storyboard') issues.push('kind 必须是 script-storyboard');
  if (doc.source !== 'script' && doc.source !== 'transcript') issues.push('source 无效');
  if (typeof doc.sourceText !== 'string') issues.push('sourceText 必须是字符串');
  else if (doc.sourceText.length > 100000) issues.push('稿子过长');
  if (!Array.isArray(doc.words)) issues.push('words 必须是数组');
  else if (doc.words.some((word) => !word || typeof word.text !== 'string')) issues.push('词条必须带 text');
  if (!Array.isArray(doc.shots)) issues.push('shots 必须是数组');
  else if (doc.shots.length > 500) issues.push('镜头过多');
  const ids = new Set();
  for (const shot of doc.shots ?? []) {
    if (!shot || typeof shot !== 'object') {
      issues.push('镜头必须是对象');
      continue;
    }
    if (typeof shot.id !== 'string' || !shot.id) issues.push('镜头缺少 id');
    else if (ids.has(shot.id)) issues.push(`镜头 id 重复：${shot.id}`);
    else ids.add(shot.id);
    if (typeof shot.text !== 'string') issues.push(`${shot.id || '镜头'} 的原文必须是字符串`);
    if (!ROLES.includes(shot.role)) issues.push(`${shot.id || '镜头'} 的段落类型无效`);
    if (!Array.isArray(shot.emphasis) || shot.emphasis.some((item) => !item || typeof item.text !== 'string' || !EMPHASIS_STYLES.includes(item.style))) issues.push(`${shot.id || '镜头'} 的重点词无效`);
    if (shot.assetId !== null && typeof shot.assetId !== 'string') issues.push(`${shot.id || '镜头'} 的配图 id 无效`);
    if (!Array.isArray(shot.motions) || new Set(shot.motions).size !== shot.motions.length || shot.motions.some((motion) => !MOTIONS.includes(motion))) issues.push(`${shot.id || '镜头'} 的动效无效`);
    if (typeof shot.note !== 'string') issues.push(`${shot.id || '镜头'} 的备注必须是字符串`);
    if (shot.charRange !== null && !validRange(shot.charRange, doc.sourceText?.length ?? 0)) issues.push(`${shot.id || '镜头'} 的字范围无效`);
    if (shot.wordRange !== null && !validRange(shot.wordRange, (doc.words ?? []).length)) issues.push(`${shot.id || '镜头'} 的词范围无效`);
    if (shot.timeRange != null) {
      const time = shot.timeRange;
      if (!time || !Number.isFinite(time.startMs) || !Number.isFinite(time.endMs) || time.endMs < time.startMs) issues.push(`${shot.id || '镜头'} 的时间范围无效`);
    }
    if (doc.version === 2) {
      for (const key of ['voiceSaid', 'pictureAdds', 'screenKeeps']) {
        if (typeof shot[key] !== 'string') issues.push(`${shot.id || '镜头'} 的${key}必须是字符串`);
        else if (shot[key].length > 500) issues.push(`${shot.id || '镜头'} 的说明过长`);
      }
      if (!Array.isArray(shot.cues) || shot.cues.some((cue) => !cue || !MOTIONS.includes(cue.motion) || !Number.isFinite(cue.atMs) || !Number.isFinite(cue.leadMs) || (cue.word !== null && typeof cue.word !== 'string') || (cue.wordIndex !== null && !Number.isInteger(cue.wordIndex)))) issues.push(`${shot.id || '镜头'} 的动效触发点无效`);
      if (shot.typing !== null && (!Array.isArray(shot.typing) || shot.typing.some((step) => !step || typeof step.text !== 'string' || !Number.isFinite(step.atMs)))) issues.push(`${shot.id || '镜头'} 的打字进度无效`);
    }
  }
  if (doc.version === 2 && doc.align != null) {
    const align = doc.align;
    if (!align || !Number.isFinite(align.leadMs) || typeof align.keepsKey !== 'string' || (align.clock !== 'source' && align.clock !== 'timeline')) issues.push('对齐记录无效');
  }
  return {ok: issues.length === 0, issues};
}

function compactCopy(value) {
  return String(value ?? '').replace(/[\s，,。！？!?、；;：:「」『』“”"'（）()\n]/g, '');
}

function copyCoverage(piece, spoken) {
  const left = compactCopy(piece);
  const right = compactCopy(spoken);
  if (!left || !right) return {piece: 0, spoken: 0, length: left.length};
  const counts = new Map();
  for (const char of right) counts.set(char, (counts.get(char) ?? 0) + 1);
  let hit = 0;
  for (const char of left) {
    const leftCount = counts.get(char) ?? 0;
    if (leftCount > 0) {
      hit += 1;
      counts.set(char, leftCount - 1);
    }
  }
  return {piece: hit / left.length, spoken: hit / right.length, length: left.length};
}

export function shotCopyIssues(shot) {
  const issues = [];
  const spoken = compactCopy(shot?.text);
  const keep = copyCoverage(shot?.screenKeeps, shot?.text);
  const add = copyCoverage(shot?.pictureAdds, shot?.text);
  const full = (cover) => spoken.length > 0 && cover.length >= spoken.length * 0.85 && cover.piece >= 0.85 && cover.spoken >= 0.85;
  if (full(keep) && full(add)) issues.push({code: 'sentence-twice', message: '同一句话在这一镜里出现了两次。'});
  else if (full(keep)) issues.push({code: 'screen-repeats-speech', message: '屏幕上要留下的字和这句口播几乎一样，画面会变成复述。'});
  const fragment = (cover) => cover.length >= 4 && cover.piece >= 0.8 && cover.spoken < 0.92;
  if (!full(keep) && !full(add) && fragment(keep) && fragment(add)) {
    const bag = new Map();
    for (const char of compactCopy(shot.screenKeeps) + compactCopy(shot.pictureAdds)) bag.set(char, (bag.get(char) ?? 0) + 1);
    let covered = 0;
    const seen = new Map();
    for (const char of spoken) {
      const have = (bag.get(char) ?? 0) - (seen.get(char) ?? 0);
      if (have > 0) {
        covered += 1;
        seen.set(char, (seen.get(char) ?? 0) + 1);
      }
    }
    if (covered / spoken.length >= 0.8) issues.push({code: 'sentence-split', message: '同一句话被拆成两截，同时出现在这一镜里。'});
  }
  return issues;
}

export function storyboardCopyIssues(doc) {
  return (doc?.shots ?? []).flatMap((shot, index) => shotCopyIssues(shot).map((issue) => ({...issue, shotId: shot.id, index})));
}

export function missingAssetShots(doc) {
  return (doc?.shots ?? []).map((shot, index) => ({shot, index})).filter(({shot}) => !shot.assetId);
}

export function rematchAssets(doc, assets, options) {
  return {...doc, shots: matchShots(doc.shots, assets, options)};
}

function fail(error) {
  return {ok: false, error};
}

function nextId(shots) {
  const nums = shots.map((shot) => Number(/^s(\d+)$/.exec(shot.id)?.[1])).filter((n) => Number.isInteger(n));
  return `s${(nums.length ? Math.max(...nums) : 0) + 1}`;
}

function syncRanges(doc, shot) {
  if (!shot.charRange) return {...shot, wordRange: null};
  if (doc.sourceText.slice(shot.charRange.start, shot.charRange.end) !== shot.text) return {...shot, charRange: null, wordRange: null};
  return {...shot, wordRange: wordRangesFromChars(doc, shot.charRange.start, shot.charRange.end)};
}

export function updateShot(doc, id, patch = {}) {
  const index = doc.shots.findIndex((shot) => shot.id === id);
  if (index < 0) return fail('找不到这一镜');
  const next = {...doc.shots[index]};
  if (patch.text !== undefined) {
    if (typeof patch.text !== 'string') return fail('原文必须是字符串');
    next.text = patch.text;
  }
  if (patch.role !== undefined) {
    if (!ROLES.includes(patch.role)) return fail('段落类型无效');
    next.role = patch.role;
  }
  if (patch.note !== undefined) {
    if (typeof patch.note !== 'string') return fail('备注必须是字符串');
    next.note = patch.note;
  }
  if (patch.emphasis !== undefined) {
    if (!Array.isArray(patch.emphasis) || patch.emphasis.some((item) => !item || typeof item.text !== 'string' || !EMPHASIS_STYLES.includes(item.style))) return fail('重点词无效');
    next.emphasis = patch.emphasis.map((item) => ({text: item.text, style: item.style}));
  }
  if (patch.motions !== undefined) {
    if (!Array.isArray(patch.motions) || new Set(patch.motions).size !== patch.motions.length || patch.motions.some((motion) => !MOTIONS.includes(motion))) return fail('动效无效');
    next.motions = [...patch.motions];
  }
  if (patch.assetId !== undefined) {
    if (patch.assetId !== null && (typeof patch.assetId !== 'string' || !patch.assetId)) return fail('配图无效');
    next.assetId = patch.assetId;
    next.match = null;
  }
  for (const key of ['voiceSaid', 'pictureAdds', 'screenKeeps']) {
    if (patch[key] === undefined) continue;
    if (typeof patch[key] !== 'string') return fail('分镜说明必须是字符串');
    next[key] = patch[key];
  }
  const timingDirty = patch.text !== undefined || patch.emphasis !== undefined || patch.motions !== undefined;
  if (timingDirty) {
    next.timeRange = null;
    next.cues = [];
    next.typing = null;
  }
  const shots = doc.shots.map((shot, shotIndex) => (shotIndex === index ? syncRanges(doc, next) : shot));
  return {ok: true, storyboard: {...doc, align: timingDirty ? null : doc.align, shots}};
}

export function addShot(doc, afterId) {
  const shot = freshCopy({id: nextId(doc.shots), text: '', role: '方案', emphasis: [], assetId: null, match: null, motions: [], note: '', charRange: null, wordRange: null});
  const index = afterId ? doc.shots.findIndex((item) => item.id === afterId) : -1;
  if (afterId && index < 0) return fail('找不到插入位置');
  const shots = doc.shots.slice();
  shots.splice(index < 0 ? shots.length : index + 1, 0, shot);
  return {ok: true, storyboard: {...doc, shots}};
}

export function removeShot(doc, id) {
  if (!doc.shots.some((shot) => shot.id === id)) return fail('找不到这一镜');
  return {ok: true, storyboard: {...doc, shots: doc.shots.filter((shot) => shot.id !== id)}};
}

function rangesForSplit(doc, shot, leftText, rightText) {
  if (!shot.charRange || doc.sourceText.slice(shot.charRange.start, shot.charRange.end) !== shot.text) return {left: null, right: null};
  const leftAt = shot.text.indexOf(leftText);
  const rightAt = shot.text.lastIndexOf(rightText);
  if (leftAt < 0 || rightAt < 0) return {left: null, right: null};
  const left = {start: shot.charRange.start + leftAt, end: shot.charRange.start + leftAt + leftText.length};
  const right = {start: shot.charRange.start + rightAt, end: shot.charRange.start + rightAt + rightText.length};
  return {left, right};
}

export function splitShot(doc, id, at) {
  const index = doc.shots.findIndex((shot) => shot.id === id);
  if (index < 0) return fail('找不到这一镜');
  const shot = doc.shots[index];
  if (!Number.isInteger(at) || at <= 0 || at >= shot.text.length) return fail('请点在句子中间再拆分');
  const leftText = shot.text.slice(0, at).trim();
  const rightText = shot.text.slice(at).trim();
  if (!leftText || !rightText) return fail('拆开后两边都要有字');
  const ranges = rangesForSplit(doc, shot, leftText, rightText);
  const right = freshCopy({
    id: nextId(doc.shots),
    text: rightText,
    role: shot.role,
    emphasis: shot.emphasis.filter((item) => rightText.includes(item.text)),
    assetId: null,
    match: null,
    motions: [...shot.motions],
    note: '',
    charRange: ranges.right,
    wordRange: null,
  });
  const left = syncRanges(doc, freshCopy({
    ...shot,
    text: leftText,
    emphasis: shot.emphasis.filter((item) => leftText.includes(item.text)),
    charRange: ranges.left,
  }));
  const syncedRight = syncRanges(doc, right);
  const shots = doc.shots.slice();
  shots.splice(index, 1, left, syncedRight);
  return {ok: true, storyboard: {...doc, align: null, shots}};
}

export function mergeShots(doc, id) {
  const index = doc.shots.findIndex((shot) => shot.id === id);
  if (index < 0) return fail('找不到这一镜');
  const next = doc.shots[index + 1];
  if (!next) return fail('后面没有可以合并的镜头');
  const left = doc.shots[index];
  const text = `${left.text}${next.text}`;
  const emphasis = [];
  for (const item of [...left.emphasis, ...next.emphasis]) {
    if (!text.includes(item.text) || emphasis.some((kept) => kept.text === item.text)) continue;
    emphasis.push(item);
  }
  const motions = [...left.motions];
  for (const motion of next.motions) if (!motions.includes(motion)) motions.push(motion);
  const contiguous = left.charRange && next.charRange && left.charRange.end === next.charRange.start;
  const merged = syncRanges(doc, freshCopy({
    ...left,
    text,
    emphasis,
    motions,
    assetId: left.assetId || next.assetId,
    match: left.assetId ? left.match : next.match,
    note: [left.note, next.note].filter(Boolean).join('\n'),
    charRange: contiguous ? {start: left.charRange.start, end: next.charRange.end} : null,
  }));
  const shots = doc.shots.slice();
  shots.splice(index, 2, merged);
  return {ok: true, storyboard: {...doc, align: null, shots}};
}
