function maybeGlassdoorDetailChanged() {
  const detailJobs = getDetailJob();
  if (!detailJobs) return;
  chrome.storage.local.get('evalMode').then(({ evalMode }) => {
    const mode = evalMode || 'personal';
    const newHash = buildJobCacheKey(detailJobs[0], 'detail', mode);
    if (newHash !== lastDetailHash) glassdoorJobChanged();
  });
}

function initGlassdoorWatchers() {
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      glassdoorJobChanged();
    }
  }, 500);

  document.addEventListener('click', (e) => {
    const jobCard = e.target.closest(
      '[data-test="jobListing"], li[class*="JobsList"],[class*="JobCard"], ' +
      'a[href*="/job-listing/"], a[href*="/partner/jobListing"], a[data-test="job-link"], ' +
      '[id^="job-listing-"],[class*="jobCard"]'
    );
    if (jobCard) {
      setTimeout(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) lastUrl = currentUrl;
        glassdoorJobChanged();
      }, 300);
    }
  }, true);

  const detailPane = qFirst(document,[
    '[data-test="job-detail-body"]',
    '.JobDetails',
    '[class*="JobDetail"]',
    '#JobDescriptionContainer',
    '[class*="jobDetail"]',
  ]);
  if (detailPane) {
    const detailObserver = new MutationObserver(() => {
      if (detailObserver._t) clearTimeout(detailObserver._t);
      detailObserver._t = setTimeout(maybeGlassdoorDetailChanged, 500);
    });
    detailObserver.observe(detailPane, { childList: true, subtree: true, characterData: true });
  }
}
