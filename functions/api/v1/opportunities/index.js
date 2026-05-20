export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  const apiKey = env.SIMPLER_GRANTS_API_KEY || env[' SIMPLER_GRANTS_API_KEY'];
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const params = url.searchParams;
    const query = params.get('query') || '';
    const agency = params.get('agency') || '';
    const category = params.get('category') || '';

    // Paginate through ALL results - API max is 100 per page
    const PAGE_SIZE = 100;
    let allOpportunities = [];
    let pageOffset = 1;
    let totalCount = null;

    while (true) {
      const body = {
        pagination: {
          page_size: PAGE_SIZE,
          page_offset: pageOffset
        },
        // Only fetch posted (active) opportunities
        opportunity_status: 'posted'
      };
      if (query) body.query = query;
      if (agency) body.agency = agency;
      if (category) body.category = category;

      const response = await fetch('https://api.simpler.grants.gov/v1/opportunities/search', {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errText = await response.text();
        return new Response(JSON.stringify({ error: 'Upstream error: ' + response.status, details: errText }), {
          status: response.status,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        });
      }

      const data = await response.json();
      const items = data.data || [];

      if (totalCount === null) {
        totalCount = data.pagination?.total_count || data.total || items.length;
      }

      // Filter: only opportunities with close_date in the future
      const now = new Date();
      const futureItems = items.filter(o => {
        const closeDate = (o.summary || {}).close_date;
        if (!closeDate) return true; // include if no close date
        const d = new Date(closeDate);
        return d >= now;
      });

      allOpportunities = allOpportunities.concat(futureItems);

      // If we got fewer than PAGE_SIZE results, we've reached the end
      if (items.length < PAGE_SIZE) break;

      // Safety: don't fetch more than 10 pages (1000 results)
      pageOffset += PAGE_SIZE;
      if (pageOffset > 1000) break;
    }

    // Sort by close_date ascending (closing soonest first)
    allOpportunities.sort((a, b) => {
      const da = new Date((a.summary || {}).close_date || '9999-12-31');
      const db = new Date((b.summary || {}).close_date || '9999-12-31');
      return da - db;
    });

    // Normalize
    const opportunities = allOpportunities.map(o => {
      const s = o.summary || {};
      return {
        id: o.opportunity_id || o.legacy_opportunity_id,
        opportunity_number: o.opportunity_number || o.opportunity_id,
        title: o.opportunity_title || '',
        agency: o.agency_name || o.agency || '',
        description: (s.summary_description || '').substring(0, 500),
        award_ceiling: s.award_ceiling ? String(s.award_ceiling) : '',
        close_date: s.close_date || '',
        category: (s.funding_categories || [])[0] || o.category || '',
        status: o.opportunity_status || 'posted',
        cfda: ((o.opportunity_assistance_listings || [])[0] || {}).assistance_listing_number || '',
        open_date: s.post_date || '',
      };
    });

    return new Response(JSON.stringify({
      results: opportunities,
      count: opportunities.length,
      total_available: totalCount,
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
