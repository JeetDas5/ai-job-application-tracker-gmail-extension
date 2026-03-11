import { GmailAPI } from './gmail-api.js';
import { OpenRouterAPI } from './openrouter-api.js';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "sync_jobs") {
    handleSync(sendResponse);
    return true; // Keeps the message channel open for async response
  }
});

async function handleSync(sendResponse) {
  try {
    // 1. Get Settings
    const settings = await chrome.storage.local.get([
      'openrouter_key', 'jobs', 'custom_items', 'lastSyncTime', 'model', 'mode', 'custom_prompt'
    ]);

    if (!settings.openrouter_key) {
      sendResponse({ status: "error", message: "Missing OpenRouter API Key" });
      return;
    }

    const mode = settings.mode || 'job_tracker';

    // Validate custom mode has a prompt
    if (mode === 'custom' && !settings.custom_prompt) {
      sendResponse({ status: "error", message: "Custom mode requires a prompt. Please set one in Settings." });
      return;
    }

    // 2. Authenticate Gmail
    const token = await GmailAPI.getAuthToken();
    if (!token) {
      sendResponse({ status: "error", message: "Failed to authenticate Gmail" });
      return;
    }

    // 3. Construct Query based on Time
    // In custom mode we fetch all inbox mail; in job tracker mode we filter by keywords
    let query = mode === 'job_tracker'
      ? 'label:INBOX (application OR "thank you for applying")'
      : 'label:INBOX';

    if (settings.lastSyncTime) {
      // Gmail 'after' uses seconds
      const afterTimestamp = Math.floor(new Date(settings.lastSyncTime).getTime() / 1000);
      query += ` after:${afterTimestamp}`;
    } else {
      query += ` newer_than:7d`;
    }

    console.log("Using Gmail Query:", query, "| Mode:", mode);

    // 4. List relevant messages
    const messages = await GmailAPI.listMessages(token, query);
    console.log(`Fetched ${messages.length} emails from Gmail.`);

    const newItems = [];

    if (mode === 'job_tracker') {
      // ── JOB TRACKER MODE ──────────────────────────────────────────
      const existingJobs = settings.jobs || [];

      for (const msg of messages) {
        if (existingJobs.find(job => job.id === msg.id)) continue;

        const fullEmail = await GmailAPI.getMessage(token, msg.id);
        const analysis = await OpenRouterAPI.analyzeEmail(settings.openrouter_key, fullEmail, settings.model);

        if (analysis.is_job_related) {
          newItems.push({ ...analysis, id: msg.id });
        }
      }

      const updatedJobs = [...newItems, ...existingJobs];
      const newLastSyncTime = new Date().toISOString();

      await chrome.storage.local.set({ jobs: updatedJobs, lastSyncTime: newLastSyncTime });
      await chrome.storage.local.remove('processedIds');

      // Stats tracking
      try {
        const today = new Date().toISOString().split('T')[0];
        const storage = await chrome.storage.local.get("stats");
        const stats = storage.stats || { ai_daily: {}, emails_daily: {} };
        if (!stats.emails_daily) stats.emails_daily = {};
        if (!stats.emails_daily[today]) stats.emails_daily[today] = 0;
        stats.emails_daily[today] += messages.length;
        await chrome.storage.local.set({ stats });
      } catch (statsErr) {
        console.error("Failed to update email stats:", statsErr);
      }

      console.log(`[Job Tracker] Processed ${messages.length} emails. Found ${newItems.length} new jobs.`);
      sendResponse({
        status: "success",
        count: newItems.length,
        processed: messages.length,
        lastSync: new Date().toISOString()
      });

    } else {
      // ── CUSTOM MODE ───────────────────────────────────────────────
      const existingItems = settings.custom_items || [];

      for (const msg of messages) {
        if (existingItems.find(item => item.id === msg.id)) continue;

        const fullEmail = await GmailAPI.getMessage(token, msg.id);
        const analysis = await OpenRouterAPI.analyzeEmailCustom(
          settings.openrouter_key, fullEmail, settings.model, settings.custom_prompt
        );

        // Store ALL results so the user can filter relevant vs non-relevant in the dashboard
        newItems.push({
          ...analysis,
          id: msg.id,
          subject: fullEmail.subject,
          date: new Date().toISOString().split('T')[0]
        });
      }

      const updatedItems = [...newItems, ...existingItems];
      const newLastSyncTime = new Date().toISOString();

      await chrome.storage.local.set({ custom_items: updatedItems, lastSyncTime: newLastSyncTime });

      // Stats tracking
      try {
        const today = new Date().toISOString().split('T')[0];
        const storage = await chrome.storage.local.get("stats");
        const stats = storage.stats || { ai_daily: {}, emails_daily: {} };
        if (!stats.emails_daily) stats.emails_daily = {};
        if (!stats.emails_daily[today]) stats.emails_daily[today] = 0;
        stats.emails_daily[today] += messages.length;
        await chrome.storage.local.set({ stats });
      } catch (statsErr) {
        console.error("Failed to update email stats:", statsErr);
      }

      console.log(`[Custom] Processed ${messages.length} emails. Found ${newItems.length} items.`);
      sendResponse({
        status: "success",
        count: newItems.length,
        processed: messages.length,
        lastSync: newLastSyncTime
      });
    }

  } catch (error) {
    console.error("Sync Error:", error);
    sendResponse({ status: "error", message: error.message });
  }
}
