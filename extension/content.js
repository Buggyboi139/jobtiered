const gradeCache = new Map();
let pendingListings = [];
let pendingDetails = [];
let batchTimer = null;
let isProcessing = false;
let retryDelay = 100;
const BATCH_SIZE = 8;
const BATCH_DELAY = 500;
const DESC_LIMIT = 3500;
const POLL_INTERVAL = 4000;
const SAVED_DESC_LIMIT = 2000;

let globalTooltip = null;
let keywordHighlightActive = false;
let resumeKeywords = [];
let lastDetailHash = '';
let lastUrl = window.location.href;

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function initTooltip() {
  if (document.getElementById('jtr-global-tooltip')) {
    globalTooltip = document.getElementById('jtr-global-tooltip');
    return;
  }
  globalTooltip = document.createElement('div');
  globalTooltip.id = 'jtr-global-tooltip';
  globalTooltip.style.cssText = `
    visibility:hidden; width:360px;
    background:rgba(15,15,20,0.97);
    backdrop-filter:blur(16px); -webkit-backdrop-filter:blur(16px);
    color:#e8e8f0; text-align:left;
    border-radius:12px; padding:14px 16px;
    position:fixed; z-index:2147483647;
    opacity:0; transition:opacity 0.18s ease;
    font-size:13px; font-family:system-ui,sans-serif;
    box-shadow:0 12px 40px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.1);
    pointer-events:none; line-height:1.5;
  `;
  document.body.appendChild(globalTooltip);
}

function showTooltip(e, html) {
  if (!globalTooltip) initTooltip();
  globalTooltip.innerHTML = html;
  globalTooltip.style.visibility = 'visible';
  globalTooltip.style.opacity = '1';
  let x = e.clientX + 16;
  let y = e.clientY + 16;
  globalTooltip.style.left = '0px';
  globalTooltip.style.top = '0px';
  const tw = globalTooltip.offsetWidth || 360;
  const th = globalTooltip.offsetHeight || 200;
  if (x + tw > window.innerWidth) x = e.clientX - tw - 12;
  if (y + th > window.innerHeight) y = window.innerHeight - th - 10;
  globalTooltip.style.left = Math.max(4, x) + 'px';
  globalTooltip.style.top = Math.max(4, y) + 'px';
}

function hideTooltip() {
  if (globalTooltip) {
    globalTooltip.style.visibility = 'hidden';
    globalTooltip.style.opacity = '0';
  }
}

function hashJob(title, company) {
  return ((title || '') + '|' + (company || '')).toLowerCase().replace(/[^a-z0-9|]/g, '').slice(0, 60);
}

function truncate(text, max) {
  if (!text || text.length <= max) return text || '';
  return text.slice(0, max) + '\u2026';
}

async function loadCache() {
  try {
    const { gradeHistory } = await chrome.storage.local.get('gradeHistory');
    if (gradeHistory) {
      for (const [k, v] of Object.entries(gradeHistory)) gradeCache.set(k, v);
    }
  } catch (e) {
    console.warn('[JTR] Cache load failed:', e.message);
  }
}

async function persistCache() {
  try {
    const obj = Object.fromEntries([...gradeCache].slice(-400));
    await chrome.storage.local.set({ gradeHistory: obj });
  } catch (e) {
    console.warn('[JTR] Cache persist failed:', e.message);
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.gradeHistory && !changes.gradeHistory.newValue) gradeCache.clear();
  if (changes.resumeText) extractResumeKeywords(changes.resumeText.newValue || '');
});

async function extractResumeKeywords(text) {
  if (!text) { resumeKeywords = []; return; }
  const techTerms = text.match(/\b([A-Z][a-zA-Z0-9+#.]+(?:\s[A-Z][a-zA-Z0-9+.]+)?|[A-Z]{2,})\b/g) || [];
  const cleaned = [...new Set(techTerms.map(t => t.trim()).filter(t => t.length > 2 && t.length < 40))];
  resumeKeywords = cleaned.slice(0, 60);
}

function getJsonLdDescription() {
  let ext = '';
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    try {
      const d = JSON.parse(s.innerText || s.textContent || '');
      const arr = Array.isArray(d) ? d : [d];
      for (const item of arr) {
        const targets = item['@graph'] ? item['@graph'] : [item];
        for (const t of targets) {
          if (t['@type'] === 'JobPosting') {
            if (t.baseSalary) ext += `Salary: ${JSON.stringify(t.baseSalary)}\n`;
            if (t.jobLocation) ext += `Location: ${JSON.stringify(t.jobLocation)}\n`;
            if (t.employmentType) ext += `Type: ${t.employmentType}\n`;
            if (t.description) ext += `Details: ${t.description.replace(/<[^>]*>?/gm, '')}\n`;
          }
        }
      }
    } catch (_) {}
  }
  return ext.trim();
}

function extractGlassdoorPay() {
  const paySelectors = [
    '[data-test="detailSalary"]',
    '[data-test="salaryEstimate"]',
    '[class*="SalaryEstimate"]',
    '[class*="salary-estimate"]',
    '[class*="SalaryRange"]',
    '[class*="CompensationModule"]',
    '[class*="EmpBasicInfo"] [class*="salary"]',
    '[class*="salaryTab"]',
    '[class*="SalaryModule"]',
    '[class*="payRange"]',
    '[class*="PayRange"]',
  ];

  for (const sel of paySelectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.innerText?.trim();
        if (text && /\$[\d,]/.test(text)) return text;
      }
    } catch (_) {}
  }

  const detailBody = qFirst(document, [
    '[data-test="job-detail-body"]',
    '.JobDetails',
    '[class*="JobDetail"]',
    '#JobDescriptionContainer',
    '[class*="jobDetail"]',
  ]);

  if (detailBody) {
    const bodyText = detailBody.innerText || '';
    const payPatterns = [
      /(?:Employer (?:Provided|Est\.) (?:Pay|Salary)|Estimated Total Pay|Base Pay Range|Salary Range|Pay Range|Compensation)[:\s]*\$[\d,]+(?:\.\d+)?(?:\s*[-–—to]+\s*\$[\d,]+(?:\.\d+)?)?(?:\s*(?:\/\s*(?:yr|year|hr|hour|mo|month)|per\s+(?:year|hour|month)|[kK](?:\s|$)|a\s+year))?/i,
      /\$[\d,]+(?:\.\d+)?(?:[kK])?\s*[-–—to]+\s*\$[\d,]+(?:\.\d+)?(?:[kK])?\s*(?:\/\s*(?:yr|year|hr|hour|mo)|per\s+(?:year|hour|month)|a\s+year)?/i,
      /(?:salary|pay|compensation|base pay)[:\s]*\$[\d,]+(?:\.\d+)?(?:\s*[-–—to]+\s*\$[\d,]+(?:\.\d+)?)?/i,
    ];
    for (const pat of payPatterns) {
      const m = bodyText.match(pat);
      if (m) return m[0].trim();
    }
  }

  const allText = document.body.innerText || '';
  const globalMatch = allText.match(/(?:Employer (?:Provided|Est\.) (?:Pay|Salary)|Estimated Total Pay|Base Pay Range)[:\s]*\$[\d,]+(?:\.\d+)?(?:\s*[-–—to]+\s*\$[\d,]+(?:\.\d+)?)?(?:\s*(?:\/\s*(?:yr|year|hr|hour)|per\s+(?:year|hour)|[kK](?:\s|$)|a\s+year))?/i);
  if (globalMatch) return globalMatch[0].trim();

  return '';
}

const BADGE_STYLES = `
  :host { display:inline-block; margin:0 6px; vertical-align:middle; position:relative; z-index:9999; }
  .badge {
    display:inline-flex; align-items:center; gap:4px; padding:3px 9px;
    font-family:system-ui,sans-serif; font-weight:700; border-radius:6px;
    background:rgba(255,255,255,0.12); color:#e8e8f0; cursor:help;
    font-size:12px; line-height:1.3; white-space:nowrap; text-transform:uppercase;
    border:1px solid rgba(255,255,255,0.18);
    backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px);
    box-shadow:0 2px 8px rgba(0,0,0,0.4);
    transition:transform 0.15s ease, box-shadow 0.15s ease;
  }
  .badge:hover { transform:translateY(-1px); box-shadow:0 4px 14px rgba(0,0,0,0.5); }
  .loading { animation:pulse 1.4s infinite ease-in-out; text-transform:none; font-size:11px; }
  @keyframes pulse { 0%,100%{opacity:.45} 50%{opacity:1} }
  .tier-S { background:linear-gradient(135deg,rgba(251,191,36,0.35),rgba(251,191,36,0.15)); color:#fbbf24; border-color:rgba(251,191,36,0.5); text-shadow:0 0 8px rgba(251,191,36,0.4); }
  .tier-A { background:linear-gradient(135deg,rgba(74,222,128,0.3),rgba(74,222,128,0.1)); color:#4ade80; border-color:rgba(74,222,128,0.45); }
  .tier-B { background:linear-gradient(135deg,rgba(74,158,255,0.3),rgba(74,158,255,0.1)); color:#4a9eff; border-color:rgba(74,158,255,0.45); }
  .tier-C { background:linear-gradient(135deg,rgba(251,146,60,0.3),rgba(251,146,60,0.1)); color:#fb923c; border-color:rgba(251,146,60,0.45); }
  .tier-D { background:linear-gradient(135deg,rgba(248,113,113,0.3),rgba(248,113,113,0.1)); color:#f87171; border-color:rgba(248,113,113,0.45); }
  .tier-F { background:linear-gradient(135deg,rgba(220,38,38,0.4),rgba(220,38,38,0.15)); color:#ff6b6b; border-color:rgba(220,38,38,0.55); }
  .upgrade {
    background:linear-gradient(135deg,rgba(99,102,241,0.3),rgba(99,102,241,0.12));
    color:#a5b4fc; border-color:rgba(99,102,241,0.5);
    font-size:10px; text-transform:none; cursor:pointer;
    padding:4px 10px;
  }
  .upgrade:hover { background:linear-gradient(135deg,rgba(99,102,241,0.45),rgba(99,102,241,0.2)); }
`;

function tierColor(tier) {
  const map = { S: '#fbbf24', A: '#4ade80', B: '#4a9eff', C: '#fb923c', D: '#f87171', F: '#ff6b6b' };
  return map[tier?.toUpperCase()] || '#9090a0';
}

function buildTooltipHtml(result) {
  const pay = escapeHtml(result.estimated_pay || result.pay || 'Listed');
  const market = escapeHtml(result.market_range || '');
  const fit = result.fit_score && result.fit_score !== 'N/A' ? escapeHtml(result.fit_score) : '';
  const reasoning = escapeHtml(result.reasoning || 'None provided');
  const tier = (result.tier || result.grade || '?').toUpperCase();
  const color = tierColor(tier);

  const headerHtml = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.1);">
      <span style="font-size:22px;font-weight:900;color:${color};text-shadow:0 0 12px ${color}40;">${tier}</span>
      <div style="flex:1;">
        <div style="color:#e8e8f0;font-size:12px;"><strong style="color:${color};">Pay:</strong> ${pay}</div>
        ${market ? `<div style="color:#9090a0;font-size:11px;">Market: ${market}</div>` : ''}
        ${fit ? `<div style="color:#9090a0;font-size:11px;">Fit: <strong style="color:#4ade80;">${fit}</strong></div>` : ''}
      </div>
    </div>`;

  const pros = (result.pros || []).map(p => `<li style="margin:3px 0;">${escapeHtml(p)}</li>`).join('');
  const flags = (result.red_flags || result.flags || []).map(f => `<li style="margin:3px 0;">${escapeHtml(f)}</li>`).join('');
  const missing = (result.missing_skills || []).length > 0
    ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">
        <div style="color:#fb923c;font-size:11px;font-weight:700;margin-bottom:4px;">GAPS</div>
        <ul style="padding-left:14px;margin:0;font-size:12px;color:#9090a0;">
          ${result.missing_skills.map(s => `<li style="margin:2px 0;">${escapeHtml(s)}</li>`).join('')}
        </ul></div>` : '';

  return `
    ${headerHtml}
    <div style="font-size:12px;color:#b0b0c0;margin-bottom:10px;line-height:1.5;">${reasoning}</div>
    ${pros ? `<div style="margin-bottom:6px;"><div style="color:#4ade80;font-size:11px;font-weight:700;margin-bottom:3px;">PROS</div><ul style="padding-left:14px;margin:0;font-size:12px;color:#9090a0;">${pros}</ul></div>` : ''}
    ${flags ? `<div><div style="color:#f87171;font-size:11px;font-weight:700;margin-bottom:3px;">FLAGS</div><ul style="padding-left:14px;margin:0;font-size:12px;color:#9090a0;">${flags}</ul></div>` : ''}
    ${missing}`;
}

function createBadge(container, id) {
  if (!container) return null;
  const old = container.querySelectorAll('span[data-jtr-id]');
  old.forEach(b => { if (b.getAttribute('data-jtr-id') !== id) b.remove(); });
  const existing = container.querySelector(`span[data-jtr-id="${id}"]`);
  if (existing) return existing;

  const host = document.createElement('span');
  host.setAttribute('data-jtr-id', id);
  host.style.cssText = 'display:inline-block;vertical-align:middle;position:relative;z-index:9999;pointer-events:all!important;';

  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `<style>${BADGE_STYLES}</style><span class="badge loading" id="b">Grading\u2026</span>`;

  host.addEventListener('mousemove', (e) => { e.stopPropagation(); if (host._tip) showTooltip(e, host._tip); });
  host.addEventListener('mouseenter', (e) => { e.stopPropagation(); if (host._tip) showTooltip(e, host._tip); });
  host.addEventListener('mouseleave', (e) => { e.stopPropagation(); hideTooltip(); });
  host.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (host._tip) {
      if (globalTooltip?.style.opacity === '1') hideTooltip();
      else showTooltip(e, host._tip);
    }
  }, true);

  container.prepend(host);
  return host;
}

function renderResult(host, result) {
  if (!host || !result) return;
  const b = host.shadowRoot?.getElementById('b');
  if (!b) return;
  const tier = (result.tier || result.grade || '?').toString().toUpperCase().trim();
  b.className = `badge tier-${tier}`;
  b.textContent = tier;
  host._tip = buildTooltipHtml(result);
}

function renderError(host, msg) {
  if (!host) return;
  const b = host.shadowRoot?.getElementById('b');
  if (!b) return;
  b.className = 'badge';
  b.style.color = '#f87171';
  b.textContent = '!';
  host._tip = `<div style="color:#f87171;font-weight:700;">Error</div><div style="color:#9090a0;font-size:12px;margin-top:4px;">${escapeHtml(msg)}</div>`;
}

function renderUpgradePrompt(host) {
  if (!host) return;
  const b = host.shadowRoot?.getElementById('b');
  if (!b) return;
  b.className = 'badge upgrade';
  b.textContent = '\u2B06 Upgrade to Pro';
  host._tip = `<div style="color:#a5b4fc;font-weight:700;font-size:14px;margin-bottom:8px;">Free Grades Exhausted</div>
    <div style="color:#9090a0;font-size:12px;line-height:1.5;">You\u2019ve used all 15 free lifetime grades.<br><br>Upgrade to <strong style="color:#a5b4fc;">Pro</strong> for unlimited AI job grading, cover letter generation, resume tailoring, and more.</div>
    <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);color:#71717a;font-size:11px;">Click the JobTiered extension icon \u2192 Upgrade Plan</div>`;
}

function removeBadgeSilently(host) {
  if (host) host.remove();
}

function applyDimming(element, mode, tierVal) {
  if (!element) return;
  element.style.transition = 'opacity 0.35s ease';
  element.style.opacity = (mode === 'personal' && (tierVal === 'd' || tierVal === 'f')) ? '0.22' : '1';
}

function getDescriptionBody() {
  return document.querySelector(
    '.jobs-description__content, #jobDescriptionText, .jobDescriptionContent, [data-testid="job-details-scroll-container"], #JobDescriptionContainer'
  );
}

function qFirst(root, selectors) {
  if (!root) return null;
  for (const sel of selectors) {
    try { const el = root.querySelector(sel); if (el) return el; } catch (_) {}
  }
  return null;
}

function qText(root, selectors) {
  return qFirst(root, selectors)?.innerText?.trim() || '';
}

function highlightKeywordsInPage() {
  if (!keywordHighlightActive || resumeKeywords.length === 0) return;
  const descEl = getDescriptionBody();
  if (!descEl || descEl.getAttribute('data-jtr-highlighted') === '1') return;
  descEl.setAttribute('data-jtr-highlighted', '1');
  const walker = document.createTreeWalker(descEl, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) textNodes.push(node);
  const escapedKws = resumeKeywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(`\\b(${escapedKws.join('|')})\\b`, 'gi');
  for (const tn of textNodes) {
    if (!tn.nodeValue || !pattern.test(tn.nodeValue)) continue;
    pattern.lastIndex = 0;
    const span = document.createElement('span');
    span.innerHTML = tn.nodeValue.replace(pattern, '<mark style="background:rgba(74,158,255,0.25);color:inherit;border-radius:3px;padding:0 2px;">$1</mark>');
    tn.parentNode.replaceChild(span, tn);
  }
}

function getDetailJob() {
  const host = window.location.hostname;
  const pageUrl = window.location.href;
  let title = '', description = '', container = null, company = '', location = '';

  if (host.includes('linkedin.com')) {
    title = qText(document, [
      '.job-details-jobs-unified-top-card__job-title h1',
      '.job-details-jobs-unified-top-card__job-title',
      '.jobs-unified-top-card__job-title h1',
      '.jobs-unified-top-card__job-title',
      'h1.t-24', 'h1[class*="topcard"]', 'h1'
    ]);
    company = qText(document, [
      '.job-details-jobs-unified-top-card__company-name a',
      '.job-details-jobs-unified-top-card__company-name',
      '.jobs-unified-top-card__company-name a',
      '.jobs-unified-top-card__company-name',
      'a.topcard__org-name-link',
      '.topcard__flavor'
    ]);
    location = qText(document, [
      '.job-details-jobs-unified-top-card__bullet',
      '.job-details-jobs-unified-top-card__primary-description-container .tvm__text',
      '.jobs-unified-top-card__bullet',
      '.topcard__flavor--bullet',
      '[aria-label*="location"]'
    ]);
    container = qFirst(document, [
      '.job-details-jobs-unified-top-card__content--two-pane',
      '.jobs-unified-top-card__content--two-pane',
      '.jobs-details__main-content',
      '.topcard'
    ]) || document.querySelector('h1')?.parentElement;
    description = qText(document, [
      '#job-details',
      '.jobs-description-content__text',
      '.jobs-description__content',
      '.jobs-box__html-content',
      '.description__text'
    ]);

  } else if (host.includes('indeed.com')) {
    const titleEl = qFirst(document, [
      '[data-testid="simpler-jobTitle"]',
      '[data-testid="jobsearch-JobInfoHeader-title"]',
      '.jobsearch-JobInfoHeader-title',
      'h2.jobTitle', 'h1'
    ]);
    title = titleEl?.innerText?.replace(/[-–]\s*job post/i, '')?.trim() || '';
    company = qText(document, [
      '[data-testid="inlineHeader-companyName"] a',
      '[data-testid="inlineHeader-companyName"]',
      '.jobsearch-JobInfoHeader-subtitle .companyName',
      '[data-company-name="true"]'
    ]);
    location = qText(document, [
      '[data-testid="inlineHeader-companyLocation"]',
      '[data-testid="job-location"]',
      '.jobsearch-JobInfoHeader-subtitle .companyLocation',
      '[data-testid="jobsearch-JobInfoHeader-companyLocation"]'
    ]);
    container = qFirst(document, ['.jobsearch-JobInfoHeader-title-container']) || titleEl?.parentElement;
    description = qText(document, [
      '#jobDescriptionText',
      '[data-testid="jobsearch-JobComponent-description"]',
      '.jobsearch-jobDescriptionText'
    ]);

  } else if (host.includes('glassdoor.com')) {
    title = qText(document, [
      '[data-test="job-title"]', '[data-test="jobTitle"]',
      'h1[data-test]', '[class*="JobDetails_jobTitle"]',
      '[class*="jobTitle"]', '.JobDetails h1', 'h1'
    ]);
    company = qText(document, [
      '[data-test="employer-name"]', '[data-test="employerName"]',
      '[class*="EmployerProfile_compactEmployerName"]',
      '[class*="employer-name"]', '.employer-name'
    ]).replace(/[\d.]+\s*$/, '').trim();
    location = qText(document, [
      '[data-test="emp-location"]', '[data-test="location"]',
      '[class*="location"]', '.location'
    ]);
    container = (qFirst(document, [
      '[data-test="job-title"]', '[class*="JobDetails_jobTitle"]', '.JobDetails header', 'h1'
    ]) || document.querySelector('h1'))?.parentElement;
    description = qText(document, [
      '[data-test="JobDescription"]', '[data-test="job-description-text"]',
      '[class*="JobDescription"]', '[class*="jobDescription"]',
      '#JobDescriptionContainer', '.jobDescriptionContent', '.desc'
    ]);

    if (!description) {
      const pane = qFirst(document, [
        '[data-test="job-detail-body"]', '.JobDetails',
        '#JobDescriptionContainer', '[id^="job-desc-"]'
      ]);
      if (pane) description = pane.innerText?.trim() || '';
    }

    const gdPay = extractGlassdoorPay();
    if (gdPay) {
      const payNormalized = gdPay.replace(/\s+/g, ' ');
      if (!description.includes(payNormalized)) {
        description = `Salary/Pay Information: ${payNormalized}\n\n${description}`;
      }
    }

  } else if (host.includes('ziprecruiter.com')) {
    const rightPane = qFirst(document, [
      '[data-testid="right-pane"]', '.job_details_container',
      '.job-detail-panel', '[role="dialog"]', '[class*="JobDetail"]'
    ]);
    const scope = rightPane || document;

    const titleEl = qFirst(scope, [
      'h1[data-testid="job-title"]', '[data-testid="job-title"]',
      'h2.font-bold', 'h1', 'h2[class*="text-header"]', 'h2'
    ]);
    title = titleEl?.innerText?.trim() || '';
    container = titleEl?.parentElement || null;

    description = qText(scope, [
      '[data-testid="job-details-scroll-container"]', '.job_description',
      '[data-testid="job-description"]', '.job-description-content', '.job-body'
    ]);
    company = qText(scope, [
      '[data-testid="job-company"]', '.company-name',
      'a[data-testid="company-name"]', '[class*="company"]'
    ]);
    location = qText(scope, [
      '[data-testid="job-location"]', '.job-location', '[class*="location"]'
    ]);
  }

  if (!title || title.toLowerCase().match(/\d+\s+jobs/) || title.length < 3) return null;

  const ldDesc = getJsonLdDescription();
  if (ldDesc.length > 50) description = ldDesc + '\n\n' + description;

  if (!title || !container || !description) return null;

  return [{
    title: title.trim(),
    description: truncate(description.trim(), DESC_LIMIT),
    container, company, location, url: pageUrl
  }];
}

function getListingJobs() {
  const host = window.location.hostname;
  const jobs = [];

  if (host.includes('linkedin.com')) {
    const cards = document.querySelectorAll([
      '.job-card-container--clickable',
      '.job-card-container',
      '.jobs-search-results__list-item',
      'li.ember-view.occludable-update',
      '.scaffold-layout__list-item',
      '[data-view-name="job-card"]'
    ].join(','));

    cards.forEach(card => {
      if (card.querySelector('span[data-jtr-id]')) return;
      const titleEl = qFirst(card, [
        'a.job-card-list__title--link strong',
        '.job-card-list__title--link strong',
        '.job-card-list__title strong',
        'a.job-card-list__title--link',
        '.artdeco-entity-lockup__title a',
        '[aria-label][href*="/jobs/view/"]',
        'a[href*="/jobs/view/"]',
        'strong'
      ]);
      const title = titleEl?.innerText?.trim();
      if (!title || title.length < 3) return;

      const company = qText(card, [
        '.job-card-container__primary-description',
        '.job-card-container__company-name',
        '.artdeco-entity-lockup__subtitle'
      ]);
      const location = qText(card, [
        '.job-card-container__metadata-item',
        '.artdeco-entity-lockup__caption',
        'li[class*="metadata"]'
      ]);
      const linkEl = card.querySelector('a[href*="/jobs/view/"]');
      const jobUrl = linkEl?.href || '';
      const snippet = card.innerText?.trim() || '';

      const badgeContainer = titleEl?.closest('h3,h2,div[class*="title"]') || titleEl?.parentElement || card;
      jobs.push({ title, description: snippet, container: badgeContainer, isListing: true, company, location, url: jobUrl });
    });
  }

  if (host.includes('indeed.com')) {
    const cards = document.querySelectorAll([
      '.job_seen_beacon', '.resultContent',
      'li[class*="JobResult"]', '[data-testid="slider_item"]',
      '.jobsearch-ResultsList > li'
    ].join(','));

    cards.forEach(card => {
      if (card.querySelector('span[data-jtr-id]')) return;
      const titleEl = qFirst(card, [
        'h2.jobTitle a', 'h2.jobTitle span[id]',
        '[data-testid="jobTitle"] a', '[data-testid="jobTitle"]',
        '.jobTitle > a', '.jobTitle > span'
      ]);
      const title = titleEl?.innerText?.trim().replace(/\s*new$/i, '');
      if (!title || title.length < 3) return;

      const company = qText(card, [
        '[data-testid="company-name"]', '.companyName', '.company_location .companyName'
      ]);
      const location = qText(card, [
        '[data-testid="text-location"]', '.companyLocation'
      ]);
      const linkEl = qFirst(card, ['a[href*="/viewjob"]', 'a[href*="/rc/clk"]', 'h2.jobTitle a']);
      const jobUrl = linkEl?.href || '';
      const snippet = qText(card, ['.job-snippet', '.underShelfFooter', '.metadata']) || card.innerText?.slice(0, 200) || '';
      const badgeContainer = titleEl?.closest('h2') || titleEl?.parentElement || card;
      jobs.push({ title, description: snippet, container: badgeContainer, isListing: true, company, location, url: jobUrl });
    });
  }

  if (host.includes('glassdoor.com')) {
    const cards = document.querySelectorAll([
      '[data-test="jobListing"]',
      'li[class*="JobsList_jobListItem"]',
      'li[class*="jobCard"]',
      '[class*="JobCard_jobCard"]',
      'article[class*="job"]',
      '[id^="job-listing-"]'
    ].join(','));

    cards.forEach(card => {
      if (card.querySelector('span[data-jtr-id]')) return;
      const titleEl = qFirst(card, [
        'a[data-test="job-link"]',
        '[data-test="job-title"]',
        'a[data-test="job-title"]',
        '[class*="jobTitle"] a',
        '[class*="JobCard_jobTitle"] a',
        'a[href*="/job-listing/"]',
        'a[href*="/partner/jobListing"]',
        '.job-title a', '.job-title'
      ]);
      const title = titleEl?.innerText?.trim();
      if (!title || title.length < 3) return;

      const company = qText(card, [
        '[data-test="employer-name"]',
        '[class*="EmployerProfile_compactEmployerName"]',
        '[class*="employer"]', '.employer-name'
      ]).replace(/[\d.]+\s*$/, '').trim();

      const location = qText(card, [
        '[data-test="emp-location"]', '[data-test="location"]',
        '[class*="location"]', '.location'
      ]);
      const linkEl = qFirst(card, [
        'a[data-test="job-link"]',
        'a[href*="/job-listing/"]',
        'a[href*="/partner/jobListing"]',
        'a[class*="jobLink"]'
      ]);
      const jobUrl = linkEl?.href || '';
      const salary = qText(card, [
        '[data-test="detailSalary"]', '.salary-estimate', '[class*="salary"]', '[class*="Salary"]'
      ]);
      const snippet = (salary ? salary + ' ' : '') + (card.innerText?.slice(0, 300) || '');
      const badgeContainer = titleEl?.parentElement || card;
      jobs.push({ title, description: snippet, container: badgeContainer, isListing: true, company, location, url: jobUrl });
    });

    if (jobs.length === 0) {
      document.querySelectorAll('a[href*="/job-listing/"], a[href*="/partner/jobListing"]').forEach(a => {
        const title = a.innerText?.trim();
        if (!title || title.length < 3 || a.closest('.sidebar,nav,header')) return;
        const card = a.closest('li,article,[class*="job"]') || a.parentElement;
        if (!card || card.querySelector('span[data-jtr-id]')) return;
        const company = qText(card, ['[class*="employer"]', '[data-test="employer-name"]']).replace(/[\d.]+\s*$/, '').trim();
        const location = qText(card, ['[class*="location"]', '[data-test="emp-location"]']);
        jobs.push({ title, description: card.innerText?.slice(0, 300) || '', container: a.parentElement || card, isListing: true, company, location, url: a.href });
      });
    }
  }

  if (host.includes('ziprecruiter.com')) {
    const cards = document.querySelectorAll([
      'article[data-testid="job-result-item"]',
      '[data-testid="job-result-item"]',
      'article.job_result', '.job_result_card',
      '[class*="job-results"] > li',
      '[class*="JobResults"] > article'
    ].join(','));

    if (cards.length > 0) {
      cards.forEach(card => {
        if (card.querySelector('span[data-jtr-id]')) return;
        const titleEl = qFirst(card, [
          '[data-testid="job-title"]', 'h2.font-bold',
          '.job-title', 'h2 a', 'a[class*="job_link"]', 'h2'
        ]);
        const title = titleEl?.innerText?.trim();
        if (!title || title.length < 4 || title.match(/seekers|businesses|hiring/i)) return;
        if (titleEl?.closest('[data-testid="right-pane"],[role="dialog"]')) return;

        const company = qText(card, ['[data-testid="job-company"]', '.company-name', '[class*="company"]']);
        const location = qText(card, ['[data-testid="job-location"]', '.job-location', '[class*="location"]']);
        const linkEl = qFirst(card, ['a[href*="/jobs/"]', 'a[href*="/job/"]', 'a[href*="/c/"]']);
        const jobUrl = linkEl?.href || '';
        const badgeContainer = titleEl?.parentElement || card;
        jobs.push({ title, description: card.innerText?.slice(0, 300) || '', container: badgeContainer, isListing: true, company, location, url: jobUrl });
      });
    }

    if (jobs.length === 0) {
      document.querySelectorAll('h2, [data-testid="job-title"], .job-title').forEach(titleEl => {
        const title = titleEl.innerText?.trim();
        if (!title || title.length < 4 || title.match(/seekers|businesses/i)) return;
        if (titleEl.closest('[data-testid="right-pane"],[role="dialog"]')) return;
        if (titleEl.parentElement?.querySelector('span[data-jtr-id]')) return;
        const card = titleEl.closest('article,li,[data-testid="job-result-item"]') || titleEl.parentElement?.parentElement;
        const company = qText(card || document, ['[data-testid="job-company"]', '.company-name']);
        const location = qText(card || document, ['[data-testid="job-location"]', '.job-location']);
        const linkEl = (card || document).querySelector('a[href*="/jobs/"],a[href*="/job/"]');
        jobs.push({ title, description: card?.innerText?.slice(0, 300) || '', container: titleEl.parentElement, isListing: true, company, location, url: linkEl?.href || '' });
      });
    }
  }

  return jobs.length ? jobs : null;
}

function buildSalaryBlock(currentSalary, minSalary) {
  if (currentSalary || minSalary) {
    return `Current Salary: ${currentSalary || 'Unknown'}
Min Desired Salary: ${minSalary || 'Unknown'}
Grade pay harshly if the estimated pay is below the minimum desired salary.`;
  }
  return `No salary anchors provided. Estimate the market salary range for each role based on title, location, seniority, and industry. Populate market_range accordingly.`;
}

function isPaidLicense(status) {
  return status === 'valid' || status === 'byok' || status === 'offline';
}

async function checkLicense(type) {
  const { licenseStatus, openRouterKey, freemiumRemaining, session } = await chrome.storage.local.get([
    'licenseStatus', 'openRouterKey', 'freemiumRemaining', 'session'
  ]);

  if (licenseStatus === 'byok' && openRouterKey) return { allowed: true, isPaid: true };
  if (licenseStatus === 'valid' || licenseStatus === 'offline') return { allowed: true, isPaid: true };

  if (!session?.access_token) {
    return { allowed: false, isPaid: false, noAccount: true };
  }

  if (type === 'detail') {
    const remaining = freemiumRemaining ?? 15;
    if (remaining > 0) return { allowed: true, isPaid: false, freemiumRemaining: remaining };
    return { allowed: false, isPaid: false, freemiumExhausted: true };
  }

  return { allowed: false, isPaid: false, isSideCard: true };
}

async function gradeBatch(jobs, type) {
  const licenseCheck = await checkLicense(type);

  if (!licenseCheck.allowed) {
    if (licenseCheck.freemiumExhausted) {
      jobs.forEach(j => renderUpgradePrompt(j._host));
    } else if (licenseCheck.isSideCard) {
      jobs.forEach(j => removeBadgeSilently(j._host));
    } else if (licenseCheck.noAccount) {
      jobs.forEach(j => renderError(j._host, 'Sign in to grade jobs'));
    } else {
      jobs.forEach(j => renderError(j._host, 'License required'));
    }
    return;
  }

  const isMainCard = type === 'detail';

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
  "results": [
    { "job_index": 0, "tier": "S", "fit_score": "N/A", "reasoning": "string", "estimated_pay": "string", "market_range": "string", "pros": ["string"], "red_flags": ["string"], "missing_skills": [] }
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
  "results": [
    { "job_index": 0, "tier": "S", "fit_score": "85%", "reasoning": "string", "estimated_pay": "string", "market_range": "string", "pros": ["string"], "red_flags": ["string"], "missing_skills": ["string"] }
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
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent }
      ],
      temperature: 0.1,
      isMainCard
    });

    if (response.freemiumExhausted) {
      jobs.forEach(j => renderUpgradePrompt(j._host));
      return;
    }

    if (response.error === 'freemium_exhausted') {
      await chrome.storage.local.set({ freemiumRemaining: 0 });
      jobs.forEach(j => renderUpgradePrompt(j._host));
      return;
    }

    if (response.silent) {
      jobs.forEach(j => removeBadgeSilently(j._host));
      return;
    }

    if (response.error || !response.ok) {
      const msg = response.data?.error?.message || response.error || 'API Error';
      throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
    }

    if (!response.data?.choices?.[0]) throw new Error('Invalid API response structure');

    retryDelay = 100;

    if (response.freemiumRemaining !== undefined && response.freemiumRemaining !== null) {
      await chrome.storage.local.set({ freemiumRemaining: response.freemiumRemaining });
    }

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
    if (detailJobs) {
      const newHash = hashJob(detailJobs[0].title, detailJobs[0].company);
      if (newHash !== lastDetailHash) {
        lastDetailHash = newHash;
        const descEl = getDescriptionBody();
        if (descEl) descEl.removeAttribute('data-jtr-highlighted');
      }
      enqueueJobs(detailJobs, 'detail', mode);
    }
  });
}

function glassdoorJobChanged() {
  lastDetailHash = '';
  const oldBadges = document.querySelectorAll('span[data-jtr-id$="-detail"]');
  oldBadges.forEach(b => b.remove());
  setTimeout(scan, 600);
  setTimeout(scan, 1500);
  setTimeout(scan, 3000);
}

function initGlassdoorWatchers() {
  setInterval(() => {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      glassdoorJobChanged();
    }
  }, 500);

  document.addEventListener('click', (e) => {
    const jobCard = e.target.closest(
      '[data-test="jobListing"], li[class*="JobsList"], [class*="JobCard"], ' +
      'a[href*="/job-listing/"], a[href*="/partner/jobListing"], a[data-test="job-link"], ' +
      '[id^="job-listing-"], [class*="jobCard"]'
    );
    if (jobCard) {
      setTimeout(() => {
        const currentUrl = window.location.href;
        if (currentUrl !== lastUrl) {
          lastUrl = currentUrl;
        }
        glassdoorJobChanged();
      }, 300);
    }
  }, true);

  const detailPane = qFirst(document, [
    '[data-test="job-detail-body"]',
    '.JobDetails',
    '[class*="JobDetail"]',
    '#JobDescriptionContainer',
    '[class*="jobDetail"]',
  ]);
  if (detailPane) {
    const detailObserver = new MutationObserver(() => {
      if (detailObserver._t) clearTimeout(detailObserver._t);
      detailObserver._t = setTimeout(() => {
        const detailJobs = getDetailJob();
        if (detailJobs) {
          const newHash = hashJob(detailJobs[0].title, detailJobs[0].company);
          if (newHash !== lastDetailHash) {
            glassdoorJobChanged();
          }
        }
      }, 500);
    });
    detailObserver.observe(detailPane, { childList: true, subtree: true, characterData: true });
  }
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

  if (window.location.hostname.includes('glassdoor.com')) {
    initGlassdoorWatchers();
  }
}

init();
