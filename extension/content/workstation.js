const JTR_WORKSTATION_ID = 'jtr-workstation-host';

function initWorkstation() {
  if (document.getElementById(JTR_WORKSTATION_ID) || !document.body) return;

  const host = document.createElement('div');
  host.id = JTR_WORKSTATION_ID;
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      * { box-sizing: border-box; }
      .tab, .panel, button, select { font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
      .tab { position: fixed; right: 0; top: 38%; transform: translateY(-50%); z-index: 2147483600; width: 42px; min-height: 136px; padding: 12px 8px; display: grid; place-items: center; gap: 8px; color: #bbf7d0; background: linear-gradient(145deg, rgba(30,41,59,.92), rgba(15,23,42,.98)); border: 1px solid rgba(56,189,248,.32); border-right: 0; border-radius: 16px 0 0 16px; box-shadow: 0 24px 60px rgba(0,0,0,.38); cursor: pointer; }
      .tab strong { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11px; letter-spacing: .12em; text-transform: uppercase; }
      .tab span { width: 8px; height: 8px; border-radius: 999px; background: linear-gradient(135deg,#0ea5e9,#10b981 50%,#34d399); box-shadow: 0 0 14px rgba(52,211,153,.55); }
      .panel { position: fixed; top: 0; right: 0; z-index: 2147483601; width: clamp(360px, 18vw, 520px); max-width: calc(100vw - 8px); height: 100dvh; color: #f8fafc; background: #05070a; border-left: 1px solid rgba(56,189,248,.32); box-shadow: -24px 0 60px rgba(0,0,0,.42); transform: translateX(calc(100% + 8px)); transition: transform .22s ease; overflow: hidden; display: grid; grid-template-rows: auto auto 1fr auto; }
      .panel.open { transform: translateX(0); }
      .panel:before { content: ''; position: absolute; inset: 0; background: radial-gradient(at 0% 0%, rgba(16,185,129,.16), transparent 38%), radial-gradient(at 100% 0%, rgba(14,165,233,.12), transparent 38%), radial-gradient(at 50% 100%, rgba(52,211,153,.07), transparent 48%); pointer-events: none; }
      .head, .tools, .jobs, .foot { position: relative; z-index: 1; }
      .head { padding: 18px; background: rgba(15,23,42,.42); border-bottom: 1px solid rgba(255,255,255,.08); backdrop-filter: blur(24px); }
      .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
      h2 { margin: 0; font-size: 20px; letter-spacing: -.04em; background: linear-gradient(to right,#34d399,#38bdf8); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; }
      .sub, .meta, .pay, .foot, .empty { color: #94a3b8; }
      .sub { margin-top: 4px; font-size: 12px; }
      .close { width: 34px; height: 34px; }
      .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 16px; }
      .stat, .job { background: linear-gradient(145deg, rgba(30,41,59,.2), rgba(15,23,42,.54)); border: 1px solid rgba(255,255,255,.08); box-shadow: 0 16px 38px rgba(0,0,0,.22); }
      .stat { padding: 9px 8px; text-align: center; border-radius: 14px; }
      .stat strong { display: block; color: #38bdf8; font-size: 16px; }
      .stat span { display: block; color: #94a3b8; font-size: 10px; }
      .tools { padding: 12px 14px; border-bottom: 1px solid rgba(255,255,255,.08); background: rgba(15,23,42,.24); }
      .row { display: flex; gap: 8px; }
      .row + .row { margin-top: 8px; }
      button, select { border-radius: 12px; border: 1px solid rgba(56,189,248,.22); background: rgba(14,165,233,.08); color: #94a3b8; font-weight: 800; cursor: pointer; }
      button:hover { background: rgba(14,165,233,.15); border-color: rgba(56,189,248,.42); color: #f8fafc; }
      .primary { color: #38bdf8; border-color: rgba(56,189,248,.35); background: rgba(14,165,233,.12); }
      .danger { color: #fecaca; border-color: rgba(239,68,68,.32); background: rgba(239,68,68,.12); }
      .tools button { flex: 1; padding: 10px 8px; font-size: 11px; }
      select { width: 100%; padding: 9px 10px; outline: none; font-size: 12px; }
      select option { background: #0f172a; color: #f8fafc; }
      .jobs { overflow: auto; padding: 14px; }
      .job { margin-bottom: 10px; padding: 13px; border-radius: 18px; }
      .job-head { display: flex; align-items: flex-start; gap: 8px; }
      .tier { flex: 0 0 auto; min-width: 26px; text-align: center; padding: 3px 8px; border-radius: 999px; font-size: 11px; font-weight: 900; border: 1px solid rgba(56,189,248,.3); }
      .tier-S { color: #fbbf24; background: rgba(245,158,11,.16); border-color: rgba(245,158,11,.34); }
      .tier-A { color: #34d399; background: rgba(16,185,129,.15); border-color: rgba(16,185,129,.34); }
      .tier-B { color: #38bdf8; background: rgba(14,165,233,.14); border-color: rgba(56,189,248,.34); }
      .tier-C { color: #fed7aa; background: rgba(245,158,11,.11); border-color: rgba(245,158,11,.25); }
      .tier-D, .tier-F, .tier-x { color: #fecaca; background: rgba(239,68,68,.12); border-color: rgba(239,68,68,.32); }
      .title { min-width: 0; flex: 1; color: #f8fafc; font-weight: 800; font-size: 13px; line-height: 1.3; }
      .title a { color: inherit; text-decoration: none; }
      .title a:hover { color: #38bdf8; }
      .meta, .pay { font-size: 11px; line-height: 1.45; margin-top: 5px; }
      .pay { color: #64748b; }
      .job-actions { display: grid; grid-template-columns: 1fr auto; gap: 6px; margin-top: 10px; }
      .job-actions button { padding: 8px 9px; font-size: 10px; }
      .pending { margin-top: 8px; color: #fed7aa; font-size: 10px; font-weight: 800; }
      .empty { margin-top: 40px; text-align: center; font-size: 13px; line-height: 1.5; }
      .foot { padding: 10px 14px 14px; border-top: 1px solid rgba(255,255,255,.08); font-size: 10px; background: rgba(15,23,42,.32); }
    </style>
    <button class="tab" type="button"><span></span><strong>JobTiered</strong></button>
    <aside class="panel">
      <section class="head"><div class="top"><div><h2>JobTiered</h2><div class="sub">Docked workstation</div></div><button class="close" type="button">×</button></div><div class="stats"><div class="stat"><strong data-stat="saved">0</strong><span>Saved</span></div><div class="stat"><strong data-stat="applied">0</strong><span>Applied</span></div><div class="stat"><strong data-stat="pending">0</strong><span>Pending</span></div></div></section>
      <section class="tools"><div class="row"><button class="primary" data-action="refresh" type="button">Refresh</button><button data-action="rescan" type="button">Rescan</button><button data-action="settings" type="button">Settings</button></div><div class="row"><select data-filter="stage"><option value="">All stages</option><option value="saved">Saved</option><option value="applied">Applied</option><option value="offer">Offer</option><option value="rejected">Rejected</option></select></div></section>
      <section class="jobs" data-jobs></section>
      <section class="foot" data-status>Local data ready.</section>
    </aside>`;

  document.documentElement.appendChild(host);

  const panel = shadow.querySelector('.panel');
  const tab = shadow.querySelector('.tab');
  const close = shadow.querySelector('.close');
  const jobsEl = shadow.querySelector('[data-jobs]');
  const statusEl = shadow.querySelector('[data-status]');
  const stageFilter = shadow.querySelector('[data-filter="stage"]');
  let savedJobs = [];
  let filterStage = '';

  const esc = (v) => String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tier = (v) => {
    const t = String(v || '?').toUpperCase().replace('~', '').trim();
    return ['S', 'A', 'B', 'C', 'D', 'F'].includes(t) ? t : 'x';
  };
  const keyOf = (job) => job.dedup_key || job.id || `${job.url || ''}|${job.title || ''}|${job.company || ''}`;
  const setStatus = (text) => { statusEl.textContent = text; };

  async function setOpen(open) {
    panel.classList.toggle('open', !!open);
    tab.style.display = open ? 'none' : 'grid';
    await chrome.storage.local.set({ workstationOpen: !!open });
    if (open) loadJobs(true);
  }

  function shapedJobs() {
    return (savedJobs || []).map(j => ({ ...j, stage: j.stage || (j.applied ? 'applied' : 'saved') }));
  }

  function render() {
    const shaped = shapedJobs();
    shadow.querySelector('[data-stat="saved"]').textContent = shaped.length;
    shadow.querySelector('[data-stat="applied"]').textContent = shaped.filter(j => j.applied || j.stage === 'applied').length;
    shadow.querySelector('[data-stat="pending"]').textContent = shaped.filter(j => !j.applied && j.stage !== 'rejected').length;
    const jobs = (filterStage ? shaped.filter(j => j.stage === filterStage) : shaped).slice().reverse();

    if (!jobs.length) {
      jobsEl.innerHTML = '<div class="empty">No saved jobs yet.<br>Open a full posting and grade S, A, or B jobs to save them.</div>';
      return;
    }

    jobsEl.innerHTML = jobs.map(job => {
      const t = tier(job.tier);
      const rawKey = keyOf(job);
      const k = esc(rawKey);
      const stage = job.stage || 'saved';
      const meta = [job.company, job.location].filter(Boolean).join(' · ');
      const pay = [job.pay, job.marketRange ? `Mkt: ${job.marketRange}` : '', job.fit && job.fit !== 'N/A' ? job.fit : ''].filter(Boolean).join(' · ');
      const title = esc(job.title || 'Untitled job');
      const titleHtml = job.url ? `<a href="${esc(job.url)}" target="_blank" rel="noopener noreferrer">${title}</a>` : title;
      return `<article class="job" data-key="${k}"><div class="job-head"><span class="tier tier-${t}">${t === 'x' ? '?' : t}</span><div class="title">${titleHtml}</div></div>${meta ? `<div class="meta">${esc(meta)}</div>` : ''}${pay ? `<div class="pay">${esc(pay)}</div>` : ''}<div class="job-actions"><select data-stage="${k}">${['saved','applied','offer','rejected'].map(s => `<option value="${s}" ${s === stage ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select><button class="danger" data-remove="${k}" type="button">Delete</button></div>${job.syncPending ? '<div class="pending">Sync pending</div>' : ''}</article>`;
    }).join('');
  }

  async function loadJobs(syncServer) {
    const local = await chrome.storage.local.get('savedJobs');
    savedJobs = local.savedJobs || [];
    render();
    if (!syncServer) return;
    try {
      setStatus('Syncing saved jobs...');
      const resp = await chrome.runtime.sendMessage({ action: 'getSavedJobs' });
      if (!resp || resp.error || !Array.isArray(resp.jobs)) {
        setStatus(resp?.error ? `Sync failed: ${resp.error}` : 'Sync failed, using local data.');
        return;
      }
      const serverJobs = resp.jobs.map(row => ({ id: row.id, title: row.title || '', company: row.company || '', location: row.location || '', url: row.url || '', dedup_key: row.dedup_key || '', tier: row.tier || '', pay: row.pay || '', marketRange: row.market_range || '', fit: row.fit || '', date: row.created_at ? row.created_at.split('T')[0] : '', description: row.description || '', applied: !!row.applied, stage: row.stage || 'saved', reasoning: row.reasoning || '', pros: row.pros || [], flags: row.flags || [], cover_letter: row.cover_letter || '', tweaked_resume: row.tweaked_resume || '', interview_questions: row.interview_questions || '', syncPending: false }));
      const map = new Map();
      [...savedJobs, ...serverJobs].forEach(job => map.set(keyOf(job), job));
      savedJobs = [...map.values()].slice(-200);
      await chrome.storage.local.set({ savedJobs });
      render();
      setStatus('Synced.');
    } catch (_) {
      setStatus('Offline, using local data.');
    }
  }

  async function updateStage(key, stage) {
    const idx = savedJobs.findIndex(j => keyOf(j) === key);
    if (idx === -1) return;
    savedJobs[idx] = { ...savedJobs[idx], stage, applied: stage !== 'saved', syncPending: !savedJobs[idx].id };
    await chrome.storage.local.set({ savedJobs });
    render();
    if (savedJobs[idx].id) {
      const resp = await chrome.runtime.sendMessage({ action: 'updateJob', jobId: savedJobs[idx].id, updates: { stage, applied: stage !== 'saved' } });
      setStatus(resp?.error ? `Cloud update failed: ${resp.error}` : 'Stage synced.');
    } else setStatus('Saved locally.');
  }

  async function removeJob(key) {
    const job = savedJobs.find(j => keyOf(j) === key);
    savedJobs = savedJobs.filter(j => keyOf(j) !== key);
    await chrome.storage.local.set({ savedJobs });
    render();
    if (job?.id) {
      const resp = await chrome.runtime.sendMessage({ action: 'deleteJob', jobId: job.id });
      setStatus(resp?.error ? `Cloud delete failed: ${resp.error}` : 'Deleted from cloud.');
    } else setStatus('Removed locally.');
  }

  function eventElement(target) {
    return target && target.nodeType === Node.ELEMENT_NODE ? target : target?.parentElement || null;
  }

  tab.addEventListener('click', () => setOpen(true));
  close.addEventListener('click', () => setOpen(false));
  shadow.addEventListener('click', (e) => {
    const target = eventElement(e.target);
    const button = target?.closest('button');
    if (!button) return;
    if (button.dataset.action === 'refresh') loadJobs(true);
    if (button.dataset.action === 'rescan') { scan(); setStatus('Page rescan requested.'); }
    if (button.dataset.action === 'settings') chrome.runtime.openOptionsPage();
    if (button.dataset.remove) removeJob(button.dataset.remove);
  });
  shadow.addEventListener('change', (e) => {
    const target = eventElement(e.target);
    if (!target) return;
    if (target === stageFilter) { filterStage = stageFilter.value; render(); return; }
    if (target.dataset.stage) updateStage(target.dataset.stage, target.value);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.savedJobs) { savedJobs = changes.savedJobs.newValue || []; render(); }
  });
  chrome.storage.local.get(['workstationOpen', 'savedJobs']).then(({ workstationOpen, savedJobs: initialJobs }) => {
    savedJobs = initialJobs || [];
    render();
    setOpen(!!workstationOpen);
  });
}
