function governmentJobsTextAfterLabel(text, label) {
  const re = new RegExp(`${label}\\s*[:\\n]\\s*([^\\n]+)`, 'i');
  const match = String(text || '').match(re);
  return match ? match[1].trim() : '';
}

function governmentJobsBestSectionText() {
  const selectors = [
    '#details-info',
    '#job-details-content',
    '.job-details-content',
    '.job-description',
    '.jobDescription',
    '.summary',
    '[class*="description"]',
    '[class*="Description"]',
    '[class*="details"]',
    '[class*="Details"]',
    'main'
  ];

  for (const sel of selectors) {
    const el = qFirst(document, [sel]);
    const text = el?.innerText?.trim() || '';
    if (text.length > 300) return text;
  }

  return (document.body.innerText || '').trim();
}

function getGovernmentJobsDetailJob() {
  const title = qText(document,[
    'h1.job-header-title',
    '.job-header-title',
    '#pretty-job-title',
    '[data-automation="job-title"]',
    '[class*="job-title"]',
    '[class*="JobTitle"]',
    'h1'
  ]);

  const pageText = document.body.innerText || '';
  const company = qText(document,[
    '.job-details-agency',
    '.agency',
    '.department',
    '.job-header-content',
    '[class*="department"]',
    '[class*="agency"]'
  ]) || governmentJobsTextAfterLabel(pageText, 'Department');

  const location = qText(document,[
    '.job-details-location',
    '.location',
    '[class*="location"]',
    '[class*="Location"]'
  ]) || governmentJobsTextAfterLabel(pageText, 'Location');

  const pay = governmentJobsTextAfterLabel(pageText, 'Salary');
  const type = governmentJobsTextAfterLabel(pageText, 'Job Type');
  const remote = governmentJobsTextAfterLabel(pageText, 'Remote Employment');
  const jobNumber = governmentJobsTextAfterLabel(pageText, 'Job Number');

  const titleEl = qFirst(document,[
    'h1.job-header-title',
    '.job-header-title',
    '#pretty-job-title',
    '[data-automation="job-title"]',
    '[class*="job-title"]',
    'h1'
  ]);
  const container = titleEl?.closest('section,header,div') || titleEl?.parentElement;

  let description = governmentJobsBestSectionText();
  const extras = [
    pay ? `Salary: ${pay}` : '',
    location ? `Location: ${location}` : '',
    type ? `Job Type: ${type}` : '',
    remote ? `Remote: ${remote}` : '',
    jobNumber ? `Job Number: ${jobNumber}` : ''
  ].filter(Boolean).join('\n');

  if (extras && !description.includes(extras)) description = `${extras}\n\n${description}`;

  return { title, company, location, container, description };
}

function getGovernmentJobsListingJobs(jobs) {
  const cards = document.querySelectorAll([
    '.job-item',
    'tr.job-table-row',
    '.list-item',
    '[class*="job-item"]',
    '[class*="JobItem"]',
    '[class*="job-card"]',
    '[class*="JobCard"]',
    'article',
    'li'
  ].join(','));

  const seen = new Set();

  cards.forEach(card => {
    if (card.querySelector('span[data-jtr-id]')) return;
    const titleEl = qFirst(card,[
      '.job-item-title a',
      'h3 a',
      'h2 a',
      'a[href*="/careers/"][href*="/jobs/"]',
      'a[href*="/jobs/"]',
      '[class*="title"] a',
      '[class*="Title"] a'
    ]);
    const title = titleEl?.innerText?.trim();
    if (!title || title.length < 3 || title.length > 160) return;

    const jobUrl = titleEl?.href || '';
    const key = jobUrl || title;
    if (seen.has(key)) return;
    seen.add(key);

    const text = card.innerText?.trim() || '';
    if (!text || /sign in|create account|privacy policy/i.test(title)) return;

    const company = qText(card, [
      '.job-item-agency',
      '.department',
      '.agency',
      '[class*="department"]',
      '[class*="agency"]'
    ]) || governmentJobsTextAfterLabel(text, 'Department');

    const location = qText(card,[
      '.job-item-location',
      '.location',
      '[class*="location"]',
      '[class*="Location"]'
    ]) || governmentJobsTextAfterLabel(text, 'Location');

    const pay = governmentJobsTextAfterLabel(text, 'Salary');
    const snippet = [pay ? `Salary: ${pay}` : '', text].filter(Boolean).join('\n');
    const badgeContainer = titleEl?.closest('h2,h3,div,td') || titleEl?.parentElement || card;

    jobs.push({ title, description: snippet.slice(0, 1200), container: badgeContainer, isListing: true, company, location, url: jobUrl });
  });
}
