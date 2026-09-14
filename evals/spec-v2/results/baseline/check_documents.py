from pathlib import Path
import hashlib
import re
import json

root = Path(__file__).resolve().parent
names = ['概要设计.md', '需求设计文档.md']
docs = {name: (root / name).read_text() for name in names}
checks = []
def check(name, ok):
    checks.append({'check': name, 'passed': bool(ok)})
    if not ok:
        raise AssertionError(name)

def anchors(text):
    explicit = re.findall(r'<a id="([^"]+)"></a>', text)
    headings = re.findall(r'^#{1,6} (.+)$', text, re.M)
    slugs = [re.sub(r'[^\w\-\s]', '', h.lower()).replace(' ', '-') for h in headings]
    return set(explicit + slugs)

expected = {f'D-{i:03d}' for i in range(1, 11)}
definitions = [anchor for text in docs.values() for anchor in re.findall(r'<a id="([^"]+)"></a>', text)]
check('D-001 through D-010 each have exactly one owner', set(definitions) == expected and len(definitions) == len(expected))
index = docs['需求设计文档.md'].split('### 11.4 ', 1)[1]
check('Contract index links every D anchor', set(re.findall(r'\[(D-\d{3})\]', index)) == expected)
coverage = docs['需求设计文档.md'].split('### 11.3 ', 1)[1].split('### 11.4 ', 1)[0]
check('TC-001 through TC-007 have coverage rows', set(re.findall(r'^\| (TC-\d{3}) \|', coverage, re.M)) == {f'TC-{i:03d}' for i in range(1, 8)})
check('AC-001 through AC-008 have requirement rows', set(re.findall(r'^\| (AC-\d{3}) \|', docs['需求设计文档.md'], re.M)) == {f'AC-{i:03d}' for i in range(1, 9)})
for name, content in docs.items():
    check(f'{name}: code fences balanced', len(re.findall(r'^```', content, re.M)) % 2 == 0)
    for label, href in re.findall(r'\[([^\]]+)\]\(([^)]+)\)', content):
        if '://' in href:
            continue
        target, _, fragment = href.partition('#')
        path = root / (target or name)
        check(f'{name}: link {href}', path.is_file() and (not fragment or fragment in anchors(path.read_text())))
check('Detailed design required numbered sections', all(s in docs['需求设计文档.md'] for s in ['## 一、修订历史', '### 2.1 ', '### 2.2 ', '### 3.1 ', '### 3.6 ', '## 四、详细设计', '### 10.5 Planning Handoff', '### 11.2 ', '### 11.3 ', '### 11.4 ']))
for section in [1, 2, 3]:
    check(f'Module 4.{section} has five required subsections', all(f'#### 4.{section}.{n} ' in docs['需求设计文档.md'] for n in range(1, 6)))
check('Draft review status explicit in both documents', all('待' in text and '评审' in text and '未' in text for text in docs.values()))
source = (root/'source.md').read_bytes()
report = {'passed_checks': len(checks), 'checks': checks, 'source_sha256': hashlib.sha256(source).hexdigest(), 'rendered': False, 'implementation_tests_run': False}
(root/'document-check-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2)+'\n')
print(json.dumps({'passed_checks': len(checks), 'source_sha256': report['source_sha256'], 'result': 'PASS'}, ensure_ascii=False))
