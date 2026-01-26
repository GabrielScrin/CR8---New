import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret, x-company-id',
  'access-control-allow-methods': 'POST, OPTIONS',
};

serve(async (req) => {
  const url = new URL(req.url);
  // expects path like /functions/v1/webhook-in/<source_id>
  const parts = url.pathname.split('/').filter(Boolean);
  const idx = parts.indexOf('webhook-in');
  const sourceId = idx >= 0 && parts.length > idx + 1 ? parts[idx + 1] : null;

  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  if (!sourceId) return new Response(JSON.stringify({ error: 'missing source id' }), { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } });

  const token = req.headers.get('x-webhook-secret') || (req.headers.get('authorization') || '').startsWith('Bearer ') ? (req.headers.get('authorization') || '').slice(7) : null;
  if (!token) return new Response(JSON.stringify({ error: 'missing secret' }), { status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' } });

  try {
    // validate secret via RPC (service role)
    const { data, error } = await supabase.rpc('validate_inbound_secret', { p_source_id: sourceId, p_token: token });
    if (error) {
      console.error('validate_inbound_secret error', error);
      return new Response(JSON.stringify({ error: 'internal' }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } });
    }
    const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
    if (!row) return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: { ...corsHeaders, 'content-type': 'application/json' } });

    const body = await req.json().catch(() => null);
    if (!body) return new Response(JSON.stringify({ error: 'invalid payload' }), { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } });

    const externalEventId = body.external_event_id ?? body.externalEventId ?? null;

    // dedupe when external_event_id is provided
    if (externalEventId) {
      const { data: existing } = await supabase
        .from('webhook_events_in')
        .select('id')
        .eq('source_id', sourceId)
        .eq('external_event_id', externalEventId)
        .limit(1);
      if (existing && Array.isArray(existing) && existing.length > 0) {
        return new Response(JSON.stringify({ ok: true, duplicate: true }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
      }
    }

    // insert event (service role allowed to write)
    const { data: inserted, error: insertErr } = await supabase.from('webhook_events_in').insert([
      { source_id: sourceId, external_event_id: externalEventId, payload: body, status: 'received' },
    ]).select('*');

    if (insertErr) {
      console.error('insert event error', insertErr);
      return new Response(JSON.stringify({ error: 'could not persist event' }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } });
    }

    // Respond with 200 and audit id
    const ev = Array.isArray(inserted) && inserted.length > 0 ? inserted[0] : null;
    return new Response(JSON.stringify({ ok: true, id: ev?.id ?? null }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  } catch (e) {
    console.error('webhook-in error', e);
    return new Response(JSON.stringify({ error: 'internal' }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }
});
