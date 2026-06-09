(function () {
  const managedStatuses = new Set(['valid', 'lifetime', 'offline']);

  try {
    LICENSE_LABELS.none.text = 'No Plan';
    LICENSE_LABELS.lifetime = { text: 'Lifetime', cls: 'valid' };
  } catch (_) {}

  const originalStorageGet = chrome.storage.local.get.bind(chrome.storage.local);
  chrome.storage.local.get = async function patchedStorageGet(keys) {
    const data = await originalStorageGet(keys);
    const requestedLicenseStatus = keys === 'licenseStatus' ||
      (Array.isArray(keys) && keys.includes('licenseStatus')) ||
      (keys && typeof keys === 'object' && Object.prototype.hasOwnProperty.call(keys, 'licenseStatus')) ||
      keys == null;

    if (requestedLicenseStatus && data?.licenseStatus === 'lifetime') {
      data.licenseStatus = 'valid';
      data.licenseKind = 'lifetime';
    }
    return data;
  };

  function stableHash(input) {
    const str = String(input || '');
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36);
  }

  function normalizeTier(value) {
    const tier = String(value || '?').toUpperCase().replace('~', '').trim();
    return ['S', 'A', 'B', 'C', 'D', 'F'].includes(tier) ? tier : '?';
  }

  function normalizeJobUrl(url) {
    if (!url) return '';
    try {
      const u = new URL(url);
      [
        'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
        'trk', 'refId', 'from', 'src', 'source', 'context', 'origin', 'redirected',
        'ao', 's', 'q', 'l', 'radius', 'sort', 'page', 'start'
      ].forEach(k => u.searchParams.delete(k));
      u.hash = '';
      return `${u.origin}${u.pathname}${u.search}`.toLowerCase().replace(/\/$/, '');
    } catch (_) {
      return String(url).split('#')[0].split('?')[0].toLowerCase().replace(/\/$/, '');
    }
  }

  function compact(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function buildPopupDedupKey(job) {
    if (!job) return '';
    if (job.dedup_key) return job.dedup_key;
    const title = compact(job.title);
    const company = compact(job.company);
    const location = compact(job.location);
    const url = normalizeJobUrl(job.url);
    const descHash = stableHash(String(job.description || '').slice(0, 800));
    return stableHash(url ? ['url', url, title, company, location].join('|') : ['text', title, company, location, descHash].join('|'));
  }

  function ensureShape(job) {
    const shaped = { ...job };
    shaped.stage = shaped.stage || (shaped.applied ? 'applied' : 'saved');
    shaped.applied = shaped.stage !== 'saved';
    shaped.tier = normalizeTier(shaped.tier);
    shaped.dedup_key = shaped.dedup_key || buildPopupDedupKey(shaped);
    return shaped;
  }

  function mergeKey(job) {
    return job?.dedup_key || buildPopupDedupKey(job) || `${normalizeJobUrl(job?.url)}|${compact(job?.title)}`;
  }

  function toBackendJob(job) {
    return {
      title: job.title || '',
      company: job.company || '',
      location: job.location || '',
      url: job.url || '',
      dedup_key: job.dedup_key || buildPopupDedupKey(job),
      tier: normalizeTier(job.tier),
      pay: job.pay || '',
      marketRange: job.marketRange || '',
      fit: job.fit || '',
      description: job.description || '',
      reasoning: job.reasoning || '',
      pros: job.pros || [],
      flags: job.flags || [],
      stage: job.stage || 'saved',
      applied: !!job.applied,
      cover_letter: job.cover_letter || '',
      tweaked_resume: job.tweaked_resume || '',
      interview_questions: job.interview_questions || ''
    };
  }

  mapSupabaseJob = function patchedMapSupabaseJob(row) {
    return ensureShape({
      id: row.id,
      title: row.title || '',
      company: row.company || '',
      location: row.location || '',
      url: row.url || '',
      dedup_key: row.dedup_key || '',
      tier: row.tier || '',
      pay: row.pay || '',
      marketRange: row.market_range || '',
      fit: row.fit || '',
      date: row.created_at ? row.created_at.split('T')[0] : '',
      description: row.description || '',
      applied: !!row.applied,
      stage: row.stage || 'saved',
      reasoning: row.reasoning || '',
      pros: row.pros || [],
      flags: row.flags || [],
      cover_letter: row.cover_letter || '',
      tweaked_resume: row.tweaked_resume || '',
      interview_questions: row.interview_questions || '',
      syncPending: false,
      serverUpdatedAt: row.updated_at || row.created_at || ''
    });
  };

  async function retryPendingJobSync() {
    const pending = allSavedJobs.filter(job => job.syncPending && !job.id);
    if (pending.length === 0) return false;

    let changed = false;
    for (const job of pending) {
      try {
        const resp = await chrome.runtime.sendMessage({ action: 'saveJob', job: toBackendJob(job) });
        if (resp?.error) continue;
        const saved = resp.job || resp.savedJob || resp.data || resp;
        const idx = allSavedJobs.indexOf(job);
        if (idx !== -1) {
          allSavedJobs[idx] = {
            ...job,
            id: saved.id || job.id,
            syncPending: false,
            serverUpdatedAt: saved.updated_at || saved.created_at || job.serverUpdatedAt
          };
          changed = true;
        }
      } catch (_) {}
    }
    return changed;
  }

  function mergeSavedJobs(localJobs, serverJobs) {
    const merged = new Map();
    for (const job of (localJobs || []).map(ensureShape)) {
      merged.set(mergeKey(job), job);
    }
    for (const serverJob of (serverJobs || []).map(ensureShape)) {
      const key = mergeKey(serverJob);
      const localJob = merged.get(key) || {};
      merged.set(key, {
        ...localJob,
        ...serverJob,
        cover_letter: serverJob.cover_letter || localJob.cover_letter || '',
        tweaked_resume: serverJob.tweaked_resume || localJob.tweaked_resume || '',
        interview_questions: serverJob.interview_questions || localJob.interview_questions || '',
        syncPending: false
      });
    }
    return [...merged.values()].slice(-200);
  }

  fetchSavedJobsFromSupabase = async function patchedFetchSavedJobsFromSupabase() {
    setSyncStatus('Syncing…');
    try {
      const pendingChanged = await retryPendingJobSync();
      if (pendingChanged) await chrome.storage.local.set({ savedJobs: allSavedJobs });

      const resp = await chrome.runtime.sendMessage({ action: 'getSavedJobs' });
      if (resp.error) {
        setSyncStatus('Sync failed, using local data');
        return;
      }
      if (resp.jobs) {
        const serverJobs = resp.jobs.map(mapSupabaseJob);
        allSavedJobs = mergeSavedJobs(allSavedJobs, serverJobs);
        await chrome.storage.local.set({ savedJobs: allSavedJobs });
        document.getElementById('savedCount').textContent = allSavedJobs.length;
        supabaseReady = true;
        renderSavedJobs();
        setSyncStatus('');
      }
    } catch (_) {
      setSyncStatus('Offline, using local data');
    }
  };

  const originalRenderSavedJobs = renderSavedJobs;
  renderSavedJobs = function patchedRenderSavedJobs() {
    allSavedJobs = (allSavedJobs || []).map(ensureShape);
    originalRenderSavedJobs();
    document.querySelectorAll('.job-pay').forEach((el, idx) => {
      const visibleJobs = [...allSavedJobs].filter(j => {
        if (currentFilter === 'applied' && !(j.applied || j.stage === 'applied')) return false;
        if (currentFilter === 'pending' && !(!j.applied && j.stage !== 'rejected')) return false;
        if (pipelineFilter && (j.stage || 'saved') !== pipelineFilter) return false;
        return true;
      }).slice().reverse();
      const job = visibleJobs[idx];
      if (job?.syncPending && !el.textContent.includes('Sync pending')) {
        el.textContent = el.textContent ? `${el.textContent} · Sync pending` : 'Sync pending';
      }
    });
  };
})();
