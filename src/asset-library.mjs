// Local illustration library. Images stay on disk; the repo only ships this
// reader plus a few original placeholder fixtures. Field names follow the
// existing library.json (Chinese keys) and also accept English aliases.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const ASSET_TYPES = ['插画', '贴纸印章', '章节卡', '界面'];
export const ASSET_USAGES = ['开场', '痛点', '方案', '结尾'];
export const MEDIA_TYPES = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

export function defaultAssetsDir(home = os.homedir()) {
  return path.join(home, 'saymivo-assets');
}

export function expandHome(value, home = os.homedir()) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text === '~') return home;
  if (text.startsWith('~/') || text.startsWith('~\\')) return path.join(home, text.slice(2));
  return text;
}

export function assetsConfigPath(root) {
  return path.join(root, '.saymivo.json');
}

export function readAssetsConfig(root) {
  try {
    const data = JSON.parse(fs.readFileSync(assetsConfigPath(root), 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

/** Env SAYMIVO_ASSETS_DIR wins, then .saymivo.json, then ~/saymivo-assets. */
export function resolveAssetsDir({root, env = process.env, home = os.homedir()} = {}) {
  const fromEnv = expandHome(env.SAYMIVO_ASSETS_DIR ?? '', home);
  if (fromEnv) return {dir: path.resolve(fromEnv), source: 'env'};
  const configured = expandHome(readAssetsConfig(root).assetsDir ?? '', home);
  if (configured) return {dir: path.resolve(configured), source: 'file'};
  return {dir: defaultAssetsDir(home), source: 'default'};
}

export function writeAssetsDir(root, assetsDir) {
  const file = assetsConfigPath(root);
  const current = readAssetsConfig(root);
  const value = String(assetsDir ?? '').trim();
  if (!value) delete current.assetsDir;
  else {
    if (value.length > 1024 || /[\0\r\n]/.test(value)) throw Error('素材目录路径无效');
    current.assetsDir = value;
  }
  if (!current.assetsDir && Object.keys(current).length === 0) {
    fs.rmSync(file, {force: true});
    return;
  }
  fs.writeFileSync(file, JSON.stringify(current, null, 2) + '\n', {mode: 0o600});
}

function asStrings(value) {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function first(raw, keys) {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

export function assetTypeOf(rawType, category) {
  const type = String(rawType ?? '').trim().toLowerCase();
  const cat = String(category ?? '');
  if (type === 'ui' || type === '界面' || (!type && cat.includes('界面'))) return '界面';
  if (['sticker', 'stamp', '贴纸', '贴纸印章', '印章'].includes(type) || (!type && (cat.includes('贴纸') || cat.includes('印章')))) return '贴纸印章';
  if (['chapter', '章节', '章节卡'].includes(type) || (!type && cat.includes('章节'))) return '章节卡';
  return '插画';
}

export function isDeprecated(value) {
  if (value === true || value === 1) return true;
  if (typeof value === 'string' && ['true', '1', 'yes', 'deprecated'].includes(value.trim().toLowerCase())) return true;
  return false;
}

export function normalizeAsset(raw, index = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {item: null, warning: `第 ${index + 1} 条不是对象，已跳过`};
  const id = String(first(raw, ['id']) ?? '').trim();
  if (!id) return {item: null, warning: `第 ${index + 1} 条缺少 id，已跳过`};
  const category = String(first(raw, ['category', '类别']) ?? '').trim();
  const width = Number(first(raw, ['width', '宽']));
  const height = Number(first(raw, ['height', '高']));
  return {
    item: {
      id,
      path: String(first(raw, ['path', '文件路径']) ?? '').trim(),
      thumb: String(first(raw, ['thumb', '缩略图']) ?? '').trim(),
      vectorPath: String(first(raw, ['vectorPath', '矢量路径']) ?? '').trim(),
      category,
      title: String(first(raw, ['title', '中文标题']) ?? id).trim(),
      keywords: asStrings(first(raw, ['keywords', '关键词'])),
      color: String(first(raw, ['color', '主色']) ?? '').trim(),
      usages: asStrings(first(raw, ['usages', '适合用法', '用途'])),
      source: String(first(raw, ['source', '来源']) ?? '').trim(),
      prompt: String(first(raw, ['prompt', '生成提示词']) ?? '').trim(),
      width: Number.isFinite(width) ? width : null,
      height: Number.isFinite(height) ? height : null,
      type: assetTypeOf(first(raw, ['type', '类型']), category),
      deprecated: isDeprecated(raw.deprecated),
      note: String(first(raw, ['note', '备注']) ?? '').trim(),
    },
    warning: null,
  };
}

export function normalizeLibrary(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {ok: false, code: 'invalid', message: 'library.json 的顶层必须是对象。', items: [], categories: [], warnings: []};
  }
  const warnings = [];
  const buckets = [];
  if (Array.isArray(raw.items)) buckets.push(...raw.items);
  else if (raw.items !== undefined) warnings.push('items 不是数组，已忽略');
  if (Array.isArray(raw.extras)) buckets.push(...raw.extras);
  const items = [];
  const seen = new Set();
  buckets.forEach((entry, index) => {
    const {item, warning} = normalizeAsset(entry, index);
    if (warning) warnings.push(warning);
    if (!item) return;
    if (seen.has(item.id)) {
      warnings.push(`重复 id「${item.id}」已保留第一条`);
      return;
    }
    seen.add(item.id);
    items.push(item);
  });
  return {
    ok: true,
    version: raw.version ?? null,
    style: raw.style && typeof raw.style === 'object' ? raw.style : null,
    items,
    warnings,
    categories: [...new Set(items.map((item) => item.category).filter(Boolean))],
  };
}

export function missingLibraryMessage(dir) {
  return `还没有接到素材目录（${dir}）。请在本机创建这个文件夹，放入 library.json 和图片；也可以在「服务配置」里改成你已有的素材目录。素材不会写入仓库。`;
}

/** Never throws when the folder or index is missing or unreadable. */
export function loadAssetLibrary(dir) {
  const resolved = path.resolve(dir);
  let stat = null;
  try {
    stat = fs.statSync(resolved);
  } catch {
    stat = null;
  }
  if (!stat || !stat.isDirectory()) {
    return {ok: false, code: 'missing', dir: resolved, message: missingLibraryMessage(resolved), items: [], categories: [], warnings: [], style: null, version: null};
  }
  const indexPath = path.join(resolved, 'library.json');
  if (!fs.existsSync(indexPath)) {
    return {ok: false, code: 'no-index', dir: resolved, message: `目录里还没有 library.json：${resolved}`, items: [], categories: [], warnings: [], style: null, version: null};
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  } catch {
    return {ok: false, code: 'invalid', dir: resolved, message: `library.json 无法解析。素材库停在这条说明上，工作台的其他功能不受影响：${indexPath}`, items: [], categories: [], warnings: [], style: null, version: null};
  }
  const normalized = normalizeLibrary(raw);
  return {...normalized, dir: resolved, indexPath};
}

export function filterAssets(items, query = {}) {
  const q = String(query.q ?? query.keyword ?? '').trim().toLowerCase();
  const category = String(query.category ?? '').trim();
  const usage = String(query.usage ?? '').trim();
  const type = String(query.type ?? '').trim();
  const includeDeprecated = query.includeDeprecated === true || query.deprecated === true || query.deprecated === '1' || query.deprecated === 'true';
  return (items ?? []).filter((item) => {
    if (item.deprecated && !includeDeprecated) return false;
    if (category && item.category !== category) return false;
    if (usage && !(item.usages ?? []).includes(usage)) return false;
    if (type && item.type !== type) return false;
    if (!q) return true;
    const haystack = [item.id, item.title, item.category, item.type, item.source, item.prompt, item.note, ...(item.keywords ?? []), ...(item.usages ?? [])].join('\n').toLowerCase();
    return haystack.includes(q);
  });
}

/** Resolve a library-relative file and refuse paths that leave the directory. */
export function safeAssetFile(rootDir, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath.trim() || relativePath.includes('\0')) return null;
  if (path.isAbsolute(relativePath)) return null;
  let root;
  try {
    root = fs.realpathSync(rootDir);
  } catch {
    return null;
  }
  const abs = path.resolve(root, relativePath);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  if (!fs.existsSync(abs)) return null;
  let real;
  try {
    real = fs.realpathSync(abs);
  } catch {
    return null;
  }
  if (real !== root && !real.startsWith(root + path.sep)) return null;
  let stat;
  try {
    stat = fs.statSync(real);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const ext = path.extname(real).toLowerCase();
  if (!MEDIA_TYPES[ext]) return null;
  return real;
}
