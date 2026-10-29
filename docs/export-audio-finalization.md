# 本地 AAC 导出收尾

普通导出的渲染进程成功退出后，服务先校验音频收尾，再返回 `done` 和下载文件。原始 `edited-ID.mp4` 保留，成功产物为 `edited-ID-final.mp4`，旁边的 `.audio-proof.json` 记录实际文件、工具链、逐包与 PCM 证据。失败时不返回候选下载链接，也不替换原文件。

当前支持范围很窄：实际校准过的 macOS arm64、Remotion 4.0.380、捆绑 FFmpeg/ffprobe 的精确 SHA，以及未修改的相关编码实现和导出配置。该链先将 48k 立体声 PCM 编为 libfdk_aac 320k/cutoff18000 的 ADTS，再 COPY 封 MP4。ADTS 不携带编码器的 2048 个起始填充采样表达。独立短合成音直接封 MP4 与 ADTS 路径的解码对照确认了这个值；它不是对任意 AAC 的固定猜测。

仅实际 AAC LC、首 PTS/DTS 为 0、没有已有 skip/discard 表达的唯一音轨接受补偿。已有正确的 -2048/Skip Samples 2048 保持原样；无音轨保持原样。未知版本、平台、配置、编码器、其他轨道、已有非零起点或复杂裁切会拒绝自动收尾，不套旧值。

收尾使用 COPY remux，使音频 PTS 提前 2048/48000 秒，由 MP4 edit list 表达起始填充。`movie_timescale=48000` 避免默认 1000 刻度把末包时长舍掉 16 个采样。没有 `-ss`、`atrim`、`-shortest`、重新编码或音量处理。

发布前必须全部通过：

- 视频每个 coded packet 的内容、顺序、数量、PTS/DTS/时长及 extradata 完全相同。
- 每个 AAC packet 内容、顺序、数量和时长完全相同；只有 PTS/DTS 恰好提前 2048 个采样，首包明确 Skip Samples 2048。
- fresh 48k PCM 逐字节等于原输出解码去起始 2048 后的全部序列，完整保留编码尾 padding。
- 原文件前后 SHA/stat 不变，工具链和原始 props 快照未变。

候选在私有临时目录中生成，用不覆盖的原子 link 发布。取消、工具失败、任一校验失败都会清理候选，保留 raw。两个 FFmpeg 输入分别使用独立打开、核过身份的原文件描述符，避免 macOS 共用 seek 位置导致缺包。

`tests/export-audio-finalize.test.mjs` 使用实际本地 FDK 和短合成视频执行正例、重复补偿、未知链、故障/取消及包内容/尾时长反例。它不证明任何用户成片的听感、语义剪辑或口型；这些仍需实际播放审阅。

依赖升级后应重新校准并更新受控 SHA，或改为直接从同一次渲染的独立 PCM WAV 封 MP4，保留编码器的原生 skip metadata。不要为了通过校验修改语音剪口或容差。
