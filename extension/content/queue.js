function enqueueJobs(jobs, type, mode) {
  for (const job of jobs) {
    const key = hashJob(job.title, job.company) + '-' + type;
    const cached = gradeCache.get(key);
    if (cached) {
      const host = createBadge(job.container, key);
      if (host) {
        renderResult(host, cached, job.isListing);
        const tierVal = (cached.tier || cached.grade || '?').toString().toLowerCase();
        applyDimming(job.isListing ? job.container : getDescriptionBody(), mode, tierVal);
      }
      continue;
    }
    if (type === 'detail' && pendingDetails.some(q => hashJob(q.title, q.company) + '-detail' === key)) continue;
    if (type === 'list' && pendingListings.some(q => hashJob(q.title, q.company) + '-list' === key)) continue;

    const host = createBadge(job.container, key);
    if (!host) continue;
    job._host = host;
    if (type === 'detail') pendingDetails.push(job);
    else pendingListings.push(job);
  }
  if (batchTimer) clearTimeout(batchTimer);
  batchTimer = setTimeout(flushQueue, BATCH_DELAY);
}

async function flushQueue() {
  if (isProcessing) return;
  if (pendingDetails.length > 0) {
    isProcessing = true;
    const batch = pendingDetails.splice(0, BATCH_SIZE);
    try { await gradeBatch(batch, 'detail'); }
    finally { isProcessing = false; if (pendingDetails.length > 0 || pendingListings.length > 0) setTimeout(flushQueue, retryDelay); }
  } else if (pendingListings.length > 0) {
    isProcessing = true;
    const batch = pendingListings.splice(0, BATCH_SIZE);
    try { await gradeBatch(batch, 'list'); }
    finally { isProcessing = false; if (pendingDetails.length > 0 || pendingListings.length > 0) setTimeout(flushQueue, retryDelay); }
  }
}
