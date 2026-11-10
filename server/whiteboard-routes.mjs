import fs from 'node:fs';
import path from 'node:path';
import {filterAssets, loadAssetLibrary, resolveAssetsDir, safeAssetFile, MEDIA_TYPES} from '../src/asset-library.mjs';
import {captionsToDraftInput, draftScriptStoryboard, validateScriptStoryboard} from '../src/script-storyboard.mjs';

export function scriptStoryboardPath(dir, id) {
  if (typeof id !== 'string' || !/^[\w-]+$/.test(id)) return null;
  return path.join(dir, `${id}.storyboard.json`);
}

/** Project documents are `<id>.json`. A storyboard sits beside them and is not a project. */
export function isProjectDocument(name) {
  return typeof name === 'string' && name.endsWith('.json') && !name.endsWith('.storyboard.json');
}

export function removeScriptStoryboard(dir, id) {
  const file = scriptStoryboardPath(dir, id);
  if (file) fs.rmSync(file, {force: true});
}

function libraryPayload(root, url) {
  const located = resolveAssetsDir({root});
  const loaded = loadAssetLibrary(located.dir);
  const includeDeprecated = url.searchParams.get('deprecated') === '1';
  const pool = filterAssets(loaded.items, {deprecated: includeDeprecated ? '1' : '0'});
  const items = filterAssets(pool, {
    q: url.searchParams.get('q') ?? '',
    category: url.searchParams.get('category') ?? '',
    usage: url.searchParams.get('usage') ?? '',
    type: url.searchParams.get('type') ?? '',
    includeDeprecated: true,
  });
  return {
    ok: loaded.ok,
    code: loaded.code ?? null,
    message: loaded.message ?? '',
    dir: located.dir,
    source: located.source,
    style: loaded.style ?? null,
    warnings: loaded.warnings ?? [],
    categories: [...new Set(pool.map((item) => item.category).filter(Boolean))],
    total: (loaded.items ?? []).length,
    shown: items.length,
    hiddenDeprecated: (loaded.items ?? []).filter((item) => item.deprecated).length,
    items,
  };
}

function readSavedStoryboard(file) {
  if (!fs.existsSync(file)) return {ok: true, storyboard: null};
  try {
    const storyboard = JSON.parse(fs.readFileSync(file, 'utf8'));
    const checked = validateScriptStoryboard(storyboard);
    if (!checked.ok) return {ok: false, code: 'invalid', message: '已保存的分镜读不出来', issues: checked.issues, storyboard: null};
    return {ok: true, storyboard};
  } catch {
    return {ok: false, code: 'invalid', message: '分镜文件损坏，没有载入到表格里', storyboard: null};
  }
}

export async function whiteboardRoute({req, res, url, ROOT, PROJECTS_DIR, json, body}) {
  if (url.pathname === '/api/asset-library' && req.method === 'GET') {
    json(res, 200, libraryPayload(ROOT, url));
    return true;
  }
  if (url.pathname === '/api/asset-library/media' && req.method === 'GET') {
    const located = resolveAssetsDir({root: ROOT});
    const loaded = loadAssetLibrary(located.dir);
    const item = (loaded.items ?? []).find((asset) => asset.id === url.searchParams.get('id'));
    if (!item) {
      json(res, 404, {error: '素材不在当前库里'});
      return true;
    }
    const variant = url.searchParams.get('variant') === 'file' ? 'file' : 'thumb';
    const relative = variant === 'file' ? (item.path || item.thumb) : (item.thumb || item.path);
    const file = relative ? safeAssetFile(located.dir, relative) : null;
    if (!file) {
      json(res, 404, {error: '缩略图文件不在素材目录里'});
      return true;
    }
    const type = MEDIA_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
    res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-store'});
    res.end(fs.readFileSync(file));
    return true;
  }

  const match = url.pathname.match(/^\/api\/projects\/([\w-]+)\/storyboard(\/draft)?$/);
  if (!match) return false;
  const id = match[1];
  const file = scriptStoryboardPath(PROJECTS_DIR, id);
  if (!file) {
    json(res, 400, {error: '项目编号无效'});
    return true;
  }
  if (!match[2] && req.method === 'GET') {
    json(res, 200, readSavedStoryboard(file));
    return true;
  }
  if (!match[2] && req.method === 'PUT') {
    const raw = await body(req);
    if (raw.length > 1_000_000) {
      json(res, 413, {error: '分镜内容过大'});
      return true;
    }
    let incoming;
    try {
      incoming = JSON.parse(raw || '{}');
    } catch {
      json(res, 400, {error: '分镜不是有效的 JSON'});
      return true;
    }
    const checked = validateScriptStoryboard(incoming);
    if (!checked.ok) {
      json(res, 400, {error: '分镜未通过校验', issues: checked.issues});
      return true;
    }
    const saved = {...incoming, updatedAt: new Date().toISOString()};
    fs.mkdirSync(PROJECTS_DIR, {recursive: true});
    fs.writeFileSync(file, JSON.stringify(saved, null, 2));
    json(res, 200, {ok: true, storyboard: saved});
    return true;
  }
  if (match[2] && req.method === 'POST') {
    let incoming = {};
    const raw = await body(req);
    if (raw) {
      try {
        incoming = JSON.parse(raw);
      } catch {
        json(res, 400, {error: '分镜草稿请求不是有效的 JSON'});
        return true;
      }
    }
    let draftInput = incoming.sourceText ? {sourceText: incoming.sourceText, words: incoming.words ?? [], source: incoming.source === 'transcript' ? 'transcript' : 'script'} : null;
    if (!draftInput) {
      const projectFile = path.join(PROJECTS_DIR, `${id}.json`);
      if (!fs.existsSync(projectFile)) {
        json(res, 400, {error: '还没有稿子或转写'});
        return true;
      }
      try {
        draftInput = captionsToDraftInput(JSON.parse(fs.readFileSync(projectFile, 'utf8')).captions);
      } catch {
        json(res, 400, {error: '项目文件读不出来，无法按转写生成分镜'});
        return true;
      }
    }
    const library = libraryPayload(ROOT, new URL('http://local/api/asset-library'));
    const storyboard = draftScriptStoryboard({...draftInput, assets: library.items});
    const checked = validateScriptStoryboard(storyboard);
    if (!checked.ok) {
      json(res, 500, {error: '自动分镜未通过校验', issues: checked.issues});
      return true;
    }
    json(res, 200, {ok: true, storyboard, library: {ok: library.ok, message: library.message, dir: library.dir}});
    return true;
  }
  json(res, 405, {error: '不支持的分镜请求'});
  return true;
}
