const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co/functions/v1/validate-license";
const OWNER_API_KEY = "sk-or-v1-YOUR_OWNER_KEY_HERE";
const LICENSE_CHECK_ALARM = "licenseCheck";
const LICENSE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(LICENSE_CHECK_ALARM, { periodInMinutes: 1440 });
  validateAndCacheLicense();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LICENSE_CHECK_ALARM) validateAndCacheLicense();
});

chrome.runtime.onStartup.addListener(() => {
  checkLicenseCacheAge();
});

async function checkLicenseCacheAge() {
  const { licenseCheckedAt } = await chrome.storage.local.get("licenseCheckedAt");
  if (!licenseCheckedAt || Date.now() - licenseCheckedAt > LICENSE_CACHE_TTL_MS) {
    validateAndCacheLicense();
  }
}

async function validateAndCacheLicense() {
  const { licenseKey, licenseEmail, licenseMode } = await chrome.storage.local.get([
    "licenseKey", "licenseEmail", "licenseMode"
  ]);

  if (licenseMode === "byok") {
    await chrome.storage.local.set({
      licenseStatus: "byok",
      licenseCheckedAt: Date.now()
    });
    return;
  }

  if (!licenseKey) {
    await chrome.storage.local.set({
      licenseStatus: "none",
      licenseCheckedAt: Date.now()
    });
    return;
  }

  try {
    const resp = await fetch(SUPABASE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ license_key: licenseKey, email: licenseEmail || "" })
    });

    if (!resp.ok) {
      const cached = await chrome.storage.local.get("licenseStatus");
      if (!cached.licenseStatus || cached.licenseStatus === "none") {
        await chrome.storage.local.set({ licenseStatus: "invalid", licenseCheckedAt: Date.now() });
      }
      return;
    }

    const data = await resp.json();
    await chrome.storage.local.set({
      licenseStatus: data.valid ? "valid" : "invalid",
      licensePlan: data.plan || "unknown",
      licenseExpiry: data.expires_at || null,
      licenseCheckedAt: Date.now()
    });
  } catch (_) {
    const { licenseCheckedAt } = await chrome.storage.local.get("licenseCheckedAt");
    if (licenseCheckedAt && Date.now() - licenseCheckedAt < LICENSE_CACHE_TTL_MS * 3) return;
    await chrome.storage.local.set({ licenseStatus: "offline", licenseCheckedAt: Date.now() });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fetchOpenRouter") {
    handleOpenRouterFetch(request).then(sendResponse).catch(err => sendResponse({ error: err.message }));
    return true;
  }

  if (request.action === "validateLicense") {
    validateAndCacheLicense().then(() => {
      chrome.storage.local.get(["licenseStatus", "licensePlan", "licenseExpiry"]).then(sendResponse);
    });
    return true;
  }

  if (request.action === "getLicenseStatus") {
    chrome.storage.local.get(["licenseStatus", "licensePlan", "licenseExpiry", "licenseMode"]).then(sendResponse);
    return true;
  }
});

async function handleOpenRouterFetch(request) {
  const { licenseMode, licenseStatus, openRouterKey } = await chrome.storage.local.get([
    "licenseMode", "licenseStatus", "openRouterKey"
  ]);

  let apiKey;

  if (licenseMode === "byok") {
    if (!openRouterKey) return { error: "No API key configured. Add your OpenRouter key in Settings." };
    apiKey = openRouterKey;
  } else {
    const isValid = licenseStatus === "valid" || licenseStatus === "offline";
    if (!isValid) return { error: "Invalid or expired license. Update in Settings." };
    apiKey = OWNER_API_KEY;
  }

  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://jobtierpro.app",
      "X-Title": "Job Tier Rater Pro",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: request.model || "google/gemini-2.5-flash-lite",
      messages: request.messages,
      temperature: request.temperature ?? 0.1
    })
  });

  const data = await resp.json();
  return { status: resp.status, ok: resp.ok, data };
}
