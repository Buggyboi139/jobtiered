const SUPABASE_URL = "https://ppbpqyjejyoqjuvhzlsc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JuUEERY7RM0vVRb8_SGDlQ_EenqKT84";
const STRIPE_SUB_LINK = "https://buy.stripe.com/test_14A5kE3lY0Fe4oy2L493y01";
const STRIPE_BYOK_LINK = "https://buy.stripe.com/test_14A28scWy2Nm6wGbhA93y00";
const CANCEL_SUB_LINK = "https://billing.stripe.com/p/login/14A28scWy2Nm6wGbhA93y00";

let currentMode = 'subscription';

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get([
    'openRouterKey', 'currentSalary', 'minSalary', 'resumeText',
    'licenseMode', 'session', 'licenseStatus', 'licensePlan'
  ]);

  if (data.openRouterKey) document.getElementById('apiKey').value = data.openRouterKey;
  if (data.currentSalary) document.getElementById('currentSalary').value = data.currentSalary;
  if (data.minSalary)     document.getElementById('minSalary').value = data.minSalary;
  if (data.resumeText)    document.getElementById('resumeText').value = data.resumeText;

  const mode = data.licenseMode || 'subscription';
  setAccessMode(mode, false);
  renderLicenseStatus(data.licenseStatus, data.licensePlan, mode, data.session);
});

function setAccessMode(mode, animate = true) {
  currentMode = mode;
  document.getElementById('modeByok').classList.toggle('active', mode === 'byok');
  document.getElementById('modeSubscription').classList.toggle('active', mode === 'subscription');
  document.getElementById('byokSection').style.display = mode === 'byok' ? 'block' : 'none';
  if (animate) document.getElementById('errBanner').style.display = 'none';
}

document.getElementById('modeByok').addEventListener('click', () => {
  setAccessMode('byok');
  chrome.storage.local.set({ licenseMode: 'byok' });
});

document.getElementById('modeSubscription').addEventListener('click', () => {
  setAccessMode('subscription');
  chrome.storage.local.set({ licenseMode: 'subscription' });
});

function toggleToSignup() {
  document.getElementById('errBanner').style.display = 'none';
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('signupForm').style.display = 'block';
  document.getElementById('signupEmail').value = '';
  document.getElementById('signupPassword').value = '';
  document.getElementById('signupConfirmPassword').value = '';
}

function toggleToLogin() {
  document.getElementById('errBanner').style.display = 'none';
  document.getElementById('signupForm').style.display = 'none';
  document.getElementById('loginForm').style.display = 'block';
}

document.getElementById('showSignupLink').addEventListener('click', (e) => {
  e.preventDefault();
  toggleToSignup();
});

document.getElementById('backToLoginLink').addEventListener('click', (e) => {
  e.preventDefault();
  toggleToLogin();
});

document.getElementById('buySubBtn').addEventListener('click', async () => {
  const { session } = await chrome.storage.local.get('session');
  if (session?.user?.id) {
    window.open(`${STRIPE_SUB_LINK}?client_reference_id=${session.user.id}`, '_blank');
  } else {
    showErr('Please log in first.');
  }
});

document.getElementById('buyByokBtn').addEventListener('click', async () => {
  const { session } = await chrome.storage.local.get('session');
  if (session?.user?.id) {
    window.open(`${STRIPE_BYOK_LINK}?client_reference_id=${session.user.id}`, '_blank');
  } else {
    showErr('Please log in first.');
  }
});

document.getElementById('loginBtn').addEventListener('click', async () => {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value.trim();
  const btn = document.getElementById('loginBtn');

  document.getElementById('errBanner').style.display = 'none';

  if (!email || !password) { showErr('Enter email and password.'); return; }

  btn.textContent = 'Signing in\u2026';
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
      throw new Error(data.error_description || 'Login failed. Check your credentials.');
    }

    await chrome.storage.local.set({ session: data });
    document.getElementById('onboardingBanner').style.display = 'none';

    const response = await chrome.runtime.sendMessage({ action: 'validateLicense' });

    renderLicenseStatus(response?.licenseStatus || 'invalid', response?.licensePlan, currentMode, data);
    showToast('Signed in successfully.', 'success');

  } catch (error) {
    showErr(error.message);
  } finally {
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
});

document.getElementById('signupBtn').addEventListener('click', async () => {
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const confirm = document.getElementById('signupConfirmPassword').value;
  const btn = document.getElementById('signupBtn');

  document.getElementById('errBanner').style.display = 'none';

  if (!email || !password || !confirm) {
    showErr('Please fill in all fields.');
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showErr('Please enter a valid email address.');
    return;
  }

  if (password.length < 8) {
    showErr('Password must be at least 8 characters.');
    return;
  }

  if (password !== confirm) {
    showErr('Passwords do not match.');
    return;
  }

  btn.textContent = 'Creating account\u2026';
  btn.disabled = true;

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error_description || data.msg || 'Registration failed. Please try again.');
    }

    if (data.access_token) {
      await chrome.storage.local.set({ session: data });
      toggleToLogin();

      const response = await chrome.runtime.sendMessage({ action: 'validateLicense' });
      renderLicenseStatus(response?.licenseStatus || 'invalid', response?.licensePlan, currentMode, data);

      document.getElementById('onboardingBanner').style.display = 'block';
      showToast('Account created. Choose a plan to get started.', 'success');
    } else {
      toggleToLogin();
      document.getElementById('loginEmail').value = email;
      showErr('Account created. Check your email to confirm your address, then sign in.');
    }

  } catch (error) {
    showErr(error.message);
  } finally {
    btn.textContent = 'Create Account';
    btn.disabled = false;
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await chrome.storage.local.remove(['session', 'licenseStatus', 'licensePlan']);
  document.getElementById('loginEmail').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('errBanner').style.display = 'none';
  document.getElementById('onboardingBanner').style.display = 'none';
  renderLicenseStatus('none', null, currentMode, null);
  showToast('Signed out.', 'success');
});

document.getElementById('saveSettings').addEventListener('click', async () => {
  const apiKey     = document.getElementById('apiKey').value.trim();
  const salary     = document.getElementById('currentSalary').value;
  const minSalary  = document.getElementById('minSalary').value;
  const resumeText = document.getElementById('resumeText').value;

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
  showToast('Settings saved. Cache cleared.', 'success');
});

document.getElementById('refreshStatusBtn').addEventListener('click', async () => {
  const btn = document.getElementById('refreshStatusBtn');
  btn.textContent = 'Checking\u2026';
  btn.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ action: 'validateLicense' });
    const { session } = await chrome.storage.local.get('session');
    renderLicenseStatus(response?.licenseStatus || 'invalid', response?.licensePlan, currentMode, session);
    showToast('License status updated.', 'success');
  } finally {
    btn.textContent = 'Refresh License Status';
    btn.disabled = false;
  }
});

document.getElementById('cancelSubBtn').addEventListener('click', () => {
  window.open(CANCEL_SUB_LINK, '_blank');
});

document.getElementById('deleteAccountBtn').addEventListener('click', () => {
  document.getElementById('deleteConfirmOverlay').classList.add('visible');
});

document.getElementById('deleteConfirmCancel').addEventListener('click', () => {
  document.getElementById('deleteConfirmOverlay').classList.remove('visible');
});

document.getElementById('deleteConfirmProceed').addEventListener('click', async () => {
  document.getElementById('deleteConfirmOverlay').classList.remove('visible');
  await handleDeleteAccount();
});

document.getElementById('deleteConfirmOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.remove('visible');
  }
});

async function handleDeleteAccount() {
  showToast('Account deletion requested. This feature will be connected shortly.', 'error');
}

function renderLicenseStatus(status, plan, mode, session) {
  const box  = document.getElementById('licenseStatusBox');
  const text = document.getElementById('licenseStatusText');
  const sub  = document.getElementById('licenseStatusSub');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const loggedInView = document.getElementById('loggedInView');
  const userEmail = document.getElementById('userEmail');
  const purchaseOptions = document.getElementById('purchaseOptions');
  const dangerZone = document.getElementById('dangerZone');

  if (!session?.access_token) {
    box.className = 'status-box none';
    text.textContent = 'Not logged in';
    sub.textContent  = 'Sign in or create a free account to get started';
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
    loggedInView.style.display = 'none';
    purchaseOptions.style.display = 'none';
    dangerZone.style.display = 'none';
    return;
  }

  loginForm.style.display = 'none';
  signupForm.style.display = 'none';
  loggedInView.style.display = 'block';
  userEmail.textContent = session.user.email;
  dangerZone.style.display = 'block';

  if (status === 'valid' || status === 'offline') {
    box.className = 'status-box valid';
    text.textContent = 'Active Subscription';
    sub.textContent  = 'Your Pro account is in good standing';
    purchaseOptions.style.display = 'none';
    document.getElementById('onboardingBanner').style.display = 'none';
    return;
  }

  if (status === 'lifetime') {
    box.className = 'status-box byok';
    text.textContent = 'Lifetime BYOK License';
    sub.textContent  = 'Ensure your OpenRouter key is set in BYOK Mode';
    purchaseOptions.style.display = 'none';
    document.getElementById('onboardingBanner').style.display = 'none';
    return;
  }

  if (status === 'byok') {
    box.className = 'status-box byok';
    text.textContent = 'BYOK Mode';
    sub.textContent  = 'Using your own API key \u2014 no subscription required';
    purchaseOptions.style.display = 'none';
    document.getElementById('onboardingBanner').style.display = 'none';
    return;
  }

  box.className = 'status-box invalid';
  text.textContent = 'No Active License';
  sub.textContent  = 'Choose a plan below to unlock all features';
  purchaseOptions.style.display = 'flex';
  purchaseOptions.style.flexDirection = 'column';
}

function showErr(msg) {
  const el = document.getElementById('errBanner');
  el.textContent = msg;
  el.style.display = 'block';
}

let toastTimer = null;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = type;
  void el.offsetWidth;
  el.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('visible'); }, 3000);
}
