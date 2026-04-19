async function init() {
  initTooltip();
  await loadCache();

  const { resumeText, keywordHighlight } = await chrome.storage.local.get(['resumeText', 'keywordHighlight']);
  keywordHighlightActive = !!keywordHighlight;
  if (resumeText) extractResumeKeywords(resumeText);

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.keywordHighlight) {
      keywordHighlightActive = !!changes.keywordHighlight.newValue;
      if (keywordHighlightActive) {
        highlightKeywordsInPage();
      } else {
        teardownHighlights(getDescriptionBody());
      }
    }
    if (changes.resumeText) {
      extractResumeKeywords(changes.resumeText.newValue || '');
      if (keywordHighlightActive) {
        teardownHighlights(getDescriptionBody());
        highlightKeywordsInPage();
      }
    }
  });

  const fixStyle = document.createElement('style');
  fixStyle.textContent = `
    span[data-jtr-id] {
      position: relative !important;
      z-index: 9999 !important;
      pointer-events: all !important;
      display: inline-block !important;
    }
  `;
  document.head.appendChild(fixStyle);

  scan();

  const observer = new MutationObserver(() => {
    if (observer._t) clearTimeout(observer._t);
    observer._t = setTimeout(scan, 700);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(scan, POLL_INTERVAL);

  if (window.location.hostname.includes('linkedin.com')) {
    initLinkedInWatchers();
  }
  if (window.location.hostname.includes('glassdoor.com')) {
    initGlassdoorWatchers();
  }
}

init();
