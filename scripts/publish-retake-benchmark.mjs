// Local review artifact only. Does not create or modify editor projects.
import fs from 'node:fs';
import path from 'node:path';
const [experimentArg,legacyArg,destinationArg]=process.argv.slice(2);
if(!destinationArg)throw Error('Usage: publish-retake-benchmark.mjs EXPERIMENT_DIR LEGACY_DIR DESTINATION');
const experiment=path.resolve(experimentArg),legacy=path.resolve(legacyArg),destination=path.resolve(destinationArg);
const report=JSON.parse(fs.readFileSync(path.join(experiment,'report.json'),'utf8'));
const baseline=JSON.parse(fs.readFileSync(path.join(legacy,'result.json'),'utf8'));
if(baseline.snapshot.clips.length!==1||baseline.snapshot.clips[0].inSec!==report.range[0]||baseline.snapshot.clips[0].outSec!==report.range[1]||baseline.sources[0].sourceSha256!==report.sourceSha256)throw Error('Baseline and experiment are not the same source/range');
if(baseline.counts.approved!==0)throw Error('Baseline has approved cuts; must render those before comparing');
fs.mkdirSync(destination,{recursive:true});
for(const file of ['original.mp4','codex-proposed.mp4','report.json','observations.json','input-units.json','decisions.json'])fs.copyFileSync(path.join(experiment,file),path.join(destination,file));
fs.copyFileSync(path.join(legacy,'result.json'),path.join(destination,'legacy-result.json'));
if(fs.existsSync(path.join(experiment,'alignment.json')))fs.copyFileSync(path.join(experiment,'alignment.json'),path.join(destination,'alignment.json'));
if(fs.existsSync(path.join(experiment,'verification.json')))fs.copyFileSync(path.join(experiment,'verification.json'),path.join(destination,'verification.json'));
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rows=report.proposals.map(c=>`<tr><td>${c.startSec.toFixed(3)}—${c.endSec.toFixed(3)}</td><td>${escape(c.text)}</td><td>${escape(c.reason)}</td><td>已避开相邻词，待试听</td></tr>`).join('');
fs.writeFileSync(path.join(destination,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>口播精剪短段对比实验</title><style>body{font:16px/1.6 system-ui;max-width:1200px;margin:32px auto;padding:0 24px;background:#f7f6f2;color:#21252b}h1{font-size:26px}.notice{background:#fff0cc;padding:16px;border-radius:12px}.videos{display:grid;grid-template-columns:1fr 1fr;gap:24px}video{width:100%;background:#111}table{border-collapse:collapse;width:100%;background:white}td,th{padding:12px;text-align:left;border-bottom:1px solid #ddd}a{color:#1858b5}@media(max-width:750px){.videos{grid-template-columns:1fr}}</style><h1>口播精剪 · 自动流程短段对比</h1><p>同一原片 ${report.range[0]}—${report.range[1]} 秒 · 原速 · 不使用 Gemini · 未写入工作台工程</p><p class="notice">实验提案，尚未通过听审与剪口验收。右侧是程序根据 Codex 词编号决定生成的候选预览；不能视为已合格成片。对齐检查只验证时间位置，不证明文字忠实或取舍正确。</p><div class="videos"><section><h2>A · 原片／旧流程自动结果</h2><video controls preload="metadata" src="original.mp4"></video><p>旧流程 ${baseline.counts.candidates} 个候选，自动批准 ${baseline.counts.approved} 个，因此自动结果与此原片一致。</p></section><section><h2>B · Codex 自动取舍提案</h2><video controls preload="metadata" src="codex-proposed.mp4"></video><p>程序生成 ${report.proposals.length} 处取舍。重点试听：是否仍有重录、有效信息是否丢失、字头字尾是否完整、气口是否自然。</p></section></div><h2>机器生成的取舍记录（原片时间）</h2><table><thead><tr><th>范围／秒</th><th>删除文字</th><th>理由</th><th>边界状态</th></tr></thead><tbody>${rows}</tbody></table><p><a href="report.json">实验报告</a> · <a href="legacy-result.json">旧流程结果</a> · <a href="observations.json">原始识别证据</a> · <a href="decisions.json">Codex 原始决定</a></p></html>`);
console.log(destination);
