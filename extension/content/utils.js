function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

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
    const u = new URL(url, window.location.href);
    const tracking = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'trk', 'refId', 'from', 'src', 'source', 'context', 'origin', 'redirected',
      'ao', 's', 'q', 'l', 'radius', 'sort', 'page', 'start'
    ];
    tracking.forEach(k => u.searchParams.delete(k));
    u.hash = '';
    return `${u.origin}${u.pathname}${u.search}`.toLowerCase().replace(/\/$/, '');
  } catch (_) {
    return String(url).split('#')[0].split('?')[0].toLowerCase().replace(/\/$/, '');
  }
}

function compactIdentityPart(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function hashJob(title, company) {
  return ((title || '') + '|' + (company || '')).toLowerCase().replace(/[^a-z0-9|]/g, '').slice(0, 60);
}

function buildDedupKey(job) {
  if (!job) return '';
  const title = compactIdentityPart(job.title);
  const company = compactIdentityPart(job.company);
  const location = compactIdentityPart(job.location);
  const normalizedUrl = normalizeJobUrl(job.url);
  const fallbackDescHash = stableHash(String(job.description || '').slice(0, 800));
  const raw = normalizedUrl
    ? ['url', normalizedUrl, title, company, location].join('|')
    : ['text', title, company, location, fallbackDescHash].join('|');
  return stableHash(raw);
}

function buildJobCacheKey(job, type, mode) {
  if (!job) return `${type || 'job'}-${mode || 'personal'}-unknown`;
  const raw = [
    mode || 'personal',
    type || 'job',
    compactIdentityPart(job.title),
    compactIdentityPart(job.company),
    compactIdentityPart(job.location),
    normalizeJobUrl(job.url),
    stableHash(String(job.description || '').slice(0, 1000))
  ].join('|');
  return `jtr-${stableHash(raw)}`;
}

function truncate(text, max) {
  if (!text || text.length <= max) return text || '';
  return text.slice(0, max) + '\u2026';
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

function getDescriptionBody() {
  return document.querySelector([
    '[data-test-id="expandable-text-box"]', '#job-details', '.jobs-description__content', '.jobs-description-content', '.jobs-description-content__text', '.jobs-box__html-content', '.description__text', '.show-more-less-html__markup',
    '#jobDescriptionText', '.jobsearch-jobDescriptionText', '[data-testid="jobsearch-JobComponent-description"]',
    '#JobDescriptionContainer', 'div[class*="JobDetails_jobDescription__"]', '[data-test="JobDescription"]', '[data-test="job-description-text"]', '.jobDescriptionContent', '[class*="JobDescription"]', '[class*="jobDescription"]',
    '[data-testid="job-details-scroll-container"]', '[data-testid="job-description"]', '.job_description', '.job-description-content', '.job-body',
    '#details-info', '.job-details-content', '#job-details-content',
    '.usajobs-joa-section', '#duties', '#requirements', '#qualifications'
  ].join(', '));
}

function extractGlassdoorPay() {
  const paySelectors = [
    '[data-test="detailSalary"]',
    '[data-test="salaryEstimate"]',
    '[class*="SalaryEstimate"]',
    '[class*="salary-estimate"]',
    '[class*="SalaryRange"]',
    '[class*="CompensationModule"]',
    '[class*="EmpBasicInfo"][class*="salary"]',
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
    const payPatterns =[
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
