function getIndeedDetailJob() {
  const titleEl = qFirst(document, [
    '[data-testid="simpler-jobTitle"]',
    '[data-testid="jobsearch-JobInfoHeader-title"]',
    '.jobsearch-JobInfoHeader-title',
    'h2.jobTitle', 'h1'
  ]);
  const title = titleEl?.innerText?.replace(/[-–]\s*job post/i, '')?.trim() || '';
  const company = qText(document,[
    '[data-testid="inlineHeader-companyName"] a',
    '[data-testid="inlineHeader-companyName"]',
    '.jobsearch-JobInfoHeader-subtitle .companyName',
    '[data-company-name="true"]'
  ]);
  const location = qText(document, [
    '[data-testid="inlineHeader-companyLocation"]',
    '[data-testid="job-location"]',
    '.jobsearch-JobInfoHeader-subtitle .companyLocation',
    '[data-testid="jobsearch-JobInfoHeader-companyLocation"]'
  ]);
  const container = qFirst(document,['.jobsearch-JobInfoHeader-title-container']) || titleEl?.parentElement;
  const description = qText(document,[
    '#jobDescriptionText',
    '[data-testid="jobsearch-JobComponent-description"]',
    '.jobsearch-jobDescriptionText'
  ]);

  return { title, company, location, container, description };
}

function getIndeedListingJobs(jobs) {
  const cards = document.querySelectorAll([
    '.job_seen_beacon', '.resultContent',
    'li[class*="JobResult"]', '[data-testid="slider_item"]',
    '.jobsearch-ResultsList > li'
  ].join(','));

  cards.forEach(card => {
    if (card.querySelector('span[data-jtr-id]')) return;
    const titleEl = qFirst(card,[
      'h2.jobTitle a', 'h2.jobTitle span[id]',
      '[data-testid="jobTitle"] a', '[data-testid="jobTitle"]',
      '.jobTitle > a', '.jobTitle > span'
    ]);
    const title = titleEl?.innerText?.trim().replace(/\s*new$/i, '');
    if (!title || title.length < 3) return;

    const company = qText(card, [
      '[data-testid="company-name"]', '.companyName', '.company_location .companyName'
    ]);
    const location = qText(card, [
      '[data-testid="text-location"]', '.companyLocation'
    ]);
    const linkEl = qFirst(card, ['a[href*="/viewjob"]', 'a[href*="/rc/clk"]', 'h2.jobTitle a']);
    const jobUrl = linkEl?.href || '';
    const snippet = qText(card,['.job-snippet', '.underShelfFooter', '.metadata']) || card.innerText?.trim() || '';
    const badgeContainer = titleEl?.closest('h2') || titleEl?.parentElement || card;
    jobs.push({ title, description: snippet.slice(0, 1200), container: badgeContainer, isListing: true, company, location, url: jobUrl });
  });
}
