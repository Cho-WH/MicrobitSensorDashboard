/** @typedef {{target:HTMLElement,height:number}} PanelHeight */

// Own presentation animations and the shared disclosure interaction.
// Callers still own other DOM updates and focus.
/** @param {HTMLElement} anchor @param {{disclosureRoot?:HTMLElement}} options */
export function createPanelTransition(anchor, { disclosureRoot = anchor } = {}) {
  const doc = anchor.ownerDocument, win = doc.defaultView;
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  /** @type {Animation[]} */ let animations = [];
  /** @type {{target:HTMLElement,animation:Animation,to:number}[]} */ let heights = [];
  let fontFrame = null;
  let disposed = false;

  function cancel() {
    animations.forEach(animation => animation.cancel());
    animations = []; heights = [];
    if (fontFrame !== null) win.cancelAnimationFrame(fontFrame);
    fontFrame = null;
  }
  /** Capture before the caller updates content; an interrupted transition retains its visible height.
   * @param {HTMLElement[]} targets @returns {PanelHeight[]} */
  function capture(targets) {
    if (disposed || motion.matches) return [];
    return targets.filter(target => target.getClientRects().length)
      .map(target => ({target,height:target.getBoundingClientRect().height}));
  }
  /** Play after the same synchronous DOM update. Omit previousHeights for an entrance only.
   * @param {HTMLElement[]} targets
   * @param {{previousHeights?:PanelHeight[],frames?:Keyframe[],timing?:KeyframeAnimationOptions}} options */
  function play(targets, { previousHeights = [], frames = [
    {opacity:0.45,transform:'translateY(5px)'}, {opacity:1,transform:'translateY(0)'},
  ], timing = {} } = {}) {
    cancel();
    if (disposed || motion.matches) return;
    const style = win.getComputedStyle(anchor);
    const options = {
      duration:parseFloat(style.getPropertyValue('--sl-motion-panel')),
      easing:style.getPropertyValue('--sl-motion-panel-easing').trim(),
      ...timing,
      // Always release height/overflow/transform to CSS after finishing.
      fill:/** @type {FillMode} */ ('none'),
    };
    // Read all natural heights after cancelling old animations and before new writes.
    const sizes = previousHeights.map(({target,height}) => ({target,from:height,to:target.getBoundingClientRect().height}));
    for (const target of targets) {
      if (target.getClientRects().length) animations.push(target.animate(frames, options));
    }
    for (const {target,from,to} of sizes) {
      if (!from || !to || Math.abs(from-to)<0.5) continue;
      const animation = target.animate([
        {height:`${from}px`,overflow:'clip'}, {height:`${to}px`,overflow:'clip'},
      ], options);
      animations.push(animation); heights.push({target,animation,to});
    }
  }
  function refreshFontHeights() {
    fontFrame = null;
    const active = heights.flatMap(item => {
      const effect = item.animation.effect;
      if (item.animation.playState !== 'running' || !(effect instanceof win.KeyframeEffect)) return [];
      const progress = effect.getComputedTiming().progress;
      if (progress === null || progress >= 1) return [];
      return [{item,effect,progress,frames:effect.getKeyframes(),height:item.target.getBoundingClientRect().height}];
    });
    // Temporarily remove only our height effects to read the natural layout.
    // Restore them synchronously, without cancelling or restarting their clocks.
    for (const {effect} of active) effect.setKeyframes([]);
    const sizes = active.map(entry => ({...entry,to:entry.item.target.getBoundingClientRect().height}));
    for (const {item,effect,progress,frames,height,to} of sizes) {
      if (Math.abs(to-item.to)<0.5) { effect.setKeyframes(frames); continue; }
      effect.setKeyframes([
        ...(progress > 0 ? [{height:frames[0].height,overflow:'clip',offset:0}] : []),
        {height:`${height}px`,overflow:'clip',offset:progress},
        {height:`${to}px`,overflow:'clip',offset:1},
      ]);
      item.to = to;
    }
  }
  function fontsChanged() {
    // Hidden Korean text can request a new subset on its first opening.
    // Reconcile after other font listeners update their layout, not by snapping
    // every panel to its final size as soon as any subset finishes loading.
    if (!disposed && fontFrame === null && heights.some(item => item.animation.playState === 'running'))
      fontFrame = win.requestAnimationFrame(refreshFontHeights);
  }
  /** Delegation also covers disclosures added after the view was mounted.
   * @param {MouseEvent} event */
  function toggleDisclosure(event) {
    if (disposed || event.defaultPrevented || event.button > 0 || !(event.target instanceof Element)) return;
    const summary = event.target.closest('summary'), disclosure = summary?.parentElement;
    if (!(disclosure instanceof HTMLDetailsElement) || !disclosureRoot.contains(disclosure)
      || disclosure.querySelector('summary') !== summary || disclosure.matches('.disclosure-menu')
      || disclosure.closest('[data-ui-motion="none"]')) return;
    // Links and controls inside a summary retain their own activation behavior.
    const control = event.target.closest('a,button,input,select,textarea,[contenteditable]');
    if (control && summary.contains(control)) return;
    // Responsive side panels let their CSS grid interpolate both columns.
    // Keep native disclosure behavior and avoid a simultaneous height effect.
    if (win.getComputedStyle(disclosure).getPropertyValue('--sl-disclosure-axis').trim() === 'inline') return;
    /** @type {HTMLElement[]} */ const targets = [disclosure];
    for (let parent = disclosure.parentElement; parent && disclosureRoot.contains(parent); parent = parent.parentElement) {
      if (parent.hasAttribute('data-ui-height')) targets.push(parent);
    }
    const previousHeights = capture(targets);
    event.preventDefault();
    disclosure.open = !disclosure.open;
    play([], { previousHeights });
  }
  disclosureRoot.addEventListener('click', toggleDisclosure);
  const motionChanged = () => { if (motion.matches) cancel(); };
  win.addEventListener('resize', cancel);
  doc.fonts?.addEventListener('loadingdone', fontsChanged);
  motion.addEventListener('change', motionChanged);
  return { capture, play, cancel, dispose() {
    disposed = true;
    cancel();
    disclosureRoot.removeEventListener('click', toggleDisclosure);
    win.removeEventListener('resize', cancel);
    doc.fonts?.removeEventListener('loadingdone', fontsChanged);
    motion.removeEventListener('change', motionChanged);
  } };
}
