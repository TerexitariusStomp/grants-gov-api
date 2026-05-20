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
let _ready = false;           // isReady() mirror
let _selectedModel = "Phi-3.5-mini-instruct-q4f16_1-MLC";
let _progressCallback = null;

window.WebLLMHelper = Object.freeze({
    // State helpers ----------------------------------------------------------
    isReady()      { return _ready; },
    isReadyStateReady() { return _ready; },   // alias — some callers use this name
    isEngineReady() { return _ready; },
    isLoading()    { return _loading; },

    // Init -------------------------------------------------------------------
    async init(model) {
        if (_engine) return _engine;
        if (_loading) {
            // Wait for in-progress load (busy-wait a tiny bit)
            await new Promise(r => setTimeout(r, 500));
            if (_engine) return _engine;
        }
        _loading = true;
        _selectedModel = model || _selectedModel;

        _engine = await CreateMLCEngine(_selectedModel, {
            initProgressCallback: (report) => {
                if (_progressCallback) _progressCallback(report);
            },
        });

        _loading = false;
        _ready = true;
        console.log("[WebLLM] Engine ready:", _selectedModel);
        return _engine;
    },

    // On-progress helper (stores the callback; set before initWebLLM)
    onProgress(fn) { _progressCallback = fn; },

    // Shortcut: call init on a lazy warm-up
    async initWebLLM(model) {
        return this.init(model);
    },

    // AI sort — ranks opportunity results by relevance to user profile --------
    async aiSortGrants(opportunities, userProfile) {
        await this.init();   // lazy-load

        const prompt = `You are an expert federal grant matching assistant.
User profile: ${userProfile ?? "No specific profile provided"}

Here are grant opportunities (JSON array):
${JSON.stringify(opportunities.slice(0, 40), null, 2)}

TASK: Rank them by relevance to the user profile.
Return ONLY a valid JSON array. Format for each entry:
{"opportunity_number": "NNN-123", "score": 92, "reason": "one-line"}
Be concise. Return exactly the same items, just in sorted order.`;

        const reply = await _engine.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
            max_gen_len: 2048,
        });

        const content = reply.choices[0]?.message?.content ?? "[]";
        try {
            // Try direct parse first
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) return parsed;
        } catch (_) {
            // Extract the JSON array from a raw LLM reply that wraps it in prose
            const match = content.match(/\[[\s\S]*\]/);
            if (match) {
                try { return JSON.parse(match[0]); } catch (_2) {}
            }
        }
        console.warn("[WebLLM] Could not parse sort response, returning original order");
        return opportunities.map(o => ({ opportunity_number: o.opportunity_number, score: null, reason: "Not scored" }));
    },

    // AI autofill application — generates all form fields from profile --------
    async aiAutofillApplication(opportunity, profile) {
        await this.init();   // lazy-load

        const prompt = `You are an expert federal grant writer who COMPLETELY fills in the grant application on behalf of the applicant.

USER PROFILE (the applicant):
${JSON.stringify(profile ?? {}, null, 2)}

GRANT OPPORTUNITY:
Title: ${opportunity?.title ?? "N/A"}
Opportunity Number: ${opportunity?.opportunity_number ?? "N/A"}
Agency: ${opportunity?.agency ?? "N/A"}
Description: ${typeof opportunity?.description === "string" ? opportunity.description.slice(0, 4000) : JSON.stringify(opportunity?.description ?? {})}
Award Ceiling: ${opportunity?.award_ceiling ?? "Not specified"}
Category: ${opportunity?.category ?? "N/A"}

TASK: Generate a COMPLETE, polished grant application response that directly addresses this specific opportunity and user.
Each section must be a full, substantive paragraph (150-600 words), NOT a template or placeholder.

Return ONLY a valid JSON object with these keys:
{
  "project_summary": "...",
  "project_narrative": "...",
  "goals": "...",
  "timeline": "...",
  "evaluation": "...",
  "sustainability": "...",
  "budget_breakdown": "...",
  "additional_info": "..."
}

RULES:
- Every field must be filled with specific, original prose tailored to this opportunity.
- Use numbers, timelines, and actual budget amounts.
- Reference the agency and opportunity by name.
- Do NOT include JSON formatting tips or explanations — JUST the JSON.`;

        const reply = await _engine.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            temperature: 0.3,
            max_gen_len: 4096,
        });

        const content = reply.choices[0]?.message?.content ?? "{}";

        // Extract JSON from possibly-prose-wrapped reply
        const jsonContent = (() => {
            const trimmed = content.trim();
            if (trimmed.startsWith("{")) return trimmed;
            const match = trimmed.match(/\{[\s\S]*\}/);
            return match ? match[0] : trimmed;
        })();

        try {
            const fields = JSON.parse(jsonContent);
            return { status: "success", fields };
        } catch (e) {
            console.error("[WebLLM] Failed to parse autofill response:", jsonContent?.slice(0, 300));
            return { status: "error", error: `Failed to parse AI response: ${e?.message ?? e}` };
        }
    },

    // Scrape a website → extract structured org info via WebLLM ---------------
    async scrapeWebsite(url, scrapedText) {
        await this.init();   // lazy-load

        const prompt = `You are an expert data analyst who extracts structured information from website text.

WEBSITE URL: ${url}

WEBSITE CONTENT:
${scrapedText}

Analyze the website content and extract structured organization information.
Return ONLY valid JSON with these fields. Leave fields empty string "" if not found.

{
  "organization_name": "Full legal name of the organization",
  "organization_type": "One of: Non-Profit 501(c)(3), Tribal Government, Local Government, State Government, University/College, Small Business, Other",
  "organization_mission": "Their mission statement and what they do (2-4 sentences)",
  "expertise": "Their areas of expertise and specialization (2-4 sentences)",
  "past_projects": "Notable projects, accomplishments, or programs they've completed (2-4 sentences)",
  "contact_name": "Name of a key contact person if listed, or general contact title",
  "title": "Contact person's title",
  "email": "Contact email address",
  "phone": "Contact phone number",
  "address": "Full mailing address",
  "website": "The URL that was scraped",
  "project_description": "A description of their main project or program focus that would be useful for grant applications (3-5 sentences)",
  "target_population": "Who they serve — communities, demographics, geographic areas (1-3 sentences)",
  "partnerships": "Key partners, collaborators, funders, or stakeholders mentioned (1-3 sentences)"
}`;

        const reply = await _engine.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            temperature: 0.1,
            max_gen_len: 2048,
        });

        const content = reply.choices[0]?.message?.content ?? "{}";

        // Extract JSON from possibly-prose-wrapped reply
        const jsonContent = (() => {
            const trimmed = content.trim();
            if (trimmed.startsWith("{")) return trimmed;
            // Strip markdown code fences
            const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (fence) return fence[1].trim();
            const match = trimmed.match(/\{[\s\S]*\}/);
            return match ? match[0] : trimmed;
        })();

        try {
            const fields = JSON.parse(jsonContent);
            return { status: "success", fields };
        } catch (e) {
            console.error("[WebLLM] scrapeWebsite parse failed:", jsonContent?.slice(0, 300));
            return { status: "error", error: `AI extraction failed: ${e?.message ?? e}` };
        }
    },

    // Expose engine for advanced use
    getEngine() { return _engine; },
    getSelectedModel() { return _selectedModel; },
});
