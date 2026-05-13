"""Scrape search results from simpler.grants.gov (no API key needed)."""
import re
import time
import requests as _http
from bs4 import BeautifulSoup

# Simple cache: (query, limit) -> (timestamp, total, results)
_cache = {}
_CACHE_TTL = 300  # 5 minutes

# Strip header labels from scraped values
_HEADER_PREFIXES = ["close date", "status", "agency", "award min", "award max", "posted date:"]


def _strip_label(text):
    """Remove header labels that get duplicated into scraped text."""
    for prefix in _HEADER_PREFIXES:
        if text.lower().startswith(prefix):
            text = text[len(prefix):]
            break
    return text.strip()


def search_grants(query="", category="", agency="", limit=50, offset=1, statuses=None):
    """Search simpler.grants.gov by scraping the SSR search page (no API key needed)."""
    if statuses is None:
        statuses = ["posted", "forecasted"]

    # Check cache
    cache_key = (query, category, agency, limit, offset, str(statuses))
    cached = _cache.get(cache_key)
    if cached and (time.time() - cached[0]) < _CACHE_TTL:
        return cached[1], cached[2]

    url = f"https://simpler.grants.gov/search?query={_http.utils.quote(query or '')}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
    }

    try:
        resp = _http.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        print(f"[scrape] Failed to fetch simpler.grants.gov: {e}")
        return 0, []

    soup = BeautifulSoup(resp.text, "html.parser")

    # Extract total opportunities count
    total_rows = 0
    # Look in the heading: "94 Opportunities"
    match = re.search(r"(\d[\d,]*)\s+Opportun", resp.text)
    if match:
        total_rows = int(match.group(1).replace(",", ""))

    # Extract data from the results table
    results = []
    table = soup.find("table")
    if not table:
        return total_rows, []

    # Header row has <th>, data rows have <td>
    data_rows = [r for r in table.find_all("tr") if r.find("td") is not None]

    # The simpler.grants.gov table has 6 columns:
    # 0: Close date  1: Status  2: Title + Number  3: Agency + Posted date  4: Award min  5: Award max
    for row in data_rows:
        cells = row.find_all("td")
        if len(cells) < 6:
            continue

        # Cell 0: Close date (contains "Close date" header label + actual value)
        close_date = _strip_label(cells[0].get_text(strip=True))

        # Cell 1: Status
        status = _strip_label(cells[1].get_text(strip=True)).lower()

        # Cell 2: Title + opportunity number
        title_cell = cells[2]
        title = ""
        opp_number = ""
        
        # Title is in the <a> tag
        link = title_cell.find("a")
        if link:
            title = link.get_text(strip=True)
        
        # Number is in a <span> with "Number: XXX"
        for span in title_cell.find_all("span"):
            text = span.get_text(strip=True)
            if text.startswith("Number:"):
                opp_number = text.replace("Number:", "").strip()
                break
        
        if not opp_number:
            match2 = re.search(r"Number:\s*(\S+)", title_cell.get_text())
            if match2:
                opp_number = match2.group(1)

        # Cell 3: Agency + posted date
        agency_cell = cells[3]
        agency_name = ""
        full_text = agency_cell.get_text()
        # Format: "AgencyAdvanced Research Projects Agency EnergyPosted date: Oct 2, 2024Expected awards: --"
        # But also "Agency" text is the header. Let's parse it.
        parts = full_text.split("Posted date:")
        raw_agency = parts[0].replace("Agency", "").strip() if parts else ""
        agency_name = raw_agency or ""

        # Cell 4: Award min
        award_min = _strip_label(cells[4].get_text(strip=True))
        # Cell 5: Award max
        award_max = _strip_label(cells[5].get_text(strip=True))

        if not opp_number:
            continue

        results.append({
            "id": opp_number,
            "opportunity_number": opp_number,
            "title": title,
            "agency": agency_name,
            "description": "",
            "award_ceiling": award_max or "Not specified",
            "close_date": close_date,
            "category": category if category else "General",
            "funding_opportunity_number": opp_number,
            "status": status,
            "url": f"https://simpler.grants.gov/opportunity/{opp_number}",
            "source": "simpler-grants-web",
        })

    _cache[cache_key] = (time.time(), total_rows, results)
    return total_rows, results


def get_detail(opportunity_number):
    """Scrape a single opportunity detail page."""
    url = f"https://simpler.grants.gov/opportunity/{opportunity_number}"

    try:
        resp = _http.get(url, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        }, timeout=30)
        resp.raise_for_status()
    except Exception as e:
        print(f"[detail] Failed to fetch {url}: {e}")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    title = ""
    h1 = soup.find("h1")
    if h1:
        title = h1.get_text(strip=True)

    description = ""
    main = soup.find("main")
    if main:
        paras = main.find_all("p")
        description = " ".join(p.get_text(strip=True) for p in paras if p.get_text(strip=True))[:3000]

    return {
        "id": opportunity_number,
        "opportunity_number": opportunity_number,
        "title": title,
        "agency": "",
        "description": description,
        "award_ceiling": "Not specified",
        "close_date": "",
        "category": "General",
        "funding_opportunity_number": opportunity_number,
        "status": "posted",
        "url": url,
        "source": "simpler-grants-web",
    }


if __name__ == "__main__":
    import sys
    query = sys.argv[1] if len(sys.argv) > 1 else "energy"

    total, results = search_grants(query, limit=10)
    print(f"Total: {total}, Found: {len(results)}")
    for r in results[:5]:
        print(f"\n--- {r['title'][:80]}")
        print(f"  Number: {r['opportunity_number']}")
        print(f"  Agency: {r['agency']}")
        print(f"  Status: {r['status']}")
        print(f"  Award: {r['award_ceiling']}")
        print(f"  Close: {r['close_date']}")
