import { createController } from './controller.js';
import { prepareLuminousShell } from '../ui/luminous-shell.js';
try {
  await prepareLuminousShell(document);
  createController();
} catch(error) {
  const message = document.getElementById('lab-error'); message.hidden = false;
  message.textContent = '실험실을 열지 못했습니다. ' + error.message;
  console.error(error);
}
