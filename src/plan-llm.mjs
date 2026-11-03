// Optional storyboard draft. The model may only fill the schema; times stay on the rule draft.
import fs from 'node:fs';
import {draftPlan, prepareWords, validatePlan, SHOTS, SLIDE_KINDS} from './plan.mjs';

const promptTemplate = fs.readFileSync(new URL('../prompts/plan-draft.txt', import.meta.url), 'utf8');

export function llmSettings(env = process.env) {
  if (!env.OPENAI_API_KEY) return null;
  return {
    key: env.OPENAI_API_KEY,
    base: String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    model: env.PLAN_LLM_MODEL || 'gpt-4o-mini',
  };
}

const fold = text => String(text ?? '').replace(/[，,。！？!?、；;：:\s]/g, '');

function wordsInSentence(sentence, words) {
  return words.filter(word => word.endMs > sentence.startMs && word.startMs < sentence.endMs).sort((a, b) => a.startMs - b.startMs);
}

function locateSpan(text, sentenceWords, {maxChars = 80} = {}) {
  const needle = fold(text);
  if (!needle || [...needle].length > maxChars) return null;
  for (let start = 0; start < sentenceWords.length; start++) {
    let joined = '';
    for (let end = start; end < sentenceWords.length; end++) {
      joined += fold(sentenceWords[end].text);
      if (joined.length > maxChars && !joined.includes(needle)) break;
      if (joined.includes(needle)) return {text: needle, atWordId: sentenceWords[start].id, atMs: sentenceWords[start].startMs};
    }
  }
  return null;
}

function contentOf(payload) {
  if (typeof payload === 'string') return payload;
  return payload?.choices?.[0]?.message?.content ?? payload?.content ?? payload?.text ?? '';
}

export function adoptLlmDraft(payload, base, words, removes = []) {
  const warnings = [];
  let parsed;
  try {
    parsed = JSON.parse(contentOf(payload));
  } catch {
    return {ok: false, plan: base, warnings: [{code: 'llm-fallback', message: '模型没有返回 JSON，已用规则底稿'}]};
  }
  if (!parsed || !Array.isArray(parsed.sentences)) {
    return {ok: false, plan: base, warnings: [{code: 'llm-fallback', message: '模型结果缺少句子，已用规则底稿'}]};
  }
  const kept = prepareWords(words, {removes});
  const transcript = kept.map(word => word.text).join('');
  const sentences = base.sentences.map(sentence => {
    const proposed = parsed.sentences.find(row => row?.id === sentence.id) ?? {};
    if (Number.isFinite(proposed.startMs) && proposed.startMs !== sentence.startMs) warnings.push({sentenceId: sentence.id, code: 'time-locked', message: '已忽略模型改过的时间'});
    const next = {...sentence, labels: [], slide: null, cta: false};
    if (SHOTS.includes(proposed.shot)) next.shot = proposed.shot;
    else if (proposed.shot) warnings.push({sentenceId: sentence.id, code: 'dropped', message: '景别不在允许的三种里，已保留原来的景别'});
    const local = wordsInSentence(sentence, kept);
    if (proposed.punch?.text) {
      const hit = locateSpan(proposed.punch.text, local, {maxChars: 12});
      if (!hit) {
        next.punch = null;
        warnings.push({sentenceId: sentence.id, code: 'dropped', message: '大字不是保留词里的连续文字，已丢掉'});
      } else next.punch = hit;
    }
    for (const label of proposed.labels ?? []) {
      const hit = locateSpan(label?.text, local, {maxChars: 12});
      if (!hit) warnings.push({sentenceId: sentence.id, code: 'dropped', message: '标签不在原话里，已丢掉'});
      else next.labels.push({text: hit.text, atMs: hit.atMs, atWordId: hit.atWordId});
    }
    if (proposed.slide && SLIDE_KINDS.includes(proposed.slide.kind)) {
      const items = [];
      for (const item of proposed.slide.items ?? []) {
        const hit = locateSpan(item?.title, local);
        if (!hit) warnings.push({sentenceId: sentence.id, code: 'dropped', message: '全屏页条目不在原话里，已丢掉'});
        else items.push({id: item.id || `item-${items.length + 1}`, title: hit.text, atWordId: hit.atWordId, atMs: hit.atMs, status: 'aligned'});
      }
      let title = String(proposed.slide.title ?? '');
      if (title && (invented(title, transcript) || [...title].length > 16)) {
        warnings.push({sentenceId: sentence.id, code: 'dropped', message: '全屏页标题不能概括，已去掉标题'});
        title = '';
      }
      if (items.length) next.slide = {kind: proposed.slide.kind, title, items};
      else if (proposed.slide.items?.length) warnings.push({sentenceId: sentence.id, code: 'dropped', message: '这页没有可用条目，已去掉'});
    } else if (proposed.slide) warnings.push({sentenceId: sentence.id, code: 'dropped', message: '全屏页种类不受支持，已去掉'});
    if (proposed.cta === true) next.cta = true;
    return next;
  });
  const chapters = (base.chapters ?? []).map((chapter, index) => {
    const proposed = (parsed.chapters ?? [])[index];
    if (!proposed?.title) return {...chapter, title: ''};
    const title = String(proposed.title);
    if (invented(title, transcript) || [...title].length > 10) {
      warnings.push({sentenceId: chapter.id, code: 'dropped', message: '章节标题不合法，已留空'});
      return {...chapter, title: ''};
    }
    return {...chapter, title};
  });
  if ((parsed.chapters ?? []).length > 6) warnings.push({code: 'dropped', message: '章节超过 6 个，多出的已丢掉'});
  const checked = validatePlan({...base, chapters, sentences, warnings}, {words, removes});
  return {ok: true, plan: {...checked.plan, warnings: [...warnings, ...checked.issues.map(issue => ({...issue, code: issue.code === 'rejected-hallucination' ? 'dropped' : issue.code}))]}, warnings};
}

function invented(text, source) {
  const digits = String(text).match(/\d+(?:\.\d+)?/g) ?? [];
  if (digits.some(digit => !source.includes(digit))) return true;
  return [...String(text)].some(char => '不没非别莫勿'.includes(char) && !source.includes(char));
}

function messages(base, kept, faceBox, style) {
  const input = {
    words: kept.map(word => ({id: word.id, text: word.text, startMs: word.startMs, endMs: word.endMs})),
    sentences: base.sentences.map(sentence => ({id: sentence.id, text: sentence.text, startMs: sentence.startMs, endMs: sentence.endMs})),
    face: Boolean(faceBox),
    style: style ?? base.style,
  };
  return [
    {role: 'system', content: promptTemplate},
    {role: 'user', content: JSON.stringify(input)},
  ];
}

async function defaultFetch({url, body, signal, key}) {
  const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`}, body: JSON.stringify(body), signal});
  if (!response.ok) throw Error(`模型接口 ${response.status}`);
  return response.json();
}

export async function draftWithLlm({words = [], removes = [], corrections = [], faceBox = null, style, env = process.env, fetchImpl = defaultFetch, timeoutMs = 30000} = {}) {
  const base = draftPlan({words, removes, corrections, style});
  const settings = llmSettings(env);
  if (!settings) return {plan: base, warnings: [{code: 'llm-unconfigured', message: '未配置 OPENAI_API_KEY，使用规则底稿'}], source: 'rules'};
  const kept = prepareWords(words, {removes, corrections});
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const payload = await fetchImpl({
      url: `${settings.base}/chat/completions`,
      key: settings.key,
      signal: controller.signal,
      body: {model: settings.model, response_format: {type: 'json_object'}, messages: messages(base, kept, faceBox, style)},
    });
    const adopted = adoptLlmDraft(payload, base, words, removes);
    if (!adopted.ok) return {plan: base, warnings: adopted.warnings, source: 'rules'};
    return {plan: adopted.plan, warnings: adopted.plan.warnings ?? adopted.warnings, source: 'llm'};
  } catch (error) {
    const timedOut = error?.name === 'AbortError';
    return {plan: base, warnings: [{code: 'llm-fallback', message: timedOut ? '模型超时，已用规则底稿' : '模型请求失败，已用规则底稿'}], source: 'rules'};
  } finally {
    clearTimeout(timer);
  }
}
