function buildSalaryBlock(currentSalary, minSalary) {
  if (currentSalary || minSalary) {
    return `Current Salary: ${currentSalary || 'Unknown'}
Min Desired Salary: ${minSalary || 'Unknown'}
Grade pay harshly if the estimated pay is below the minimum desired salary.`;
  }
  return `No salary anchors provided. Estimate the market salary range for each role based on title, location, seniority, and industry. Populate market_range accordingly.`;
}

async function checkLicense() {
  const { licenseStatus, openRouterKey } = await chrome.storage.local.get([
    'licenseStatus', 'openRouterKey'
  ]);
  if (licenseStatus === 'byok' && openRouterKey) return true;
  if (licenseStatus === 'valid' || licenseStatus === 'lifetime' || licenseStatus === 'offline') return true;
  return false;
}

async function saveSyncedJob(localJob, jobData) {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'saveJob', job: jobData });
    if (response?.error) return;

    const saved = response.job || response.savedJob || response.data || response;
    const { savedJobs } = await chrome.storage.local.get('savedJobs');
    const current = savedJobs || [];
    const idx = current.findIndex(j =>
      (localJob.dedup_key && j.dedup_key === localJob.dedup_key) ||
      ((j.url || '') + '|' + (j.title || '')).toLowerCase() === ((localJob.url || '') + '|' + (localJob.title || '')).toLowerCase()
    );
    if (idx === -1) return;

    current[idx] = {
      ...current[idx],
      id: saved.id || current[idx].id,
      syncPending: false,
      serverUpdatedAt: saved.updated_at || saved.created_at || current[idx].serverUpdatedAt
    };
    await chrome.storage.local.set({ savedJobs: current });
  } catch (_) {}
}

async function gradeBatch(jobs, type) {
  const allowed = await checkLicense();
  if (!allowed) {
    jobs.forEach(j => renderError(j._host, 'License required'));
    return;
  }

  const { currentSalary, minSalary, resumeText, savedJobs, evalMode } = await chrome.storage.local.get([
    'currentSalary', 'minSalary', 'resumeText', 'savedJobs', 'evalMode'
  ]);

  const mode = evalMode || 'personal';
  let systemPrompt = '';

  if (mode === 'objective') {
    systemPrompt = `You are a cynical labor-rights advocate evaluating job postings. Output ONLY valid JSON — no commentary, no markdown fences.
Ignore candidate fit. Grade each job S–F based purely on compensation, transparency, and red flags.

Output a JSON object:
{
  "results":[
    { "job_index": 0, "tier": "S", "fit_score": "N/A", "reasoning": "string", "estimated_pay": "string", "market_range": "string", "pros": ["string"], "red_flags": ["string"], "missing_skills":[] }
  ]
}

Tier rules:
- S/A: Transparent pay at or above market, clear expectations, real benefits.
- B/C: Standard corporate, pay within market range.
- D/F: Toxic culture signals ("wear many hats", "fast-paced family"), missing/insulting pay, pay below market, bait-and-switch.
- market_range: always estimate the typical salary range for this exact role + location.`;
  } else {
    systemPrompt = `You are an expert tech recruiter and job evaluator. Output ONLY valid JSON — no commentary, no markdown fences.

User Profile:
${buildSalaryBlock(currentSalary, minSalary)}
Resume:
${resumeText || 'Not provided — estimate fit based on general job appeal.'}

Output a JSON object:
{
  "results":[
    { "job_index": 0, "tier": "S", "fit_score": "85%", "reasoning": "string", "estimated_pay": "string", "market_range": "string", "pros": ["string"], "red_flags":["string"], "missing_skills":["string"] }
  ]
}

Tier rules:
- S/A: above-market pay, strong resume match, great growth.
- B/C: average pay, decent fit.
- D/F: low pay, poor fit, toxic flags, exploitative language.
- market_range: always estimate the typical salary range for this exact role + location.
- If resume is missing, estimate fit_score generically and leave missing_skills empty.`;
  }

  const userContent = `Rate these ${jobs.length} job(s):\n\n` + jobs.map((j, i) =>
    `[Job Index: ${i}]\nTitle: ${j.title}\nCompany: ${j.company || 'Unknown'}\nLocation: ${j.location || 'Not listed'}\nDescription: ${j.description}`
  ).join('\n---\n');

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'fetchOpenRouter',
      model: 'google/gemini-2.5-flash-lite',
      messages:[
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.1
    });

    if (response.error || !response.ok) {
      const msg = response.data?.error?.message || response.error || 'API Error';
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }

    if (!response.data?.choices?.[0]) throw new Error('Invalid API response structure');

    retryDelay = 100;

    const usage = response.data.usage;
    if (usage) {
      const { apiTokens } = await chrome.storage.local.get('apiTokens');
      chrome.storage.local.set({ apiTokens: (apiTokens || 0) + (usage.total_tokens || 0) });
    }

    let raw = response.data.choices[0].message.content;
    raw = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
    const fc = raw.indexOf('{'), fs = raw.indexOf('[');
    let start = -1, end = -1;
    if (fc !== -1 && (fs === -1 || fc < fs)) { start = fc; end = raw.lastIndexOf('}'); }
    else if (fs !== -1) { start = fs; end = raw.lastIndexOf(']'); }
    if (start === -1 || end <= start) throw new Error('No JSON found in response');
    raw = raw.substring(start, end + 1);

    let parsed = JSON.parse(raw);
    function lcKeys(o) {
      if (Array.isArray(o)) return o.map(lcKeys);
      if (o && typeof o === 'object') return Object.fromEntries(Object.entries(o).map(([k, v]) =>[k.toLowerCase().trim(), lcKeys(v)]));
      return o;
    }
    parsed = lcKeys(parsed);

    const results = parsed.results && Array.isArray(parsed.results) ? parsed.results
      : Array.isArray(parsed) ? parsed : [parsed];

    const currentSaved = savedJobs ||[];
    let changed = false;

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const idx = result.job_index !== undefined ? result.job_index : i;
      const job = jobs[idx];
      if (!job) continue;

      const tierVal = normalizeTier(result.tier || result.grade);
      result.tier = tierVal;
      const jobKey = buildJobCacheKey(job, type, mode);

      gradeCache.set(jobKey, result);
      renderResult(job._host, result, job.isListing);

      const dimmingTarget = job.isListing ? job.container : getDescriptionBody();
      applyDimming(dimmingTarget, mode, tierVal);

      if (type === 'detail' && (tierVal === 'S' || tierVal === 'A' || tierVal === 'B')) {
        const dedupKey = buildDedupKey(job);
        const existing = currentSaved.find(s =>
          (dedupKey && s.dedup_key === dedupKey) ||
          ((s.url || '') + '|' + (s.title || '')).toLowerCase() === ((job.url || '') + '|' + job.title).toLowerCase()
        );

        if (!existing) {
          const jobData = {
            title: job.title.substring(0, 80),
            company: job.company || '',
            location: job.location || '',
            url: job.url || '',
            dedup_key: dedupKey,
            tier: tierVal,
            pay: result.estimated_pay || result.pay || 'Listed',
            marketRange: result.market_range || '',
            fit: result.fit_score || '',
            description: (job.description || '').substring(0, SAVED_DESC_LIMIT),
            reasoning: result.reasoning || '',
            pros: result.pros ||[],
            flags: result.red_flags || result.flags ||[]
          };
          const localJob = {
            ...jobData,
            date: new Date().toISOString().split('T')[0],
            applied: false,
            stage: 'saved',
            syncPending: true
          };
          currentSaved.push(localJob);
          changed = true;
          saveSyncedJob(localJob, jobData);
        }
      }
    }

    if (changed) {
      while (currentSaved.length > 200) currentSaved.shift();
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
    jobs.forEach(j => renderError(j._host, msg));
  }
}
