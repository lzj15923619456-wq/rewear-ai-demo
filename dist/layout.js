// Preview owns the simulated status bar; the app owns bottom safe-area padding.
(() => {
  if (new URLSearchParams(location.search).get('preview') !== 'wechat') return;
  document.documentElement.classList.add('wechat-preview');
})();
