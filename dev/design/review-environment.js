// Development-only stress conditions. Production bootstrap never imports this.
export async function applyReviewEnvironment(params, doc = document) {
  if (params.get('text') === '200') doc.documentElement.style.fontSize = '200%';
  if (params.get('fallback') === '1') {
    const missing = new FontFace('Review unavailable font', 'url(data:font/woff2;base64,AA==)');
    doc.fonts.add(missing); await missing.load().catch(() => {});
    doc.documentElement.style.setProperty('--sl-font', "'Review unavailable font',system-ui,'Malgun Gothic',sans-serif");
    doc.documentElement.dataset.reviewFont = missing.status;
    const style = doc.createElement('style');
    style.textContent = '*{filter:none!important;backdrop-filter:none!important}'; doc.head.append(style);
  }
  if (params.get('motion') === 'reduce') {
    // Match both JS and CSS branches without changing the user's OS preference.
    const original = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const media = original(query);
      if (query.includes('prefers-reduced-motion: reduce')) Object.defineProperty(media,'matches',{value:true});
      return media;
    };
    const reduced = [];
    function visit(sheet) {
      for (const rule of sheet.cssRules) {
        if (rule.styleSheet) visit(rule.styleSheet);
        if (rule.conditionText?.includes('prefers-reduced-motion:reduce') || rule.conditionText?.includes('prefers-reduced-motion: reduce'))
          reduced.push(...[...rule.cssRules].map(child => child.cssText));
      }
    }
    [...doc.styleSheets].forEach(visit);
    const style = doc.createElement('style'); style.textContent = reduced.join('\n'); doc.head.append(style);
  }
  await doc.fonts.ready;
}
