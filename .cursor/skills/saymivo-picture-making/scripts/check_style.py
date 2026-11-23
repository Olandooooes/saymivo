#!/usr/bin/env python3
"""Compare verified project style fields with render evidence (JSON objects).

Policy: reference, approved (flat field/value map), canvas [w,h],
optional camera [x,y,w,h]. Evidence: computed (flat map), and critical
(named map of [x,y,w,h] bounds in the same canvas coordinate system).
"""
import argparse
import json
from pathlib import Path


def check(policy, evidence):
    issues = []
    if not policy.get("reference"):
        issues.append("未检查: 缺认可参考依据")
    approved = policy["approved"]
    if not approved:
        issues.append("未检查: 无已核准的样式数值")
    for key, value in approved.items():
        actual = evidence["computed"].get(key)
        if actual != value:
            status = "未检查" if actual is None else "未通过"
            issues.append(f"{status}: {key} 实际 {actual!r}，核准 {value!r}")
    width, height = policy["canvas"]
    if not evidence["critical"]:
        issues.append("未检查: 缺关键内容边界")
    for name, (x, y, w, h) in evidence["critical"].items():
        if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > width or y + h > height:
            issues.append(f"未通过: {name} 越出画布或无有效尺寸")
        if policy.get("camera"):
            a, b, c, d = policy["camera"]
            if max(x, a) < min(x + w, a + c) and max(y, b) < min(y + h, b + d):
                issues.append(f"未通过: {name} 侵入实拍预留区")
    return issues


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("policy", type=Path)
    parser.add_argument("evidence", type=Path)
    args = parser.parse_args()
    findings = check(json.loads(args.policy.read_text()), json.loads(args.evidence.read_text()))
    for finding in findings:
        print(finding)
    if not findings:
        print("通过: 输入字段与边界检查。视觉均衡另看实物。")
    raise SystemExit(bool(findings))
