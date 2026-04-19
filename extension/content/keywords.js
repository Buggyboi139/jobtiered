async function extractResumeKeywords(text) {
  if (!text) { resumeKeywords =[]; return; }
  const techTerms = text.match(/\b([A-Z][a-zA-Z0-9+#.]+(?:\s[A-Z][a-zA-Z0-9+.]+)?|[A-Z]{2,})\b/g) ||[];
  const cleaned =[...new Set(techTerms.map(t => t.trim()).filter(t => t.length > 2 && t.length < 40))];
  resumeKeywords = cleaned.slice(0, 60);
}

function highlightKeywordsInPage() {
  if (!keywordHighlightActive || resumeKeywords.length === 0) return;
  const descEl = getDescriptionBody();
  if (!descEl || descEl.getAttribute('data-jtr-highlighted') === '1') return;
  descEl.setAttribute('data-jtr-highlighted', '1');
  const walker = document.createTreeWalker(descEl, NodeFilter.SHOW_TEXT, null);
  const textNodes =[];
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
