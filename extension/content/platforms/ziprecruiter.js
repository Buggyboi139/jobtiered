function getZipRecruiterDetailJob() {
  const rightPane = qFirst(document,[
    '[data-testid="right-pane"]',
    '.job_details_container',
    '.job-detail-panel',
    '[role="dialog"]',
    '[class*="JobDetail"]',
    '[class*="jobDetail"]',
    'main'
  ]);
  const scope = rightPane || document;

  const titleEl = qFirst(scope, [
    'h1[data-testid="job-title"]',
    '[data-testid="job-title"]',
    'h1',
    'h2.font-bold',
    'h2[class*="text-header"]',
    'h2'
  ]);
  const title = titleEl?.innerText?.trim() || '';
  const container = titleEl?.closest('section,header,div') || titleEl?.parentElement || null;

  let description = qText(scope, [
    '[data-testid="job-details-scroll-container"]',
    '[data-testid="job-description"]',
    '.job_description',
    '.job-description-content',
    '.job-body',
    '[class*="description"]',
    '[class*="Description"]'
  ]);
  if (!description || description.length < 120) {
    const detailText = rightPane?.innerText?.trim() || document.body.innerText?.trim() || '';
    description = detailText.slice(0, DESC_LIMIT);
  }

  const company = qText(scope,[
    '[data-testid="job-company"]',
    '.company-name',
    'a[data-testid="company-name"]',
    'a[href*="/c/"]',
    '[class*="company"]',
    '[class*="Company"]'
  ]);
  const location = qText(scope, [
    '[data-testid="job-location"]',
    '.job-location',
    '[class*="location"]',
    '[class*="Location"]'
  ]);

  return { title, company, location, container, description };
}

function getZipRecruiterListingJobs(jobs) {
  const cards = document.querySelectorAll([
    'article[data-testid="job-result-item"]',
    '[data-testid="job-result-item"]',
    'article.job_result',
    '.job_result_card',
    '[class*="job-results"] > li',
    '[class*="JobResults"] > article',
    'article',
    'li[class*="job"]',
    'div[class*="job_result"]'
  ].join(','));

  const seen = new Set();

  if (cards.length > 0) {
    cards.forEach(card => {
      if (card.querySelector('span[data-jtr-id]')) return;
      const titleEl = qFirst(card,[
        '[data-testid="job-title"]',
        'h2.font-bold',
        '.job-title',
        'h2 a',
        'h3 a',
        'a[class*="job_link"]',
        'a[href*="/jobs/"]',
        'a[href*="/job/"]',
        'h2',
        'h3'
      ]);
      const title = titleEl?.innerText?.trim();
      if (!title || title.length < 4 || title.length > 170 || title.match(/seekers|businesses|hiring|post a job|create alert/i)) return;
      if (titleEl?.closest('[data-testid="right-pane"],[role="dialog"]')) return;

      const linkEl = qFirst(card,['a[href*="/jobs/"]', 'a[href*="/job/"]', 'a[href*="/c/"]']);
      const jobUrl = linkEl?.href || '';
      const key = jobUrl || title;
      if (seen.has(key)) return;
      seen.add(key);

      const company = qText(card, [
        '[data-testid="job-company"]',
        '.company-name',
        'a[href*="/c/"]',
        '[class*="company"]',
        '[class*="Company"]'
      ]);
      const location = qText(card, [
        '[data-testid="job-location"]',
        '.job-location',
        '[class*="location"]',
        '[class*="Location"]'
      ]);
      const badgeContainer = titleEl?.closest('h2,h3,div,article') || titleEl?.parentElement || card;
      jobs.push({ title, description: card.innerText?.slice(0, 1200) || '', container: badgeContainer, isListing: true, company, location, url: jobUrl });
    });
  }

  if (jobs.length === 0) {
    document.querySelectorAll('h2, h3, [data-testid="job-title"], .job-title').forEach(titleEl => {
      const title = titleEl.innerText?.trim();
      if (!title || title.length < 4 || title.length > 170 || title.match(/seekers|businesses|hiring|post a job/i)) return;
      if (titleEl.closest('[data-testid="right-pane"],[role="dialog"]')) return;
      const card = titleEl.closest('article,li,[data-testid="job-result-item"],div[class*="job"]') || titleEl.parentElement?.parentElement;
      if (!card || card.querySelector('span[data-jtr-id]')) return;
      const company = qText(card || document, ['[data-testid="job-company"]', '.company-name', 'a[href*="/c/"]']);
      const location = qText(card || document, ['[data-testid="job-location"]', '.job-location', '[class*="location"]']);
      const linkEl = (card || document).querySelector('a[href*="/jobs/"],a[href*="/job/"]');
      const jobUrl = linkEl?.href || '';
      if (jobUrl && seen.has(jobUrl)) return;
      if (jobUrl) seen.add(jobUrl);
      jobs.push({ title, description: card?.innerText?.slice(0, 1200) || '', container: titleEl.parentElement, isListing: true, company, location, url: jobUrl });
    });
  }
}
