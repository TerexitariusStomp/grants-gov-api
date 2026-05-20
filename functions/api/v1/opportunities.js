// Cloudflare Pages Function: /api/v1/opportunities
// Proxies requests to api.simpler.grants.gov with server-side API key

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Try both env var names (with and without leading space)
  const apiKey = env.SIMPLER_GRANTS_API_KEY || env[' SIMPLER_GRANTS_API_KEY'];
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const params = url.searchParams;
    const limit = parseInt(params.get('limit') || '50');
    const page = parseInt(params.get('page') || '1');
    const query = params.get('query') || '';
    const agency = params.get('agency') || '';
    const category = params.get('category') || '';

    // Build the POST body for the simpler.grants.gov API
    const body = {
      pagination: {
        page_size: limit,
        page_offset: (page - 1) * limit + 1
      }
    };
    if (query) body.query = query;
    if (agency) body.agency = agency;
    if (category) body.category = category;

    const response = await fetch('https://api.simpler.grants.gov/v1/opportunities/search', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ 
        error: 'Upstream API error: ' + response.status,
        details: errText 
      }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const data = await response.json();
    const items = data.data || [];

    // Normalize to match frontend expectations
    const opportunities = items.map(function(o) {
      const s = o.summary || {};
      return {
        id: o.opportunity_id || o.legacy_opportunity_id,
        opportunity_number: o.opportunity_number || o.opportunity_id,
        title: o.opportunity_title || '',
        agency: o.agency_name || o.agency || '',
        description: (s.summary_description || '').substring(0, 500),
        award_ceiling: s.award_ceiling ? String(s.award_ceiling) : '',
        close_date: s.close_date || '',
        category: (s.funding_categories && s.funding_categories[0]) || o.category || '',
        status: o.opportunity_status || 'posted',
        cfda: (o.opportunity_assistance_listings && o.opportunity_assistance_listings[0] && o.opportunity_assistance_listings[0].assistance_listing_number) || '',
        open_date: s.post_date || '',
        created_at: s.created_at || '',
        updated_at: s.updated_at || '',
      };
    });

    return new Response(JSON.stringify({
      results: opportunities,
      count: opportunities.length,
      page: page,
      total_pages: Math.ceil(opportunities.length / limit),
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
// Wed, May 20, 2026  1:26:54 AM
