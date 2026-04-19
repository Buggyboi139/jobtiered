function getDetailJob() {
  const host = window.location.hostname;
  const pageUrl = window.location.href;
  let title = '', description = '', container = null, company = '', location = '';

  if (host.includes('linkedin.com')) {
    const d = getLinkedInDetailJob();
    title = d.title; company = d.company; location = d.location;
    container = d.container; description = d.description;
  } else if (host.includes('indeed.com')) {
    const d = getIndeedDetailJob();
    title = d.title; company = d.company; location = d.location;
    container = d.container; description = d.description;
  } else if (host.includes('glassdoor.com')) {
    const d = getGlassdoorDetailJob();
    title = d.title; company = d.company; location = d.location;
    container = d.container; description = d.description;
  } else if (host.includes('ziprecruiter.com')) {
    const d = getZipRecruiterDetailJob();
    title = d.title; company = d.company; location = d.location;
    container = d.container; description = d.description;
  } else if (host.includes('usajobs.gov')) {
    const d = getUsajobsDetailJob();
    if (d === null) return null;
    title = d.title; company = d.company; location = d.location;
    container = d.container; description = d.description;
  } else if (host.includes('governmentjobs.com')) {
    const d = getGovernmentJobsDetailJob();
    title = d.title; company = d.company; location = d.location;
    container = d.container; description = d.description;
  }

  if (!title || title.toLowerCase().match(/\d+\s+jobs/) || title.length < 3) return null;

  const ldDesc = getJsonLdDescription();
  if (ldDesc.length > 50) description = ldDesc + '\n\n' + description;

  if (!title || !container || !description) return null;

  return[{
    title: title.trim(),
    description: truncate(description.trim(), DESC_LIMIT),
    container, company, location, url: pageUrl
  }];
}

function getListingJobs() {
  const host = window.location.hostname;
  const jobs =[];

  if (host.includes('linkedin.com')) getLinkedInListingJobs(jobs);
  if (host.includes('indeed.com')) getIndeedListingJobs(jobs);
  if (host.includes('glassdoor.com')) getGlassdoorListingJobs(jobs);
  if (host.includes('ziprecruiter.com')) getZipRecruiterListingJobs(jobs);
  if (host.includes('usajobs.gov')) getUsajobsListingJobs(jobs);
  if (host.includes('governmentjobs.com')) getGovernmentJobsListingJobs(jobs);

  return jobs.length ? jobs : null;
}

function scan() {
  chrome.storage.local.get('evalMode').then(({ evalMode }) => {
    const mode = evalMode || 'personal';
    const listingJobs = getListingJobs();
    if (listingJobs?.length > 0) enqueueJobs(listingJobs, 'list', mode);
    const detailJobs = getDetailJob();
    if (detailJobs) {
      const newHash = hashJob(detailJobs[0].title, detailJobs[0].company);
      if (newHash !== lastDetailHash) {
        lastDetailHash = newHash;
        teardownHighlights(getDescriptionBody());
      }
      enqueueJobs(detailJobs, 'detail', mode);
    }
  });
}
