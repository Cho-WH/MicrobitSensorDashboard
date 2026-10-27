/** @typedef {{target:HTMLElement,height:number}} PanelHeight */

// Own presentation animations and the shared disclosure interaction.
// Callers still own other DOM updates and focus.
/** @param {HTMLElement} anchor @param {{disclosureRoot?:HTMLElement}} options */
export function createPanelTransition(anchor, { disclosureRoot = anchor } = {}) {
  const doc = anchor.ownerDocument, win = doc.defaultView;
  const motion = win.matchMedia('(prefers-reduced-motion: reduce)');
  /** @type {Animation[]} */ let animations = [];
  let disposed = false;

  function cancel() {
    animations.forEach(animation => animation.cancel());
    animations = [];
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
      animations.push(target.animate([
        {height:`${from}px`,overflow:'clip'}, {height:`${to}px`,overflow:'clip'},
      ], options));
    }
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
  doc.fonts?.addEventListener('loadingdone', cancel);
  motion.addEventListener('change', motionChanged);
  return { capture, play, cancel, dispose() {
    disposed = true;
    cancel();
    disclosureRoot.removeEventListener('click', toggleDisclosure);
    win.removeEventListener('resize', cancel);
    doc.fonts?.removeEventListener('loadingdone', cancel);
    motion.removeEventListener('change', motionChanged);
  } };
}
