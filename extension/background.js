const SUPABASE_URL = "https://ppbpqyjejyoqjuvhzlsc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_JuUEERY7RM0vVRb8_SGDlQ_EenqKT84";
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
  const { licenseMode, session } = await chrome.storage.local.get(["licenseMode", "session"]);

  if (!session?.access_token) {
    await chrome.storage.local.set({
      licenseStatus: "none",
      licenseCheckedAt: Date.now()
    });
    return;
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${session.user.id}&select=status,price_id`, {
      headers: {
        "apikey": SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${session.access_token}`
      }
    });

    if (!resp.ok) {
      const cached = await chrome.storage.local.get("licenseStatus");
      if (!cached.licenseStatus || cached.licenseStatus === "none") {
        await chrome.storage.local.set({ licenseStatus: "invalid", licenseCheckedAt: Date.now() });
      }
      return;
    }

    const data = await resp.json();
    const sub = data[0];

    if (licenseMode === "byok") {
      if (sub && (sub.status === "active" || sub.status === "lifetime")) {
        await chrome.storage.local.set({
          licenseStatus: "byok",
          licenseCheckedAt: Date.now()
        });
      } else {
        await chrome.storage.local.set({
          licenseStatus: "invalid",
          licenseCheckedAt: Date.now()
        });
      }
      return;
    }

    if (sub && (sub.status === "active" || sub.status === "lifetime")) {
      await chrome.storage.local.set({
        licenseStatus: "valid",
        licensePlan: sub.price_id || "unknown",
        licenseExpiry: null,
        licenseCheckedAt: Date.now()
      });
    } else {
      await chrome.storage.local.set({
        licenseStatus: "invalid",
        licensePlan: "unknown",
        licenseExpiry: null,
        licenseCheckedAt: Date.now()
      });
    }
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
  const { licenseMode, licenseStatus, openRouterKey, session } = await chrome.storage.local.get([
    "licenseMode", "licenseStatus", "openRouterKey", "session"
  ]);

  if (licenseMode === "byok") {
    if (!openRouterKey) return { error: "No API key configured." };

    const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openRouterKey}`,
        "HTTP-Referer": "https://jobtiered.com",
        "X-Title": "JobTiered",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: request.model || "google/gemini-2.5-flash-lite",
        messages: request.messages,
        temperature: request.temperature ?? 0.1
      })
    });

    const byokText = await resp.text();
    let data;
    try {
      data = JSON.parse(byokText);
    } catch {
      return { error: `OpenRouter returned invalid response (${resp.status})` };
    }
    return { status: resp.status, ok: resp.ok, data };
  }

  const isValid = licenseStatus === "valid" || licenseStatus === "offline";
  if (!isValid || !session?.access_token) return { error: "Invalid license or not logged in." };

  const resp = await fetch(`${SUPABASE_URL}/functions/v1/evaluate-job`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY
    },
    body: JSON.stringify({
      messages: request.messages,
      model: request.model,
      temperature: request.temperature
    })
  });

  const text = await resp.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: `Server returned invalid response (${resp.status})` };
  }

  if (!resp.ok || data.error) {
    return { error: data.error || `Server Error ${resp.status}` };
  }

  return { status: resp.status, ok: true, data };
}
