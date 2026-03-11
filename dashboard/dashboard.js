import { OpenRouterAPI } from '../scripts/openrouter-api.js';

// Cache models to avoid refetching on every sort/filter change
let cachedModels = [];

// Current active mode ('job_tracker' | 'custom')
let currentMode = 'job_tracker';

// Helper to refresh rate limit data from storage
async function updateRateLimitData() {
    const limitData = await chrome.storage.local.get("rate_limit_errors");
    let rateErrors = limitData.rate_limit_errors || {};
    const now = Date.now();
    let changed = false;

    // Clean up errors older than 24 hours
    for (const [mid, timestamp] of Object.entries(rateErrors)) {
        if (now - timestamp > 86400000) {
            delete rateErrors[mid];
            changed = true;
        }
    }

    if (changed) {
        await chrome.storage.local.set({ rate_limit_errors: rateErrors });
    }

    // Update cachedModels in place
    cachedModels = cachedModels.map(m => ({
        ...m,
        _rateLimitError: rateErrors[m.id] || null
    }));
}

document.addEventListener('DOMContentLoaded', async () => {
    // Listen for storage changes to update UI in real-time
    chrome.storage.onChanged.addListener(async (changes, namespace) => {
        if (namespace === 'local' && changes.rate_limit_errors) {
            console.log("Rate limits changed, updating UI...");
            await updateRateLimitData();
            renderModelOptions();
            if (document.getElementById('view-comparison').style.display === 'block') {
                renderComparisonTable();
            }
        }
    });

    // 1. Initial Load — read mode first
    const stored = await chrome.storage.local.get(['mode', 'lastSyncTime']);
    currentMode = stored.mode || 'job_tracker';

    applyModeToUI(currentMode);
    loadAndRender('all');
    await loadSettings();

    // 2. Navigation Logic
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            document.querySelectorAll('.nav-item').forEach(na => na.classList.remove('active'));
            e.target.classList.add('active');

            const view = e.target.dataset.view;
            document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');

            if (view === 'settings') {
                document.getElementById('view-settings').style.display = 'block';
                document.getElementById('app-filters').style.display = 'none';
                document.getElementById('custom-filters').style.display = 'none';
            } else if (view === 'stats') {
                document.getElementById('view-stats').style.display = 'block';
                document.getElementById('app-filters').style.display = 'none';
                document.getElementById('custom-filters').style.display = 'none';
                renderStats();
            } else if (view === 'comparison') {
                document.getElementById('view-comparison').style.display = 'block';
                document.getElementById('app-filters').style.display = 'none';
                document.getElementById('custom-filters').style.display = 'none';
                await updateRateLimitData();
                renderComparisonTable();
            } else {
                // Default: Items view
                document.getElementById('view-applications').style.display = 'block';
                if (currentMode === 'job_tracker') {
                    document.getElementById('app-filters').style.display = 'block';
                    document.getElementById('custom-filters').style.display = 'none';
                } else {
                    document.getElementById('app-filters').style.display = 'none';
                    document.getElementById('custom-filters').style.display = 'block';
                }
            }
        });
    });

    // 3. Mode Toggle Buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const selectedMode = btn.dataset.mode;
            currentMode = selectedMode;
            applyModeToUI(selectedMode);
        });
    });

    // 4. Save Settings Logic
    document.getElementById('save-settings').addEventListener('click', saveSettings);

    // Live Theme Preview
    document.getElementById('setting-theme').addEventListener('change', (e) => {
        applyTheme(e.target.value);
    });

    // Refresh Models Button
    document.getElementById('refresh-models').addEventListener('click', async () => {
        const key = document.getElementById('setting-api-key').value;
        if (key) {
            await fetchModels(key);
            alert("Models refreshed!");
        } else {
            alert("Please enter an OpenRouter API Key first.");
        }
    });

    // Filtering & Sorting Listeners
    document.getElementById('show-paid-models').addEventListener('change', renderModelOptions);
    document.getElementById('sort-models').addEventListener('change', renderModelOptions);

    // Fetch models on key blur
    document.getElementById('setting-api-key').addEventListener('blur', async (e) => {
        if (e.target.value) {
            await fetchModels(e.target.value);
        }
    });

    // Update Last Sync Time
    const data = await chrome.storage.local.get('lastSyncTime');
    if (data.lastSyncTime) {
        document.getElementById('last-sync-time').innerText = new Date(data.lastSyncTime).toLocaleString();
    }

    // Handle Filtering — job tracker mode filters
    document.querySelectorAll('#app-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelector('#app-filters .filter-btn.active').classList.remove('active');
            e.target.classList.add('active');
            loadAndRender(e.target.dataset.filter);
        });
    });

    // Handle Filtering — custom mode filters
    document.querySelectorAll('#custom-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelector('#custom-filters .filter-btn.active').classList.remove('active');
            e.target.classList.add('active');
            loadAndRender(e.target.dataset.filter);
        });
    });

    document.getElementById('refresh-dashboard').addEventListener('click', () => location.reload());
});

// ─── MODE UI HELPERS ──────────────────────────────────────────────────────────

function applyModeToUI(mode) {
    // Update mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    // Show/hide custom prompt input
    const customPromptGroup = document.getElementById('custom-prompt-group');
    customPromptGroup.style.display = mode === 'custom' ? 'block' : 'none';

    // Update mode description text
    const modeDesc = document.getElementById('mode-description');
    if (mode === 'job_tracker') {
        modeDesc.textContent = 'Track job applications, interviews, offers & rejections from your Gmail inbox.';
    } else {
        modeDesc.textContent = 'Use a custom AI prompt to surface and summarize any kind of email from your inbox.';
    }

    // Update sidebar title
    const title = document.getElementById('sidebar-title');
    if (title) {
        title.innerHTML = mode === 'job_tracker'
            ? 'JobTracker<span>AI</span>'
            : 'MailTracker<span>AI</span>';
    }

    // Update the items nav label
    const navApplications = document.getElementById('nav-applications');
    if (navApplications) {
        navApplications.textContent = mode === 'job_tracker' ? '📋 Applications' : '📋 Items';
    }

    // Update view title
    const viewTitle = document.getElementById('view-title');
    if (viewTitle) {
        viewTitle.textContent = mode === 'job_tracker' ? 'Applications' : 'Matched Emails';
    }

    // Show/hide correct filter panel in sidebar (only if we're on the items view)
    if (document.getElementById('view-applications').style.display !== 'none') {
        document.getElementById('app-filters').style.display = mode === 'job_tracker' ? 'block' : 'none';
        document.getElementById('custom-filters').style.display = mode === 'custom' ? 'block' : 'none';
    }

    // Show/hide correct table
    document.getElementById('job-table-container').style.display = mode === 'job_tracker' ? 'block' : 'none';
    document.getElementById('custom-table-container').style.display = mode === 'custom' ? 'block' : 'none';

    // Reload data for the new mode
    loadAndRender('all');
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

async function loadSettings() {
    const data = await chrome.storage.local.get(['openrouter_key', 'model', 'theme', 'mode', 'custom_prompt']);

    if (data.openrouter_key) {
        document.getElementById('setting-api-key').value = data.openrouter_key;
        await fetchModels(data.openrouter_key, data.model);
    }

    if (data.theme) {
        document.getElementById('setting-theme').value = data.theme;
        applyTheme(data.theme);
    }

    // Load mode
    const savedMode = data.mode || 'job_tracker';
    currentMode = savedMode;
    applyModeToUI(savedMode);

    // Load custom prompt
    if (data.custom_prompt) {
        document.getElementById('setting-custom-prompt').value = data.custom_prompt;
    }
}

async function fetchModels(apiKey, savedModel = null) {
    const select = document.getElementById('setting-model');
    select.innerHTML = '<option disabled>Fetching models...</option>';

    try {
        cachedModels = await OpenRouterAPI.listModels();
        await updateRateLimitData();
        renderModelOptions(savedModel);

        if (cachedModels.length === 0) {
            select.innerHTML = '<option disabled>No text models found</option>';
        }
    } catch (err) {
        console.error("Model fetch error:", err);
        select.innerHTML = '<option disabled>Error fetching models</option>';
    }
}

function renderModelOptions(savedModel = null) {
    const select = document.getElementById('setting-model');
    const showPaid = document.getElementById('show-paid-models').checked;
    const sortType = document.getElementById('sort-models').value;

    let displayModels = cachedModels.filter(m => showPaid || m._isFree);

    if (displayModels.length === 0 && cachedModels.length > 0) {
        select.innerHTML = '<option disabled>No models match filters</option>';
        return;
    } else if (cachedModels.length === 0) {
        return;
    }

    displayModels.sort((a, b) => {
        const aName = a.id.toLowerCase();
        const bName = b.id.toLowerCase();
        const aGemini = aName.includes('gemini');
        const bGemini = bName.includes('gemini');

        if (sortType === 'default') {
            if (aGemini && !bGemini) return -1;
            if (!aGemini && bGemini) return 1;
            if (a._isFree && !b._isFree) return -1;
            if (!a._isFree && b._isFree) return 1;
            return a._estCost - b._estCost;
        }

        if (sortType === 'price_asc') return a._estCost - b._estCost;
        if (sortType === 'price_desc') return b._estCost - a._estCost;
        if (sortType === 'name') return aName.localeCompare(bName);
        return 0;
    });

    select.innerHTML = '';
    let currentSelection = (savedModel && typeof savedModel === 'string')
        ? savedModel
        : select.value;

    displayModels.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;

        let priceLabel = "●";
        let colorStyle = "";

        if (m._isFree) {
            colorStyle = "color: #16a34a; font-weight: bold;";
        } else if (m._estCost < 0.001) {
            colorStyle = "color: #d97706; font-weight: bold;";
        } else {
            colorStyle = "color: #dc2626; font-weight: bold;";
        }

        if (m._rateLimitError) {
            colorStyle += " text-decoration: line-through; opacity: 0.6;";
            priceLabel = "❌";
        }

        opt.style.cssText = colorStyle;
        let label = `${priceLabel} ${m.name}`;
        if (!m._isFree) label += ` (~$${m._estCost.toFixed(6)})`;

        const limits = [];
        if (m._rpm) limits.push(`${m._rpm} RPM`);
        if (m._rpd) limits.push(`${m._rpd} RPD`);
        if (limits.length > 0) label += ` [${limits.join(', ')}]`;

        opt.text = label;
        select.appendChild(opt);
    });

    if (currentSelection && displayModels.find(m => m.id === currentSelection)) {
        select.value = currentSelection;
    } else if (displayModels.length > 0) {
        select.value = displayModels[0].id;
    }
}

async function saveSettings() {
    const key = document.getElementById('setting-api-key').value;
    const model = document.getElementById('setting-model').value;
    const theme = document.getElementById('setting-theme').value;
    const customPrompt = document.getElementById('setting-custom-prompt').value.trim();

    if (!key) {
        alert("Please enter an OpenRouter API Key.");
        return;
    }

    if (currentMode === 'custom' && !customPrompt) {
        alert("Please enter a custom AI prompt for Custom mode.");
        return;
    }

    await chrome.storage.local.set({
        openrouter_key: key,
        model: model,
        theme: theme,
        mode: currentMode,
        custom_prompt: customPrompt
    });

    // Show Feedback
    const status = document.getElementById('save-status');
    status.style.opacity = '1';
    setTimeout(() => { status.style.opacity = '0'; }, 2000);

    applyTheme(theme);
    applyModeToUI(currentMode);
}

function applyTheme(theme) {
    document.body.classList.remove('theme-light', 'theme-dark');
    if (theme !== 'system') {
        document.body.classList.add(`theme-${theme}`);
    }
}

// ─── DATA LOADING & RENDERING ─────────────────────────────────────────────────

async function loadAndRender(filter) {
    if (currentMode === 'job_tracker') {
        await renderJobTable(filter);
    } else {
        await renderCustomTable(filter);
    }
}

async function renderJobTable(filter) {
    const data = await chrome.storage.local.get('jobs');
    const jobs = data.jobs || [];
    const tbody = document.getElementById('dashboard-table-body');

    let filteredJobs = filter === 'all' ? jobs : jobs.filter(j => j.status === filter);

    filteredJobs.sort((a, b) => {
        if (a.status === 'Interviewing' && b.status !== 'Interviewing') return -1;
        if (a.status !== 'Interviewing' && b.status === 'Interviewing') return 1;
        return new Date(b.date) - new Date(a.date);
    });

    document.getElementById('total-count').innerText = filteredJobs.length;

    tbody.innerHTML = filteredJobs.map(job => {
        const isInterview = job.status === 'Interviewing';
        const boltIcon = isInterview ? ' <span class="interview-icon">\u26A1</span>' : '';
        const interviewInfo = job.interview_details?.is_scheduled
            ? `<br><small>\uD83D\uDCC5 ${job.interview_details.date} at ${job.interview_details.time}</small>`
            : '';

        return `
      <tr class="${isInterview ? 'row-highlight' : ''}">
        <td>${job.date}</td>
        <td>
            <strong>${job.company}</strong>
            ${boltIcon}
        </td>
        <td>
            ${job.role}
            ${interviewInfo}
        </td>
        <td><span class="status-pill status-${job.status}">${job.status}</span></td>
        <td>
            <a href="https://mail.google.com/mail/u/0/#inbox/${job.id}" target="_blank" class="view-btn">View</a>
            <button class="delete-btn delete-job-btn" data-id="${job.id}" data-type="job">Remove</button>
        </td>
      </tr>
    `;
    }).join('');
}

async function renderCustomTable(filter) {
    const data = await chrome.storage.local.get('custom_items');
    const items = data.custom_items || [];
    const tbody = document.getElementById('custom-table-body');

    let filtered = filter === 'all'
        ? items
        : filter === 'relevant'
            ? items.filter(i => i.is_relevant === true)
            : items;

    // Sort: relevant first, then by date
    filtered.sort((a, b) => {
        if (a.is_relevant && !b.is_relevant) return -1;
        if (!a.is_relevant && b.is_relevant) return 1;
        return new Date(b.date) - new Date(a.date);
    });

    document.getElementById('total-count').innerText = filtered.length;

    tbody.innerHTML = filtered.map(item => {
        const relevanceLabel = item.is_relevant ? 'Relevant' : 'Not Relevant';
        const relevanceClass = item.is_relevant ? 'status-relevant' : 'status-not-relevant';
        const subject = item.subject || '(No subject)';
        const summary = item.summary || '—';

        // Build extra fields (anything besides the known base fields)
        const knownFields = new Set(['id', 'subject', 'date', 'summary', 'is_relevant']);
        const extraEntries = Object.entries(item).filter(([k]) => !knownFields.has(k));
        const extraHtml = extraEntries.length > 0
            ? `<div style="margin-top:6px; font-size:11px; color:var(--text-secondary);">${extraEntries.map(([k, v]) => `<span><b>${k}:</b> ${v}</span>`).join(' &nbsp;|&nbsp; ')}</div>`
            : '';

        return `
      <tr>
        <td style="white-space:nowrap;">${item.date}</td>
        <td>
            <strong style="font-size:13px;">${subject}</strong>
            ${extraHtml}
        </td>
        <td>
            <div class="ai-summary-text">${summary}</div>
        </td>
        <td>
            <span class="status-pill ${relevanceClass}" style="display:inline-block; margin-bottom:6px;">${relevanceLabel}</span><br>
            <a href="https://mail.google.com/mail/u/0/#inbox/${item.id}" target="_blank" class="view-btn">View</a>
            <button class="delete-btn delete-job-btn" data-id="${item.id}" data-type="custom">Remove</button>
        </td>
      </tr>
    `;
    }).join('');
}

// ─── DELETE (shared for both modes) ──────────────────────────────────────────

document.getElementById('dashboard-table-body').addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-job-btn')) {
        const id = e.target.dataset.id;
        if (confirm("Are you sure you want to remove this item?")) {
            await deleteItem(id, 'job');
        }
    }
});

document.getElementById('custom-table-body').addEventListener('click', async (e) => {
    if (e.target.classList.contains('delete-job-btn')) {
        const id = e.target.dataset.id;
        if (confirm("Are you sure you want to remove this item?")) {
            await deleteItem(id, 'custom');
        }
    }
});

async function deleteItem(id, type) {
    if (type === 'job') {
        const data = await chrome.storage.local.get('jobs');
        const updated = (data.jobs || []).filter(j => j.id !== id);
        await chrome.storage.local.set({ jobs: updated });
    } else {
        const data = await chrome.storage.local.get('custom_items');
        const updated = (data.custom_items || []).filter(i => i.id !== id);
        await chrome.storage.local.set({ custom_items: updated });
    }
    location.reload();
}

// ─── EXPORT CSV ───────────────────────────────────────────────────────────────

document.getElementById('export-csv').addEventListener('click', async () => {
    if (currentMode === 'job_tracker') {
        const result = await chrome.storage.local.get('jobs');
        const jobs = result.jobs || [];

        if (jobs.length === 0) { alert("No data to export!"); return; }

        const headers = ["Date", "Company", "Role", "Status", "Interview Date", "Interview Time"];
        const rows = jobs.map(job => [
            job.date,
            `"${job.company}"`,
            `"${job.role}"`,
            job.status,
            job.interview_details?.date || "",
            job.interview_details?.time || ""
        ]);

        downloadCSV(headers, rows, `job_applications_${new Date().toISOString().split('T')[0]}.csv`);

    } else {
        const result = await chrome.storage.local.get('custom_items');
        const items = result.custom_items || [];

        if (items.length === 0) { alert("No data to export!"); return; }

        const headers = ["Date", "Subject", "Relevant", "Summary"];
        const rows = items.map(item => [
            item.date,
            `"${(item.subject || '').replace(/"/g, '""')}"`,
            item.is_relevant ? "Yes" : "No",
            `"${(item.summary || '').replace(/"/g, '""')}"`
        ]);

        downloadCSV(headers, rows, `custom_items_${new Date().toISOString().split('T')[0]}.csv`);
    }
});

function downloadCSV(headers, rows, filename) {
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ─── MODEL COMPARISON ─────────────────────────────────────────────────────────

function renderComparisonTable() {
    const tbody = document.getElementById('comparison-body');

    const sorted = [...cachedModels].sort((a, b) => {
        const aName = a.id.toLowerCase();
        const bName = b.id.toLowerCase();
        const aGemini = aName.includes('gemini');
        const bGemini = bName.includes('gemini');

        if (aGemini && !bGemini) return -1;
        if (!aGemini && bGemini) return 1;
        if (a._isFree && !b._isFree) return -1;
        if (!a._isFree && b._isFree) return 1;
        return aName.localeCompare(bName);
    });

    tbody.innerHTML = sorted.map(m => {
        const isFree = m._isFree;
        const rateError = m._rateLimitError
            ? `<span style="color: red; font-size: 11px;">Exceeded at ${new Date(m._rateLimitError).toLocaleTimeString()}</span>`
            : `<span style="color: green;">OK</span>`;

        const pPrompt = m.pricing ? parseFloat(m.pricing.prompt) * 1000000 : 0;
        const pComp = m.pricing ? parseFloat(m.pricing.completion) * 1000000 : 0;
        const costStr = isFree ? "Free" : `$${pPrompt.toFixed(2)} / $${pComp.toFixed(2)} (per 1M)`;
        const estStr = isFree ? "Free" : `$${m._estCost.toFixed(6)}`;

        return `
            <tr>
                <td>
                    <strong>${m.name}</strong><br>
                    <small style="color: var(--text-secondary);">${m.id}</small>
                </td>
                <td>${costStr}</td>
                <td>${estStr}</td>
                <td>
                    RPM: ${m._rpm || '-'}<br>
                    RPD: ${m._rpd || '-'}
                </td>
                <td>${rateError}</td>
            </tr>
        `;
    }).join('');
}

// ─── STATS ────────────────────────────────────────────────────────────────────

async function renderStats() {
    const data = await chrome.storage.local.get("stats");
    const stats = data.stats || { ai_daily: {}, emails_daily: {} };
    const today = new Date().toISOString().split('T')[0];

    // 1. AI Calls Today
    const todayUsage = stats.ai_daily[today] || {};
    const todayContainer = document.getElementById('stats-ai-today');

    if (Object.keys(todayUsage).length === 0) {
        todayContainer.innerHTML = '<p style="color: var(--text-secondary);">No calls made today.</p>';
    } else {
        let html = '<ul style="list-style: none; padding: 0;">';
        for (const [model, count] of Object.entries(todayUsage)) {
            html += `<li style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border-color);">
                <span>${model}</span>
                <strong>${count}</strong>
             </li>`;
        }
        html += '</ul>';
        todayContainer.innerHTML = html;
    }

    // 2. Email Processing (Last 7 Days)
    const emailChart = document.getElementById('stats-email-chart');
    const dates = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }

    let chartHtml = '<div style="display: flex; align-items: flex-end; height: 150px; gap: 10px; padding-top: 20px;">';
    const maxVal = Math.max(...dates.map(d => stats.emails_daily[d] || 0), 10);

    dates.forEach(date => {
        const val = stats.emails_daily[date] || 0;
        const height = Math.max((val / maxVal) * 100, 2);
        const dayLabel = new Date(date).toLocaleDateString(undefined, { weekday: 'short' });

        chartHtml += `
            <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px;">
                <div style="font-size: 11px; font-weight: bold; color: var(--primary);">${val > 0 ? val : ''}</div>
                <div style="width: 100%; background: var(--status-applied-bg); height: ${height}%; border-radius: 4px 4px 0 0; min-height: 4px;"></div>
                <div style="font-size: 10px; color: var(--text-secondary);">${dayLabel}</div>
            </div>
        `;
    });
    chartHtml += '</div>';
    emailChart.innerHTML = chartHtml;

    // 3. Last 30 Days AI Usage
    const monthBody = document.getElementById('stats-ai-month-body');
    const monthUsage = {};

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const minDateStr = thirtyDaysAgo.toISOString().split('T')[0];

    Object.keys(stats.ai_daily).forEach(date => {
        if (date >= minDateStr) {
            Object.entries(stats.ai_daily[date]).forEach(([model, count]) => {
                monthUsage[model] = (monthUsage[model] || 0) + count;
            });
        }
    });

    if (Object.keys(monthUsage).length === 0) {
        monthBody.innerHTML = '<tr><td colspan="2" style="text-align: center; color: var(--text-secondary);">No data in last 30 days.</td></tr>';
    } else {
        monthBody.innerHTML = Object.entries(monthUsage)
            .sort((a, b) => b[1] - a[1])
            .map(([model, count]) => `
                <tr>
                    <td>${model}</td>
                    <td>${count}</td>
                </tr>
            `).join('');
    }
}