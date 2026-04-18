// UPDATED PARSING LOGIC: Ignore [ ] brackets and strictly extract the JSON object
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('No JSON found in response');
    }
    raw = raw.substring(start, end + 1);

    let parsed = JSON.parse(raw);
    function lcKeys(o) {
      if (Array.isArray(o)) return o.map(lcKeys);
      if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) => [k.toLowerCase().trim(), lcKeys(v)]));
      return o;
    }
    parsed = lcKeys(parsed);

    let results = parsed.results && Array.isArray(parsed.results) ? parsed.results
      : Array.isArray(parsed) ? parsed : [parsed];

    const currentSaved = savedJobs || [];
    let changed = false;

    results.forEach((result, i) => {
      const idx = result.job_index !== undefined ? result.job_index : i;
      const job = jobs[idx];
      if (!job) return;

      const tierVal = (result.tier || result.grade || '?').toString().toLowerCase();
      const jobKey = hashJob(job.title, job.company) + '-' + type;

      gradeCache.set(jobKey, result);
      renderResult(job._host, result);

      const dimmingTarget = job.isListing ? job.container : getDescriptionBody();
      applyDimming(dimmingTarget, mode, tierVal);

      if (type === 'detail' && (tierVal === 's' || tierVal === 'a')) {
        const dedupKey = (job.url || '') + '|' + job.title;
        if (!currentSaved.some(s => ((s.url || '') + '|' + s.title) === dedupKey)) {
          currentSaved.push({
            title: job.title.substring(0, 80),
            company: job.company || '',
            location: job.location || '',
            url: job.url || '',
            tier: tierVal.toUpperCase(),
            pay: result.estimated_pay || result.pay || 'Listed',
            marketRange: result.market_range || '',
            fit: result.fit_score || '',
            date: new Date().toISOString().split('T')[0],
            description: (job.description || '').substring(0, SAVED_DESC_LIMIT),
            applied: false,
            stage: 'saved',
            reasoning: result.reasoning || '',
            pros: result.pros || [],
            flags: result.red_flags || result.flags || []
          });
          changed = true;
        }
      }
    });

    if (changed) {
      while (currentSaved.length > 100) currentSaved.shift();
      chrome.storage.local.set({ savedJobs: currentSaved });
    }

    if (type === 'detail') setTimeout(highlightKeywordsInPage, 400);
    persistCache();
  } catch (err) {
    let msg = err.message || 'Error';
    if (msg.toLowerCase().includes('rate limit')) { msg = 'Rate Limited'; retryDelay = Math.min(retryDelay * 2, 30000); }
    else if (msg.toLowerCase().includes('license')) msg = 'License Required';
    else if (msg.includes('JSON') || msg.includes('Unexpected token')) msg = 'Parse Error';
    else if (msg.length > 22) msg = 'API Error';
    console.warn('[JTR]', err.message);
    jobs.forEach(j => renderError(j._host, msg));
  }
}

function enqueueJobs(jobs, type, mode) {
  for (const job of jobs) {
    const key = hashJob(job.title, job.company) + '-' + type;
    const cached = gradeCache.get(key);
    if (cached) {
      const host = createBadge(job.container, key);
      if (host) {
        renderResult(host, cached);
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

function scan() {
  chrome.storage.local.get('evalMode').then(({ evalMode }) => {
    const mode = evalMode || 'personal';
    const listingJobs = getListingJobs();
    if (listingJobs?.length > 0) enqueueJobs(listingJobs, 'list', mode);
    const detailJobs = getDetailJob();
    if (detailJobs) enqueueJobs(detailJobs, 'detail', mode);
  });
}

async function init() {
  initTooltip();
  await loadCache();

  const { resumeText, keywordHighlight } = await chrome.storage.local.get(['resumeText', 'keywordHighlight']);
  keywordHighlightActive = !!keywordHighlight;
  if (resumeText) extractResumeKeywords(resumeText);

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.keywordHighlight) keywordHighlightActive = !!changes.keywordHighlight.newValue;
  });

  const fixStyle = document.createElement('style');
  fixStyle.textContent = `
    span[data-jtr-id] {
      position: relative !important;
      z-index: 9999 !important;
      pointer-events: all !important;
      display: inline-block !important;
    }
  `;
  document.head.appendChild(fixStyle);

  scan();

  const observer = new MutationObserver(() => {
    if (observer._t) clearTimeout(observer._t);
    observer._t = setTimeout(scan, 700);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  setInterval(scan, POLL_INTERVAL);
}

init();