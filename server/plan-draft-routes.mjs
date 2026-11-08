import {draftWithLlm, resolveLlm} from '../src/plan-llm.mjs';

export async function planDraftRoute({req, res, url, json, body, env = process.env, fetchImpl, probeImpl, timeoutMs} = {}) {
  if (url.pathname === '/api/plan/llm' && req.method === 'GET') {
    const settings = await resolveLlm({env, probeImpl, fetchImpl});
    json(res, 200, {enabled: settings.available, provider: settings.provider, model: settings.available ? settings.model : null, message: settings.available ? '' : settings.message});
    return true;
  }
  if (url.pathname !== '/api/plan/draft') return false;
  if (req.method !== 'POST') { json(res, 405, {error: '请使用 POST'}); return true; }
  const data = await body(req);
  const draft = () => draftWithLlm({words: data.words ?? [], removes: data.removes ?? [], corrections: data.corrections ?? [], faceBox: data.faceBox ?? null, style: data.style, env, fetchImpl, probeImpl, timeoutMs});
  const accept = String(req.headers?.accept ?? '');
  if (!accept.includes('application/x-ndjson')) {
    const result = await draft();
    json(res, 200, {source: result.source, plan: result.plan, warnings: result.warnings, provider: result.provider ?? null, model: result.model ?? null});
    return true;
  }
  res.writeHead(200, {'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache'});
  const result = await draftWithLlm({
    words: data.words ?? [], removes: data.removes ?? [], corrections: data.corrections ?? [], faceBox: data.faceBox ?? null, style: data.style, env, fetchImpl, probeImpl, timeoutMs,
    onProgress: event => res.write(`${JSON.stringify({type: 'progress', ...event})}\n`),
  });
  res.end(`${JSON.stringify({type: 'done', source: result.source, plan: result.plan, warnings: result.warnings, provider: result.provider ?? null, model: result.model ?? null})}\n`);
  return true;
}
