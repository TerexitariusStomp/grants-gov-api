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
    const limit = parseInt(params.get('limit') || '50');
    const page = parseInt(params.get('page') || '1');
    const query = params.get('query') || '';

    const body = {
      pagination: {
        page_size: limit,
        page_offset: (page - 1) * limit + 1
      }
    };
    if (query) body.query = query;

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

    const opportunities = items.map(o => ({
      id: o.opportunity_id || o.legacy_opportunity_id,
      opportunity_number: o.opportunity_number || o.opportunity_id,
      title: o.opportunity_title || '',
      agency: o.agency_name || o.agency || '',
      description: ((o.summary || {}).summary_description || '').substring(0, 500),
      award_ceiling: (o.summary || {}).award_ceiling ? String((o.summary || {}).award_ceiling) : '',
      close_date: (o.summary || {}).close_date || '',
      category: ((o.summary || {}).funding_categories || [])[0] || o.category || '',
      status: o.opportunity_status || 'posted',
      cfda: ((o.opportunity_assistance_listings || [])[0] || {}).assistance_listing_number || '',
      open_date: (o.summary || {}).post_date || '',
    }));

    return new Response(JSON.stringify({
      results: opportunities,
      count: opportunities.length,
      page: page,
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
