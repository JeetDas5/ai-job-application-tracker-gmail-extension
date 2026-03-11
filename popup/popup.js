// Load data on popup open
document.addEventListener('DOMContentLoaded', async () => {
    const data = await chrome.storage.local.get(['jobs', 'custom_items', 'lastSyncTime', 'mode']);
    const mode = data.mode || 'job_tracker';

    // Update popup title based on mode
    const titleEl = document.getElementById('popup-title');
    if (titleEl) {
        titleEl.textContent = mode === 'job_tracker' ? 'Job Tracker AI' : 'Mail Tracker AI';
    }

    if (mode === 'job_tracker') {
        if (data.jobs) renderJobs(data.jobs);
    } else {
        if (data.custom_items) renderCustomItems(data.custom_items);
    }

    if (data.lastSyncTime) updateSyncTime(data.lastSyncTime);

    // Update count label
    const countLabel = document.getElementById('count-label');
    if (countLabel) {
        countLabel.textContent = mode === 'job_tracker' ? 'Applications Tracked' : 'Emails Matched';
    }
});

// Trigger Sync
document.getElementById('sync-btn').addEventListener('click', () => {
    const btn = document.getElementById('sync-btn');
    btn.innerText = "Syncing...";
    btn.disabled = true;

    chrome.runtime.sendMessage({ action: "sync_jobs" }, (response) => {
        btn.innerText = "Sync Gmail";
        btn.disabled = false;
        if (response.status === "success") {
            if (response.lastSync) updateSyncTime(response.lastSync);
            location.reload();
        } else {
            alert("Error: " + response.message);
        }
    });
});

document.getElementById('open-dashboard').onclick = () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("dashboard/dashboard.html") });
};

function updateSyncTime(isoString) {
    const date = new Date(isoString);
    document.getElementById('last-sync-time').innerText = date.toLocaleString();
}

function renderJobs(jobs) {
    const container = document.getElementById('job-list');
    document.getElementById('job-count').innerText = jobs.length;
    container.innerHTML = jobs.map(job => `
    <div class="job-card">
      <span class="status-badge">${job.status}</span>
      <h4>${job.company}</h4>
      <p>${job.role}</p>
      <p style="font-size: 10px; color: #999;">${job.date}</p>
    </div>
  `).join('');
}

function renderCustomItems(items) {
    const container = document.getElementById('job-list');
    const relevantItems = items.filter(i => i.is_relevant);
    document.getElementById('job-count').innerText = relevantItems.length;
    container.innerHTML = relevantItems.slice(0, 10).map(item => `
    <div class="job-card">
      <span class="status-badge" style="color: #16a34a;">Relevant</span>
      <h4 style="font-size: 13px;">${item.subject || '(No subject)'}</h4>
      <p style="font-size: 11px;">${item.summary || ''}</p>
      <p style="font-size: 10px; color: #999;">${item.date}</p>
    </div>
  `).join('');

    if (relevantItems.length === 0) {
        container.innerHTML = '<p style="font-size: 12px; color: #999; text-align:center; padding: 10px;">No relevant emails found yet.<br>Try syncing.</p>';
    }
}