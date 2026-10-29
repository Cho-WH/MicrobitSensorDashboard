import { test, expect } from '@playwright/test';

test('a font first used by a disclosure cannot cancel its first opening or clip the revealed content', async ({ page }) => {
  let releaseFont, requestedFont;
  const fontGate = new Promise(resolve => { releaseFont = resolve; });
  const fontRequested = new Promise(resolve => { requestedFont = resolve; });
  await page.route('**/PretendardVariable.woff2?disclosure-test', async route => {
    requestedFont(); await fontGate; await route.continue();
  });
  await page.goto('/sensors/temperature/?view=preview');
  await page.locator('#activate-experiment').click();
  await expect(page.locator('[data-guide-action="confirm"]')).toBeEnabled();
  await page.evaluate(async () => {
    await document.fonts.ready;
    const font = new FontFace('DisclosureDelayed', 'url(/public/vendor/pretendard/PretendardVariable.woff2?disclosure-test)');
    document.fonts.add(font);
    // Lengthen only this fixture's motion so the real font round trip fits
    // inside it even on CI. No product duration or pixel size is asserted.
    document.querySelector('.lab-shell').style.setProperty('--sl-motion-panel', '1500ms');
    const detail = document.createElement('details'); detail.dataset.testDisclosure = 'font';
    detail.innerHTML = '<summary>First opening fixture</summary><div style="max-width:20rem;font:20px DisclosureDelayed,monospace"><p></p><label>Draft <input value="Keep my draft"></label></div>';
    detail.querySelector('p').textContent = 'iii iii iii iii iii iii '.repeat(25);
    document.querySelector('#guide-host').append(detail);
    document.addEventListener('click', () => {
      window.fontDisclosureResult = Promise.all(detail.getAnimations().map(animation =>
        animation.finished.then(() => 'finished', () => 'cancelled')));
    }, {once:true});
  });
  const detail = page.locator('[data-test-disclosure="font"]');
  await detail.locator('summary').click();
  await fontRequested; releaseFont();
  const result = await page.evaluate(async () => {
    await document.fonts.ready;
    return window.fontDisclosureResult;
  });
  expect(result.length).toBeGreaterThan(0);
  expect(result.every(state => state === 'finished')).toBe(true);
  const field = detail.getByRole('textbox', { name: 'Draft' });
  await expect(field).toHaveValue('Keep my draft');
  expect(await field.evaluate(input => input.getBoundingClientRect().bottom <= input.closest('details').getBoundingClientRect().bottom)).toBe(true);
  await field.fill('Still editable');
  await expect(field).toBeFocused();
});

test('new disclosures work in app and nested guide scopes without losing input or keyboard focus', async ({ page }) => {
  await page.goto('/sensors/temperature/?view=preview');
  await page.locator('#activate-experiment').click();
  await expect(page.locator('[data-guide-action="confirm"]')).toBeEnabled();
  // Added after binding: neither the app nor the guide gets another setup call.
  await page.evaluate(() => {
    for (const [selector, name] of [['#guide-host', 'app'], ['.step-panel', 'guide']]) {
      const detail = document.createElement('details');
      detail.dataset.testDisclosure = name;
      detail.innerHTML = `<summary><span>${name} fixture</span> <button type="button">Nested action</button></summary><label>Draft <input></label>`;
      document.querySelector(selector).append(detail);
    }
  });
  for (const name of ['app', 'guide']) {
    const detail = page.locator(`[data-test-disclosure="${name}"]`), summary = detail.locator('summary');
    await summary.focus();
    await summary.press('Enter');
    await expect(detail).toHaveAttribute('open', '');
    await detail.getByRole('textbox', { name: 'Draft' }).fill('Keep my draft');
    await summary.focus();
    await summary.press('Space');
    await expect(detail).not.toHaveAttribute('open', '');
    await expect(summary).toBeFocused();
    await detail.getByRole('button', { name: 'Nested action' }).click();
    await expect(detail).not.toHaveAttribute('open', '');
    await summary.getByText(`${name} fixture`, { exact: true }).click();
    await expect(detail.getByRole('textbox', { name: 'Draft' })).toHaveValue('Keep my draft');
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const guide = page.locator('[data-test-disclosure="guide"]');
  await guide.locator('summary').focus();
  await guide.locator('summary').press('Space');
  await expect(guide).not.toHaveAttribute('open', '');
  await guide.locator('summary').press('Enter');
  await expect(guide.getByRole('textbox', { name: 'Draft' })).toHaveValue('Keep my draft');
});
