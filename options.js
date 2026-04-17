let currentMode = 'byok';

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get([
    'openRouterKey', 'currentSalary', 'minSalary', 'resumeText',
    'licenseMode', 'licenseKey', 'licenseEmail',
    'licenseStatus', 'licensePlan', 'licenseExpiry'
  ]);

  if (data.openRouterKey) document.getElementById('apiKey').value = data.openRouterKey;
  if (data.currentSalary) document.getElementById('currentSalary').value = data.currentSalary;
  if (data.minSalary)     document.getElementById('minSalary').value = data.minSalary;
  if (data.resumeText)    document.getElementById('resumeText').value = data.resumeText;
  if (data.licenseEmail)  document.getElementById('licenseEmail').value = data.licenseEmail;
  if (data.licenseKey)    document.getElementById('licenseKey').value = data.licenseKey;

  const mode = data.licenseMode || 'byok';
  setAccessMode(mode, false);
  renderLicenseStatus(data.licenseStatus, data.licensePlan, data.licenseExpiry, mode);
});

function setAccessMode(mode, animate = true) {
  currentMode = mode;
  document.getElementById('modeByok').classList.toggle('active', mode === 'byok');
  document.getElementById('modeSubscription').classList.toggle('active', mode === 'subscription');
  document.getElementById('byokSection').style.display = mode === 'byok' ? 'block' : 'none';
  document.getElementById('subscriptionSection').style.display = mode === 'subscription' ? 'block' : 'none';
  if (animate) document.getElementById('errBanner').style.display = 'none';
}

document.getElementById('modeByok').addEventListener('click', () => {
  setAccessMode('byok');
  chrome.storage.local.set({ licenseMode: 'byok' });
  renderLicenseStatus('byok', null, null, 'byok');
});

document.getElementById('modeSubscription').addEventListener('click', () => {
  setAccessMode('subscription');
  chrome.storage.local.set({ licenseMode: 'subscription' });
  chrome.storage.local.get(['licenseStatus', 'licensePlan', 'licenseExpiry']).then(({ licenseStatus, licensePlan, licenseExpiry }) => {
    renderLicenseStatus(licenseStatus, licensePlan, licenseExpiry, 'subscription');
  });
});

document.getElementById('validateLicenseBtn').addEventListener('click', async () => {
  const key   = document.getElementById('licenseKey').value.trim();
  const email = document.getElementById('licenseEmail').value.trim();
  const btn   = document.getElementById('validateLicenseBtn');
  const err   = document.getElementById('errBanner');

  err.style.display = 'none';

  if (!key) { showErr('Enter a license key.'); return; }

  btn.innerHTML = '<span class="spinner"></span> Validating…';
  btn.disabled = true;

  await chrome.storage.local.set({ licenseKey: key, licenseEmail: email, licenseMode: 'subscription' });

  const response = await chrome.runtime.sendMessage({ action: 'validateLicense' });
  btn.innerHTML = '✓ Validate License';
  btn.disabled = false;

  const status = response?.licenseStatus || 'invalid';
  renderLicenseStatus(status, response?.licensePlan, response?.licenseExpiry, 'subscription');

  if (status === 'valid' || status === 'offline') {
    showSaveBanner('✓ License validated!');
  } else {
    showErr('License is invalid or expired. Check your key and try again.');
  }
});

document.getElementById('clearLicenseBtn').addEventListener('click', async () => {
  await chrome.storage.local.remove(['licenseKey', 'licenseEmail', 'licenseStatus', 'licensePlan', 'licenseExpiry']);
  document.getElementById('licenseKey').value = '';
  document.getElementById('licenseEmail').value = '';
  document.getElementById('errBanner').style.display = 'none';
  renderLicenseStatus('none', null, null, 'subscription');
});

document.getElementById('saveSettings').addEventListener('click', async () => {
  const apiKey      = document.getElementById('apiKey').value.trim();
  const salary      = document.getElementById('currentSalary').value;
  const minSalary   = document.getElementById('minSalary').value;
  const resumeText  = document.getElementById('resumeText').value;

  const payload = {
    currentSalary: salary,
    minSalary: minSalary,
    resumeText: resumeText,
    licenseMode: currentMode
  };

  if (currentMode === 'byok') {
    payload.openRouterKey = apiKey;
  }
  if (currentMode === 'subscription') {
    payload.licenseKey   = document.getElementById('licenseKey').value.trim();
    payload.licenseEmail = document.getElementById('licenseEmail').value.trim();
  }

  await chrome.storage.local.set(payload);
  await chrome.storage.local.remove(['gradeHistory', 'apiTokens']);
  showSaveBanner('✓ Settings saved! Cache cleared.');
});

function renderLicenseStatus(status, plan, expiry, mode) {
  const box  = document.getElementById('licenseStatusBox');
  const text = document.getElementById('licenseStatusText');
  const sub  = document.getElementById('licenseStatusSub');

  if (mode === 'byok') {
    box.className = 'status-box byok';
    text.textContent = 'BYOK Mode — Using your own API key';
    sub.textContent  = 'Costs billed directly to your OpenRouter account';
    return;
  }

  if (!status || status === 'none') {
    box.className = 'status-box none';
    text.textContent = 'No license configured';
    sub.textContent  = 'Enter a license key and click Validate';
    return;
  }

  if (status === 'valid' || status === 'offline') {
    box.className = 'status-box valid';
    text.textContent = `Active${plan ? ` — ${plan}` : ''}`;
    sub.textContent  = expiry
      ? `Expires ${new Date(expiry).toLocaleDateString()}`
      : (status === 'offline' ? 'Validated offline (cached)' : 'Lifetime / no expiry');
    return;
  }

  if (status === 'invalid' || status === 'expired') {
    box.className = 'status-box invalid';
    text.textContent = status === 'expired' ? 'License expired' : 'License invalid';
    sub.textContent  = 'Please update your license key or renew at jobtierpro.app';
    return;
  }

  box.className = 'status-box none';
  text.textContent = 'Status unknown';
  sub.textContent  = 'Click Validate to recheck';
}

function showErr(msg) {
  const el = document.getElementById('errBanner');
  el.textContent = msg;
  el.style.display = 'block';
}

function showSaveBanner(msg) {
  const banner = document.getElementById('saveBanner');
  banner.textContent = msg;
  banner.style.display = 'block';
  setTimeout(() => { banner.style.display = 'none'; }, 2500);
}
