const HIGHLIGHT_CATEGORIES = {
  redFlag: {
    label: 'Red Flag',
    bg: 'rgba(239,68,68,0.20)',
    outline: '1px solid rgba(239,68,68,0.45)',
    terms:[
      'wear many hats', 'wear multiple hats', 'fast-paced', 'fast paced',
      'startup mentality', 'self-starter', 'self starter', 'rockstar',
      'rock star', 'ninja', 'guru', 'hustle', 'comfortable with ambiguity',
      'above and beyond', 'go above and beyond', 'family atmosphere',
      'like a family', 'work hard play hard', 'passionate about',
      'agile environment', 'entrepreneurial spirit', 'do whatever it takes',
      'ownership mentality', 'results-driven', 'results driven',
      'dynamic environment', 'fast growing', 'fast-growing', 'high growth',
      'scrappy', 'can do attitude', 'can-do attitude', 'highly motivated',
      'strong work ethic', 'must be able to', 'unlimited pto',
      'mission-driven', 'mission driven', 'competitive salary', 'market rate',
      'unlimited vacation', 'unlimited time off', 'other duties as assigned',
      'roll up your sleeves', 'no big egos', 'no ego', 'move fast'
    ]
  },
  resumeSkill: {
    label: 'Resume Skill',
    bg: 'rgba(59,130,246,0.20)',
    outline: '1px solid rgba(59,130,246,0.45)',
    terms:[]
  },
  compensation: {
    label: 'Compensation',
    bg: 'rgba(34,197,94,0.18)',
    outline: '1px solid rgba(34,197,94,0.42)',
    terms:[
      'salary', 'base salary', 'base pay', 'pay range', 'total compensation',
      'compensation', 'equity', 'stock options', 'rsu', 'rsus', 'espp',
      'bonus', 'annual bonus', 'signing bonus', 'commission', 'profit sharing',
      '401k', '401(k)', 'pto', 'paid time off', 'parental leave',
      'maternity leave', 'paternity leave', 'health insurance', 'healthcare',
      'medical', 'dental', 'vision', 'benefits', 'remote work',
      'work from home', 'hybrid', 'stipend', 'relocation', 'per hour',
      'per year', 'annually', 'overtime', 'flexible hours', 'flexible schedule',
      'four day', '4-day', 'sabbatical', 'tuition', 'education reimbursement',
      'professional development', 'home office', 'internet stipend'
    ]
  }
};

let _hlMatchCounts = {};
let _hlObserver = null;
const _JTR_HL_ATTR = 'data-jtr-highlighted';
let _lastDescText = '';
let _expectedMarks = 0;

function extractResumeKeywords(text) {
  if (!text) {
    resumeKeywords = [];
    HIGHLIGHT_CATEGORIES.resumeSkill.terms =[];
    return;
  }

  const capTerms = text.match(
    /\b([A-Z][a-zA-Z0-9+#./]*(?:\.[a-zA-Z]+)*(?:\s[A-Z][a-zA-Z0-9+#./]+){0,2}|[A-Z]{2,}[0-9]*)\b/g
  ) ||[];

  const lowerPattern = /\b(python|javascript|typescript|react|angular|vue|svelte|node\.?js|express|django|flask|fastapi|rails|spring|laravel|docker|kubernetes|k8s|aws|gcp|azure|git|github|gitlab|linux|bash|shell|sql|nosql|mongodb|postgresql|mysql|sqlite|redis|kafka|elasticsearch|opensearch|terraform|ansible|jenkins|grafana|prometheus|datadog|rest|graphql|grpc|protobuf|microservices|devops|ci\/cd|agile|scrum|kanban|jira|confluence|figma|sketch|zeplin|swift|kotlin|go|golang|rust|scala|java|c\+\+|c#|\.net|php|ruby|matlab|jupyter|pandas|numpy|tensorflow|pytorch|keras|scikit-?learn|hadoop|spark|airflow|dbt|snowflake|databricks|looker|tableau|power\s?bi|excel|html|css|sass|scss|webpack|vite|jest|cypress|selenium|playwright|flutter|unity|unreal|blockchain|solidity|ux|ui|product management|project management|data engineering|data science|machine learning|deep learning|nlp|llm|computer vision|reinforcement learning|a\/b testing|analytics|data analysis|sql server|oracle|firebase|supabase|nextjs|next\.js|nuxt|remix|astro|tailwind|bootstrap|material\s?ui|chakra|styled\s?components|redux|mobx|zustand|rxjs|graphql|apollo|prisma|typeorm|sequelize|fastify|nestjs|nest\.js|spring\s?boot|hibernate|mybatis|junit|pytest|mocha|chai|vitest|storybook|chromatic)\b/gi;
  const lowerTerms = text.match(lowerPattern) ||[];

  const all = [...capTerms, ...lowerTerms.map(t => t.trim())];
  const cleaned =[...new Set(
    all.map(t => t.trim()).filter(t => t.length > 1 && t.length < 50 && !/^\d+$/.test(t))
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
  const order =['redFlag', 'resumeSkill', 'compensation'];
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