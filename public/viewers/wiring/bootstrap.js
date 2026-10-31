// Show the already-painted skeleton while the scene's dependencies arrive.
import('./viewer.js').catch(error => {
  document.body.dataset.ready = 'error';
  document.getElementById('loading').hidden = true;
  document.getElementById('error').hidden = false;
  console.error(error);
});
