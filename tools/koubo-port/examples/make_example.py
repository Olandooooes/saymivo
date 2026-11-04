"""Builds phrases.example.json (synthetic placeholder speech) + scenes.example.json.
The scenes file is the reference for how to write a real one: every time is a phrase reference,
default shot is WIDE_L / WIDE_R (person ~0.8x, off to one side, text on the other half),
PUSH only briefly on key lines, PIP during text-heavy page stretches, END for the close."""
import json, re, os
TXT = ["示例标题 很简单", "它到底难在哪", "你可能也遇到过", "很多人常说", "一个说法", "叫 Demo", "也就是演示词",
       "它和旧方法", "区别是什么", "最大的不同", "以前靠手动", "现在靠流程", "比如说", "写一份周计划",
       "如果只列标题", "然后买菜洗菜切菜", "全都要亲自来", "而有了工具和清单的人", "能把环节连起来",
       "列出清单", "分好步骤", "排好时间", "得到结果", "不过要小心", "会做不等于做好", "漏了步骤", "顺序搞反",
       "忘了检查", "结果就会走样", "我只看三点", "第一省不省时间", "第二稳不稳定", "第三方不方便改",
       "以示例应用为例", "载入一个文件", "生成列表", "排好顺序", "标记要点", "从开始到完成", "这就是最想分享的一点"]
PH = []; t = 0.3
for s in TXT:
    toks = re.findall(r'[A-Za-z]+|\S', s); dt = 0.17; tk = []
    for x in toks: tk.append([x, round(t, 3)]); t += dt * (2 if x.isascii() else 1)
    PH.append({'text': s, 's': tk[0][1], 'e': round(t, 3), 'tokens': tk}); t += 0.35
here = os.path.dirname(os.path.abspath(__file__))
json.dump(PH, open(os.path.join(here, 'phrases.example.json'), 'w'), ensure_ascii=False, indent=1)
p = lambda i, d=0: f'@p{i}' + (f'{d:+.2f}' if d else '')
S = {
 "_doc": "Example scene spec. Placeholder copy only. Times: '@pN' phrase start, '@pN.e' end, '@pN#k' token k, '@pN~X' first token X, +/- offsets.",
 "chapters": [{"title": "示例标题", "at": 0}, {"title": "01·区别", "at": p(7, -0.2)}, {"title": "02·要小心", "at": p(23, -0.2)},
              {"title": "03·三点", "at": p(29, -0.2)}, {"title": "04·示例应用", "at": p(33, -0.2)}],
 "demo_joins": [3.1, 7.9, 12.4, 20.2, 33.0, 41.5],
 "shots": [
  {"at": 0, "shot": "WIDE_C"},
  {"at": p(2, -0.3), "shot": "WIDE_L"},           # side panel on the right
  {"at": p(7, -0.3), "shot": "WIDE_R"},           # question headline on the left
  {"at": p(11, -0.1), "shot": "PUSH"},            # key line: brief push-in (<= 2.5 s)
  {"at": p(12, -0.3), "shot": "PIP"},             # text-heavy page stretch
  {"at": p(23, -0.3), "shot": "WIDE_R"},
  {"at": p(29, -0.1), "shot": "PUSH"},
  {"at": p(30, -0.3), "shot": "PIP"},
  {"at": p(33, -0.3), "shot": "WIDE_R"},
  {"at": p(34, -0.3), "shot": "PIP"},
  {"at": p(38, -0.3), "shot": "WIDE_C"},
  {"at": p(39, -0.3), "shot": "END"}],
 "overlays": [
  {"template": "title_card", "start": 0, "end": p(2, -0.15), "title": {"text": "示例标题", "at": p(0)},
   "glass": {"text": "它到底难在哪？", "at": p(1)}, "arrows": {"at": p(1, 0.3), "x": 0.70, "y": 0.27}},
  {"template": "side_panel", "start": p(2, -0.15), "end": p(7, -0.2),
   "items": [{"text": "你可能也遇到过", "at": p(2, -0.05), "style": "h1"}, {"text": "很多人常说", "at": p(3, -0.05), "style": "muted"},
             {"text": "一个说法", "at": p(4), "style": "h2"}],
   "accent": {"text": "Demo", "at": p(5, 0.12)}, "tag": {"text": "演示词", "at": "@p6~演"}},
  {"template": "headline_pill", "start": p(7, -0.2), "end": p(9, -0.2), "pill": {"text": "旧方法", "at": p(7, 0.25)},
   "lines": [{"text": "区别", "at": p(8)}, {"text": "是什么？", "at": p(8)}]},
  {"template": "contrast_arrow", "start": p(9, -0.2), "end": p(12, -0.15), "header": {"text": "最大的不同", "at": p(9)},
   "from": {"text": "手动", "at": p(10)}, "to": {"text": "流程", "at": p(11), "pop_at": "@p11~流"}},
  {"template": "blur_lines", "start": p(23, -0.2), "end": p(25, -0.1), "out_at": p(24, -0.15),
   "lines": [{"text": "不过", "at": p(23, 0.15), "size": 104}, {"text": "要小心", "at": "@p23~要-0.08", "size": 170}]},
  {"template": "pill_lines", "start": p(24, -0.1), "end": p(25, -0.1), "pill": {"text": "会做", "at": p(24)},
   "lines": [{"text": "不等于", "at": "@p24~不"}, {"text": "做好", "at": "@p24#5"}]},
  {"template": "error_stack", "start": p(25, -0.1), "end": p(29, -0.15),
   "items": [{"text": "漏了步骤", "at": p(25)}, {"text": "顺序搞反", "at": p(26)}, {"text": "忘了检查", "at": p(27)}], "verdict": {"text": "结果会走样", "at": p(28)}},
  {"template": "headline_badges", "start": p(29, -0.15), "end": p(30, -0.1), "pill": {"text": "判断方法", "at": p(29)},
   "headline": {"text": "三点", "at": "@p29~三"}, "badges": {"n": 3, "at": "@p29~三+0.05"}},
  {"template": "pill_lines", "start": p(33, -0.15), "end": p(34, -0.2), "pill": {"text": "目的相同", "at": p(33, 0.4)},
   "lines": [{"text": "示例应用", "at": "@p33~示"}]},
  {"template": "flow_pills", "start": p(38, -0.15), "end": p(39, -0.2), "a": {"text": "开始", "at": "@p38~开"}, "b": {"text": "完成", "at": "@p38#4"},
   "bottom": {"text": "省了多少事", "at": p(38, 0.6)}}],
 "pages": [
  {"id": "example", "bg": "offwhite", "start": p(12, -0.3), "end": p(17, -0.1), "layers": [
    {"template": "page_example", "exit_at": p(15, -0.2), "brand": "EXAMPLE", "kicker": {"text": "比如说", "at": p(12)},
     "title": [{"text": "写一份", "at": p(13)}, {"text": "周计划", "at": "@p13~周", "accent": True}], "caption": "比如说：一个小需求",
     "card": {"at": p(14), "lead": "如果只", "big": "列标题", "node": "大纲"}, "capsule": {"text": "只列标题", "at": "@p14~列"}},
    {"template": "scattered_capsules", "start": p(15, -0.1), "lead": {"text": "然后", "at": p(15)},
     "items": [{"text": "买菜", "at": "@p15~买"}, {"text": "洗菜", "at": "@p15~洗"}, {"text": "切菜", "at": "@p15~切"}],
     "capsule": {"text": "全都要亲自来", "at": p(16)}}]},
  {"id": "chain", "bg": "dark_glow", "enter": "slide", "start": p(17, -0.1), "end": p(23, -0.3), "layers": [
    {"template": "doc_stack", "header": [{"text": "而有了", "at": p(17)}, {"text": "工具", "at": "@p17~工", "accent": True}, {"text": "和", "at": "@p17~和"},
                                          {"text": "清单", "at": "@p17~清", "accent": True}, {"text": "的人", "at": "@p17~的"}],
     "sub": {"text": "能把环节连起来", "at": p(18)}, "slots_at": "@p18~连-0.1",
     "items": [{"text": "列出清单", "at": p(19)}, {"text": "分好步骤", "at": p(20)}, {"text": "排好时间", "at": p(21)}, {"text": "得到结果", "at": p(22)}]}]},
  {"id": "criteria", "bg": "grey", "start": p(30, -0.3), "end": p(33, -0.3), "layers": [
    {"template": "card_carousel", "header": "怎么评估一个方法 · 三点", "brand": "EXAMPLE", "cards": [
      {"tag": "第一", "at": p(30, -0.3), "lines": [{"text": "能不能"}, {"text": "省下时间？", "highlight": "省下时间"}], "chips": ["时间"], "highlight_at": "@p30~省"},
      {"tag": "第二", "at": p(31, -0.3), "lines": [{"text": "结果稳不稳定", "highlight": "稳不稳定"}, {"text": "能否复用？"}], "chips": ["稳定", "复用"], "highlight_at": "@p31~稳"},
      {"tag": "第三", "at": p(32, -0.3), "lines": [{"text": "出问题时"}, {"text": "方不方便改", "highlight": "方便改"}], "chips": ["修改"], "highlight_at": "@p32#4"}]}]},
  {"id": "product", "bg": "offwhite", "start": p(34, -0.3), "end": p(38, -0.3), "layers": [
    {"template": "editor_mock", "title": "示例应用", "subtitle": "目的相同", "thumb_label": "载入一个文件", "thumb_at": "@p34~载",
     "list": [{"text": "示例条目一", "at": p(35)}, {"text": "示例条目二", "at": p(35, 0.3)}, {"text": "示例条目三", "at": p(36)}],
     "tracks": [{"label": "列表", "at": p(35)}, {"label": "顺序", "at": p(36)}, {"label": "要点", "at": p(37)}],
     "markers": [{"x": 0.3, "at": "@p37~标"}, {"x": 0.62, "at": "@p37~要"}], "select_at": p(37, 0.4),
     "checklist": [{"text": "生成列表", "at": p(35)}, {"text": "排好顺序", "at": p(36)}, {"text": "标记要点", "at": p(37)}]}]},
  {"id": "end", "bg": "dark_end", "start": p(39, -0.3), "end": p(39, 3), "layers": [
    {"template": "neon_end", "lead": {"text": "这就是", "at": p(39)}, "word": {"text": "Demo", "at": "@p39~最"}, "line": {"text": "最想分享的一点", "at": "@p39~最+0.2"}}]}]
}
json.dump(S, open(os.path.join(here, 'scenes.example.json'), 'w'), ensure_ascii=False, indent=1)
print('phrases', len(PH), 'duration', PH[-1]['e'])
