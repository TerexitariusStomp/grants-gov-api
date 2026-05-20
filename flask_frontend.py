"""Grants.gov live API using Simpler.Grants.gov with full descriptions."""
import os
import sys
import time
import json
import re
import requests as _http
from flask import Flask, request, jsonify, send_from_directory
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env'))

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'frontend')

app = Flask(__name__, static_folder=STATIC_DIR)

@app.after_request
def _add_cors_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = ALLOWED_ORIGIN
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
    return resp

# ---------------------------------------------------------------------------
# Frontend static files
# ---------------------------------------------------------------------------

PROFILE_DB = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'profiles')


@app.route('/')
def index():
    return send_from_directory(STATIC_DIR, 'index.html')


@app.route('/profile')
def profile_page():
    return send_from_directory(STATIC_DIR, 'profile.html')


@app.route('/ecovillage-matcher/')
def ecovillage_index():
    return send_from_directory(STATIC_DIR, 'ecovillage-matcher/index.html')


@app.route('/<path:path>')
def frontend_files(path):
    return send_from_directory(STATIC_DIR, path)

# ---------------------------------------------------------------------------
# Simpler.Grants.gov API wrapper
# Base: https://api.simpler.grants.gov/v1
# Search: POST /opportunities/search  (requires X-API-Key)
# Detail: GET  /opportunities/<id>    (requires X-API-Key)
# ---------------------------------------------------------------------------

API_BASE = "https://api.simpler.grants.gov/v1"
API_KEY = os.environ.get("SIMPLER_GRANTS_API_KEY", "")
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "https://terexitariusstomp.github.io")
AI_BASE_URL = os.environ.get("AI_BASE_URL", "http://localhost:8081/v1")
AI_MODEL = os.environ.get("AI_MODEL", "gemma-3-12b-it")
AI_API_KEY = os.environ.get("AI_API_KEY", "")

def _api_headers() -> dict:
    """Build request headers -- include X-API-Key only when configured."""
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["X-API-Key"] = API_KEY
    return headers

# Map friendly names to Simpler.Grants.gov values
FUNDING_CATEGORIES = {
    "health": "Health",
    "education": "Education",
    "agriculture": "Agriculture",
    "energy": "Energy",
    "environment": "Environment",
    "housing": "Housing",
    "arts": "Arts",
    "business": "Business and Commerce",
    "community": "Community Development",
    "food": "Food and Nutrition",
    "income": "Income Security and Social Services",
    "infrastructure": "Infrastructure and Economic Development",
    "law": "Law, Justice, and Legal Services",
    "science": "Science and Technology",
}

STATUS_MAP = {
    "forecasted": "forecasted",
    "posted": "posted",
    "closed": "closed",
    "archived": "archived",
}


def _search(query="", category="", agency="", limit=50, offset=1, statuses=None):
    """Search opportunities via Simpler.Grants.gov API."""
    if statuses is None:
        statuses = ["posted", "forecasted"]

    import time as _time

    if not hasattr(_search, '_cache'):
        _search._cache = {}
    cache_key = (query, category, agency, limit, offset, str(statuses))
    cached = _search._cache.get(cache_key)
    if cached and (_time.time() - cached[0]) < 300:
        return cached[1], cached[2]

    payload = {
        "filters": {
            "opportunity_status": {"one_of": statuses}
        },
        "pagination": {
            "page_offset": int(offset),
            "page_size": int(limit),
            "sort_order": [{"order_by": "relevancy", "sort_direction": "descending"}],
        },
    }

    if query:
        payload["query"] = query
    if agency:
        payload["filters"]["agency"] = {"one_of": [agency]}
    if category:
        mapped = FUNDING_CATEGORIES.get(category.lower(), category)
        payload["filters"]["funding_category"] = {"one_of": [mapped]}

    resp = _http.post(
        f"{API_BASE}/opportunities/search",
        headers=_api_headers(),
        json=payload,
        timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()

    results = data.get("data", [])
    total_info = data.get("pagination_info", {})
    total_rows = total_info.get("total_records", len(results))

    normalized = []
    for r in results:
        summary_raw = r.get("summary", "")
        # Extract description from summary
        desc = ""
        if isinstance(summary_raw, dict):
            desc = summary_raw.get("summary_description", "") or summary_raw.get("description", "")
            if desc:
                import re as _re
                desc = _re.sub(r'<[^>]+>', ' ', desc)
                desc = _re.sub(r'\s+', ' ', desc).strip()
        if not desc:
            desc = "No description available."

        close_date = ""
        award_ceiling = "Not specified"
        if isinstance(summary_raw, dict):
            close_date = summary_raw.get("close_date", "") or ""
            award_ceiling_val = summary_raw.get("award_ceiling")
            if award_ceiling_val:
                award_ceiling = f"${award_ceiling_val:,.0f}" if isinstance(award_ceiling_val, (int, float)) else str(award_ceiling_val)

        normalized.append({
            "id": str(r.get("opportunity_id", "")),
            "opportunity_id": str(r.get("opportunity_id", "")),
            "opportunity_number": r.get("opportunity_number", ""),
            "title": r.get("opportunity_title", ""),
            "agency": r.get("agency_name", r.get("agency", "")),
            "description": desc,
            "award_ceiling": award_ceiling,
            "close_date": close_date,
            "category": ", ".join(
                a.get("program_title", "")
                for a in r.get("opportunity_assistance_listings", [])
            ),
            "funding_opportunity_number": r.get("opportunity_number", ""),
            "status": r.get("opportunity_status", ""),
            "url": f"https://simpler.grants.gov/opportunity/{r.get('opportunity_number', '')}",
            "source": "simpler-grants-api",
        })

    _search._cache[cache_key] = (_time.time(), total_rows, normalized)
    return total_rows, normalized


def _get_detail(opportunity_id):
    """Get full opportunity details via Simpler.Grants.gov API."""

    # Try direct detail endpoint if it looks like a UUID
    if isinstance(opportunity_id, str) and len(opportunity_id) > 30:
        resp = _http.get(
            f"{API_BASE}/opportunities/{opportunity_id}",
            headers=_api_headers(),
            timeout=30,
        )
        if resp.ok:
            return _normalize_detail(resp.json().get("data", {}))

    # Search by querying the opportunity_number, then get detail
    try:
        search_payload = {
            "query": opportunity_id,
            "pagination": {
                "page_offset": 1,
                "page_size": 10,
                "sort_order": [{"order_by": "relevancy", "sort_direction": "descending"}],
            },
        }
        resp = _http.post(
            f"{API_BASE}/opportunities/search",
            headers=_api_headers(),
            json=search_payload,
            timeout=15,
        )
        print(f"[detail] search for {opportunity_id}: status={resp.status_code}")
        if resp.ok:
            search_data = resp.json()
            sr = search_data.get("data", [])
            print(f"[detail] search returned {len(sr)} results")
            # Find exact match
            for r in sr:
                if r.get("opportunity_number") == opportunity_id:
                    opp_id = r.get("opportunity_id", "")
                    print(f"[detail] exact match opp_id={opp_id}")
                    if opp_id:
                        resp2 = _http.get(
                            f"{API_BASE}/opportunities/{opp_id}",
                            headers=_api_headers(),
                            timeout=30,
                        )
                        print(f"[detail] detail endpoint status={resp2.status_code}")
                        if resp2.ok:
                            return _normalize_detail(resp2.json().get("data", {}))
                    # Fallback: return what search has
                    return _normalize_detail(r)
    except Exception as e:
        print(f"[detail] Lookup failed: {e}")
        import traceback; traceback.print_exc()

    return None


def _normalize_detail(r):
    """Normalize a raw opportunity record into our standard format."""
    if not r:
        return None
    summary_raw = r.get("summary", {})
    desc = ""
    if isinstance(summary_raw, dict):
        desc = summary_raw.get("summary_description", "") or summary_raw.get("description", "")
        if desc:
            desc = re.sub(r'<[^>]+>', ' ', desc)
            desc = re.sub(r'\s+', ' ', desc).strip()
    elif summary_raw:
        desc = str(summary_raw)

    close_date = ""
    award_ceiling = "Not specified"
    if isinstance(summary_raw, dict):
        cd = summary_raw.get("close_date") or summary_raw.get("forecasted_close_date") or ""
        if cd:
            close_date = cd
        award_val = summary_raw.get("award_ceiling")
        if award_val:
            award_ceiling = _format_award(award_val)

    return {
        "id": str(r.get("opportunity_id", "")),
        "opportunity_id": str(r.get("opportunity_id", "")),
        "opportunity_number": r.get("opportunity_number", ""),
        "title": r.get("opportunity_title", ""),
        "agency": r.get("agency_name", r.get("agency", "")),
        "description": desc if desc else "No description available.",
        "award_ceiling": award_ceiling,
        "close_date": close_date,
        "open_date": summary_raw.get("post_date", "") if isinstance(summary_raw, dict) else "",
        "category": ", ".join(
            a.get("program_title", "")
            for a in r.get("opportunity_assistance_listings", [])
        ),
        "funding_opportunity_number": r.get("opportunity_number", ""),
        "status": r.get("opportunity_status", ""),
        "url": f"https://simpler.grants.gov/opportunity/{r.get('opportunity_number', '')}",
        "source": "simpler-grants-api",
    }


def _format_award(award_ceiling_val):
    if award_ceiling_val:
        return f"${award_ceiling_val:,.0f}" if isinstance(award_ceiling_val, (int, float)) else str(award_ceiling_val)
    return "Not specified"


# ---------------------------------------------------------------------------
# CORS preflight for API routes
# ---------------------------------------------------------------------------

@app.route('/api/v1/<path:_path>', methods=['OPTIONS'])
def api_preflight(_path):
    return ('', 204)


# ---------------------------------------------------------------------------
# Routes -- /api/v1/ (used by frontend JS)
# ---------------------------------------------------------------------------

@app.route('/api/v1/opportunities/')
def search_opportunities():
    query = request.args.get('query', '').strip()
    agency = request.args.get('agency', '').strip()
    category = request.args.get('category', '').strip()
    limit = request.args.get('limit', default=50, type=int)
    page = request.args.get('page', default=1, type=int)
    # Backend _search() uses 'offset' as page_offset (1-indexed page number)
    offset = page if page > 0 else 1

    total, results = _search(
        query=query,
        category=category,
        agency=agency,
        limit=limit,
        offset=offset,
    )
    return {"count": total, "results": results}


@app.route('/api/v1/opportunities/<string:opportunity_id>')
def get_opportunity(opportunity_id):
    result = _get_detail(opportunity_id)
    if result:
        return result
    return jsonify({"error": f"Opportunity {opportunity_id} not found"}), 404


@app.route('/api/v1/ai-summary', methods=['POST'])
def ai_summary():
    try:
        if not AI_BASE_URL or not AI_MODEL:
            return jsonify({"error": "AI_BASE_URL/AI_MODEL not configured"}), 500

        data = request.get_json() or {}
        opportunity = data.get("opportunity") or {}
        prompt = (
            "Write a concise first-draft grant concept note (max 250 words). "
            "Include objective, target beneficiaries, 3 key activities, and expected outcomes.\n\n"
            f"Opportunity title: {opportunity.get('opportunity_title') or opportunity.get('title') or ''}\n"
            f"Agency: {opportunity.get('agency_name') or opportunity.get('agency') or ''}\n"
            f"Opportunity number: {opportunity.get('opportunity_number') or ''}\n"
            f"Description: {(opportunity.get('description') or '')[:2500]}"
        )

        headers = {"Content-Type": "application/json"}
        if AI_API_KEY:
            headers["Authorization"] = f"Bearer {AI_API_KEY}"

        base = AI_BASE_URL.rstrip('/')
        resp = _http.post(
            f"{base}/chat/completions",
            headers=headers,
            json={
                "model": AI_MODEL,
                "messages": [
                    {"role": "system", "content": "You are an expert grant writing assistant."},
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0.3,
            },
            timeout=60,
        )
        if not resp.ok:
            return jsonify({"error": f"AI upstream error {resp.status_code}", "details": resp.text[:400]}), 502

        payload = resp.json()
        content = payload.get("choices", [{}])[0].get("message", {}).get("content", "")
        return jsonify({"summary": content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# /api/v1/generate-application → migrated to client-side WebLLM (frontend/ai-sorter.js)
# AI autofill now runs entirely in the browser — no backend, no API key needed.
@app.route('/s2s/health')
def s2s_health():
    return jsonify({
        "status": "healthy",
        "service": "Grants.gov S2S Integration",
        "api_endpoint": f"{API_BASE}/opportunities/search",
        "api_key_configured": bool(API_KEY),
    })


@app.route('/s2s/opportunities')
def s2s_search():
    query = request.args.get('query', '').strip()
    agency = request.args.get('agency', '').strip()
    category = request.args.get('category', '').strip()
    limit = request.args.get('limit', default=50, type=int)
    offset = request.args.get('offset', default=1, type=int)

    total, results = _search(
        query=query,
        category=category,
        agency=agency,
        limit=limit,
        offset=offset,
    )
    return jsonify({"count": total, "results": results})


@app.route('/s2s/opportunities/<int:opportunity_id>')
def s2s_get_opportunity(opportunity_id):
    result = _get_detail(opportunity_id)
    if result:
        return jsonify(result)
    return jsonify({"error": f"Opportunity {opportunity_id} not found"}), 404


@app.route('/s2s/submit-application', methods=['POST'])
def s2s_submit():
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400
    return jsonify({
        "status": "queued",
        "message": "Application queued locally (full S2S submission requires digital certificate)",
        "application_id": f"APP-{int(time.time())}",
    }), 202


@app.route('/s2s/profiles', methods=['POST'])
def s2s_create_profile():
    return jsonify({"status": "success", "message": "Profile created", "profile_id": "123456"}), 201


@app.route('/s2s/profiles/<profile_id>')
def s2s_get_profile(profile_id):
    return jsonify({"error": f"Profile {profile_id} not found"}), 404


@app.route('/s2s/profiles/sam-status/<duns_number>')
def s2s_sam_status(duns_number):
    return jsonify({"duns_number": duns_number, "sam_status": "Check SAM.gov directly"})


# ---------------------------------------------------------------------------
# AI Application Generator
# Takes project info + opportunity details, returns filled application fields
# ---------------------------------------------------------------------------

APPLICATION_FIELDS = [
    "project_summary",
    "project_narrative",
    "goals_and_objectives",
    "project_timeline",
    "evaluation_plan",
    "sustainability_plan",
    "budget_breakdown",
    "additional_info",
]

AI_GENERATE_PROMPT = """You are an expert grants application writer. Write a COMPLETE, HIGH-QUALITY grant application tailored SPECIFICALLY to this opportunity using the organization's profile information.

OPPORTUNITY DETAILS:
{opportunity_details}

ORGANIZATION PROFILE & PROJECT INFORMATION:
{project_info}

Write a compelling, professional application that:

1. project_summary - Write 1 tight paragraph (3-5 sentences). State the organization name, the core problem being addressed, the proposed solution, and how this project directly aligns with THIS specific opportunity's stated goals and priorities. Be specific - reference key themes from the opportunity description.

2. project_narrative - Write 4-5 substantial paragraphs. This is the heart of the application:
   - Paragraph 1: Problem statement - what gap exists, who is affected, why this matters. Reference statistics or context from the opportunity if available.
   - Paragraph 2: Proposed solution/methodology - what the organization will do, how it connects their expertise to the opportunity's objectives. Use the organization's mission and past projects to show capability.
   - Paragraph 3: Implementation approach - step-by-step how the work will be done, leveraging the organization's established methods and partnerships.
   - Paragraph 4: Expected outcomes and impact - what will change, how many people/communities will benefit, how success connects to the opportunity's stated goals.
   - Paragraph 5 (if applicable): Innovation or special value - what makes this organization's approach unique and why they are the right applicant for THIS grant.

3. goals_and_objectives - Write 200-400 words with 4-6 specific, measurable goals. Each goal should have a target metric and timeline. Use the SMART framework. Connect each goal directly to something explicitly stated in the opportunity description.

4. project_timeline - Write 200-400 words describing a phased implementation with specific milestones, deliverables, and dates for each phase. Include a planning phase, implementation phase, and evaluation/completion phase.

5. evaluation_plan - Write 150-300 words on how success will be measured. Include quantitative metrics, qualitative assessment methods, data collection approaches, and reporting schedule. Reference the organization's track record of accountability.

6. sustainability_plan - Write 150-300 words on how the project continues after funding ends. Discuss diversified funding streams, capacity building, revenue generation, and community ownership. Reference the organization's stability and track record.

7. budget_breakdown - Write 200-400 words with a realistic, detailed budget. Allocate funds across categories (personnel, equipment, supplies, travel, indirect costs/overhead). Justify each major expense in context of the project activities. Base totals on the award ceiling of {award_ceiling} - be realistic and show good stewardship.

8. additional_info - Write 100-200 words. Mention the organization's relevant history, partnerships, community connections, or other factors that make them the strongest candidate. Reference their expertise areas and past relevant projects.

CRITICAL WRITING GUIDELINES:
- Use the organization's REAL name from the profile throughout (not generic placeholders)
- Reference the opportunity's SPECIFIC goals, priorities, and language in your narrative
- Weave in the organization's mission, expertise, and past projects to show capability
- Reference target population and community connections from the profile
- Use professional grants-writing language - persuasive but not exaggerated
- Be specific with numbers, timelines, and measurable outcomes
- Do NOT use markdown formatting, bullet points with asterisks, or headers in the output
- Each field should be a single cohesive paragraph or set of paragraphs

Return ONLY valid JSON with these exact field names as keys:
{{"project_summary": "...", "project_narrative": "...", "goals_and_objectives": "...", "project_timeline": "...", "evaluation_plan": "...", "sustainability_plan": "...", "budget_breakdown": "...", "additional_info": "..."}}"""


@app.route('/api/v1/applications/', methods=['POST'])
def generate_application_submit():
    """Submit application (returns confirmation)."""
    data = request.get_json() or {}
    return jsonify({
        "status": "success",
        "application_id": f"APP-{int(time.time())}",
    })


# ---------------------------------------------------------------------------
# Routes -- /s2s/ (S2S API mirror)
# ---------------------------------------------------------------------------

SCRAPE_PROMPT = """Analyze the following website content and extract structured organization information.
Return ONLY valid JSON with these fields. Leave fields empty string "" if not found.

{{
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
}}

WEBSITE URL: {url}

WEBSITE CONTENT:
{content}
"""


@app.route('/api/v1/scrape-website', methods=['POST'])
def scrape_website():
    """Scrape a website and extract organization information using AI."""
    data = request.get_json()
    if not data or not data.get('url'):
        return jsonify({"error": "url is required"}), 400

    url = data['url']

    # Fetch the website content
    try:
        resp = _http.get(url, headers={
            "User-Agent": "Mozilla/5.0 (compatible; GrantsApp/1.0)"
        }, timeout=15, allow_redirects=True)
        resp.raise_for_status()
        html_content = resp.text
    except Exception as e:
        return jsonify({"error": f"Failed to fetch website: {e}"}), 400

    # Extract text content from HTML using BeautifulSoup
    from bs4 import BeautifulSoup
    soup = BeautifulSoup(html_content, 'html.parser')

    # Remove scripts, styles, nav, footer, header
    for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
        tag.decompose()

    # Get readable text, limit to reasonable size
    text = soup.get_text(separator=' ', strip=True)
    # Clean up whitespace
    text = re.sub(r'\s+', ' ', text)
    # Truncate to ~8000 chars (limit for prompt)
    if len(text) > 8000:
        text = text[:8000]

    # Also try to get meta description and key content
    meta_desc = ''
    desc_tag = soup.find('meta', attrs={'name': 'description'})
    if desc_tag:
        meta_desc = desc_tag.get('content', '')
    og_desc = soup.find('meta', attrs={'property': 'og:description'})
    if og_desc:
        meta_desc = og_desc.get('content', '')

    # Build combined content
    content_parts = []
    if meta_desc:
        content_parts.append(f"Meta description: {meta_desc}")
    title = soup.find('title')
    if title:
        content_parts.append(f"Page title: {title.get_text(strip=True)}")

    # Extract main content sections
    main_content = soup.find('main') or soup.find('body')
    if main_content:
        h1s = [h.get_text(strip=True) for h in main_content.find_all(['h1', 'h2', 'h3']) if h.get_text(strip=True)]
        if h1s:
            content_parts.append(f"Headings: {' | '.join(h1s)}")
        # Get paragraph text
        paragraphs = [p.get_text(strip=True) for p in main_content.find_all('p') if len(p.get_text(strip=True)) > 50]
        if paragraphs:
            content_parts.append(f"Content: {' '.join(paragraphs)[:4000]}")

    full_content = '\n\n'.join(content_parts)
    if not full_content.strip():
        full_content = text[:2000]

    # Use basic HTML → text extraction; AI extraction is done client-side via WebLLM
    # to eliminate the need for OPENROUTER_API_KEY.  This stub returns the raw
    # cleaned text so the browser-side WebLLMHelper can run the SCRAPE_PROMPT.
    return jsonify({
        "status": "scraped",
        "url": url,
        "text": full_content,
    })


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print(f"API Key configured: {bool(API_KEY)}")
    app.run(host='0.0.0.0', port=8000)
