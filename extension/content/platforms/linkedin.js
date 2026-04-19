function getLinkedInDetailJob() {
  const title = qText(document,[
    '.job-details-jobs-unified-top-card__job-title h1',
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title h1',
    '.jobs-unified-top-card__job-title',
    '.jobs-details__main-content h1',
    'h1.t-24', 'h1[class*="topcard"]',
    '.top-card-layout__title',
    'h2[class*="top-card-layout__title"]',
    'h1'
  ]);
  const company = qText(document,[
    '.job-details-jobs-unified-top-card__company-name a',
    '.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__company-name',
    'a.topcard__org-name-link',
    '.topcard__flavor',
    '.top-card-layout__card a[data-tracking-control-name="public_jobs_topcard-org-name"]',
    '.job-details-jobs-unified-top-card__primary-description-container a'
  ]);
  const location = qText(document,[
    '.job-details-jobs-unified-top-card__bullet',
    '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
    '.jobs-unified-top-card__bullet',
    '.topcard__flavor--bullet',
    '.top-card-layout__bullet',
    '.job-details-jobs-unified-top-card__primary-description-container span',
    '[aria-label*="location"]'
  ]);
  const container = qFirst(document,[
    '.job-details-jobs-unified-top-card__content--two-pane',
    '.job-details-jobs-unified-top-card__container--two-pane',
    '.jobs-unified-top-card__content--two-pane',
    '.jobs-details__main-content',
    '.topcard',
    '.top-card-layout__entity-info-container'
  ]) || document.querySelector('.jobs-details__main-content h1')?.parentElement
    || document.querySelector('h1')?.parentElement;
  const description = qText(document,[
    '#job-details',
    '.jobs-description-content__text',
    '.jobs-description-content',
    '.jobs-description__content',
    '.jobs-box__html-content',
    '.description__text',
    '.show-more-less-html__markup'
  ]);

  return { title, company, location, container, description };
}

function getLinkedInListingJobs(jobs) {
  const cards = document.querySelectorAll([
    '.job-card-container--clickable',
    '.job-card-container',
    '.jobs-search-results__list-item',
    'li.ember-view.occludable-update',
    '.scaffold-layout__list-item',
    '[data-view-name="job-card"]',
    '[data-occludable-job-id]',
    'li[data-occludable-job-id]',
    '.job-card-list',
    '.jobs-search-results-list__list-item'
  ].join(','));

  cards.forEach(card => {
    if (card.querySelector('span[data-jtr-id]')) return;
    const titleEl = qFirst(card,[
      'a.job-card-list__title--link strong',
      '.job-card-list__title--link strong',
      '.job-card-list__title strong',
      'a.job-card-list__title--link',
      '.artdeco-entity-lockup__title a',
      '.job-card-container__link strong',
      'a.job-card-container__link strong',
      '[data-control-name="job_card_title"]',
      '[aria-label][href*="/jobs/view/"]',
      'a[href*="/jobs/view/"]',
      'strong'
    ]);
    const title = titleEl?.innerText?.trim();
    if (!title || title.length < 3) return;

    const company = qText(card,[
      '.job-card-container__primary-description',
      '.job-card-container__company-name',
      '.artdeco-entity-lockup__subtitle',
      '.job-card-list__entity-lockup-subtitle'
    ]);
    const location = qText(card,[
      '.job-card-container__metadata-item',
      '.job-card-container__metadata-wrapper li',
      '.artdeco-entity-lockup__caption',
      '.job-card-list__entity-lockup-caption',
      'li[class*="metadata"]'
    ]);
    const linkEl = card.querySelector('a[href*="/jobs/view/"]');
    const jobUrl = linkEl?.href || '';
    const snippet = card.innerText?.trim() || '';

    const badgeContainer = titleEl?.closest('h3,h2,div[class*="title"]') || titleEl?.parentElement || card;
    jobs.push({ title, description: snippet.slice(0, 1200), container: badgeContainer, isListing: true, company, location, url: jobUrl });
  });
}

function linkedInJobChanged() {
  lastDetailHash = '';
  const oldBadges = document.querySelectorAll('span[data-jtr-id$="-detail"]');
  oldBadges.forEach(b => b.remove());
  const descEl = getDescriptionBody();
  if (descEl) descEl.removeAttribute('data-jtr-highlighted');
  setTimeout(scan, 300);
  setTimeout(scan, 1000);
  setTimeout(scan, 2500);
}

function initLinkedInWatchers() {
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      linkedInJobChanged();
    }
  }, 500);

  document.addEventListener('click', (e) => {
    const jobCard = e.target.closest(
      '.job-card-container, .job-card-container--clickable, ' +
      '.job-card-list, [data-occludable-job-id], ' +
      '.scaffold-layout__list-item, [data-view-name="job-card"], ' +
      '.jobs-search-results__list-item, a[href*="/jobs/view/"]'
    );
    if (jobCard) {
      setTimeout(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
        }
        linkedInJobChanged();
      }, 400);
    }
  }, true);

  const detailPane = qFirst(document,[
    '.jobs-search__job-details',
    '.jobs-details__main-content',
    '.job-details-jobs-unified-top-card__container--two-pane',
    '#job-details',
    '.jobs-description'
  ]);
  if (detailPane) {
    const linkedInObserver = new MutationObserver(() => {
      if (linkedInObserver._t) clearTimeout(linkedInObserver._t);
      linkedInObserver._t = setTimeout(() => {
        const detailJobs = getDetailJob();
        if (detailJobs) {
          const newHash = hashJob(detailJobs[0].title, detailJobs[0].company);
          if (newHash !== lastDetailHash) {
            linkedInJobChanged();
          }
        }
      }, 500);
    });
    linkedInObserver.observe(detailPane, { childList: true, subtree: true, characterData: true });
  }
}
