const HIGHLIGHT_CATEGORIES = {
  redFlag: {
    label: 'Red Flag',
    bg: 'rgba(239,68,68,0.20)',
    outline: '1px solid rgba(239,68,68,0.45)',
    terms:[
      'wear many hats', 'deal with ambiguity', 'thick skin', 'self-starter', 
      'fast-paced environment', 'agile environment', 'hit the ground running', 
      'always on', 'tight deadlines', 'high pressure', 'willingness to work long hours', 
      'whatever it takes', 'hustle', 'work hard play hard', 'trial period', 
      'unpaid task', 'temp-to-hire', 'commission only', 'draw against commission', 
      'other duties as assigned', 'rockstar', 'ninja', 'guru', 'we are a family', 
      'no big egos'
    ]
  },
  greenFlag: {
    label: 'Green Flag',
    bg: 'rgba(34,197,94,0.18)',
    outline: '1px solid rgba(34,197,94,0.42)',
    terms:[
      'work-life balance', 'psychological safety', 'no micromanagement', 'autonomy', 
      'mentorship', 'professional development', 'learning budget', 'paid training', 
      'internal mobility', 'promote from within', 'continuing education', 'inclusive', 
      'neurodivergent', 'ergonomic', 'equal opportunity', 'reasonable accommodation'
    ]
  },
  compensationLogistics: {
    label: 'Pay & Logistics',
    bg: 'rgba(251,191,36,0.20)',
    outline: '1px solid rgba(251,191,36,0.45)',
    terms:[
      'base salary', 'base pay', 'ote', 'on-target earnings', 'hourly rate', 
      'salary range', 'compensation', 'sign-on bonus', 'retention bonus', 
      'commission', 'profit sharing', 'overtime', 'equity', 'stock options', 
      'rsu', 'espp', 'vesting', 'cliff', '401k', '401(k)', '401(k) match', 'pension', 
      'health insurance', 'medical', 'dental', 'vision', 'hsa', 'fsa', 'mental health', 
      'fertility benefits', 'gym stipend', 'wellness', 'pto', 'paid time off', 
      'unlimited pto', 'sabbatical', 'parental leave', 'maternity', 'paternity', 
      'sick leave', 'company holidays', 'tuition reimbursement', 'student loan repayment', 
      'commuter benefits', 'catered lunches', 'visa sponsorship', 'green card', 
      'fully remote', 'remote-first', 'hybrid', 'on-site', 'return to office', 'rto', 
      'relocation assistance', 'distributed team', 'digital nomad', 'time zone', 
      'travel required', 'asynchronous', 'core hours', 'four-day workweek', '4-day', 
      'flexible schedule', 'shift work', 'weekend availability'
    ]
  },
  requirements: {
    label: 'Requirements',
    bg: 'rgba(168,85,247,0.18)',
    outline: '1px solid rgba(168,85,247,0.42)',
    terms:[
      'years of experience', 'entry-level', 'junior', 'senior', 'lead', 'manager', 
      'director', 'executive', 'leadership', 'communication', 'problem solving', 
      'analytical', 'teamwork', 'adaptability', 'conflict resolution', 'negotiation', 
      'customer service', 'project management', 'cross-functional', "bachelor's degree", 
      "master's degree", 'phd', 'certification', 'license required', 'high school diploma'
    ]
  },
  resumeSkill: {
    label: 'Resume Match',
    bg: 'rgba(59,130,246,0.20)',
    outline: '1px solid rgba(59,130,246,0.45)',
    terms:[]
  }
};

let _hlMatchCounts = {};
let _hlObserver = null;
const _JTR_HL_ATTR = 'data-jtr-highlighted';
let _lastDescText = '';
let _expectedMarks = 0;

function extractResumeKeywords(text) {
  if (!text) {
    resumeKeywords =[];
    HIGHLIGHT_CATEGORIES.resumeSkill.terms =[];
    return;
  }

  const capTerms = text.match(
    /\b([A-Z][a-zA-Z0-9+#./]*(?:\.[a-zA-Z]+)*(?:\s[A-Z][a-zA-Z0-9+#./]+){0,2}|[A-Z]{2,}[0-9]*)\b/g
  ) || [];

  const cleaned =[...new Set(
    capTerms.map(t => t.trim()).filter(t => t.length > 1 && t.length < 50 && !/^\d+$/.test(t))
  )];

  resumeKeywords = cleaned.slice(0, 100);
  HIGHLIGHT_CATEGORIES.resumeSkill.terms = resumeKeywords;
}

function _getCategoryStyle(catKey) {
  const cat = HIGHLIGHT_CATEGORIES[catKey];
  if (!cat) return '';
  return `background:${cat.bg};color:inherit;border-radius:3px;padding:0 2px;outline:${cat.outline};`;
}

function _collectTextNodes(container) {
  const nodes =[];
  const walker = document.createTreeWalker(
    container,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        const tag = p.tagName?.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'noscript') return NodeFilter.FILTER_REJECT;
        if (p.hasAttribute('data-jtr-hl')) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue?.trim()) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    }
  );
  let node;
  while ((node = walker.nextNode())) nodes.push(node);
  return nodes;
}

function _buildCategoryPatterns() {
  const order =['redFlag', 'greenFlag', 'compensationLogistics', 'requirements', 'resumeSkill'];
  const patterns =[];
  for (const catKey of order) {
    const cat = HIGHLIGHT_CATEGORIES[catKey];
    if (!cat || cat.terms.length === 0) continue;
    const escaped = cat.terms
      .filter(Boolean)
      .map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .sort((a, b) => b.length - a.length);
    if (escaped.length === 0) continue;
    patterns.push({
      catKey,
      pattern: new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi')
    });
  }
  return patterns;
}

function _wrapTextNodeAllCategories(textNode, catPatterns) {
  const text = textNode.nodeValue;
  const intervals =[];

  for (const { catKey, pattern } of catPatterns) {
    pattern.lastIndex = 0;
    let m;
    while ((m = pattern.exec(text)) !== null) {
      intervals.push({ start: m.index, end: m.index + m[0].length, catKey, match: m[0] });
    }
  }

  if (intervals.length === 0) return {};

  intervals.sort((a, b) => a.start - b.start || b.end - a.end);

  const nonOverlapping =[];
  let lastEnd = 0;
  for (const iv of intervals) {
    if (iv.start >= lastEnd) {
      nonOverlapping.push(iv);
      lastEnd = iv.end;
    }
  }

  if (nonOverlapping.length === 0) return {};

  const parent = textNode.parentNode;
  if (!parent) return {};

  const frag = document.createDocumentFragment();
  const counts = {};
  let cursor = 0;

  for (const { start, end, catKey, match } of nonOverlapping) {
    if (start > cursor) {
      frag.appendChild(document.createTextNode(text.slice(cursor, start)));
    }
    const mark = document.createElement('mark');
    mark.setAttribute('data-jtr-hl', catKey);
    mark.style.cssText = _getCategoryStyle(catKey);
    mark.textContent = match;
    frag.appendChild(mark);
    counts[catKey] = (counts[catKey] || 0) + 1;
    cursor = end;
  }

  if (cursor < text.length) {
    frag.appendChild(document.createTextNode(text.slice(cursor)));
  }

  parent.replaceChild(frag, textNode);
  return counts;
}

function teardownHighlights(container) {
  if (!container) return;
  const marks = container.querySelectorAll('mark[data-jtr-hl]');
  if (marks.length === 0) {
    container.removeAttribute(_JTR_HL_ATTR);
    return;
  }
  marks.forEach(mark => {
    const parent = mark.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(mark.textContent), mark);
  });
  container.normalize();
  container.removeAttribute(_JTR_HL_ATTR);
}

function getHighlightCounts() {
  const result = {};
  let total = 0;
  for (const [catKey, count] of Object.entries(_hlMatchCounts)) {
    if (count > 0) {
      result[catKey] = { label: HIGHLIGHT_CATEGORIES[catKey]?.label || catKey, count };
      total += count;
    }
  }
  return { categories: result, total };
}

function highlightKeywordsInPage() {
  if (!keywordHighlightActive) return;

  const descEl = getDescriptionBody();
  if (!descEl) {
    _startHighlightWatcher();
    return;
  }

  const currentText = descEl.textContent || '';
  const currentMarks = descEl.querySelectorAll('mark[data-jtr-hl]').length;

  if (descEl.hasAttribute(_JTR_HL_ATTR) && currentText === _lastDescText && currentMarks === _expectedMarks) {
    _startHighlightWatcher();
    return;
  }

  _stopHighlightWatcher();
  teardownHighlights(descEl);

  const catPatterns = _buildCategoryPatterns();
  _hlMatchCounts = {};
  _expectedMarks = 0;

  if (catPatterns.length > 0) {
    const textNodes = _collectTextNodes(descEl);
    for (const tn of textNodes) {
      const counts = _wrapTextNodeAllCategories(tn, catPatterns);
      for (const [cat, n] of Object.entries(counts)) {
        _hlMatchCounts[cat] = (_hlMatchCounts[cat] || 0) + n;
        _expectedMarks += n;
      }
    }
  }

  descEl.setAttribute(_JTR_HL_ATTR, '1');
  _lastDescText = descEl.textContent || '';

  _startHighlightWatcher();
  return getHighlightCounts();
}

function _startHighlightWatcher() {
  if (_hlObserver) return;
  const root = document.body;
  _hlObserver = new MutationObserver(() => {
    if (_hlObserver._t) clearTimeout(_hlObserver._t);
    _hlObserver._t = setTimeout(() => {
      if (!keywordHighlightActive) {
        _stopHighlightWatcher();
        return;
      }
      const descEl = getDescriptionBody();
      if (descEl) {
        highlightKeywordsInPage();
      }
    }, 350);
  });
  _hlObserver.observe(root, { childList: true, subtree: true, characterData: true });
}

function _stopHighlightWatcher() {
  if (!_hlObserver) return;
  _hlObserver.disconnect();
  if (_hlObserver._t) clearTimeout(_hlObserver._t);
  _hlObserver = null;
}