let currentFilter = 'all';
let pipelineFilter = '';
let allSavedJobs = [];

const STAGES = ['saved', 'applied', 'interview', 'offer', 'rejected'];

const LICENSE_LABELS = {
  valid:   { text: 'Active',    cls: 'valid'   },
  byok:    { text: 'BYOK',      cls: 'byok'    },
  offline: { text: 'Offline',   cls: 'valid'   },
  invalid: { text: 'Invalid',   cls: 'invalid' },
  expired: { text: 'Expired',   cls: 'invalid' },
  none:    { text: 'No License', cls: 'none'   }
};

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get([
    'apiTokens', 'savedJobs', 'gradeHistory', 'evalMode', 'keywordHighlight'
  ]);

  if (data.apiTokens) document.getElementById('apiTokens').textContent = fmtNum(data.apiTokens);
  if (data.evalMode) setModeUI(data.evalMode);
  document.getElementById('keywordHighlight').checked = !!data.keywordHighlight;

  const cacheSize = data.gradeHistory ? Object.keys(data.gradeHistory).length : 0;
  document.getElementById('cacheCount').textContent = cacheSize;

  allSavedJobs = data.savedJobs || [];
  document.getElementById('savedCount').textContent = allSavedJobs.length;
  renderSavedJobs();

  const { licenseStatus, licenseMode } = await chrome.storage.local.get(['licenseStatus', 'licenseMode']);
  const effectiveStatus = licenseMode === 'byok' ? 'byok' : (licenseStatus || 'none');
  updateLicensePill(effectiveStatus);
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

document.getElementById('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

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
  hideAllPanels();
});

document.getElementById('filterAll').addEventListener('click', () => setFilter('all'));
document.getElementById('filterApplied').addEventListener('click', () => setFilter('applied'));
document.getElementById('filterPending').addEventListener('click', () => setFilter('pending'));
document.getElementById('filterInterview').addEventListener('click', () => setFilter('interview'));

document.getElementById('pipelineFilter').addEventListener('change', (e) => {
  pipelineFilter = e.target.value;
  renderSavedJobs();
});

function setFilter(f) {
  currentFilter = f;
  ['All', 'Applied', 'Pending', 'Interview'].forEach(name => {
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
    const prev = btn.textContent; btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = prev, 1500);
  });
});

document.getElementById('closeCoverLetter').addEventListener('click', hideCoverLetter);

document.getElementById('copyInterview').addEventListener('click', () => {
  const el = document.getElementById('interviewQuestions');
  navigator.clipboard.writeText(el.innerText).then(() => {
    const btn = document.getElementById('copyInterview');
    const prev = btn.textContent; btn.textContent = '✓ Copied!';
    setTimeout(() => btn.textContent = prev, 1500);
  });
});

document.getElementById('closeInterview').addEventListener('click', hideInterview);

function hideCoverLetter() { document.getElementById('coverLetterPanel').style.display = 'none'; }
function hideInterview()   { document.getElementById('interviewPanel').style.display = 'none'; }
function hideAllPanels()   { hideCoverLetter(); hideInterview(); }

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
  const { openRouterKey, resumeText, licenseMode, licenseStatus } = await chrome.storage.local.get([
    'openRouterKey', 'resumeText', 'licenseMode', 'licenseStatus'
  ]);
  const canUse = licenseMode === 'byok' ? !!openRouterKey : (licenseStatus === 'valid' || licenseStatus === 'offline');
  if (!canUse) { showCoverLetter(job.title, 'Error: No valid license or API key. Go to Settings.'); return; }
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

async function generateInterviewPrep(index) {
  const job = allSavedJobs[index];
  if (!job) return;
  const { openRouterKey, resumeText, licenseMode, licenseStatus } = await chrome.storage.local.get([
    'openRouterKey', 'resumeText', 'licenseMode', 'licenseStatus'
  ]);
  const canUse = licenseMode === 'byok' ? !!openRouterKey : (licenseStatus === 'valid' || licenseStatus === 'offline');
  if (!canUse) { showInterview(job.title, 'Error: No valid license. Go to Settings.'); return; }
  if (!job.description) { showInterview(job.title, 'Error: No description saved for this job.'); return; }

  showInterview(job.title, '<em style="color:#7070a0">Generating questions…</em>');

  const sys = `You are an expert interview coach. Generate targeted interview questions for this candidate and role.
Output ONLY a structured list — no preamble. Format:
## Behavioral (3 questions)
1. ...
## Technical (4 questions)
1. ...
## Culture Fit (2 questions)
1. ...
## Questions to Ask Them (2 questions)
1. ...`;

  const usr = `Role: ${job.title} at ${job.company || 'Unknown'}
Description: ${job.description}
Resume: ${resumeText || 'Not provided.'}`;

  const resp = await callAPI(sys, usr, 0.3);
  if (resp.error) { showInterview(job.title, `Error: ${resp.error}`); return; }
  showInterview(job.title, formatInterviewText(resp.text));
}

function formatInterviewText(text) {
  return text
    .replace(/^## (.+)$/gm, '<div style="color:#4a9eff;font-size:11px;font-weight:700;margin:10px 0 4px;text-transform:uppercase;letter-spacing:.05em;">$1</div>')
    .replace(/^\d+\.\s+(.+)$/gm, '<div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(255,255,255,0.1);">$1</div>')
    .replace(/\n/g, '');
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
      temperature
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
  hideInterview();
  document.getElementById('coverLetterTitle').textContent = `Cover Letter — ${title}`;
  document.getElementById('coverLetterText').value = text;
  document.getElementById('coverLetterPanel').style.display = 'block';
  document.getElementById('coverLetterPanel').scrollIntoView({ behavior: 'smooth' });
}

function showInterview(title, html) {
  hideCoverLetter();
  document.getElementById('interviewTitle').textContent = `Interview Prep — ${title}`;
  document.getElementById('interviewQuestions').innerHTML = html;
  document.getElementById('interviewPanel').style.display = 'block';
  document.getElementById('interviewPanel').scrollIntoView({ behavior: 'smooth' });
}

function renderSavedJobs() {
  const container = document.getElementById('savedJobsList');
  container.innerHTML = '';

  let jobs = [...allSavedJobs];

  if (currentFilter === 'applied') jobs = jobs.filter(j => j.applied || j.stage === 'applied');
  if (currentFilter === 'pending')   jobs = jobs.filter(j => !j.applied && j.stage !== 'rejected');
  if (currentFilter === 'interview') jobs = jobs.filter(j => j.stage === 'interview');
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
    coverBtn.textContent = '📝 Cover';
    coverBtn.addEventListener('click', () => generateCoverLetter(realIndex));
    actions.appendChild(coverBtn);

    const prepBtn = document.createElement('button');
    prepBtn.className = 'job-act-btn warn';
    prepBtn.textContent = '🎤 Prep';
    prepBtn.addEventListener('click', () => generateInterviewPrep(realIndex));
    actions.appendChild(prepBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'job-act-btn danger-sm';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove this job';
    removeBtn.addEventListener('click', () => removeJob(realIndex));
    actions.appendChild(removeBtn);

    div.appendChild(actions);
    container.appendChild(div);
  });
}
