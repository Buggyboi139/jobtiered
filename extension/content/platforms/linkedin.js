function getLinkedInDetailJob() {
  const description = qText(document,[
    '[data-test-id="expandable-text-box"]',
    '#job-details',
    '.jobs-description-content__text',
    '.jobs-description-content',
    '.jobs-description__content',
    '.jobs-box__html-content',
    '.description__text',
    '.show-more-less-html__markup'
  ]);

  const title = qText(document,[
    '.job-details-jobs-unified-top-card__job-title h1',
    '.job-details-jobs-unified-top-card__job-title',
    '.jobs-unified-top-card__job-title h1',
    '.jobs-unified-top-card__job-title',
    '.top-card-layout__title',
    'h1'
  ]);

  let company = '';
  const companyLinks = document.querySelectorAll('a[href*="/company/"]');
  for (const cl of companyLinks) {
    if (cl.closest('nav,header,footer,[role="navigation"],[role="banner"]')) continue;
    const txt = cl.innerText?.trim();
    if (txt && txt.length > 1 && txt.length < 80) { company = txt; break; }
  }
  if (!company) {
    company = qText(document,[
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name'
    ]);
  }

  let location = '';
  const descAnchor = document.querySelector('[data-test-id="expandable-text-box"], #job-details');
  if (descAnchor) {
    const detailRoot = descAnchor.closest('div[class]')?.parentElement?.parentElement;
    if (detailRoot) {
      const textContent = detailRoot.innerText || '';
      const locMatch = textContent.match(/([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})\b/);
      if (locMatch) location = locMatch[1].trim();
    }
  }
  if (!location) {
    location = qText(document,[
      '.job-details-jobs-unified-top-card__bullet',
      '.jobs-unified-top-card__bullet',
      '[aria-label*="location"]'
    ]);
  }

  const h1El = document.querySelector('h1');
  const container = qFirst(document,[
    '.job-details-jobs-unified-top-card__content--two-pane',
    '.jobs-unified-top-card__content--two-pane',
    '.jobs-details__main-content'
  ]) || h1El?.parentElement?.parentElement || h1El?.parentElement;

  return { title, company, location, container, description };
}

function getLinkedInListingJobs(jobs) {
  const seenUrls = new Set();

  const cards = document.querySelectorAll([
    '.job-card-container--clickable',
    '.job-card-container',
    '.scaffold-layout__list-item',
    '[data-view-name="job-card"]',
    '[data-occludable-job-id]',
    'li[data-occludable-job-id]'
  ].join(','));

  if (cards.length > 0) {
    cards.forEach(card => {
      if (card.querySelector('span[data-jtr-id]')) return;
      const titleEl = qFirst(card,[
        'a.job-card-list__title--link strong',
        '.artdeco-entity-lockup__title a',
        '.job-card-container__link strong',
        'a[href*="/jobs/view/"] strong',
        'a[href*="/jobs/view/"]',
        'strong'
      ]);
      const title = titleEl?.innerText?.trim();
      if (!title || title.length < 3) return;
      const linkEl = card.querySelector('a[href*="/jobs/view/"]');
      const jobUrl = linkEl?.href || '';
      if (jobUrl) seenUrls.add(jobUrl);
      const company = qText(card,[
        '.job-card-container__primary-description',
        '.artdeco-entity-lockup__subtitle'
      ]) || '';
      const location = qText(card,[
        '.job-card-container__metadata-item',
        '.artdeco-entity-lockup__caption'
      ]) || '';
      const snippet = card.innerText?.trim() || '';
      const badgeContainer = titleEl?.closest('h3,h2,div') || titleEl?.parentElement || card;
      jobs.push({ title, description: snippet.slice(0, 1200), container: badgeContainer, isListing: true, company, location, url: jobUrl });
    });
  }

  if (jobs.length === 0) {
    const jobLinks = document.querySelectorAll('a[href*="/jobs/view/"]');
    jobLinks.forEach(link => {
      if (link.closest('nav,header,footer,[role="navigation"],[role="banner"]')) return;
      const href = link.href || '';
      if (seenUrls.has(href)) return;
      const li = link.closest('li');
      if (!li) return;
      if (li.querySelector('span[data-jtr-id]')) return;
      const title = link.innerText?.trim() || li.querySelector('strong')?.innerText?.trim() || '';
      if (!title || title.length < 3) return;
      seenUrls.add(href);

      let company = '';
      const companyEl = li.querySelector('a[href*="/company/"]');
      if (companyEl && companyEl !== link) company = companyEl.innerText?.trim() || '';
      if (!company) {
        const spans = li.querySelectorAll('span');
        for (const s of spans) {
          const t = s.innerText?.trim();
          if (t && t.length > 1 && t.length < 60 && t !== title && !t.includes('ago') && !t.includes('applicant')) {
            company = t;
            break;
          }
        }
      }

      let location = '';
      const liText = li.innerText || '';
      const locMatch = liText.match(/([A-Z][a-zA-Z\s]+,\s*[A-Z]{2})\s*\(?/);
      if (locMatch) location = locMatch[1].trim();

      const badgeContainer = link.closest('div') || link.parentElement || li;
      jobs.push({ title, description: liText.slice(0, 1200), container: badgeContainer, isListing: true, company, location, url: href });
    });
  }
}

function linkedInJobChanged() {
  lastDetailHash = '';
  const oldBadges = document.querySelectorAll('span[data-jtr-id$="-detail"]');
  oldBadges.forEach(b => b.remove());
  teardownHighlights(getDescriptionBody());
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
    const target = e.target.closest('a[href*="/jobs/view/"], a[href*="/jobs/search"], li, [data-occludable-job-id]');
    if (target) {
      setTimeout(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
        }
        linkedInJobChanged();
      }, 400);
    }
  }, true);

  const descEl = document.querySelector('[data-test-id="expandable-text-box"], #job-details, .jobs-description__content');
  const observeTarget = descEl?.parentElement || document.querySelector('main') || document.body;
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
  linkedInObserver.observe(observeTarget, { childList: true, subtree: true });
}
