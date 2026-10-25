// Dependency-free entry: dynamic import failures are caught here as well as
// runtime errors. If this script itself fails, the HTML recovery hint remains.
void (async () => {
  const notice = document.getElementById('app-startup');
  const message = document.getElementById('startup-message');
  const timer = setTimeout(() => {
    if (document.documentElement.dataset.appState === 'loading')
      message.textContent = '화면을 여는 데 시간이 걸리고 있어요. 연결 상태를 확인하고 새로고침해 주세요.';
  }, 15000);
  try {
    const { startApp } = await import('./startup.js');
    await startApp();
  } catch (error) {
    document.documentElement.dataset.appState = 'error';
    notice.hidden = false; notice.setAttribute('role', 'alert');
    message.textContent = '실험실을 열지 못했어요. 연결 상태를 확인하고 새로고침해 주세요.';
    console.error(error);
  } finally { clearTimeout(timer); }
})();
