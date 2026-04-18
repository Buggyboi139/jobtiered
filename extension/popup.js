let currentFilter = 'all';
let pipelineFilter = '';
let allSavedJobs = [];
let supabaseReady = false;

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
    'freemiumRemaining', 'session'
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

  if (data.session?.access_token) {
    fetchSavedJobsFromSupabase();
  }
});

async function fetchSavedJobsFromSupabase() {
  setSyncStatus('Syncing\u2026');
  try {
    const resp = await chrome.runtime.sendMessage({ action: 'getSavedJobs' });
    if (resp.error) {
      setSyncStatus('Sync failed — using local data');
      return;
    }
    if (resp.jobs) {
      allSavedJobs = resp.jobs.map(mapSupabaseJob);
      await chrome.storage.local.set({ savedJobs: allSavedJobs });
      document.getElementById('savedCount').textContent = allSavedJobs.length;
      supabaseReady = true;
      renderSavedJobs();
      setSyncStatus('');
    }
  } catch (_) {
    setSyncStatus('Offline — using local data');
  }
}

function mapSupabaseJob(row) {
  return {
    id: row.id,
    title: row.title || '',
    company: row.company || '',
    location: row.location || '',
    url: row.url || '',
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
    interview_questions: row.interview_questions || ''
  };
}

function setSyncStatus(text) {
  const el = document.getElementById('syncStatus');
  if (el) el.textContent = text;
}

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
  for (const job of allSavedJobs) {
    if (job.id) {
      try { await chrome.runtime.sendMessage({ action: 'deleteJob', jobId: job.id }); } catch (_) {}
    }
  }
  await chrome.storage.local.remove(['savedJobs']);
  allSavedJobs = [];
  document.getElementById('savedCount').textContent = '0';
  renderSavedJobs();
  hideAllPanels();
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
  if (!allSavedJobs?.length) return;
  const rows = [['Title', 'Company', 'Location', 'Tier', 'Fit', 'Pay', 'Market Range', 'Stage', 'URL', 'Date', 'Applied']];
  allSavedJobs.forEach(j => rows.push([
    j.title || '', j.company || '', j.location || '', j.tier || '', j.fit || '',
    j.pay || '', j.marketRange || '', j.stage || 'saved', j.url || '', j.date || '',
    j.applied ? 'Yes' : 'No'
  ]));
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  downloadBlob(csv, `jobs_${today()}.csv`, 'text/csv;charset=utf-8;');
});

document.getElementById('exportJson').addEventListener('click', async () => {
  if (!allSavedJobs?.length) return;
  downloadBlob(JSON.stringify(allSavedJobs, null, 2), `jobs_${today()}.json`, 'application/json');
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

document.getElementById('copyCoverLetter').addEventListener('click', () => copyPanel('coverLetterText', 'copyCoverLetter'));
document.getElementById('closeCoverLetter').addEventListener('click', () => hidePanel('coverLetterPanel'));
document.getElementById('copyTweakResume').addEventListener('click', () => copyPanel('tweakResumeText', 'copyTweakResume'));
document.getElementById('closeTweakResume').addEventListener('click', () => hidePanel('tweakResumePanel'));
document.getElementById('copyInterview').addEventListener('click', () => copyPanel('interviewText', 'copyInterview'));
document.getElementById('closeInterview').addEventListener('click', () => hidePanel('interviewPanel'));

function copyPanel(textareaId, btnId) {
  const ta = document.getElementById(textareaId);
  navigator.clipboard.writeText(ta.value).then(() => {
    const btn = document.getElementById(btnId);
    const prev = btn.textContent; btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = prev, 1500);
  });
}

function hidePanel(id) { document.getElementById(id).style.display = 'none'; }
function hideAllPanels() {
  hidePanel('coverLetterPanel');
  hidePanel('tweakResumePanel');
  hidePanel('interviewPanel');
}

function showPanel(panelId, titleId, textId, title, text) {
  document.getElementById(titleId).textContent = title;
  document.getElementById(textId).value = text;
  document.getElementById(panelId).style.display = 'block';
  document.getElementById(panelId).scrollIntoView({ behavior: 'smooth' });
}

async function setStage(index, stage) {
  const job = allSavedJobs[index];
  job.stage = stage;
  job.applied = (stage !== 'saved');
  await chrome.storage.local.set({ savedJobs: allSavedJobs });
  renderSavedJobs();

  if (job.id) {
    try {
      await chrome.runtime.sendMessage({
        action: 'updateJob',
        jobId: job.id,
        updates: { stage, applied: job.applied }
      });
    } catch (_) {}
  }
}

async function removeJob(index) {
  const job = allSavedJobs[index];
  allSavedJobs.splice(index, 1);
  await chrome.storage.local.set({ savedJobs: allSavedJobs });
  document.getElementById('savedCount').textContent = allSavedJobs.length;
  renderSavedJobs();

  if (job.id) {
    try {
      await chrome.runtime.sendMessage({ action: 'deleteJob', jobId: job.id });
    } catch (_) {}
  }
}

async function generateCoverLetter(index) {
  const job = allSavedJobs[index];
  if (!job) return;

  if (job.cover_letter) {
    showPanel('coverLetterPanel', 'coverLetterTitle', 'coverLetterText',
      `Cover Letter \u2014 ${job.title}`, job.cover_letter);
    return;
  }

  const { openRouterKey, resumeText, licenseStatus } = await chrome.storage.local.get([
    'openRouterKey', 'resumeText', 'licenseStatus'
  ]);
  const canUse = licenseStatus === 'byok' ? !!openRouterKey : (licenseStatus === 'valid' || licenseStatus === 'offline');
  if (!canUse) {
    showPanel('coverLetterPanel', 'coverLetterTitle', 'coverLetterText',
      `Cover Letter \u2014 ${job.title}`, 'Error: Upgrade to Pro to generate cover letters.');
    return;
  }
  if (!job.description) {
    showPanel('coverLetterPanel', 'coverLetterTitle', 'coverLetterText',
      `Cover Letter \u2014 ${job.title}`, 'Error: No description saved. View the job again to refresh.');
    return;
  }

  showPanel('coverLetterPanel', 'coverLetterTitle', 'coverLetterText',
    `Cover Letter \u2014 ${job.title}`, 'Generating cover letter\u2026');

  const sys = `You are an expert career coach. Write a compelling, concise cover letter.
Guidelines: 3-4 paragraphs, under 350 words. Open with genuine interest. Use specifics from both resume and job description. Mention company by name. Close with a clear call to action. Do not fabricate experience. Output ONLY the cover letter text.`;

  const usr = `Job: ${job.title} at ${job.company || 'Unknown'} \u2014 ${job.location || ''}
Description: ${job.description}
Resume: ${resumeText || 'Not provided \u2014 write a general cover letter.'}`;

  const resp = await callAPI(sys, usr, 0.5);
  if (resp.error) {
    showPanel('coverLetterPanel', 'coverLetterTitle', 'coverLetterText',
      `Cover Letter \u2014 ${job.title}`, `Error: ${resp.error}`);
    return;
  }

  job.cover_letter = resp.text;
  await chrome.storage.local.set({ savedJobs: allSavedJobs });
  showPanel('coverLetterPanel', 'coverLetterTitle', 'coverLetterText',
    `Cover Letter \u2014 ${job.title}`, resp.text);

  if (job.id) {
    try {
      await chrome.runtime.sendMessage({
        action: 'updateJob',
        jobId: job.id,
        updates: { cover_letter: resp.text }
      });
    } catch (_) {}
  }
}

async function generateTweakedResume(index) {
  const job = allSavedJobs[index];
  if (!job) return;

  if (job.tweaked_resume) {
    showPanel('tweakResumePanel', 'tweakResumeTitle', 'tweakResumeText',
      `Tweak Resume \u2014 ${job.title}`, job.tweaked_resume);
    return;
  }

  const { openRouterKey, resumeText, licenseStatus } = await chrome.storage.local.get([
    'openRouterKey', 'resumeText', 'licenseStatus'
  ]);
  const canUse = licenseStatus === 'byok' ? !!openRouterKey : (licenseStatus === 'valid' || licenseStatus === 'offline');
  if (!canUse) {
    showPanel('tweakResumePanel', 'tweakResumeTitle', 'tweakResumeText',
      `Tweak Resume \u2014 ${job.title}`, 'Error: Upgrade to Pro to tailor resumes.');
    return;
  }
  if (!resumeText) {
    showPanel('tweakResumePanel', 'tweakResumeTitle', 'tweakResumeText',
      `Tweak Resume \u2014 ${job.title}`, 'Error: No resume found. Paste your resume in Account Management.');
    return;
  }
  if (!job.description) {
    showPanel('tweakResumePanel', 'tweakResumeTitle', 'tweakResumeText',
      `Tweak Resume \u2014 ${job.title}`, 'Error: No description saved. View the job again to refresh.');
    return;
  }

  showPanel('tweakResumePanel', 'tweakResumeTitle', 'tweakResumeText',
    `Tweak Resume \u2014 ${job.title}`, 'Generating tailored resume\u2026');

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
  if (resp.error) {
    showPanel('tweakResumePanel', 'tweakResumeTitle', 'tweakResumeText',
      `Tweak Resume \u2014 ${job.title}`, `Error: ${resp.error}`);
    return;
  }

  job.tweaked_resume = resp.text;
  await chrome.storage.local.set({ savedJobs: allSavedJobs });
  showPanel('tweakResumePanel', 'tweakResumeTitle', 'tweakResumeText',
    `Tweak Resume \u2014 ${job.title}`, resp.text);

  if (job.id) {
    try {
      await chrome.runtime.sendMessage({
        action: 'updateJob',
        jobId: job.id,
        updates: { tweaked_resume: resp.text }
      });
    } catch (_) {}
  }
}

async function generateInterviewQuestions(index) {
  const job = allSavedJobs[index];
  if (!job) return;

  if (job.interview_questions) {
    showPanel('interviewPanel', 'interviewTitle', 'interviewText',
      `Interview Prep \u2014 ${job.title}`, job.interview_questions);
    return;
  }

  const { openRouterKey, resumeText, licenseStatus } = await chrome.storage.local.get([
    'openRouterKey', 'resumeText', 'licenseStatus'
  ]);
  const canUse = licenseStatus === 'byok' ? !!openRouterKey : (licenseStatus === 'valid' || licenseStatus === 'offline');
  if (!canUse) {
    showPanel('interviewPanel', 'interviewTitle', 'interviewText',
      `Interview Prep \u2014 ${job.title}`, 'Error: Upgrade to Pro to generate interview questions.');
    return;
  }
  if (!job.description) {
    showPanel('interviewPanel', 'interviewTitle', 'interviewText',
      `Interview Prep \u2014 ${job.title}`, 'Error: No description saved. View the job again to refresh.');
    return;
  }

  showPanel('interviewPanel', 'interviewTitle', 'interviewText',
    `Interview Prep \u2014 ${job.title}`, 'Generating interview questions\u2026');

  const sys = `You are an expert interview coach and technical recruiter. Generate a tailored set of interview questions for the candidate based on the job description and their resume.

Guidelines:
- Generate 12-15 questions total.
- Organize into sections: BEHAVIORAL (4-5), TECHNICAL/ROLE-SPECIFIC (4-5), and SITUATIONAL (3-4).
- Questions should be specific to this role, company, and the candidate's background.
- Include 1-2 questions the candidate should ask the interviewer at the end.
- For each question, add a brief hint in parentheses about what the interviewer is looking for.
- Format clearly with section headers and numbered questions.
- Output ONLY the questions, no preamble.`;

  const usr = `Job Title: ${job.title}
Company: ${job.company || 'Unknown'}
Location: ${job.location || 'Not listed'}
Tier Grade: ${job.tier || 'N/A'}

Job Description:
${job.description}

---

Candidate Resume:
${resumeText || 'Not provided \u2014 generate general questions based on the job description.'}`;

  const resp = await callAPI(sys, usr, 0.4);
  if (resp.error) {
    showPanel('interviewPanel', 'interviewTitle', 'interviewText',
      `Interview Prep \u2014 ${job.title}`, `Error: ${resp.error}`);
    return;
  }

  job.interview_questions = resp.text;
  await chrome.storage.local.set({ savedJobs: allSavedJobs });
  showPanel('interviewPanel', 'interviewTitle', 'interviewText',
    `Interview Prep \u2014 ${job.title}`, resp.text);

  if (job.id) {
    try {
      await chrome.runtime.sendMessage({
        action: 'updateJob',
        jobId: job.id,
        updates: { interview_questions: resp.text }
      });
    } catch (_) {}
  }
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

function renderSavedJobs() {
  const container = document.getElementById('savedJobsList');
  container.innerHTML = '';

  let jobs = [...allSavedJobs];

  if (currentFilter === 'applied') jobs = jobs.filter(j => j.applied || j.stage === 'applied');
  if (currentFilter === 'pending') jobs = jobs.filter(j => !j.applied && j.stage !== 'rejected');
  if (pipelineFilter) jobs = jobs.filter(j => (j.stage || 'saved') === pipelineFilter);

  if (jobs.length === 0) {
    container.innerHTML = `<div class="empty-state">No jobs here yet.<br><span style="font-size:10px;">Grade S, A, or B tier jobs to save them.</span></div>`;
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
      meta.textContent = [job.company, job.location].filter(Boolean).join(' \u2014 ');
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
      pay.textContent = parts.join(' \u00b7 ');
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
    coverBtn.textContent = job.cover_letter ? '\u2709 Letter' : 'Cover Letter';
    coverBtn.addEventListener('click', () => generateCoverLetter(realIndex));
    actions.appendChild(coverBtn);

    const tweakBtn = document.createElement('button');
    tweakBtn.className = 'job-act-btn primary';
    tweakBtn.textContent = job.tweaked_resume ? '\u2709 Resume' : 'Tweak Resume';
    tweakBtn.addEventListener('click', () => generateTweakedResume(realIndex));
    actions.appendChild(tweakBtn);

    const interviewBtn = document.createElement('button');
    interviewBtn.className = 'job-act-btn success';
    interviewBtn.textContent = job.interview_questions ? '\u2709 Interview' : 'Interview Q\u2019s';
    interviewBtn.addEventListener('click', () => generateInterviewQuestions(realIndex));
    actions.appendChild(interviewBtn);

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
