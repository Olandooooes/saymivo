# Codex 口播精剪短段实验

本页记录短段对照及独立验证工具。正式 `codex` provider、现有工作台入口和可撤销应用已实现，但新安装的服务端功能开关默认关闭，通过本机验证后显式开放；不能把隔离实验的结果当作工作台已经执行过。正式入口及开放条件见[口播精剪说明](retake-analysis.md)。

隔离脚本不读取人工剪辑取舍、不修改原片或保存工程。Codex 的词编号决定由独立 CLI 调用产生；程序负责校验、测量静音边界和生成实际 MP4 对比。正式入口重新分析当前快照，不复制实验的删除决定。

## 运行

要求已有本地 Python 环境、Whisper medium、Qwen3-ASR-0.6B、Qwen3-ForcedAligner-0.6B、FFmpeg，以及可正常登录的 Codex CLI。运行脚本本身不下载模型。实验资料应放在忽略的 `inspection/` 中。

```sh
SAYMIVO_BENCHMARK_ASR=qwen node scripts/codex-retake-benchmark.mjs \
  public/clips/example.mp4 20 80 inspection/retake-experiment

.venv-align/bin/python scripts/retake-benchmark-align.py \
  . inspection/retake-experiment
```

示例中的视频路径需替换为本机素材。范围最多90秒，均为原片时钟。默认 Whisper 分窗分支用于历史对照；选择 Qwen 分支时只在测到的低能量间隙分段，转写和对齐均离线。只有转写文字发送给 Codex，不发送音视频；不调用 Gemini。

`observations.json` 保存模型原始观测；`input-units.json` 保留其对应编辑单位及成员编号。零时长词只允许与时间连续的相邻词合并，不能插值制造字内剪口。重叠或孤立零时长观测拒绝进入决策。

旧隔离脚本输出删除词编号、后续替代词编号及原因；正式 provider 的词编号协议还支持保留较早的完整版本。校验拒绝越界、重叠、删除替代版本。片段边缘缺少上下文的取舍被挡住；删除边界必须落在测量的低能量范围内，并且不吞掉相邻保留词。没有合适静音边界时保留原声。`report.json` 分别保存进入预览和被挡住的决定。

设置 `SAYMIVO_BENCHMARK_RENDER_ONLY=1` 可从已有决定重新渲染，只允许与此前 Codex 输入逐字节一致的输入，不重新请求模型、不手改取舍。

## 对比与验收

旧流程必须对同源、同范围独立运行 `analyze-retakes.mjs`。使用同一份识别证据的 Codex 对照可以隔离决策层差异；更换 ASR 的实验不能把全部改善归因于 Codex。

`publish-retake-benchmark.mjs EXPERIMENT_DIR LEGACY_DIR DESTINATION` 生成本机试听页。当前只支持旧流程自动批准为0的对照，其他情况会拒绝发布，避免把原片冒充旧流程结果。试听页不是另一套编辑器。

## 边界复核 v2

旧复核按固定词数取文字、再给音频加固定时长，可能让音频包含未提供的相邻文字；零时长对齐词也可能让目标外边界为空。v2 从真实静音区选择窗口边缘，将窗口内所有观测词交给对齐器。零时长观测只与时间连续的相邻观测合组，不按字符插值，不认证不可分组内部的切点。

删除窗同时覆盖主识别及独立对齐的待删范围，并避开两份观测中全部保留词，额外核验两侧相邻保留词、替代版本及测量静音区。原先4个空外边界在当前短段复核中均已取得观测，3处拟剪口通过机器边界检查。旧报告保留，v2 默认另写 `alignment-v2.json`。

强制对齐只定位给定文字，不证明文字确实说过；正式 provider 另用本地 Whisper medium 独立识别待删和保留版本。机器边界通过不是听审通过。

## 编码前后声音验证

`verify-retake-render.py` 从报告推导全部保留区间，校验原片、source-zero WAV 凭证、输入及实际候选文件的 SHA。每个保留段先确定有界的共同时间偏移及分数采样相位，再用固定偏移检查重叠短窗及首尾保留词附近的声音；不对每个短窗重新对齐以掩盖缺音。低能量窗单独标为未验证。

```sh
.venv-align/bin/python scripts/verify-retake-render.py inspection/retake-experiment \
  --output inspection/retake-experiment/validation-aac.json

.venv-align/bin/python scripts/verify-retake-render.py inspection/retake-experiment \
  --render-lossless-audit inspection/retake-experiment/lossless-audit.wav \
  --output inspection/retake-experiment/validation-lossless.json
```

无损审计只接受与报告逐段一致的原 `preview-filter.txt` 裁切及 concat 图：画面输出到 null，音频在 AAC 编码前保存为 mono16k PCM16，并记录源、图及输出凭证。可用 `--candidate-audio` 对已有审计 WAV 重新验证。已有文件拒绝覆盖，不修改实际 MP4 或模型决定。

当前单素材短段的编码前审计检查709个窗口，0个失败，51个首尾保留词窗口均通过；1个低能量窗未验证，实际 concat 填充使时长增加35ms。AAC 候选仍有两处内部短窗未达到严格波形阈值，同源、同范围的无剪辑转码对照在这两处也未通过；差异不能直接归因为剪口，也不能据对照放宽阈值或声称 AAC 与原声精确一致。两类报告分别保留。

## 尚未完成的验收

上述证据没有证明语气词已清净、所有重录已发现或语义取舍全部正确。正式 provider 暂时挡住缺少独立原声确认的填充语气词删除；无后续纠正的事实口误也不能凭模型补写。多素材泛化、完整工作台操作循环及自然气口听感仍须独立验证，没有宣称人耳听审通过。

正式 provider 已加入独立任务目录、工具禁用配置、结构化词编号校验、并发限制和取消／超时清理；这些属于实现及回归范围，不能代替实际账户运行和声音验收。隔离实验报告始终关闭正式工程自动应用。

```sh
node --test tests/codex-retake-benchmark.test.mjs
.venv-align/bin/python tests/test_retake_boundary_check.py
.venv-align/bin/python tests/test_retake_render_validation.py
npm run check
```
