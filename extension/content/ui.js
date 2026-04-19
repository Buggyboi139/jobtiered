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
`;

function tierColor(tier) {
  const map = { S: '#fbbf24', A: '#4ade80', B: '#4a9eff', C: '#fb923c', D: '#f87171', F: '#ff6b6b' };
  return map[tier?.toUpperCase().replace('~', '')] || '#9090a0';
}

function buildTooltipHtml(result, isListing) {
  const pay = escapeHtml(result.estimated_pay || result.pay || 'Listed');
  const market = escapeHtml(result.market_range || '');
  const fit = result.fit_score && result.fit_score !== 'N/A' ? escapeHtml(result.fit_score) : '';
  const reasoning = escapeHtml(result.reasoning || 'None provided');
  const tierRaw = (result.tier || result.grade || '?').toUpperCase();
  const color = tierColor(tierRaw);
  const displayTier = isListing ? `~${tierRaw}` : tierRaw;

  const warningBanner = isListing ? `
    <div style="background:rgba(251,146,60,0.1);border:1px solid rgba(251,146,60,0.3);padding:8px 10px;border-radius:6px;margin-bottom:12px;color:#fb923c;font-size:11px;line-height:1.4;">
      <strong>\u26A0\uFE0F Preview Grade:</strong> Based on limited summary data. Open the full job posting for an accurate evaluation.
    </div>` : '';

  const headerHtml = `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.1);">
      <span style="font-size:22px;font-weight:900;color:${color};text-shadow:0 0 12px ${color}40;">${displayTier}</span>
      <div style="flex:1;">
        <div style="color:#e8e8f0;font-size:12px;"><strong style="color:${color};">Pay:</strong> ${pay}</div>
        ${market ? `<div style="color:#9090a0;font-size:11px;">Market: ${market}</div>` : ''}
        ${fit ? `<div style="color:#9090a0;font-size:11px;">Fit: <strong style="color:#4ade80;">${fit}</strong></div>` : ''}
      </div>
    </div>`;

  const pros = (result.pros ||[]).map(p => `<li style="margin:3px 0;">${escapeHtml(p)}</li>`).join('');
  const flags = (result.red_flags || result.flags ||[]).map(f => `<li style="margin:3px 0;">${escapeHtml(f)}</li>`).join('');
  const missing = (result.missing_skills ||[]).length > 0
    ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);">
        <div style="color:#fb923c;font-size:11px;font-weight:700;margin-bottom:4px;">GAPS</div>
        <ul style="padding-left:14px;margin:0;font-size:12px;color:#9090a0;">
          ${result.missing_skills.map(s => `<li style="margin:2px 0;">${escapeHtml(s)}</li>`).join('')}
        </ul></div>` : '';

  return `
    ${warningBanner}
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

function renderResult(host, result, isListing) {
  if (!host || !result) return;
  const b = host.shadowRoot?.getElementById('b');
  if (!b) return;
  const tierRaw = (result.tier || result.grade || '?').toString().toUpperCase().trim();
  b.className = `badge tier-${tierRaw}`;
  b.textContent = isListing ? `~${tierRaw}` : tierRaw;
  host._tip = buildTooltipHtml(result, isListing);
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

function applyDimming(element, mode, tierVal) {
  if (!element) return;
  element.style.transition = 'opacity 0.35s ease';
  element.style.opacity = (mode === 'personal' && (tierVal === 'd' || tierVal === 'f')) ? '0.22' : '1';
}
