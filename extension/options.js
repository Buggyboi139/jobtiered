const SUPABASE_URL = "https://ppbpqyjejyoqjuvhzlsc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JuUEERY7RM0vVRb8_SGDlQ_EenqKT84";

let currentMode = 'byok';

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get([
    'openRouterKey', 'currentSalary', 'minSalary', 'resumeText',
    'licenseMode', 'session', 'licenseStatus', 'licensePlan'
  ]);

  if (data.openRouterKey) document.getElementById('apiKey').value = data.openRouterKey;
  if (data.currentSalary) document.getElementById('currentSalary').value = data.currentSalary;
  if (data.minSalary)     document.getElementById('minSalary').value = data.minSalary;
  if (data.resumeText)    document.getElementById('resumeText').value = data.resumeText;

  const mode = data.licenseMode || 'byok';
  setAccessMode(mode, false);
  renderLicenseStatus(data.licenseStatus, data.licensePlan, mode, data.session);
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
  renderLicenseStatus('byok', null, 'byok', null);
});

document.getElementById('modeSubscription').addEventListener('click', () => {
  setAccessMode('subscription');
  chrome.storage.local.set({ licenseMode: 'subscription' });
  chrome.storage.local.get(['licenseStatus', 'licensePlan', 'session']).then(({ licenseStatus, licensePlan, session }) => {
    renderLicenseStatus(licenseStatus, licensePlan, 'subscription', session);
  });
});

document.getElementById('loginBtn').addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const btn = document.getElementById('loginBtn');
  const err = document.getElementById('errBanner');

  err.style.display = 'none';

  if (!email || !password) { showErr('Enter email and password.'); return; }

  btn.textContent = 'Logging in...';
  btn.disabled = true;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error_description || 'Login failed');
    }

    await chrome.storage.local.set({ session: data, licenseMode: 'subscription' });
    
    const response = await chrome.runtime.sendMessage({ action: 'validateLicense' });
    
    renderLicenseStatus(response?.licenseStatus || 'invalid', response?.licensePlan, 'subscription', data);
    showSaveBanner('Logged in successfully!');

  } catch (error) {
    showErr(error.message);
  } finally {
    btn.textContent = 'Login';
    btn.disabled = false;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await chrome.storage.local.remove(['session', 'licenseStatus', 'licensePlan']);
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('errBanner').style.display = 'none';
  renderLicenseStatus('none', null, 'subscription', null);
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

  await chrome.storage.local.set(payload);
  await chrome.storage.local.remove(['gradeHistory', 'apiTokens']);
  showSaveBanner('Settings saved! Cache cleared.');
});

function renderLicenseStatus(status, plan, mode, session) {
  const box  = document.getElementById('licenseStatusBox');
  const text = document.getElementById('licenseStatusText');
  const sub  = document.getElementById('licenseStatusSub');
  const loginForm = document.getElementById('loginForm');
  const loggedInView = document.getElementById('loggedInView');
  const userEmail = document.getElementById('userEmail');

  if (mode === 'byok') {
    box.className = 'status-box byok';
    text.textContent = 'BYOK Mode';
    sub.textContent  = 'Costs billed directly to your API key';
    loginForm.style.display = 'none';
    loggedInView.style.display = 'none';
    return;
  }

  if (!session?.access_token) {
    box.className = 'status-box none';
    text.textContent = 'Not logged in';
    sub.textContent  = 'Please login to access your subscription';
    loginForm.style.display = 'block';
    loggedInView.style.display = 'none';
    return;
  }

  loginForm.style.display = 'none';
  loggedInView.style.display = 'block';
  userEmail.textContent = session.user.email;

  if (status === 'valid' || status === 'offline') {
    box.className = 'status-box valid';
    text.textContent = 'Active Subscription';
    sub.textContent  = 'Your account is in good standing';
    return;
  }

  box.className = 'status-box invalid';
  text.textContent = 'No Active Subscription';
  sub.textContent  = 'Please subscribe to use JobTiered';
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
