function getUsajobsDetailJob() {
  const pageUrl = window.location.href;
  if (pageUrl.toLowerCase().includes('/search/')) return null;
  const title = qText(document,['h1.usajobs-joa-summary__title', 'h1.job-title', 'h1']);
  const company = qText(document,['.usajobs-joa-summary__department-link', '.usajobs-joa-summary__department', '.agency-name']);
  const location = qText(document,['.usajobs-joa-location__building', '.location-name', '.location']);
  const container = qFirst(document,['h1.usajobs-joa-summary__title', 'h1'])?.parentElement;
  const duties = qText(document,['#duties']);
  const reqs = qText(document, ['#requirements']);
  const quals = qText(document, ['#qualifications']);
  let description = [duties, reqs, quals].filter(Boolean).join('\n\n');
  if (!description) description = qText(document,['.usajobs-joa-section', '.job-description']);
  if (!description) description = document.body.innerText?.trim() || '';

  return { title, company, location, container, description };
}

function getUsajobsListingJobs(jobs) {
  const cards = document.querySelectorAll('.usajobs-search-result--core, .usajobs-search-result, .search-result-item, #search-results > div');
  cards.forEach(card => {
    if (card.querySelector('span[data-jtr-id]')) return;
    const titleEl = qFirst(card,['a.usajobs-search-result--core__title', 'a.search-joa-link', 'h3 a', 'h2 a', 'a.job-title', 'a.job-title-link', 'a[href*="/job/"]']);
    const title = titleEl?.innerText?.trim();
    if (!title || title.length < 3) return;
    const company = qText(card,['.usajobs-search-result--core__department', '.usajobs-search-result--core__agency', '.agency-name', 'h4', '.department']);
    const location = qText(card,['.usajobs-search-result--core__location', '.location-name', '.location']);
    const jobUrl = titleEl?.href || '';
    const snippet = qText(card,['.usajobs-search-result--core__details', '.usajobs-search-result--core__summary', '.summary', '.salary']) || card.innerText?.trim() || '';
    const badgeContainer = titleEl?.parentElement || card;
    jobs.push({ title, description: snippet.slice(0, 1200), container: badgeContainer, isListing: true, company, location, url: jobUrl });
  });

  if (jobs.length === 0) {
    document.querySelectorAll('a.job-title-link, a[href*="/job/"]').forEach(a => {
      const title = a.innerText?.trim();
      if (!title || title.length < 3 || a.closest('nav,header,.filters')) return;
      const card = a.closest('[class*="result"], li, #search-results > div') || a.parentElement?.parentElement;
      if (!card || card.querySelector('span[data-jtr-id]')) return;
      const company = qText(card,['.agency-name', 'h4', '.department']);
      const location = qText(card,['.location-name', '.location']);
      jobs.push({ title, description: card.innerText?.slice(0, 1200) || '', container: a.parentElement || card, isListing: true, company, location, url: a.href });
    });
  }
}
