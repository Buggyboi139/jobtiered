const SUPABASE_URL = "https://ppbpqyjejyoqjuvhzlsc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JuUEERY7RM0vVRb8_SGDlQ_EenqKT84";
const STRIPE_SUB_LINK = "https://buy.stripe.com/14A5kE3lY0Fe4oy2L493y01";
const STRIPE_BYOK_LINK = "https://buy.stripe.com/14A28scWy2Nm6wGbhA93y00";
const CANCEL_SUB_LINK = "https://billing.stripe.com/p/login/14A28scWy2Nm6wGbhA93y00";

function $(id) { return document.getElementById(id); }

function isManagedStatus(status) {
  return status === 'valid' || status === 'lifetime' || status === 'offline';
}

document.addEventListener('DOMContentLoaded', async () => {
  const data = await chrome.storage.local.get([
    'openRouterKey', 'currentSalary', 'minSalary', 'resumeText',
    'session', 'licenseStatus', 'licensePlan'
  ]);

  if (data.openRouterKey) $('apiKey').value = data.openRouterKey;
  if (data.currentSalary) $('currentSalary').value = data.currentSalary;
  if (data.minSalary) $('minSalary').value = data.minSalary;
  if (data.resumeText) $('resumeText').value = data.resumeText;

  renderLicenseStatus(data.licenseStatus, data.licensePlan, data.session);

  if (data.session?.access_token) {
    const response = await chrome.runtime.sendMessage({ action: 'validateLicense' });
    renderLicenseStatus(response?.licenseStatus || data.licenseStatus, response?.licensePlan, data.session);
  }
});

function toggleToSignup() {
  $('errBanner').style.display = 'none';
  $('loginForm').style.display = 'none';
  $('signupForm').style.display = 'block';
  $('signupEmail').value = '';
  $('signupPassword').value = '';
  $('signupConfirmPassword').value = '';
}

function toggleToLogin() {
  $('errBanner').style.display = 'none';
  $('signupForm').style.display = 'none';
  $('loginForm').style.display = 'block';
}

$('showSignupLink').addEventListener('click', (e) => {
  e.preventDefault();
  toggleToSignup();
});

$('backToLoginLink').addEventListener('click', (e) => {
  e.preventDefault();
  toggleToLogin();
});

$('buySubBtn').addEventListener('click', async () => {
  const { session } = await chrome.storage.local.get('session');
  if (session?.user?.id) {
    window.open(`${STRIPE_SUB_LINK}?client_reference_id=${session.user.id}`, '_blank');
  } else {
    showErr('Please log in first.');
  }
});

$('buyByokBtn').addEventListener('click', async () => {
  const { session } = await chrome.storage.local.get('session');
  if (session?.user?.id) {
    window.open(`${STRIPE_BYOK_LINK}?client_reference_id=${session.user.id}`, '_blank');
  } else {
    showErr('Please log in first.');
  }
});

$('loginBtn').addEventListener('click', async () => {
  const email = $('loginEmail').value.trim();
  const password = $('loginPassword').value;
  const btn = $('loginBtn');

  $('errBanner').style.display = 'none';

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
    $('onboardingBanner').style.display = 'none';

    const response = await chrome.runtime.sendMessage({ action: 'validateLicense' });

    renderLicenseStatus(response?.licenseStatus || 'invalid', response?.licensePlan, data);
    showToast('Signed in successfully.', 'success');

  } catch (error) {
    showErr(error.message);
  } finally {
    btn.textContent = 'Sign In';
    btn.disabled = false;
  }
});

$('signupBtn').addEventListener('click', async () => {
  const email = $('signupEmail').value.trim();
  const password = $('signupPassword').value;
  const confirm = $('signupConfirmPassword').value;
  const btn = $('signupBtn');

  $('errBanner').style.display = 'none';

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
      renderLicenseStatus(response?.licenseStatus || 'invalid', response?.licensePlan, data);

      $('onboardingBanner').style.display = 'block';
      showToast('Account created. Choose a plan to get started.', 'success');
    } else {
      toggleToLogin();
      $('loginEmail').value = email;
      showErr('Account created. Check your email to confirm your address, then sign in.');
    }

  } catch (error) {
    showErr(error.message);
  } finally {
    btn.textContent = 'Create Account';
    btn.disabled = false;
  }
});

$('logoutBtn').addEventListener('click', async () => {
  await chrome.storage.local.remove(['session', 'licenseStatus', 'licensePlan']);
  $('loginEmail').value = '';
  $('loginPassword').value = '';
  $('errBanner').style.display = 'none';
  $('onboardingBanner').style.display = 'none';
  renderLicenseStatus('none', null, null);
  showToast('Signed out.', 'success');
});

$('saveSettings').addEventListener('click', async () => {
  const apiKey     = $('apiKey').value.trim();
  const salary     = $('currentSalary').value;
  const minSalary  = $('minSalary').value;
  const resumeText = $('resumeText').value;

  const payload = {
    currentSalary: salary,
    minSalary: minSalary,
    resumeText: resumeText,
  };

  const { licenseStatus } = await chrome.storage.local.get('licenseStatus');
  if (licenseStatus === 'byok') {
    payload.openRouterKey = apiKey;
  }

  await chrome.storage.local.set(payload);
  await chrome.storage.local.remove(['gradeHistory', 'apiTokens']);
  showToast('Settings saved. Cache cleared.', 'success');
});

$('refreshStatusBtn').addEventListener('click', async () => {
  const btn = $('refreshStatusBtn');
  btn.textContent = 'Checking…';
  btn.disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ action: 'validateLicense' });
    const { session } = await chrome.storage.local.get('session');
    renderLicenseStatus(response?.licenseStatus || 'invalid', response?.licensePlan, session);
    showToast('License status updated.', 'success');
  } finally {
    btn.textContent = 'Refresh License Status';
    btn.disabled = false;
  }
});

$('cancelSubBtn').addEventListener('click', () => {
  window.open(CANCEL_SUB_LINK, '_blank');
});

$('deleteAccountBtn').addEventListener('click', () => {
  $('deleteConfirmOverlay').classList.add('visible');
});

$('deleteConfirmCancel').addEventListener('click', () => {
  $('deleteConfirmOverlay').classList.remove('visible');
});

$('deleteConfirmProceed').addEventListener('click', async () => {
  $('deleteConfirmOverlay').classList.remove('visible');
  await handleDeleteAccount();
});

$('deleteConfirmOverlay').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.remove('visible');
  }
});

async function handleDeleteAccount() {
  const btn = $('deleteAccountBtn');
  btn.textContent = 'Deleting…';
  btn.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({ action: 'deleteAccount' });

    if (response.error) {
      showToast(`Delete failed: ${response.error}`, 'error');
      return;
    }

    await chrome.storage.local.clear();
    showToast('Account deleted successfully.', 'success');

    setTimeout(() => {
      renderLicenseStatus('none', null, null);
      $('loginEmail').value = '';
      $('loginPassword').value = '';
      $('apiKey').value = '';
      $('currentSalary').value = '';
      $('minSalary').value = '';
      $('resumeText').value = '';
    }, 500);
  } catch (err) {
    showToast(`Delete failed: ${err.message}`, 'error');
  } finally {
    btn.textContent = 'Delete Account';
    btn.disabled = false;
  }
}

function renderLicenseStatus(status, plan, session) {
  const box  = $('licenseStatusBox');
  const text = $('licenseStatusText');
  const sub  = $('licenseStatusSub');
  const loginForm = $('loginForm');
  const signupForm = $('signupForm');
  const loggedInView = $('loggedInView');
  const userEmail = $('userEmail');
  const purchaseOptions = $('purchaseOptions');
  const dangerZone = $('dangerZone');
  const byokSection = $('byokSection');
  const cancelBtn = $('cancelSubBtn');

  byokSection.style.display = 'none';
  cancelBtn.style.display = 'none';

  if (!session?.access_token) {
    box.className = 'status-box none';
    text.textContent = 'Not logged in';
    sub.textContent  = 'Sign in or create an account to get started';
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
  userEmail.textContent = session.user?.email || 'Unknown';
  dangerZone.style.display = 'block';

  if (status === 'valid' || status === 'offline') {
    box.className = 'status-box valid';
    text.textContent = 'Active Subscription';
    sub.textContent  = 'Your Pro account is in good standing. AI grading uses the managed API.';
    purchaseOptions.style.display = 'none';
    cancelBtn.style.display = 'block';
    $('onboardingBanner').style.display = 'none';
    return;
  }

  if (status === 'lifetime') {
    box.className = 'status-box valid';
    text.textContent = 'Lifetime License';
    sub.textContent  = 'Your lifetime license is active. AI grading uses the managed API.';
    purchaseOptions.style.display = 'none';
    cancelBtn.style.display = 'none';
    $('onboardingBanner').style.display = 'none';
    return;
  }

  if (status === 'byok') {
    box.className = 'status-box byok';
    text.textContent = 'BYOK License';
    sub.textContent  = 'Your license is active, but AI calls require your own OpenRouter API key.';
    purchaseOptions.style.display = 'none';
    byokSection.style.display = 'block';
    $('onboardingBanner').style.display = 'none';
    return;
  }

  if (status === 'past_due') {
    box.className = 'status-box past_due';
    text.textContent = 'Payment Past Due';
    sub.textContent  = 'Your subscription payment failed. Please update your payment method to restore access.';
    purchaseOptions.style.display = 'none';
    cancelBtn.style.display = 'block';
    $('onboardingBanner').style.display = 'none';
    return;
  }

  box.className = 'status-box invalid';
  text.textContent = 'No Active Plan';
  sub.textContent  = 'Choose a plan below to unlock all features';
  purchaseOptions.style.display = 'flex';
  purchaseOptions.style.flexDirection = 'column';
  cancelBtn.style.display = 'none';
}

function showErr(msg) {
  const el = $('errBanner');
  el.textContent = msg;
  el.style.display = 'block';
}

let toastTimer = null;
function showToast(msg, type) {
  const el = $('toast');
  el.textContent = msg;
  el.className = type;
  void el.offsetWidth;
  el.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.classList.remove('visible'); }, 3000);
}
