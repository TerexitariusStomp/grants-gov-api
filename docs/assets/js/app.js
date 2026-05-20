const STORAGE_KEY = 'grants_gov_local_config_v2';
let lastResults = [];

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

function setStatus(msg, isError = false) {
  const el = document.getElementById('status');
  el.textContent = msg;
  el.style.color = isError ? '#ff7b7b' : '#73d13d';
}

function getBackendBaseUrl() {
  const cfg = loadConfig();
  return (cfg.backendBaseUrl || '').replace(/\/$/, '');
}

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderResults(items) {
  const resultsEl = document.getElementById('results');
  if (!items.length) {
    resultsEl.innerHTML = '<li>No opportunities found.</li>';
    return;
  }

  resultsEl.innerHTML = items.map((item) => {
    const title = escapeHtml(item.opportunity_title || item.title || 'Untitled');
    const agency = escapeHtml(item.agency_name || item.agency || 'Unknown agency');
    const oppNum = escapeHtml(item.opportunity_number || 'N/A');
    const status = escapeHtml(item.opportunity_status || item.status || 'N/A');
    return `<li><strong>${title}</strong><br/>Agency: ${agency}<br/>Opportunity #: ${oppNum}<br/>Status: ${status}</li>`;
  }).join('');
}

async function searchOpportunities(keyword, agency) {
  const base = getBackendBaseUrl();
  if (!base) {
    throw new Error('Missing backend URL. Save it first.');
  }

  const url = new URL(`${base}/api/v1/opportunities/`);
  if (keyword) url.searchParams.set('query', keyword);
  if (agency) url.searchParams.set('agency', agency);
  url.searchParams.set('limit', '10');
  url.searchParams.set('page', '1');

  const resp = await fetch(url.toString());
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Backend error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.results || [];
}

async function generateAiSummary(opportunity) {
  const base = getBackendBaseUrl();
  if (!base) {
    throw new Error('Missing backend URL. Save it first.');
  }

  const resp = await fetch(`${base}/api/v1/ai-summary`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ opportunity })
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`AI proxy error ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  return data.summary || 'No content returned.';
}

function initSettingsForm() {
  const cfg = loadConfig();
  document.getElementById('backendBaseUrl').value = cfg.backendBaseUrl || '';

  document.getElementById('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const nextCfg = {
      backendBaseUrl: document.getElementById('backendBaseUrl').value.trim()
    };
    saveConfig(nextCfg);
    setStatus('Backend URL saved.');
  });
}

function initSearchForm() {
  document.getElementById('searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const keyword = document.getElementById('keyword').value.trim();
    const agency = document.getElementById('agency').value.trim();

    setStatus('Searching opportunities...');
    try {
      const results = await searchOpportunities(keyword, agency);
      lastResults = results;
      renderResults(results);
      setStatus(`Loaded ${results.length} opportunities.`);
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

function initAiButton() {
  document.getElementById('aiDraftBtn').addEventListener('click', async () => {
    const output = document.getElementById('aiOutput');
    output.textContent = '';

    if (!lastResults.length) {
      setStatus('Run a search first so AI has an opportunity to summarize.', true);
      return;
    }

    setStatus('Generating AI summary...');
    try {
      const text = await generateAiSummary(lastResults[0]);
      output.textContent = text;
      setStatus('AI summary generated.');
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

initSettingsForm();
initSearchForm();
initAiButton();
