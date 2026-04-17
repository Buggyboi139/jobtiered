const SUPABASE_URL = "https://ppbpqyjejyoqjuvhzlsc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JuUEERY7RM0vVRb8_SGDlQ_EenqKT84";
const STRIPE_SUB_LINK = "https://buy.stripe.com/14A5kE3lY0Fe4oy2L493y01";
const STRIPE_BYOK_LINK = "https://buy.stripe.com/14A28scWy2Nm6wGbhA93y00";

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

  btn.textContent = 'Signing in…';
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
    showSaveBanner('Signed in successfully!');

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

  btn.textContent = 'Creating account…';
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
      showSaveBanner('Account created! Choose a plan to get started.');
    } else {
      toggleToLogin();
      document.getElementById('loginEmail').value = email;
      showErr('Account created! Check your email to confirm your address, then sign in here.');
    }

  } catch (error) {
    showErr(error.message);
  } finally {
    btn.textContent = '🚀 Create Account';
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

document.getElementById('refreshStatusBtn').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ action: 'validateLicense' });
  const { session } = await chrome.storage.local.get('session');
  renderLicenseStatus(response?.licenseStatus || 'invalid', response?.licensePlan, currentMode, session);
});

function renderLicenseStatus(status, plan, mode, session) {
  const box  = document.getElementById('licenseStatusBox');
  const text = document.getElementById('licenseStatusText');
  const sub  = document.getElementById('licenseStatusSub');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const loggedInView = document.getElementById('loggedInView');
  const userEmail = document.getElementById('userEmail');
  const purchaseOptions = document.getElementById('purchaseOptions');

  if (!session?.access_token) {
    box.className = 'status-box none';
    text.textContent = 'Not logged in';
    sub.textContent  = 'Sign in or create a free account to get started';
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
    loggedInView.style.display = 'none';
    purchaseOptions.style.display = 'none';
    return;
  }

  loginForm.style.display = 'none';
  signupForm.style.display = 'none';
  loggedInView.style.display = 'block';
  userEmail.textContent = session.user.email;

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

function showSaveBanner(msg) {
  const banner = document.getElementById('saveBanner');
  banner.textContent = msg;
  banner.style.display = 'block';
  setTimeout(() => { banner.style.display = 'none'; }, 2500);
}
