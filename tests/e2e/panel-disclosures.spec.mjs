import { test, expect } from '@playwright/test';

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
