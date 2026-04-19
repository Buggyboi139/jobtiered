function getZipRecruiterDetailJob() {
  const rightPane = qFirst(document,[
    '[data-testid="right-pane"]', '.job_details_container',
    '.job-detail-panel', '[role="dialog"]', '[class*="JobDetail"]'
  ]);
  const scope = rightPane || document;

  const titleEl = qFirst(scope, [
    'h1[data-testid="job-title"]', '[data-testid="job-title"]',
    'h2.font-bold', 'h1', 'h2[class*="text-header"]', 'h2'
  ]);
  const title = titleEl?.innerText?.trim() || '';
  const container = titleEl?.parentElement || null;

  const description = qText(scope, [
    '[data-testid="job-details-scroll-container"]', '.job_description',
    '[data-testid="job-description"]', '.job-description-content', '.job-body'
  ]);
  const company = qText(scope,[
    '[data-testid="job-company"]', '.company-name',
    'a[data-testid="company-name"]', '[class*="company"]'
  ]);
  const location = qText(scope, [
    '[data-testid="job-location"]', '.job-location', '[class*="location"]'
  ]);

  return { title, company, location, container, description };
}

function getZipRecruiterListingJobs(jobs) {
  const cards = document.querySelectorAll([
    'article[data-testid="job-result-item"]',
    '[data-testid="job-result-item"]',
    'article.job_result', '.job_result_card',
    '[class*="job-results"] > li',
    '[class*="JobResults"] > article'
  ].join(','));

  if (cards.length > 0) {
    cards.forEach(card => {
      if (card.querySelector('span[data-jtr-id]')) return;
      const titleEl = qFirst(card,[
        '[data-testid="job-title"]', 'h2.font-bold',
        '.job-title', 'h2 a', 'a[class*="job_link"]', 'h2'
      ]);
      const title = titleEl?.innerText?.trim();
      if (!title || title.length < 4 || title.match(/seekers|businesses|hiring/i)) return;
      if (titleEl?.closest('[data-testid="right-pane"],[role="dialog"]')) return;

      const company = qText(card, ['[data-testid="job-company"]', '.company-name', '[class*="company"]']);
      const location = qText(card, ['[data-testid="job-location"]', '.job-location', '[class*="location"]']);
      const linkEl = qFirst(card,['a[href*="/jobs/"]', 'a[href*="/job/"]', 'a[href*="/c/"]']);
      const jobUrl = linkEl?.href || '';
      const badgeContainer = titleEl?.parentElement || card;
      jobs.push({ title, description: card.innerText?.slice(0, 1200) || '', container: badgeContainer, isListing: true, company, location, url: jobUrl });
    });
  }

  if (jobs.length === 0) {
    document.querySelectorAll('h2, [data-testid="job-title"], .job-title').forEach(titleEl => {
      const title = titleEl.innerText?.trim();
      if (!title || title.length < 4 || title.match(/seekers|businesses/i)) return;
      if (titleEl.closest('[data-testid="right-pane"],[role="dialog"]')) return;
      if (titleEl.parentElement?.querySelector('span[data-jtr-id]')) return;
      const card = titleEl.closest('article,li,[data-testid="job-result-item"]') || titleEl.parentElement?.parentElement;
      const company = qText(card || document, ['[data-testid="job-company"]', '.company-name']);
      const location = qText(card || document, ['[data-testid="job-location"]', '.job-location']);
      const linkEl = (card || document).querySelector('a[href*="/jobs/"],a[href*="/job/"]');
      jobs.push({ title, description: card?.innerText?.slice(0, 1200) || '', container: titleEl.parentElement, isListing: true, company, location, url: linkEl?.href || '' });
    });
  }
}
