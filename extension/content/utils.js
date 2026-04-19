function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function hashJob(title, company) {
  return ((title || '') + '|' + (company || '')).toLowerCase().replace(/[^a-z0-9|]/g, '').slice(0, 60);
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
      const arr = Array.isArray(d) ? d :[d];
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
  return document.querySelector(
    '#job-details, .jobs-description__content, .jobs-description-content, #jobDescriptionText, .jobDescriptionContent,[data-testid="job-details-scroll-container"], #JobDescriptionContainer, div[class*="JobDetails_jobDescription__"], #details-info, .usajobs-joa-section, .job-details-content'
  );
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
