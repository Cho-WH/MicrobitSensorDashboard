import { createController } from './controller.js';
try {
  if (new URL(location.href).searchParams.get('visual') === 'luminous') {
    const { prepareLuminousPreview } = await import('../ui/luminous-preview.js');
    await prepareLuminousPreview(document);
  }
  createController();
} catch(error) {
  const message = document.getElementById('lab-error'); message.hidden = false;
  message.textContent = '실험실을 열지 못했습니다. ' + error.message;
  console.error(error);
}
