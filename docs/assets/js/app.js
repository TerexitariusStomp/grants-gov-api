const STORAGE_KEY = 'grants_gov_local_config_v1';
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
  el.style.color = isError ? '#b00020' : '#2d6a4f';
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
  const cfg = loadConfig();
  if (!cfg.grantsApiKey) {
    throw new Error('Missing simple.grants.gov API key. Save it first.');
  }

  const payload = {
    query: keyword || '',
    filters: {
      opportunity_status: { one_of: ['posted', 'forecasted'] }
    },
    pagination: {
      page_offset: 1,
      page_size: 10,
      sort_order: [{ order_by: 'relevancy', sort_direction: 'descending' }]
    }
  };

  if (agency) {
    payload.filters.agency = { one_of: [agency] };
  }

  const resp = await fetch('https://api.simpler.grants.gov/v1/opportunities/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': cfg.grantsApiKey
    },
    body: JSON.stringify(payload)
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API error ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.data || [];
}

async function generateAiSummary(opportunity) {
  const cfg = loadConfig();
  if (!cfg.aiBaseUrl || !cfg.aiModel) {
    throw new Error('Missing AI base URL or model. Save connection first.');
  }

  const prompt = `Write a concise first-draft grant concept note (max 250 words) for this opportunity. Include: objective, target beneficiaries, 3 key activities, and expected outcomes.\n\nOpportunity title: ${opportunity.opportunity_title || opportunity.title || ''}\nAgency: ${opportunity.agency_name || opportunity.agency || ''}\nOpportunity number: ${opportunity.opportunity_number || ''}`;

  const headers = { 'Content-Type': 'application/json' };
  if (cfg.aiApiKey) headers.Authorization = `Bearer ${cfg.aiApiKey}`;

  const base = cfg.aiBaseUrl.replace(/\/$/, '');
  const resp = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: cfg.aiModel,
      messages: [
        { role: 'system', content: 'You are an expert grant writing assistant.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3
    })
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`AI error ${resp.status}: ${body.slice(0, 300)}`);
  }

  const data = await resp.json();
  return data?.choices?.[0]?.message?.content || 'No content returned.';
}

function initSettingsForm() {
  const cfg = loadConfig();
  document.getElementById('grantsApiKey').value = cfg.grantsApiKey || '';
  document.getElementById('aiBaseUrl').value = cfg.aiBaseUrl || 'http://localhost:8081/v1';
  document.getElementById('aiModel').value = cfg.aiModel || 'gemma-3-12b-it';
  document.getElementById('aiApiKey').value = cfg.aiApiKey || '';

  document.getElementById('settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const nextCfg = {
      grantsApiKey: document.getElementById('grantsApiKey').value.trim(),
      aiBaseUrl: document.getElementById('aiBaseUrl').value.trim(),
      aiModel: document.getElementById('aiModel').value.trim(),
      aiApiKey: document.getElementById('aiApiKey').value.trim()
    };
    saveConfig(nextCfg);
    setStatus('Connection settings saved.');
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
