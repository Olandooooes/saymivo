# 白板风格

口播白板的画布、颜色、字号、人物小窗、动效和声音只从 [`src/whiteboard-style.json`](../src/whiteboard-style.json) 读取。改气质就改这份文件，渲染和试听不要在代码里另写一套数。

工作台的分镜表里可以打开「风格规范」查看当前取值。这份说明只解释每组字段管什么。

## 画布

16:9，1920×1080，铺满。底色用 `canvas.background`（米白 `#F7F2EA`，和素材库 `style.background` 同一色）。点阵用 `canvas.grid`：间距 28、点半径 1.7、深灰、不透明度 0.22，比先前样片里几乎看不见的淡点更清楚。

## 颜色和字

- `color.ink` 深灰 `#2b2f36`：正文和大字
- `color.support` 灰蓝 `#7d93b5`：辅助线和章节号
- `color.emphasis` `#e0473a`：标红、印章
- `color.highlighter` `#f7e36b`：荧光笔底

`type.roles` 是大字、标题、正文、注释四级字号。一行不要宽过 `type.maxLineWidth`。字体按 `type.fontFamily` 的顺序回退。

## 人物小窗

`pip` 固定在左下角。直径 220，大约是画面高度的五分之一，避免人物显得过大。圆形描边和阴影来自 `pip.stroke`、`pip.shadow`。`matte` 是 false，`keepVideoBackground` 是 true：圆里放的是原视频画面，不抠像。

插画放在 `layout.illustration`，留给屏幕的字放在 `layout.copy`。

## 动效

`motion` 里每一项有 `durationMs` 和 `easing`。缓动要么是三次贝塞尔 `values`，要么是弹簧的 `stiffness` 和 `damping`。

| 键 | 用在 |
|---|---|
| 大字回弹 | 镜头动效「大字回弹」 |
| 画布滑动 / 画布推近 | 画布位移和推近，时长单独可调 |
| 印章落下 | 镜头动效「印章」 |
| 荧光笔划过 | 镜头动效「荧光笔」 |
| 章节转场 | 镜头动效「章节转场」 |
| 标红 | 镜头动效「标红」 |
| 打字界面 | `followSpeech: true`，进度跟字词起点走，不另做一段落后的动画 |

印章、贴纸、荧光笔的缩放和角度只用 `stamp`、`sticker`、`highlighter` 的最小/最大范围。

对齐提前量在 `align`：默认 `leadMs`，并且必须落在 `leadMinMs` 到 `leadMaxMs`（0 到 -80 毫秒）。`onsetMotions` 里的动效（标红、荧光笔）提前量固定为 0，不能早于那个词的发音起点。

## 声音

- `audio.voice`：人声导出响度，默认 −16 LUFS，真峰值 −1.5 dBTP。白板试听和以后的白板导出用这里的数做 loudnorm。
- `audio.music`：默认 `enabled: false`。打开之后用 `gainDb`，有人声时再叠加 `duckDb`（负数），攻击和释放用 `duckAttackMs`、`duckReleaseMs`。
- `audio.sfx`：每种镜头动效一个槽位，文件放在素材目录的 `sfx/`（`dir` 可改这个子目录名）。`gainDbMax` 是音效音量上限。音效打在对齐算出的触发时刻。

不要把私人录音放进仓库。仓库里 `tests/fixtures/script-assets/sfx/` 只有一段段自制的短提示音，用来验收槽位。
