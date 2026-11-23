#!/usr/bin/env python3
"""Check the public picture-making pack: hashes, sections, links, font, deps.

Exit 0 means those structural checks passed. It does not watch a video and
does not accept the look of any frame.
"""
from __future__ import annotations

import hashlib
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "docs" / "picture-making"

EXPECTED = {
    '.cursor/skills/saymivo-picture-making/references/delivery-and-archive.md': '235b79241febc74e3841f6cb417098e9ff47040aa98e9b749ba0c4f6ce734ec7',
    '.cursor/skills/saymivo-picture-making/scripts/check_style.py': 'dc54138138ca779afba06e1d762007aeb330def9b71da64ade08a139f82f467c',
    ".cursor/skills/saymivo-picture-making/SKILL.md":
        "16627d270e81bd1aa46be301213443468e68d1c8d8eb101d8eb9583495439ed5",
    ".cursor/skills/skill-1795151255813/SKILL.md":
        "f6d48240ea2eb79c70108d3e8f7df6d8316da520e18ad99af2ce4d0e990c27a4",
    "docs/picture-making/rules/制作执行清单-公开版.md":
        "54497bf85a27579a3be9f9229509f6df39e17a0a693d8bcd86e029386e2a9b04",
    "docs/picture-making/rules/效力与来源映射.md":
        "cbe8786a3b0ff4fef074803ebf5969ab9de45082c48b76602427b8df93981f81",
    "docs/picture-making/rules/阅读入口-公开版.md":
        "8fe74a9e2f97e7e634e347e3c8f8f9f03e0794519b9bcaa40061a445701e65a1",
    "docs/picture-making/style/caption-style.example.ass":
        "6a6b43f2bb8fc405206e14db011e6614e4c560053d1c82e68ec82f99efd7393d",
    "docs/picture-making/style/camera-and-caption.example.json":
        "79c5463ab131f48f2280ecba48f59a22ae0bb02c1030b8f6f594d3bee5ff0d03",
    "docs/picture-making/fixture/build_preview.py":
        "44ae31c2ca08f96fca84bc0deed0bc2cfab017f0fd743707ad2da71aad29c938",
    "docs/picture-making/fixture/picture_compositor.py":
        "56ff713196802c0934a62c06919e8706111813b39ea78493cd55a26caf98dd4f",
    "docs/picture-making/style/fonts/NotoSansSC-Bold.otf":
        "c6cb5a93abaa9edc8ee7463b7ebb7f42d618d40e6ed2f7a5371c97b0b64767c0",
}

CHARTER_SHA = "ad691aa296b45ec85cca832c5b8b524e14ebcf914ea8bcd57c3723c323efd5a7"
LINK_RE = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
SCAN_ROOTS = [
    PACK,
    ROOT / ".cursor" / "skills",
    ROOT / "scripts" / "picture-making",
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    h.update(path.read_bytes())
    return h.hexdigest()


def fail(errors: list[str], message: str) -> None:
    errors.append(message)
    print("FAIL", message)


def check_hashes(errors: list[str]) -> None:
    for rel, expect in EXPECTED.items():
        path = ROOT / rel
        if not path.is_file():
            fail(errors, f"missing {rel}")
            continue
        got = sha256(path)
        if got != expect:
            fail(errors, f"hash {rel}: {got} != {expect}")
        else:
            print("OK hash", rel)


def check_skill_sections(errors: list[str]) -> None:
    text = (ROOT / ".cursor/skills/saymivo-picture-making/SKILL.md").read_text(encoding="utf-8")
    for n in range(1, 13):
        if not re.search(rf"(?m)^## {n}\. ", text):
            fail(errors, f"skill missing section {n}")
    if "执行与验收约束" not in text:
        fail(errors, "skill missing section 12 title")
    startup = (ROOT / ".cursor/skills/skill-1795151255813/SKILL.md").read_text(encoding="utf-8")
    for n in range(1, 8):
        if not re.search(rf"(?m)^{n}\. ", startup):
            fail(errors, f"startup skill missing item {n}")
    print("OK skill sections 1-12 and startup items 1-7")


def check_checklist(errors: list[str]) -> None:
    text = (PACK / "rules" / "制作执行清单-公开版.md").read_text(encoding="utf-8")
    nums = [int(n) for n in re.findall(r"(?m)^(\d+)\. ", text)]
    missing = [n for n in range(1, 65) if n not in nums]
    if missing or len(nums) != 64:
        fail(errors, f"checklist numbers {nums} missing {missing}")
    else:
        print("OK checklist items 1-64")
    for token in ("t92", "t94", "t99", "t127", "第62条", "第63、64条"):
        if token not in text:
            fail(errors, f"checklist missing {token}")
    for rel in (
        "口播视觉制作错题本.md",
        "阅读指南.md",
        "history/t86-执行清单接线核验.md",
    ):
        if not (PACK / "rules" / rel).is_file():
            fail(errors, f"checklist link target missing {rel}")


def check_config_adapter(errors: list[str]) -> None:
    text = (PACK / "project-config.md").read_text(encoding="utf-8")
    required = [
        CHARTER_SHA,
        "SAYMIVO_PRIVATE_CHARTER",
        "cursor/picture-making-pack-94e7",
        "b3d039b7765718b90ff073481fd2802abad71869",
        "未合并",
        "bf7c50de9102448e5e16e6dc2e32662a4371a2fc",
        "5f18b30fd61ef54c00a9ed894f933f68b249f5c8",
        "P-01",
    ]
    for token in required:
        if token not in text:
            fail(errors, f"project-config missing {token}")
    for name in ("README.md", "AGENTS.md", "HANDOFF.md", ".cursor/skills/README.md"):
        body = (ROOT / name).read_text(encoding="utf-8")
        if "docs/picture-making/README.md" not in body and "picture-making/README.md" not in body:
            fail(errors, f"{name} does not link the pack entry")
        if "未合并" not in body:
            fail(errors, f"{name} does not state unmerged status")
    print("OK project-config adapter and entry links")


def iter_markdown() -> list[Path]:
    found = []
    for root in (PACK, ROOT / ".cursor" / "skills"):
        found.extend(root.rglob("*.md"))
    for name in ("README.md", "AGENTS.md", "HANDOFF.md", "docs/experience/README.md", "docs/experience/talking-video-playbook.md"):
        found.append(ROOT / name)
    return found


def check_links(errors: list[str]) -> None:
    checked = 0
    for path in iter_markdown():
        if not path.is_file():
            fail(errors, f"missing linked doc {path}")
            continue
        text = path.read_text(encoding="utf-8")
        for raw in LINK_RE.findall(text):
            target = raw.strip().split()[0]
            if target.startswith(("http://", "https://", "mailto:")):
                continue
            path_part = target.split("#", 1)[0]
            if not path_part:
                continue
            dest = (path.parent / path_part).resolve()
            checked += 1
            if not dest.exists():
                fail(errors, f"broken link in {path.relative_to(ROOT)} -> {target}")
    print(f"OK relative links checked: {checked}")


def check_privacy(errors: list[str]) -> None:
    forbidden = [
        re.compile(r"/Users/"),
        re.compile(r"/home/"),
        re.compile(r"Borumi"),
        re.compile(r"BEGIN (?:RSA |OPENSSH )?PRIVATE KEY"),
        re.compile(r"AKIA[0-9A-Z]{16}"),
        re.compile(r"sk-[A-Za-z0-9]{20,}"),
    ]
    for root in SCAN_ROOTS:
        for path in root.rglob("*"):
            if not path.is_file() or path.name == "verify-package.py":
                continue
            if path.suffix.lower() in {".mp4", ".mov", ".wav", ".m4a", ".srt"}:
                fail(errors, f"media or transcript in pack: {path.relative_to(ROOT)}")
            if path.suffix.lower() not in {".md", ".txt", ".py", ".json", ".ass", ""}:
                continue
            try:
                text = path.read_text(encoding="utf-8")
            except UnicodeError:
                continue
            for i, line in enumerate(text.splitlines(), 1):
                if "/workspace/" in line and "不要" in line:
                    continue
                for pattern in forbidden:
                    if pattern.search(line):
                        fail(errors, f"privacy pattern {pattern.pattern} in {path.relative_to(ROOT)}:{i}")
    print("OK privacy scan")


def check_font(errors: list[str]) -> None:
    font_path = PACK / "style" / "fonts" / "NotoSansSC-Bold.otf"
    try:
        from fontTools.ttLib import TTFont
    except ImportError:
        fail(errors, "fontTools is not installed; cannot read font names")
        return
    font = TTFont(font_path)
    names = {}
    for rec in font["name"].names:
        if rec.nameID in (1, 2, 6) and rec.platformID == 3 and rec.langID == 1033:
            names[rec.nameID] = rec.toUnicode()
    if names.get(1) != "Noto Sans SC" or names.get(2) != "Bold" or names.get(6) != "NotoSansSC-Bold":
        fail(errors, f"unexpected font names {names}")
    else:
        print("OK font family Noto Sans SC Bold")
    if font["OS/2"].usWeightClass != 700:
        fail(errors, f"font weight {font['OS/2'].usWeightClass} != 700")


def check_style_contract(errors: list[str]) -> None:
    ass = (PACK / "style" / "caption-style.example.ass").read_text(encoding="utf-8")
    preview = (PACK / "fixture" / "build_preview.py").read_text(encoding="utf-8")
    for token in ("Noto Sans SC", "64", "&H0060DAF4&", "1180,1038", "BorderStyle"):
        if token not in ass and token != "BorderStyle":
            fail(errors, f"ASS missing {token}")
    if ",3,10," not in ass:
        fail(errors, "ASS missing BorderStyle 3 Outline 10")
    if "224.5, 854.5, 377, 14" not in preview:
        fail(errors, "fixture circle geometry drifted from the example config")
    json_text = (PACK / "style" / "camera-and-caption.example.json").read_text(encoding="utf-8")
    for token in ("224.5", "854.5", "377", "#F4DA60", "1180", "1038"):
        if token not in json_text:
            fail(errors, f"style json missing {token}")
    print("OK style example still matches fixture geometry")


def check_deps(errors: list[str]) -> None:
    missing = []
    for mod in ("PIL", "numpy"):
        try:
            __import__(mod)
        except ImportError:
            missing.append(mod)
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        missing.append("ffmpeg")
    else:
        proc = subprocess.run(
            [ffmpeg, "-hide_banner", "-filters"],
            check=False,
            capture_output=True,
            text=True,
        )
        if " ass " not in f" {proc.stdout} " and " ass " not in proc.stdout:
            # ffmpeg prints " .. ass             V->V"
            if not re.search(r"\bass\b", proc.stdout):
                missing.append("ffmpeg libass filter")
    if missing:
        fail(errors, "missing deps: " + ", ".join(missing))
    else:
        print("OK deps Pillow numpy ffmpeg/libass")


def main() -> int:
    errors: list[str] = []
    check_hashes(errors)
    check_skill_sections(errors)
    check_checklist(errors)
    check_config_adapter(errors)
    check_links(errors)
    check_privacy(errors)
    check_font(errors)
    check_style_contract(errors)
    check_deps(errors)
    print("watched_video=no listened=no aesthetic=not-claimed")
    if errors:
        print(f"RESULT technical=fail count={len(errors)}")
        return 1
    print("RESULT technical=pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
