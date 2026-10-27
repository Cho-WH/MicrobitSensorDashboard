// Static styles are declared in lab.html. Resolve a stable face before Canvas
// creation; a failed/slow font must not hold the app or later change its exports.
const fontDecisions = new WeakMap();
const fallbackFont = "system-ui,'Malgun Gothic',sans-serif";

function assertStyles(doc) {
  function visit(sheet) {
    if (!sheet) throw new Error('화면 스타일을 불러오지 못했어요. 새로고침해 주세요.');
    for (const rule of sheet.cssRules) if (rule.type === 3) visit(rule.styleSheet);
  }
  for (const link of doc.querySelectorAll('link[rel="stylesheet"][data-app-style]')) visit(link.sheet);
  if (!doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue('--sl-font').trim())
    throw new Error('기본 화면 스타일을 적용하지 못했어요. 새로고침해 주세요.');
}

export async function prepareAppPresentation(doc = document) {
  assertStyles(doc);
  if (!fontDecisions.has(doc)) {
    fontDecisions.set(doc, settleFont(doc));
    // A new label or student-entered character can load another font subset.
    // Canvas does not repaint automatically when that face becomes available.
    doc.fonts.addEventListener('loadingdone', () => {
      for (const chart of Object.values(globalThis.Chart?.instances ?? {})) {
        if (chart.canvas?.ownerDocument === doc) chart.update('none');
      }
    });
  }
  doc.documentElement.style.setProperty('--sl-font', await fontDecisions.get(doc));
}

// Export/print waits for pending character ranges, with the same bounded fallback
// as startup. This never blocks normal data reception or changes saved readings.
export async function settlePendingFonts(doc = document) {
  let timer;
  try {
    await Promise.race([doc.fonts.ready,
      new Promise(resolve => { timer = setTimeout(resolve, 3000); })]);
  } finally { clearTimeout(timer); }
}

async function settleFont(doc) {
  const font = doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue('--sl-font').trim();
  let timer;
  try {
    const loaded = await Promise.race([
      doc.fonts.load('500 14px ' + font, '센서 실험실').then(faces => faces.length > 0).catch(() => false),
      new Promise(resolve => { timer = setTimeout(() => resolve(false), 3000); }),
    ]);
    return loaded ? font : fallbackFont;
  } finally { clearTimeout(timer); }
}
