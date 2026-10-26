// Shared open-link installation-mode candidates. Published artifacts stay separate.
import { createPlans } from './build-support.mjs';

export function createPairingTrial(config, template, repository, target = 'temperature') {
  if (!Object.hasOwn(config.targets, target)) throw new Error(`Unknown trial target: ${target}`);
  const modified = structuredClone(template);
  modified.yotta.config['microbit-dal'].bluetooth.pairing_mode = 1;
  const plan = createPlans(config, modified, repository).get(target);
  return { ...plan, key: `${target}-pairing-trial`, artifact: `${target}-pairing-trial-v1` };
}
