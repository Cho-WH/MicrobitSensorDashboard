import { element } from '../../../ui/dom.js';
import { presets, normalizeSettings } from './settings.js';

// Same sensor-owned controls in the common preparation slot and settings dialog.
export function createSettingsView(host, { onAction }) {
  const abort = new AbortController(), field = element('label', 'sensor-setting-field');
  const select = element('select'), description = element('p', 'lab-note');
  host.classList.add('sensor-settings');
  select.dataset.sensorSetting = 'preset';
  for (const p of presets) { const option = element('option', '', p.name); option.value = p.id; select.append(option); }
  select.addEventListener('change', () => onAction('preset:' + select.value), { signal: abort.signal });
  field.append(element('span', 'sensor-setting-label', '측정 모드'), select);
  host.replaceChildren(field, description);
  return {
    render({ settings, locked, connected, busy }) {
      const value = normalizeSettings(settings);
      select.value = value.preset; select.disabled = locked || busy || !connected;
      const text = presets.find(p => p.id === value.preset).description;
      if (description.textContent !== text) description.textContent = text;
    },
    dispose() { abort.abort(); host.classList.remove('sensor-settings'); host.replaceChildren(); },
  };
}
