import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Minimal OpenAPI spec for the public API (only test endpoint described)
const openapi = {
  openapi: '3.0.1',
  info: { title: 'CR8 Public API', version: 'v1' },
  paths: {
    '/test': {
      post: {
        summary: 'Run a quick test using the API key',
        security: [{ ApiKeyAuth: [] }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { email: { type: 'string' }, board: { type: 'string' } } } } } },
        responses: { '200': { description: 'OK' }, '401': { description: 'Unauthorized' } },
      },
    },
  },
  components: { securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'X-Api-Key' } } },
};

serve(async (req) => {
  const url = new URL(req.url);
  // Support docs
  if (url.pathname.endsWith('/openapi.json') || url.pathname.endsWith('/openapi')) {
    return new Response(JSON.stringify(openapi), { headers: { 'content-type': 'application/json' } });
  }
  if (url.pathname.endsWith('/docs') || url.pathname.endsWith('/swagger')) {
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Swagger UI</title><link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@4/swagger-ui.css"></head><body><div id="swagger"></div><script src="https://unpkg.com/swagger-ui-dist@4/swagger-ui-bundle.js"></script><script>window.onload=function(){SwaggerUIBundle({url:'${url.origin}/functions/v1/public-api/openapi.json',dom_id:'#swagger'});}</script></body></html>`;
    return new Response(html, { headers: { 'content-type': 'text/html' } });
  }

  // Test endpoint: POST /test
  if (url.pathname.endsWith('/test') && req.method === 'POST') {
    const apiKey = req.headers.get('x-api-key') || ((req.headers.get('authorization') || '').startsWith('Bearer ') ? (req.headers.get('authorization') || '').slice(7) : null);
    if (!apiKey) return new Response(JSON.stringify({ error: 'missing key' }), { status: 401, headers: { 'content-type': 'application/json' } });

    // Use Postgres RPC to validate token (server-side hashing)
    const { data, error } = await supabase.rpc('validate_api_key', { p_token: apiKey });
    if (error) {
      console.error('validate_api_key error', error);
      return new Response(JSON.stringify({ error: 'internal' }), { status: 500, headers: { 'content-type': 'application/json' } });
    }
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row || row.status === 'revoked') return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { 'content-type': 'application/json' } });

    await supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.id);

    return new Response(JSON.stringify({ ok: true, company_id: row.company_id }), { headers: { 'content-type': 'application/json' } });
  }

  return new Response('Not found', { status: 404 });
});
