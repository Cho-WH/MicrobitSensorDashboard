// Ported from G/ui/guide-layout.js at 59c5c149. Measures inert copies, never live controls.
import { createPanelTransition } from './panel-transition.js';
/** @param {{root:HTMLElement,content:HTMLElement,progress:HTMLElement,equipment:HTMLElement,steps:import('../guide/types.js').GuideStep[],
 * measureSteps:import('../guide/types.js').GuideStep[],createMeasurement:(step:import('../guide/types.js').GuideStep)=>HTMLElement}} options */
export function createGuideLayout({ root, content, progress, equipment, steps, measureSteps, createMeasurement }) {
  let measuredWidth = 0, measuredFont = '';
  let disposed = false;
  const panelTransition = createPanelTransition(content, { disclosureRoot: root });
  const stepOrder = new Map(steps.map((step, index) => [step.id, index]));
  stepOrder.set('quick', -1);
  stepOrder.set('summary', steps.length);

  function fitEquipment() {
    if (disposed || !equipment.getClientRects().length) return;
    if (!matchMedia('(min-width: 851px)').matches) {
      equipment.style.removeProperty('--equipment-image-height');
      return;
    }
    // Budget only the illustrations. Labels, help and instructions retain their
    // natural size; short/zoomed windows may still scroll at the 96px image floor.
    const box = equipment.getBoundingClientRect(), rows = new Map();
    for (const image of equipment.querySelectorAll('.equipment-illustrated img')) {
      const row = Math.round(image.parentElement.getBoundingClientRect().top);
      rows.set(row, Math.max(rows.get(row) ?? 0, image.getBoundingClientRect().height));
    }
    if (!rows.size) return;
    const pictures = [...rows.values()].reduce((sum, height) => sum + height, 0);
    const fixedHeight = box.height - pictures;
    const stage = equipment.closest('.guide');
    const stageInset = stage ? parseFloat(getComputedStyle(stage).paddingBottom) : 0;
    const available = innerHeight - (box.top + scrollY) - 26 - stageInset;
    const height = Math.max(96, Math.min(210, Math.floor((available - fixedHeight) / rows.size)));
    const value = `${height}px`;
    if (equipment.style.getPropertyValue('--equipment-image-height') !== value) equipment.style.setProperty('--equipment-image-height', value);
  }

  function measure(force = false) {
    if (disposed) return;
    const width = content.getBoundingClientRect().width;
    if (!width) return;
    const font = getComputedStyle(content).fontSize;
    if (!force && width === measuredWidth && font === measuredFont) return;
    measuredWidth = width; measuredFont = font;
    let height = 0;
    for (const step of measureSteps) {
      const copy = createMeasurement(step);
      copy.inert = true;
      copy.setAttribute('aria-hidden', 'true');
      copy.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;left:0;top:0;width:${width}px;height:auto;min-height:0;contain:layout;`;
      content.parentElement.append(copy);
      try {
        height = Math.max(height, copy.getBoundingClientRect().height);
      } finally { copy.remove(); }
    }
    content.style.setProperty('--wiring-content-height', `${Math.ceil(height)}px`);
  }

  function syncProgress() {
    if (disposed) return;
    const button = progress.querySelector('[aria-current="step"]');
    const track = progress.getBoundingClientRect();
    if (!button || !track.width) return;
    const bounds = button.getBoundingClientRect();
    progress.style.setProperty('--active-step-x', `${bounds.left - track.left + progress.scrollLeft}px`);
    progress.style.setProperty('--active-step-width', `${bounds.width}px`);
  }

  /** @param {string} stepId @param {string} previous
   * @param {import('./panel-transition.js').PanelHeight[]} previousHeights */
  function transition(stepId, previous, previousHeights) {
    if (disposed || previous === stepId) return;
    const direction = stepOrder.get(stepId) > stepOrder.get(previous) ? 1 : -1;
    panelTransition.play([content], { previousHeights, frames:
      [{ transform: `translateX(${direction * 20}px)`, opacity: 0.65 }, { transform: 'translateX(0)', opacity: 1 }],
    });
  }
  const observer = new ResizeObserver(() => { measure(); syncProgress(); fitEquipment(); });
  observer.observe(content);
  observer.observe(progress);
  observer.observe(equipment);
  window.addEventListener('resize', fitEquipment);
  const fontsChanged = () => { measure(true); syncProgress(); fitEquipment(); };
  document.fonts?.addEventListener('loadingdone', fontsChanged);
  document.fonts?.ready.then(fontsChanged);
  return { measure, syncProgress, transition, captureHeights:panelTransition.capture, transitionContent:panelTransition.play, dispose() {
    disposed = true;
    observer.disconnect();
    window.removeEventListener('resize', fitEquipment);
    document.fonts?.removeEventListener('loadingdone', fontsChanged);
    panelTransition.dispose();
  } };
}
