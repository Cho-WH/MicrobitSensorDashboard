// Wait for observable state, independently of the simulated clock in review iframes.
export async function until(predicate, message, timeout = 12000) {
  const deadline = performance.now() + timeout;
  while (!predicate()) {
    if (performance.now() >= deadline) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 25));
  }
}

// Allow ResizeObserver/rAF layout work and finite geometry transitions to complete.
// Continuous recording indicators must not block a layout assertion.
export async function rendered(doc = document) {
  let timer;
  const frames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  try {
    await Promise.race([
      (async () => {
        await doc.fonts.ready;
        await frames();
        const geometry = /^(width|height|minWidth|maxWidth|minHeight|maxHeight|left|right|top|bottom|inset.*|margin.*|padding.*|border.*Width|grid.*|flex.*|gap|rowGap|columnGap|transform|translate|scale|rotate|fontSize|lineHeight)$/;
        const animations = doc.getAnimations().filter(animation =>
          animation.playState === 'running' && Number.isFinite(animation.effect?.getComputedTiming().endTime)
          && animation.effect.getKeyframes().some(frame => Object.keys(frame).some(key => geometry.test(key))));
        if (animations.length) {
          await Promise.all(animations.map(animation => animation.finished.catch(() => {})));
          await frames();
        }
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('화면 렌더링 완료 시간 초과')), 5000); }),
    ]);
  } finally { clearTimeout(timer); }
}
