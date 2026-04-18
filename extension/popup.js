let currentFilter = 'all';
let pipelineFilter = '';
let allSavedJobs = [];

const STAGES = ['saved', 'applied', 'offer', 'rejected'];

const LICENSE_LABELS = {
  valid:    { text: 'Active',     cls: 'valid'   },
  byok:     { text: 'BYOK',       cls: 'byok'    },
  offline:  { text: 'Offline',    cls: 'valid'   },
  past_due: { text: 'Past Due',   cls: 'invalid' },
  invalid:  { text: 'No Plan',    cls: 'invalid' },
  canceled: { text: 'Canceled',   cls: 'invalid' },
  none:     { text: 'Free Tier',  cls: 'none'    }
};

function isPaidStatus(status) {
  return status === 'valid' || status === 'byok' || status === 'offline';
}

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get([
    'apiTokens', 'savedJobs', 'gradeHistory', 'evalMode', 'keywordHighlight',
    'freemiumRemaining'
  ]);

  if (data.apiTokens) document.getElementById('apiTokens').textContent = fmtNum(data.apiTokens);
  if (data.evalMode) setModeUI(data.evalMode);
  document.getElementById('keywordHighlight').checked = !!data.keywordHighlight;

  const cacheSize = data.gradeHistory ? Object.keys(data.gradeHistory).length : 0;
  document.getElementById('cacheCount').textContent = cacheSize;

  allSavedJobs = data.savedJobs || [];
  document.getElementById('savedCount').textContent = allSavedJobs.length;
  renderSavedJobs();

  const { licenseStatus } = await chrome.storage.local.get('licenseStatus');
  const status = licenseStatus || 'none';
  updateLicensePill(status);
  updateCtaButton(status);
  updateFreemiumDisplay(status, data.freemiumRemaining);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.licenseStatus) {
    const status = changes.licenseStatus.newValue || 'none';
    updateLicensePill(status);
    updateCtaButton(status);
    chrome.storage.local.get('freemiumRemaining').then(({ freemiumRemaining }) => {
      updateFreemiumDisplay(status, freemiumRemaining);
    });
  }
  if (changes.freemiumRemaining) {
    chrome.storage.local.get('licenseStatus').then(({ licenseStatus }) => {
      updateFreemiumDisplay(licenseStatus || 'none', changes.freemiumRemaining.newValue);
    });
  }
});

function fmtNum(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

function updateLicensePill(status) {
  const pill = document.getElementById('licensePill');
  const lbl  = document.getElementById('licenseLabel');
  const info = LICENSE_LABELS[status] || LICENSE_LABELS.none;
  pill.className = `license-pill ${info.cls}`;
  lbl.textContent = info.text;
}

function updateCtaButton(status) {
  const label = document.getElementById('ctaLabel');
  const sub = document.getElementById('ctaSub');

  if (isPaidStatus(status)) {
    label.textContent = 'Manage Account';
    sub.textContent = 'Subscription, API keys, and account settings';
  } else {
    label.textContent = 'Upgrade Plan';
    sub.textContent = 'Unlock unlimited grading, cover letters, and more';
  }
}

function updateFreemiumDisplay(status, remaining) {
  const card = document.getElementById('freemiumCard');
  const countEl = document.getElementById('freemiumCount');

  if (isPaidStatus(status)) {
    card.style.display = 'none';
    return;
  }

  const count = remaining ?? 15;
  card.style.display = '';
  countEl.textContent = count;

  if (count <= 0) {
    countEl.style.color = '#f87171';
  } else if (count <= 5) {
    countEl.style.color = '#fb923c';
  } else {
    countEl.style.color = '#a5b4fc';
  }
}

function setModeUI(mode) {
  document.getElementById('modePersonal').classList.toggle('active', mode === 'personal');
  document.getElementById('modeObjective').classList.toggle('active', mode === 'objective');
}

document.getElementById('licensePill').addEventListener('click', () => chrome.runtime.openOptionsPage());

document.getElementById('modePersonal').addEventListener('click', () => saveMode('personal'));
document.getElementById('modeObjective').addEventListener('click', () => saveMode('objective'));

async function saveMode(mode) {
  setModeUI(mode);
  await chrome.storage.local.set({ evalMode: mode });
  await chrome.storage.local.remove(['gradeHistory']);
  document.getElementById('cacheCount').textContent = '0';
}

document.getElementById('keywordHighlight').addEventListener('change', async (e) => {
  await chrome.storage.local.set({ keywordHighlight: e.target.checked });
});

document.getElementById('upgradePlan').addEventListener('click', () => chrome.runtime.openOptionsPage());

document.getElementById('clearCache').addEventListener('click', async () => {
  await chrome.storage.local.remove(['gradeHistory', 'apiTokens']);
  document.getElementById('cacheCount').textContent = '0';
  document.getElementById('apiTokens').textContent = '0';
});

document.getElementById('clearSaved').addEventListener('click', async () => {
  if (!confirm('Clear all saved jobs? This cannot be undone.')) return;
  await chrome.storage.local.remove(['savedJobs']);
  allSavedJobs = [];
  document.getElementById('savedCount').textContent = '0';
  renderSavedJobs();
  hideCoverLetter();
});

document.getElementById('filterAll').addEventListener('click', () => setFilter('all'));
document.getElementById('filterApplied').addEventListener('click', () => setFilter('applied'));
document.getElementById('filterPending').addEventListener('click', () => setFilter('pending'));

document.getElementById('pipelineFilter').addEventListener('change', (e) => {
  pipelineFilter = e.target.value;
  renderSavedJobs();
});

function setFilter(f) {
  currentFilter = f;
  ['All', 'Applied', 'Pending'].forEach(name => {
    const el = document.getElementById('filter' + name);
    if (el) el.classList.toggle('active', f === name.toLowerCase() || (name === 'All' && f === 'all'));
  });
  renderSavedJobs();
}

document.getElementById('exportCsv').addEventListener('click', async () => {
  const { savedJobs } = await chrome.storage.local.get('savedJobs');
  if (!savedJobs?.length) return;
  const rows = [['Title', 'Company', 'Location', 'Tier', 'Fit', 'Pay', 'Market Range', 'Stage', 'URL', 'Date', 'Applied']];
  savedJobs.forEach(j => rows.push([
    j.title || '', j.company || '', j.location || '', j.tier || '', j.fit || '',
    j.pay || '', j.marketRange || '', j.stage || 'saved', j.url || '', j.date || '',
    j.applied ? 'Yes' : 'No'
  ]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadBlob(csv, `jobs_${today()}.csv`, 'text/csv;charset=utf-8;');
});

document.getElementById('exportJson').addEventListener('click', async () => {
  const { savedJobs } = await chrome.storage.local.get('savedJobs');
  if (!savedJobs?.length) return;
  downloadBlob(JSON.stringify(savedJobs, null, 2), `jobs_${today()}.json`, 'application/json');
});

function downloadBlob(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function today() { return new Date().toISOString().split('T')[0]; }

document.getElementById('copyCoverLetter').addEventListener('click', () => {
  const ta = document.getElementById('coverLetterText');
  navigator.clipboard.writeText(ta.value).then(() => {
    const btn = document.getElementById('copyCoverLetter');
    const prev = btn.textContent; btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = prev, 1500);
  });
});

document.getElementById('closeCoverLetter').addEventListener('click', hideCoverLetter);

document.getElementById('copyTweakResume').addEventListener('click', () => {
  const ta = document.getElementById('tweakResumeText');
  navigator.clipboard.writeText(ta.value).then(() => {
    const btn = document.getElementById('copyTweakResume');
    const prev = btn.textContent; btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = prev, 1500);
  });
});

document.getElementById('closeTweakResume').addEventListener('click', hideTweakResume);

function hideCoverLetter() { document.getElementById('coverLetterPanel').style.display = 'none'; }
function hideTweakResume() { document.getElementById('tweakResumePanel').style.display = 'none'; }

function showTweakResume(title, text) {
  document.getElementById('tweakResumeTitle').textContent = `Tweak Resume — ${title}`;
  document.getElementById('tweakResumeText').value = text;
  document.getElementById('tweakResumePanel').style.display = 'block';
  document.getElementById('tweakResumePanel').scrollIntoView({ behavior: 'smooth' });
}

async function setStage(index, stage) {
  allSavedJobs[index].stage = stage;
  allSavedJobs[index].applied = (stage !== 'saved');
  await chrome.storage.local.set({ savedJobs: allSavedJobs });
  renderSavedJobs();
}

async function removeJob(index) {
  allSavedJobs.splice(index, 1);
  await chrome.storage.local.set({ savedJobs: allSavedJobs });
  document.getElementById('savedCount').textContent = allSavedJobs.length;
  renderSavedJobs();
}

async function generateCoverLetter(index) {
  const job = allSavedJobs[index];
  if (!job) return;
  const { openRouterKey, resumeText, licenseStatus } = await chrome.storage.local.get([
    'openRouterKey', 'resumeText', 'licenseStatus'
  ]);
  const canUse = licenseStatus === 'byok' ? !!openRouterKey : (licenseStatus === 'valid' || licenseStatus === 'offline');
  if (!canUse) { showCoverLetter(job.title, 'Error: Upgrade to Pro to generate cover letters.'); return; }
  if (!job.description) { showCoverLetter(job.title, 'Error: No description saved. View the job again to refresh.'); return; }

  showCoverLetter(job.title, 'Generating cover letter…');

  const sys = `You are an expert career coach. Write a compelling, concise cover letter.
Guidelines: 3-4 paragraphs, under 350 words. Open with genuine interest. Use specifics from both resume and job description. Mention company by name. Close with a clear call to action. Do not fabricate experience. Output ONLY the cover letter text.`;

  const usr = `Job: ${job.title} at ${job.company || 'Unknown'} — ${job.location || ''}
Description: ${job.description}
Resume: ${resumeText || 'Not provided — write a general cover letter.'}`;

  const resp = await callAPI(sys, usr, 0.5);
  if (resp.error) { showCoverLetter(job.title, `Error: ${resp.error}`); return; }
  showCoverLetter(job.title, resp.text);
}

async function generateTweakedResume(index) {
  const job = allSavedJobs[index];
  if (!job) return;
  const { openRouterKey, resumeText, licenseStatus } = await chrome.storage.local.get([
    'openRouterKey', 'resumeText', 'licenseStatus'
  ]);
  const canUse = licenseStatus === 'byok' ? !!openRouterKey : (licenseStatus === 'valid' || licenseStatus === 'offline');
  if (!canUse) { showTweakResume(job.title, 'Error: Upgrade to Pro to tailor resumes.'); return; }
  if (!resumeText) { showTweakResume(job.title, 'Error: No resume found. Paste your resume in Account Management.'); return; }
  if (!job.description) { showTweakResume(job.title, 'Error: No description saved. View the job again to refresh.'); return; }

  showTweakResume(job.title, 'Generating tailored resume\u2026');

  const sys = `You are an expert resume writer and career coach. You will receive a user's original resume and a job description. Your task is to rewrite the resume so it is better tailored to the specific job.

Guidelines:
- Keep the same overall structure, sections, and formatting as the original resume.
- Do NOT fabricate experience, skills, or qualifications the candidate does not have.
- Adjust language, phrasing, and emphasis to mirror keywords and requirements from the job description.
- Reorder bullet points to lead with the most relevant experience for this role.
- Incorporate relevant keywords from the job posting naturally into the resume text.
- Quantify achievements where possible based on existing information.
- Keep it concise and professional.
- This should be a reasonable tailoring, not a complete rewrite. The original voice and content should be preserved.
- Output ONLY the rewritten resume text, no commentary or explanation.`;

  const usr = `Job Title: ${job.title}
Company: ${job.company || 'Unknown'}
Location: ${job.location || 'Not listed'}

Job Description:
${job.description}

---

Original Resume:
${resumeText}`;

  const resp = await callAPI(sys, usr, 0.4);
  if (resp.error) { showTweakResume(job.title, `Error: ${resp.error}`); return; }
  showTweakResume(job.title, resp.text);
}

async function callAPI(systemContent, userContent, temperature) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'fetchOpenRouter',
      model: 'google/gemini-2.5-flash-lite',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent }
      ],
      temperature,
      isMainCard: false
    });

    if (response.error || !response.ok) {
      return { error: response.data?.error?.message || response.error || 'API Error' };
    }

    if (!response.data?.choices?.[0]) return { error: 'Invalid API response.' };

    const usage = response.data.usage;
    if (usage) {
      const { apiTokens } = await chrome.storage.local.get('apiTokens');
      const newTotal = (apiTokens || 0) + (usage.total_tokens || 0);
      await chrome.storage.local.set({ apiTokens: newTotal });
      document.getElementById('apiTokens').textContent = fmtNum(newTotal);
    }

    return { text: response.data.choices[0].message.content.trim() };
  } catch (err) {
    return { error: err.message };
  }
}

function showCoverLetter(title, text) {
  document.getElementById('coverLetterTitle').textContent = `Cover Letter — ${title}`;
  document.getElementById('coverLetterText').value = text;
  document.getElementById('coverLetterPanel').style.display = 'block';
  document.getElementById('coverLetterPanel').scrollIntoView({ behavior: 'smooth' });
}

function renderSavedJobs() {
  const container = document.getElementById('savedJobsList');
  container.innerHTML = '';

  let jobs = [...allSavedJobs];

  if (currentFilter === 'applied') jobs = jobs.filter(j => j.applied || j.stage === 'applied');
  if (currentFilter === 'pending') jobs = jobs.filter(j => !j.applied && j.stage !== 'rejected');
  if (pipelineFilter) jobs = jobs.filter(j => (j.stage || 'saved') === pipelineFilter);

  if (jobs.length === 0) {
    container.innerHTML = `<div class="empty-state">No jobs here yet.<br><span style="font-size:10px;">Grade S or A tier jobs to save them.</span></div>`;
    return;
  }

  jobs.slice().reverse().forEach(job => {
    const realIndex = allSavedJobs.indexOf(job);
    const stage = job.stage || (job.applied ? 'applied' : 'saved');
    const div = document.createElement('div');
    div.className = 'job-item';

    const header = document.createElement('div');
    header.className = 'job-header';

    const badge = document.createElement('span');
    badge.className = `tier-badge tier-${job.tier}`;
    badge.textContent = job.tier;
    header.appendChild(badge);

    const titleEl = document.createElement('div');
    titleEl.className = 'job-title';
    if (job.url) {
      const a = document.createElement('a');
      a.href = job.url; a.target = '_blank'; a.textContent = job.title;
      titleEl.appendChild(a);
    } else {
      titleEl.textContent = job.title;
    }

    if (stage !== 'saved') {
      const stageBadge = document.createElement('span');
      stageBadge.className = `job-stage-badge stage-${stage}`;
      stageBadge.textContent = stage.charAt(0).toUpperCase() + stage.slice(1);
      titleEl.appendChild(stageBadge);
    }
    header.appendChild(titleEl);
    div.appendChild(header);

    if (job.company || job.location) {
      const meta = document.createElement('div');
      meta.className = 'job-meta';
      meta.textContent = [job.company, job.location].filter(Boolean).join(' — ');
      div.appendChild(meta);
    }

    if (job.pay || job.marketRange || job.fit) {
      const pay = document.createElement('div');
      pay.className = 'job-pay';
      const parts = [];
      if (job.pay) parts.push(job.pay);
      if (job.marketRange) parts.push('Mkt: ' + job.marketRange);
      if (job.fit && job.fit !== 'N/A') parts.push(job.fit);
      if (job.date) parts.push(job.date);
      pay.textContent = parts.join(' · ');
      div.appendChild(pay);
    }

    const actions = document.createElement('div');
    actions.className = 'job-actions';

    const stageSelect = document.createElement('select');
    stageSelect.className = 'stage-select';
    STAGES.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s; opt.textContent = s.charAt(0).toUpperCase() + s.slice(1);
      if (s === stage) opt.selected = true;
      stageSelect.appendChild(opt);
    });
    stageSelect.addEventListener('change', () => setStage(realIndex, stageSelect.value));
    actions.appendChild(stageSelect);

    const coverBtn = document.createElement('button');
    coverBtn.className = 'job-act-btn primary';
    coverBtn.textContent = 'Cover Letter';
    coverBtn.addEventListener('click', () => generateCoverLetter(realIndex));
    actions.appendChild(coverBtn);

    const tweakBtn = document.createElement('button');
    tweakBtn.className = 'job-act-btn primary';
    tweakBtn.textContent = 'Tweak Resume';
    tweakBtn.addEventListener('click', () => generateTweakedResume(realIndex));
    actions.appendChild(tweakBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'job-act-btn danger-sm';
    removeBtn.textContent = 'X';
    removeBtn.title = 'Remove this job';
    removeBtn.addEventListener('click', () => removeJob(realIndex));
    actions.appendChild(removeBtn);

    div.appendChild(actions);
    container.appendChild(div);
  });
}
