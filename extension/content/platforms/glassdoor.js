function getGlassdoorDetailJob() {
  const title = qText(document,[
    'h1[class*="heading_Heading__"]',
    'h1[id^="jd-job-title-"]',
    '[data-test="job-title"]', '[data-test="jobTitle"]',
    'h1[data-test]', '[class*="JobDetails_jobTitle"]',
    '[class*="jobTitle"]', '.JobDetails h1', 'h1'
  ]);
  const company = qText(document,[
    'a[class*="EmployerProfile_profileContainer__"]',
    '[data-test="employer-name"]', '[data-test="employerName"]',
    '[class*="EmployerProfile_compactEmployerName"]',
    '[class*="employer-name"]', '.employer-name'
  ]).replace(/[\d.]+\s*$/, '').trim();
  const location = qText(document,[
    '[data-test="emp-location"]', '[data-test="location"]',
    '[class*="location"]', '.location'
  ]);
  const container = qFirst(document,[
    '[data-test="job-details-header"]',
    '[data-test="job-title"]', '[class*="JobDetails_jobTitle"]', '.JobDetails header', 'h1'
  ]) || document.querySelector('h1')?.parentElement;
  let description = qText(document,[
    'div[class*="JobDetails_jobDescription__"]',
    '[data-test="JobDescription"]', '[data-test="job-description-text"]',
    '[class*="JobDescription"]', '[class*="jobDescription"]',
    '#JobDescriptionContainer', '.jobDescriptionContent', '.desc'
  ]);

  if (!description) {
    const pane = qFirst(document, [
      '[data-test="job-detail-body"]', '.JobDetails',
      '#JobDescriptionContainer', '[id^="job-desc-"]'
    ]);
    if (pane) description = pane.innerText?.trim() || '';
  }

  const gdPay = extractGlassdoorPay();
  if (gdPay) {
    const payNormalized = gdPay.replace(/\s+/g, ' ');
    if (!description.includes(payNormalized)) {
      description = `Salary/Pay Information: ${payNormalized}\n\n${description}`;
    }
  }

  return { title, company, location, container, description };
}

function getGlassdoorListingJobs(jobs) {
  const cards = document.querySelectorAll([
    '[data-test="jobListing"]',
    'li[class*="JobsList_jobListItem"]',
    'li[class*="jobCard"]',
    '[class*="JobCard_jobCard"]',
    'article[class*="job"]',
    '[id^="job-listing-"]'
  ].join(','));

  cards.forEach(card => {
    if (card.querySelector('span[data-jtr-id]')) return;
    const titleEl = qFirst(card, [
      'a[data-test="job-link"]',
      '[data-test="job-title"]',
      'a[data-test="job-title"]',
      '[class*="jobTitle"] a',
      '[class*="JobCard_jobTitle"] a',
      'a[href*="/job-listing/"]',
      'a[href*="/partner/jobListing"]',
      '.job-title a', '.job-title'
    ]);
    const title = titleEl?.innerText?.trim();
    if (!title || title.length < 3) return;

    const company = qText(card, [
      '[data-test="employer-name"]',
      '[class*="EmployerProfile_compactEmployerName"]',
      '[class*="employer"]', '.employer-name'
    ]).replace(/[\d.]+\s*$/, '').trim();

    const location = qText(card, [
      '[data-test="emp-location"]', '[data-test="location"]',
      '[class*="location"]', '.location'
    ]);
    const linkEl = qFirst(card, [
      'a[data-test="job-link"]',
      'a[href*="/job-listing/"]',
      'a[href*="/partner/jobListing"]',
      'a[class*="jobLink"]'
    ]);
    const jobUrl = linkEl?.href || '';
    const salary = qText(card, [
      '[data-test="detailSalary"]', '.salary-estimate', '[class*="salary"]', '[class*="Salary"]'
    ]);
    const snippet = (salary ? salary + ' ' : '') + (card.innerText?.trim() || '');
    const badgeContainer = titleEl?.parentElement || card;
    jobs.push({ title, description: snippet.slice(0, 1200), container: badgeContainer, isListing: true, company, location, url: jobUrl });
  });

  if (jobs.length === 0) {
    document.querySelectorAll('a[href*="/job-listing/"], a[href*="/partner/jobListing"]').forEach(a => {
      const title = a.innerText?.trim();
      if (!title || title.length < 3 || a.closest('.sidebar,nav,header')) return;
      const card = a.closest('li,article,[class*="job"]') || a.parentElement;
      if (!card || card.querySelector('span[data-jtr-id]')) return;
      const company = qText(card, ['[class*="employer"]', '[data-test="employer-name"]']).replace(/[\d.]+\s*$/, '').trim();
      const location = qText(card, ['[class*="location"]', '[data-test="emp-location"]']);
      jobs.push({ title, description: card.innerText?.slice(0, 1200) || '', container: a.parentElement || card, isListing: true, company, location, url: a.href });
    });
  }
}

function glassdoorJobChanged() {
  lastDetailHash = '';
  const oldBadges = document.querySelectorAll('span[data-jtr-id$="-detail"]');
  oldBadges.forEach(b => b.remove());
  setTimeout(scan, 600);
  setTimeout(scan, 1500);
  setTimeout(scan, 3000);
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
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
        }
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
      detailObserver._t = setTimeout(() => {
        const detailJobs = getDetailJob();
        if (detailJobs) {
          const newHash = hashJob(detailJobs[0].title, detailJobs[0].company);
          if (newHash !== lastDetailHash) {
            glassdoorJobChanged();
          }
        }
      }, 500);
    });
    detailObserver.observe(detailPane, { childList: true, subtree: true, characterData: true });
  }
}
