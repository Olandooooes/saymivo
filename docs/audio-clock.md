# 真实音频 A/B 视觉比较

`audio-clock-ab` 已接工作台第28个入口、独立参数、逐场预览会话、保存和导出检查。它用于作者明确提供的真实 A/B 音频比较。没有 A/B 事实的视频保持原声，不补造实验、语音时间或准确率。当前代码及合成回归完成不表示已完成真实 Safari 操作、听感或最终成片验收。

`AudioClockScene` 仍是纯视觉 native 层，不创建 Audio/video。实际声音由 composition 顶层 `AudioClockPlayback` 唯一调度：比较窗内依次播放A/B并静音原口播、配乐；窗外恢复它们原来的静音、音量、淡出、duck设置。素材失效或未解码时保留原声并报告 waiting/blocked，不会静音整场。B-roll视觉原本静音，真人前景视频继续静音，由中央同源实际视频提供画面。

## 明确选择实际视频

`editor/AudioClockFields.tsx` 只列当前项目的 `clips` 和 `brollAssets(kind:'video')`，同一视频的两个不同源窗也可使用；本轮不扩充独立MP3上传。每个A/B都需明确选择源视频和源起止秒，点击本机分析。标签只能关联本场真实node，绑定完整 text/detail/bullets；源SHA、PCM/分析SHA、播放资产不能手填。来源依据、顺序、比较开始时点由作者明确输入，“连续排列”只根据两段实际长度推导后续播放点和共同横轴。

首版要求A/B连续、无未解释静音间隙，比较窗刚好包住两段。每个保留实例的输出起止须对齐实际fps；没有自动舍入听审窗口。完整文案和比较窗必须完整保留，真实速度参与曝光和播放速率。比较窗被另一普通场景或动态场覆盖、多个A/B窗相撞时拒绝预览/应用/导出，按中央最终场景ownership判断，不能暗播已离场的A/B。

调整源选择或区间会清除原凭证。异步分析有abort与generation保护，退出/重建/换参数不会把旧结果绑定到新草稿；分析期间禁止应用。播放时点、完整标签、波形和可选逐词区域都有结构化秒/位置控件。

可选词游标只接受已有、明确来源的完整时间词；“采用本项目已有词时间”要求精确clip来源、同源SHA、source-video-presentation-ms时钟、仍保留的词边界，拒绝cue估时、跨源、重叠冲突或缺失时钟。没有可用词仍可做纯波形比较；不会自动ASR或宣称准确率。

## 本地分析与衍生媒体

`createDynamicAudioRoute({ROOT,PUBLIC,json})` 已在 server/index 注册：

- `GET /api/dynamic-audio?src=...&startMs=...&endMs=...&bins=256`：只读真实PCM分析。
- `POST /api/dynamic-audio/materialize?src=...&startMs=...&endMs=...&bins=256`：用户明确分析所选视频时，返回 `{analysis,sourceIdentity,playbackAsset}` 并写本地规范WAVE片段。没有工程写入、网络外发或原媒体改动。

只接收PUBLIC内安全现有相对路径，拒绝协议、绝对路径、穿越和symlink逃逸。先在验证后的同一open fd流式SHA256，再通过继承fd让本机ffprobe/FFmpeg读取；解码前后重新核realpath、inode、大小、mtime/ctime。探测/解码限制本地demuxer和file/pipe协议，拒绝播放列表、concat和外部引用。

音频以视频首帧PTS为源零点；纯分析接口也支持以container start为零的音频，但工作台materialize只接实际带音轨视频。`-copyts`、`asetpts=PTS-(origin)/TB`、`aresample=16000:first_pts=0` 保留前导延迟、裁去零点前采样；不会用STARTPTS抹掉音频相对画面的延迟。使用通用WAVE管道并严格走RIFF chunks提取mono16k PCM16，兼容没有裸s16le muxer但有WAVE/PCM16的本地Remotion FFmpeg。

分析返回实际完整样本数/时长、原声道数、PCM SHA、准确量化源range和逐bin min/max/RMS。两行共同[-1,1]振幅、共同毫秒横轴；没有逐行增益归一化或伪造数字。显示/比较声音是mono16k下混，并非原始多声道无损比较。完整源≤10分钟，单段≤60秒，bins16—1024，stdout/运行时有上限；截断或不可靠原点直接拒绝，无模型下载。

播放片段写在 `PUBLIC/derived-audio/<sourceSHA>-<analysisSHA>.wav`，准确44字节PCM16 WAVE头及所选实际PCM。临时文件完整写完后link原子发布，不覆盖已有地址；旧同名内容不符或symlink直接拒绝。`playbackAsset`包含WAVE SHA、片段PCM SHA、源/分析SHA、源窗、真实样本数/采样率/时长。它是普通媒体资产，源视频不变。

## 源钟与证据合同

配置包括 `binding:{sceneId,src,sha256,startMs,endMs}`、明确 provenance/order/audioOwner、copyWindow/comparisonWindow，以及两个稳定A/B take。每take锁定真实源/分析SHA、源start/end、原场playAt、完整原node标签和波形区域；可选wordTrack具有显式来源、原文UTF16字素范围和每词源时间。

额外声音证据存于独立 `audioEvidence[]`，不是视觉assetIdentities。每项包含takeId、当前video sourceIdentity、完整analysis、playbackAsset。源身份、原文、剪口/速度/实例、字幕、字体、场景外观、音乐或项目视频列表变化都使旧预览失效。原场整体挪时不能靠同src/同长度绕过；投影必须给rawScene/clips/fps重新核对。

预览owner会重新读取实际原片身份、重新materialize两段并核对保存证据，再实际读取WAVE、以WebCrypto检查完整WAVE和PCM两个SHA。每帧音轨报告读取真实HTMLAudio.currentSrc/currentTime/duration/readyState/playbackRate/error；与实际真人源视频currentTime、当前保留实例时钟同时匹配才切换独占owner。`audioClockPlaybackRequest`只是一份调度请求，不能复制为解码证明。

Remotion Player会把共享Audio标签挂到composition外。实际组件把forwarded ref通过WeakMap关联到本机槽；解除/替换引用或跨Document不能继承，序列化标记不能重建这条证据。中央DOM session在比较窗额外独立检查同一个Player中的实际Audio和当前时间、唯一活动A/B槽，以及原片视频/配乐实际muted；不会接受native ready标记代替真实媒体。默认全局静音只核验加载、钟与视觉，不代表人已经听过。应用仍需完整本场所有保留实例采样、完整可见正文、真人安全确认，整场一次undo；没有一键绕过。

首次真实合成A/B操作暴露预览缺口：比较窗持续waiting，波形区未显示，已拒绝应用。当前Remotion版本的共享音频池把React风格回调当作元素属性赋值，不能据此收到原生loadeddata/seeked事件；其默认播放漂移容差也大于本入口的一帧校验门。预览现直接向forwarded实际媒体元素订阅原生事件，在逐帧同步effect之后重新读取实际currentTime；源、mute或片段变化时重新绑定，旧元素及卸载后的事件不能回写。仅A/B音轨与其真人视频预览请求一帧同步容差，既有一帧加0.1ms的就绪门、DOM独立核验及离线PCM合同均不变。未加载、漂移或错误仍等待/拒绝并保留原声。

后续真实复试在暂停时已经显示波形且ready，播放时A/B音频和独立真人元素却都只有readyState1；普通原片元素为readyState4且偏差24.908ms。此前试用的半帧同步阈值会让这一仍在就绪容差内的偏差触发再次seek/buffer，符合持续等待表现；现同步请求调整为1/fps，避免把半帧作为不必要的跳转目标。生命周期回归仍要求真实canplay后readyState达到可解码状态，34ms偏差仍拒绝。此修改没有放宽就绪门；修后的浏览器播放和最终A/B声音仍需真实复验，不能把数值解释当作已通过。

对应组件生命周期回归执行真实hook/effect体和原生EventTarget事件，覆盖静音后延迟加载、实际跳转、34ms偏差仍被拒绝、更换共享元素、卸载及只读状态重渲染不产生更新循环。这是合成生命周期验证；修复后的真实工作台完整循环、监听、应用与导出A/B仍须另行验收，不能把此前失败的循环记录当作通过。

## 导出音轨

保存A/B和导出前都重新读取当前原片/额外音源身份、PCM分析和播放资产，旧文件名或旧DOM receipt不足以通过。替换源、分析或播放字节须重新预览。保存检查不改变已有纯视觉工程的签名/保存合同。

Remotion离线bundle没有本地API端点；server preflight先完成真实再核，render worker随后读取实际bundle WAVE并检查WAVE/PCM SHA，使用明确 `verified-pcm-frame` 与样本offset。渲染仍用Remotion Audio实际混音，原口播和配乐只在比较帧静音，窗外恢复。此处是经验证PCM的渲染样本钟，**不是实时HTMLAudio解码或听审证明**，不会标成preview-decoded。最终编码/听感仍需用真实导出文件独立验收。

## 完整文字与边界

完整title/body/allnodes text/detail/bullets、来源说明、tags/links、显式transcript实际进入copyWindow，等待真实加载字体测量。每页按真实保留和速度核曝光，标签完整分页，单个显式词不跨行。波形、词游标、文字、字幕安全区避让人物全部已知路径和额外保护区。已有图像/视频证据的场景不会被这个无资料平面默默替换；未知全幅脸部不能声称自动安全。

Native报告始终 `canApply:false/uiAccepted:false/automaticAllowed:false/needsFaceReview:true`；真实session才有本机不可序列化receipt。配置缺资料/路径/足够文字或时长时不闪图。此入口是手动明确比较，不进入无A/B事实的REA自动建议。

回归：`node --test tests/audio-clock.test.mjs tests/audio-clock-integration.test.mjs tests/audio-clock-lifecycle.test.mjs tests/dynamic-audio-routes.test.mjs`。包含真实合成WAV/MKV/延迟音轨及bundled WAVE解码，纯时钟/DOM合同、保存导出身份链、组件生命周期检查另有覆盖。这些不能代替Safari像素、实听和最终成片。


实际预览的排查还要区分SDK纠偏与证据精度。播放器默认纠偏阈值用于决定何时重新seek，不能拿它当实际音轨已对齐的证明；原生和DOM证据仍各自检查真实时钟在一帧范围内。过紧的SDK纠偏曾使小偏差反复触发seek和解码等待，恢复SDK默认后，真实独立测量又发现音轨持续落后，因此该能力仍未验收。不得通过放宽证据门、删除等待记录或堆叠截图把结果变成通过。

参数页保留未接受采样的源时间区间、加载/时钟状态和DOM拒绝原因，最多显示最近256个原因段；记录不贡献有效时点、正文、素材或应用凭证。热更新涉及Context模块后，应从保存基线重新进入干净页面，先排除旧模块混态，再判断当前原生播放；开发混态不当作生产根因。新增回归见 `tests/preview-sdk-correction.test.mjs` 与 `tests/scene-dynamic-motion.test.mjs`，仍不能替代实际循环、应用撤销和导出声音检查。
