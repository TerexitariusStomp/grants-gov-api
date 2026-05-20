import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';

// --- Data ---
let villages = [];
let embeddings = {};

// --- Model singleton ---
let embedderPromise = null;
function getEmbedder() {
  if (!embedderPromise) {
    embedderPromise = pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  return embedderPromise;
}

// --- Math ---
function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

// --- Filters ---
function getFilters() {
  return {
    continent: document.getElementById('filter-continent').value,
    cost: document.getElementById('filter-cost').value,
    climate: document.getElementById('filter-climate').value,
    familyFriendly: document.getElementById('filter-family').checked,
    visaFriendly: document.getElementById('filter-visa').checked,
    consensus: document.getElementById('filter-consensus').checked,
  };
}

function passesFilters(v, f) {
  if (f.continent && v.continent !== f.continent) return false;
  if (f.cost) {
    const costMap = { free: 'free', low: 'low', medium: 'medium', high: 'high' };
    if (v.cost_level !== costMap[f.cost]) return false;
  }
  if (f.climate && !v.climate.some(c => c.includes(f.climate))) return false;
  if (f.familyFriendly && !v.family_friendly) return false;
  if (f.visaFriendly && !v.visa_friendly) return false;
  if (f.consensus && !v.governance.includes('consensus')) return false;
  return true;
}

// --- Boosts ---
function boostScore(v, f) {
  let boost = 0;
  if (f.consensus && v.governance.includes('consensus')) boost += 0.03;
  if (f.familyFriendly && v.family_friendly) boost += 0.02;
  if (f.visaFriendly && v.visa_friendly) boost += 0.02;
  return boost;
}

// --- Match reason generation ---
function buildMatchReason(village, filters) {
  const reasons = [];
  if (village.governance.includes('consensus') && filters.consensus) {
    reasons.push('consensus governance');
  }
  if (village.family_friendly && filters.familyFriendly) {
    reasons.push('family-friendly');
  }
  if (village.visa_friendly && filters.visaFriendly) {
    reasons.push('visa-friendly');
  }
  // Pick top 3 focus areas
  reasons.push(...village.focus.slice(0, 3));
  if (reasons.length === 0) return '';
  return 'Matched on ' + reasons.slice(0, 4).join(', ') + '.';
}

// --- Determine which tags matched query keywords ---
function getMatchedTags(village, query) {
  const qWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  const allText = [
    ...village.focus,
    ...village.governance,
    ...village.climate,
    village.cost_level,
    village.description,
  ].join(' ').toLowerCase();
  const matched = [];
  for (const tag of [...village.focus, ...village.governance, ...village.climate]) {
    if (qWords.some(w => tag.toLowerCase().includes(w)) || allText.includes(tag.toLowerCase())) {
      if (qWords.some(w => tag.toLowerCase().includes(w) || w.includes(tag.toLowerCase().split(' ')[0]))) {
        matched.push(tag);
      }
    }
  }
  return matched;
}

// --- Search ---
async function rankVillages(query, filters) {
  const embedder = await getEmbedder();
  const output = await embedder(query, { pooling: 'mean', normalize: true });
  const queryVector = Array.from(output.data);

  return villages
    .filter(v => passesFilters(v, filters))
    .map(v => {
      const vec = embeddings[v.id];
      const semantic = vec ? cosineSimilarity(queryVector, vec) : 0;
      const score = semantic + boostScore(v, filters);
      const matchedTags = getMatchedTags(v, query);
      const reason = buildMatchReason(v, filters);
      return { ...v, semantic, score, matchedTags, reason };
    })
    .sort((a, b) => b.score - a.score);
}

// --- Render ---
function renderResults(results, query) {
  const container = document.getElementById('results');
  const countEl = document.getElementById('result-count');

  if (results.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="emoji">&#128533;</div>
        <p>No ecovillages match your criteria. Try adjusting filters or broadening your query.</p>
      </div>`;
    countEl.textContent = '';
    return;
  }

  countEl.textContent = `${results.length} result${results.length !== 1 ? 's' : ''}`;

  container.innerHTML = results.map(v => {
    const scorePct = (v.score * 100).toFixed(0);
    const allTags = [...v.focus, ...v.governance, ...v.climate];
    const tagsHtml = allTags.map(t => {
      const isMatched = v.matchedTags && v.matchedTags.includes(t);
      return `<span class="tag${isMatched ? ' matched' : ''}">${t}</span>`;
    }).join('');

    return `
      <div class="village-card">
        <div class="card-header">
          <div>
            <h2>${v.name}</h2>
            <span class="location">${v.region}, ${v.country} &middot; ${v.continent} &middot; Pop ${v.population} &middot; Since ${v.founded}</span>
          </div>
          <span class="score-badge">${scorePct}%</span>
        </div>
        <div class="card-body">
          <p>${v.description}</p>
          <div class="tags">${tagsHtml}</div>
          ${v.reason ? `<div class="match-reason">${v.reason}</div>` : ''}
        </div>
      </div>`;
  }).join('');
}

function renderLoading() {
  document.getElementById('results').innerHTML = `
    <div class="loading-spinner">
      <div class="spinner"></div>
      <p style="margin-top:1rem">Embedding your query...</p>
    </div>`;
}

// --- Debounce ---
let searchTimeout = null;
function debouncedSearch() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(doSearch, 400);
}

async function doSearch() {
  const query = document.getElementById('query').value.trim();
  if (!query) {
    document.getElementById('results').innerHTML = `
      <div class="empty-state">
        <div class="emoji">&#127793;</div>
        <p>Type a natural-language description above to find matching ecovillages</p>
      </div>`;
    document.getElementById('result-count').textContent = '';
    return;
  }

  renderLoading();
  const filters = getFilters();
  try {
    const results = await rankVillages(query, filters);
    renderResults(results, query);
  } catch (err) {
    document.getElementById('results').innerHTML = `
      <div class="empty-state">
        <div class="emoji">&#9888;&#65039;</div>
        <p>Search error: ${err.message}</p>
      </div>`;
  }
}

// --- Init ---
async function init() {
  // Load data
  try {
    villages = await fetch('./data/villages.json').then(r => r.json());
    embeddings = await fetch('./data/embeddings.json').then(r => r.json());
  } catch (e) {
    console.error('Failed to load data:', e);
    document.getElementById('model-status-text').textContent = 'Failed to load village data';
    return;
  }

  // Preload model
  const dot = document.getElementById('model-dot');
  const statusText = document.getElementById('model-status-text');
  try {
    await getEmbedder();
    dot.classList.add('ready');
    statusText.textContent = 'Model ready (all-MiniLM-L6-v2)';
  } catch (e) {
    statusText.textContent = 'Model load failed: ' + e.message;
  }

  // Wire events
  document.getElementById('query').addEventListener('input', debouncedSearch);
  ['filter-continent', 'filter-cost', 'filter-climate'].forEach(id => {
    document.getElementById(id).addEventListener('change', doSearch);
  });
  ['filter-family', 'filter-visa', 'filter-consensus'].forEach(id => {
    document.getElementById(id).addEventListener('change', doSearch);
  });
}

init();
