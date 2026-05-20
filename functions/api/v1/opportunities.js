// Cloudflare Pages Function: /api/v1/opportunities/*
// Handles both list (/) and detail (/:id) routes

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname;

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

  const apiKey = env.SIMPLER_GRANTS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'API key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Check if this is a detail request (path has an ID after /opportunities/)
  const match = pathname.match(/\/api\/v1\/opportunities\/(.+)$/);
  const opportunityId = match ? match[1] : null;

  try {
    let targetUrl;
    
    if (opportunityId && opportunityId !== '') {
      // Detail endpoint
      targetUrl = 'https://simpler.grants.gov/api/v1/opportunities/' + encodeURIComponent(opportunityId);
    } else {
      // Search/list endpoint
      targetUrl = new URL('https://simpler.grants.gov/api/v1/opportunities');
      const params = url.searchParams;
      if (params.has('query')) targetUrl.searchParams.set('query', params.get('query'));
      if (params.has('keyword')) targetUrl.searchParams.set('keyword', params.get('keyword'));
      if (params.has('agency')) targetUrl.searchParams.set('agency', params.get('agency'));
      if (params.has('category')) targetUrl.searchParams.set('category', params.get('category'));
      if (params.has('limit')) targetUrl.searchParams.set('limit', params.get('limit'));
      if (params.has('page')) targetUrl.searchParams.set('page', params.get('page'));
      if (params.has('offset')) targetUrl.searchParams.set('offset', params.get('offset'));
      if (params.has('status')) targetUrl.searchParams.set('status', params.get('status'));
      if (params.has('oppStatuses')) targetUrl.searchParams.set('oppStatuses', params.get('oppStatuses'));
      if (!targetUrl.searchParams.has('oppStatuses') && !targetUrl.searchParams.has('status')) {
        targetUrl.searchParams.set('oppStatuses', 'posted|forecasted');
      }
    }

    const response = await fetch(targetUrl.toString(), {
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Accept': 'application/json',
        'User-Agent': 'GrantsGov-Finder/1.0',
      },
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

    if (opportunityId) {
      // Single opportunity detail
      const o = data.opportunity || data;
      const opportunity = {
        id: o.id || o.opportunityId || opportunityId,
        opportunity_number: o.opportunity_number || o.opportunityId || o.number || opportunityId,
        title: o.title || o.opportunityTitle || '',
        agency: o.agency || o.agencyName || o.agency_code || '',
        description: o.description || o.summary_description || o.synopsis || '',
        award_ceiling: o.award_ceiling || o.awardCeiling || '',
        close_date: o.close_date || o.closeDate || '',
        category: o.category || o.funding_category || '',
        status: o.status || o.oppStatus || 'posted',
        cfda: o.cfda || o.cfda_number || (o.cfdaList && o.cfdaList[0]) || '',
        open_date: o.open_date || o.openDate || '',
      };
      return new Response(JSON.stringify(opportunity), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=600',
        },
      });
    } else {
      // Search results list
      const params = url.searchParams;
      const opportunities = (data.opportunities || data.oppHits || data.results || data || []).map(function(o) {
        return {
          id: o.id || o.opportunityId || o.opportunity_number,
          opportunity_number: o.opportunity_number || o.opportunityId || o.number || o.id,
          title: o.title || o.opportunityTitle || '',
          agency: o.agency || o.agencyName || o.agency_code || '',
          description: o.description || o.summary_description || o.synopsis || '',
          award_ceiling: o.award_ceiling || o.awardCeiling || o.estimated_total_program_funding || '',
          close_date: o.close_date || o.closeDate || o.close_date_raw || '',
          category: o.category || o.funding_category || o.category_name || '',
          status: o.status || o.oppStatus || 'posted',
          cfda: o.cfda || o.cfda_number || (o.cfdaList && o.cfdaList[0]) || '',
          open_date: o.open_date || o.openDate || '',
        };
      });

      return new Response(JSON.stringify({
        results: opportunities,
        count: data.hitCount || data.total || opportunities.length,
        page: parseInt(params.get('page') || '1'),
        total_pages: Math.ceil((data.hitCount || opportunities.length) / parseInt(params.get('limit') || '50')),
      }), {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
