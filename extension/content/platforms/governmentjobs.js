function getGovernmentJobsDetailJob() {
  const title = qText(document,['h1.job-header-title', '.job-header-title', '#pretty-job-title', 'h1', '.job-details-title']);
  const company = qText(document,['.job-details-agency', '.agency', '.department', '.job-header-content']);
  const location = qText(document,['.job-details-location', '.location']);
  const container = qFirst(document,['h1.job-header-title', '.job-header-title', 'h1', '.job-details-title'])?.parentElement;
  const description = qText(document,['#details-info', '.job-details-content', '#job-details-content', '.job-description', '.summary']);

  return { title, company, location, container, description };
}

function getGovernmentJobsListingJobs(jobs) {
  const cards = document.querySelectorAll('.job-item, tr.job-table-row, .list-item');
  cards.forEach(card => {
    if (card.querySelector('span[data-jtr-id]')) return;
    const titleEl = qFirst(card,['.job-item-title a', 'h3 a', 'a[href*="/jobs/"]']);
    const title = titleEl?.innerText?.trim();
    if (!title || title.length < 3) return;
    const company = qText(card, ['.job-item-agency', '.department', '.agency']);
    const location = qText(card,['.job-item-location', '.location']);
    const jobUrl = titleEl?.href || '';
    const snippet = qText(card,['.job-item-snippet', '.summary']) || card.innerText?.trim() || '';
    const badgeContainer = titleEl?.parentElement || card;
    jobs.push({ title, description: snippet.slice(0, 1200), container: badgeContainer, isListing: true, company, location, url: jobUrl });
  });
}
