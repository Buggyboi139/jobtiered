async function loadCache() {
  try {
    const { gradeHistory } = await chrome.storage.local.get('gradeHistory');
    if (gradeHistory) {
      for (const [k, v] of Object.entries(gradeHistory)) gradeCache.set(k, v);
    }
  } catch (e) {}
}

async function persistCache() {
  try {
    const obj = Object.fromEntries([...gradeCache].slice(-400));
    await chrome.storage.local.set({ gradeHistory: obj });
  } catch (e) {}
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.gradeHistory && !changes.gradeHistory.newValue) gradeCache.clear();
  if (changes.resumeText) extractResumeKeywords(changes.resumeText.newValue || '');
});
