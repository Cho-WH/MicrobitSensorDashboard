"""Regenerate the two WOFF2 assets; normal app builds do not require Python."""
import hashlib
import json
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'public/vendor/pretendard/PretendardVariable.woff2'
OUTPUT = ROOT / 'public/vendor/lab-fonts'
COMMON = ROOT / 'node_modules/pretendard/subset_glyphs.txt'

def ranges(codes):
    groups = []
    for code in sorted(codes):
        if groups and groups[-1][1] + 1 == code:
            groups[-1][1] = code
        else:
            groups.append([code, code])
    return ','.join(f'U+{a:X}' if a == b else f'U+{a:X}-{b:X}' for a, b in groups)

OUTPUT.mkdir(parents=True, exist_ok=True)
codes = set(TTFont(SOURCE).getBestCmap())
# A stable scientific repertoire, independent of the current screen's copy.
scientific = 'µμΩωαβγδεζηθλνξπρστφχψΔΣΠΘΛΦΨℓℏÅÅ°℃℉±×÷−·⋅√∛∞≈≠≤≥∝∑∫∂∇→←↔⇒⇔²³¹⁰⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎'
common = (set(map(ord, COMMON.read_text(encoding='utf-8'))) | set(map(ord, scientific))) & codes
manifest = {'sourceVersion': 'Pretendard 1.3.9', 'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'commonListSha256': hashlib.sha256(COMMON.read_bytes()).hexdigest(), 'scientificCharacters': scientific, 'family': 'Sensor Lab Sans', 'files': []}
css = ['/* Derived from Pretendard 1.3.9, Copyright Kil Hyung-jin, SIL OFL 1.1. See LICENSE. */']
for name, chars in [('core', common), ('extended', codes - common)]:
    font = TTFont(SOURCE, recalcTimestamp=False)
    options = subset.Options()
    options.name_IDs = ['*']
    options.name_legacy = True
    options.name_languages = ['*']
    tool = subset.Subsetter(options)
    tool.populate(unicodes=chars)
    tool.subset(font)
    # Preserve attribution/license; rename the derived font's reserved family name.
    for record in font['name'].names:
        if record.nameID in (1, 2, 3, 4, 6, 16, 17, 25):
            value = record.toUnicode().replace('Pretendard', 'SensorLabSans')
            record.string = value.encode(record.getEncoding())
    font.flavor = 'woff2'
    temp = OUTPUT / (name + '.woff2')
    font.save(temp)
    assert set(TTFont(temp).getBestCmap()) == chars, 'Subset lost supported characters'
    data = temp.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    filename = f'{name}-{digest[:12]}.woff2'
    temp.replace(OUTPUT / filename)
    manifest['files'].append({'role': name, 'file': filename, 'bytes': len(data), 'sha256': digest, 'characters': len(chars)})
    display = 'block' if name == 'core' else 'optional'
    css.append(f"@font-face {{ font-family:'Sensor Lab Sans'; font-style:normal; font-weight:45 920; font-display:{display}; src:url('./{filename}') format('woff2'); unicode-range:{ranges(chars)}; }}")
    print(name, len(chars), len(data))
(OUTPUT / 'fonts.css').write_text('\n'.join(css) + '\n', encoding='utf-8')
(OUTPUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
(OUTPUT / 'LICENSE').write_bytes((SOURCE.parent / 'LICENSE').read_bytes())
