/**
 * ai-sorter.js — WebLLM helpers for Grants.gov AI autofill & sort.
 * Loaded as <script type="module"> from index.html.
 * All functions exposed via window.WebLLMHelper so script.js (classic script)
 * can call them without ESM import issues.
 */

import { CreateMLCEngine } from "https://esm.run/@mlc-ai/web-llm";

// ---------------------------------------------------------------------------
// WebLLM engine singleton
// ---------------------------------------------------------------------------
let _engine = null;
let _loading = false;
let _ready = false;
let _selectedModel = "Phi-3.5-mini-instruct-q4f16_1-MLC";
let _progressCallback = null;

// ---------------------------------------------------------------------------
// Progress bar DOM helpers (self-contained so it works regardless of script load order)
// ---------------------------------------------------------------------------
function _getEl(id) { return document.getElementById(id); }

function _showProgress() {
    var bar = _getEl('webllm-progress-bar');
    if (bar) bar.classList.add('active');
}

function _hideProgress() {
    var bar = _getEl('webllm-progress-bar');
    if (bar) bar.classList.remove('active');
}

function _updateProgress(pct, status, detail) {
    var fill = _getEl('webllm-progress-fill');
    var pctEl = _getEl('webllm-progress-pct');
    var statusEl = _getEl('webllm-status-text');
    var detailEl = _getEl('webllm-status-detail');
    if (fill) fill.style.width = Math.round(pct) + '%';
    if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    if (statusEl) statusEl.textContent = status || 'Loading AI model...';
    if (detailEl) detailEl.textContent = detail || '';
    _showProgress();
}

// ---------------------------------------------------------------------------
// Exposed API
// ---------------------------------------------------------------------------
window.WebLLMHelper = Object.freeze({
    isReady()      { return _ready; },
    isReadyStateReady() { return _ready; },
    isEngineReady() { return _ready; },
    isLoading()    { return _loading; },
    onProgress(fn) { _progressCallback = fn; },

    async init(model) {
        if (_engine) return _engine;
        if (_loading) {
            await new Promise(r => setTimeout(r, 500));
            if (_engine) return _engine;
        }
        _loading = true;
        _selectedModel = model || _selectedModel;

        _updateProgress(0, 'Starting download...', 'Model: ' + _selectedModel);

        try {
            _engine = await CreateMLCEngine(_selectedModel, {
                initProgressCallback: (report) => {
                    var pct = 0;
                    var status = report.status || report.text || 'Loading...';
                    var detail = '';

                    if (typeof report.progress === 'number') {
                        pct = report.progress * 100;
                    } else if (typeof report.percent === 'number') {
                        pct = report.percent;
                    }

                    if (report.download) detail = 'Downloading: ' + report.download;
                    if (report.file && !detail) detail = report.file;
                    if (report.weights) detail = 'Loading weights...';

                    _updateProgress(pct, status, detail);

                    if (_progressCallback) _progressCallback(report);
                },
            });
        } catch (err) {
            _loading = false;
            _updateProgress(0, 'Error loading AI model', err.message);
            throw err;
        }

        _loading = false;
        _ready = true;
        _updateProgress(100, 'AI model ready!', 'Click "Autofill with AI" to generate');
        console.log('[WebLLM] Engine ready:', _selectedModel);

        setTimeout(function() { _hideProgress(); }, 2000);
        return _engine;
    },

    async initWebLLM(model) {
        return this.init(model);
    },

    async aiSortGrants(opportunities, userProfile) {
        await this.init();

        var prompt = 'You are an expert federal grant matching assistant.\n' +
            'User profile: ' + (userProfile || 'No specific profile provided') + '\n\n' +
            'Here are grant opportunities (JSON array):\n' +
            JSON.stringify(opportunities.slice(0, 40), null, 2) + '\n\n' +
            'TASK: Rank them by relevance to the user profile.\n' +
            'Return ONLY a valid JSON array. Format for each entry:\n' +
            '{"opportunity_number": "NNN-123", "score": 92, "reason": "one-line"}\n' +
            'Be concise. Return exactly the same items, just in sorted order.';

        var reply = await _engine.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_gen_len: 2048,
        });

        var content = reply.choices[0]?.message?.content ?? '[]';
        try {
            return JSON.parse(content);
        } catch (e) {
            var match = content.match(/\[[\s\S]*\]/);
            if (match) return JSON.parse(match[0]);
            return [];
        }
    },

    async aiAutofillApplication(opportunity, profile) {
        await this.init();

        var profileText = '';
        if (profile) {
            var fields = ['organization_name', 'organization_type', 'organization_mission',
                'project_description', 'target_budget', 'project_duration',
                'target_population', 'key_partnerships', 'expertise_areas', 'past_projects'];
            fields.forEach(function(f) {
                if (profile[f]) profileText += f + ': ' + profile[f] + '\n';
            });
        }

        var oppText = 'Title: ' + (opportunity.title || '') + '\n' +
            'Agency: ' + (opportunity.agency || '') + '\n' +
            'Description: ' + ((opportunity.description || '').substring(0, 2000)) + '\n' +
            'Award Ceiling: ' + (opportunity.award_ceiling || 'N/A') + '\n' +
            'Close Date: ' + (opportunity.close_date || 'N/A');

        var prompt = 'You are an expert federal grant writer. Generate a complete grant application draft.\n\n' +
            'OPPORTUNITY:\n' + oppText + '\n\n' +
            'APPLICANT PROFILE:\n' + (profileText || 'No specific profile provided') + '\n\n' +
            'Generate a JSON object with these keys (all values as strings):\n' +
            'project_summary, narrative, goals, timeline, evaluation, sustainability, budget_breakdown, additional_info\n' +
            'Each value should be 2-4 sentences of realistic, specific content.\n' +
            'Return ONLY valid JSON, no other text.';

        var reply = await _engine.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            temperature: 0.7,
            max_gen_len: 3000,
        });

        var content = reply.choices[0]?.message?.content ?? '{}';
        try {
            return { status: 'success', fields: JSON.parse(content) };
        } catch (e) {
            var match = content.match(/\{[\s\S]*\}/);
            if (match) return { status: 'success', fields: JSON.parse(match[0]) };
            return { status: 'error', error: 'Could not parse AI response' };
        }
    },
});

// Auto-start loading WebLLM in the background
window.WebLLMHelper.init();
