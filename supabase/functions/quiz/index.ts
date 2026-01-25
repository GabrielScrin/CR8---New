// Supabase Edge Function: quiz
// Public quiz endpoint (GET quiz definition + POST submission)
// Uses SERVICE_ROLE to bypass RLS for public submissions.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.8';

const corsHeaders: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type QuizQuestion = {
  id: string;
  position: number;
  type: string;
  prompt: string;
  help_text: string | null;
  required: boolean;
  options: any;
};

type QuizRow = {
  id: string;
  company_id: string;
  public_id: string;
  title: string;
  description: string | null;
  status: 'draft' | 'published' | 'archived';
  settings: any;
};

type SubmitPayload = {
  public_id: string;
  contact?: { name?: string; email?: string; phone?: string };
  utm_source?: string;
  utm_campaign?: string;
  answers?: Array<{ question_id: string; answer: any }>;
  raw?: any;
};

const jsonResponse = (status: number, data: unknown) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'content-type': 'application/json' },
  });

const safeJson = (raw: string) => {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const isEmptyAnswer = (value: unknown) => {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
};

serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonResponse(500, { ok: false, error: 'missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' });
    }

    const url = new URL(req.url);
    const publicId = url.searchParams.get('public_id');

    // GET: quiz definition (published only)
    if (req.method === 'GET') {
      if (!publicId) return jsonResponse(400, { ok: false, error: 'missing public_id' });

      const { data: quiz, error: quizErr } = await supabaseAdmin
        .from('quizzes')
        .select('id,company_id,public_id,title,description,status,settings')
        .eq('public_id', publicId)
        .maybeSingle();
      if (quizErr) return jsonResponse(500, { ok: false, error: quizErr.message });
      if (!quiz) return jsonResponse(404, { ok: false, error: 'quiz not found' });
      if ((quiz as any).status !== 'published') return jsonResponse(404, { ok: false, error: 'quiz not published' });

      const { data: questions, error: qErr } = await supabaseAdmin
        .from('quiz_questions')
        .select('id,position,type,prompt,help_text,required,options')
        .eq('quiz_id', (quiz as any).id)
        .order('position', { ascending: true });
      if (qErr) return jsonResponse(500, { ok: false, error: qErr.message });

      return jsonResponse(200, { ok: true, quiz: quiz as QuizRow, questions: (questions ?? []) as QuizQuestion[] });
    }

    // POST: create submission (+ lead)
    if (req.method !== 'POST') return jsonResponse(405, { ok: false, error: 'method not allowed' });

    const bodyText = await req.text().catch(() => '');
    const body = (bodyText ? safeJson(bodyText) : null) as SubmitPayload | null;
    if (!body) return jsonResponse(400, { ok: false, error: 'invalid json' });
    if (!body.public_id) return jsonResponse(400, { ok: false, error: 'missing public_id' });

    const { data: quiz, error: quizErr } = await supabaseAdmin
      .from('quizzes')
      .select('id,company_id,public_id,title,description,status,settings')
      .eq('public_id', body.public_id)
      .maybeSingle();
    if (quizErr) return jsonResponse(500, { ok: false, error: quizErr.message });
    if (!quiz) return jsonResponse(404, { ok: false, error: 'quiz not found' });
    if ((quiz as any).status !== 'published') return jsonResponse(404, { ok: false, error: 'quiz not published' });

    const { data: questions, error: qErr } = await supabaseAdmin
      .from('quiz_questions')
      .select('id,position,type,prompt,help_text,required,options')
      .eq('quiz_id', (quiz as any).id)
      .order('position', { ascending: true });
    if (qErr) return jsonResponse(500, { ok: false, error: qErr.message });

    const questionIds = new Set(((questions ?? []) as any[]).map((q) => String(q.id)));
    const answers = Array.isArray(body.answers) ? body.answers : [];
    const filteredAnswers = answers.filter(
      (a) => a && typeof a === 'object' && a.question_id && questionIds.has(String(a.question_id))
    );

    const nowIso = new Date().toISOString();

    const contactName = body.contact?.name?.trim() || null;
    const contactEmail = body.contact?.email?.trim() || null;
    const contactPhone = body.contact?.phone?.trim()?.replace(/\D/g, '') || null;

    const submissionRaw = body.raw ?? {};

    // Insert submission
    const { data: submission, error: subErr } = await supabaseAdmin
      .from('quiz_submissions')
      .insert([
        {
          quiz_id: (quiz as any).id,
          company_id: (quiz as any).company_id,
          contact_name: contactName,
          contact_email: contactEmail,
          contact_phone: contactPhone,
          utm_source: body.utm_source ?? null,
          utm_campaign: body.utm_campaign ?? null,
          status: 'new',
          raw: {
            ...submissionRaw,
            quiz: { public_id: (quiz as any).public_id, title: (quiz as any).title },
          },
        },
      ])
      .select('id')
      .maybeSingle();
    if (subErr) return jsonResponse(500, { ok: false, error: subErr.message });
    if (!submission?.id) return jsonResponse(500, { ok: false, error: 'failed to create submission' });

    const submissionId = String((submission as any).id);

    // Insert answers
    const answerRows = filteredAnswers
      .filter((a) => !isEmptyAnswer(a.answer))
      .map((a) => ({
        submission_id: submissionId,
        question_id: String(a.question_id),
        answer: a.answer,
      }));

    if (answerRows.length > 0) {
      const { error: ansErr } = await supabaseAdmin.from('quiz_answers').insert(answerRows as any);
      if (ansErr) return jsonResponse(500, { ok: false, error: ansErr.message });
    }

    // Create/Upsert lead (so CRM receives it)
    const leadExternalId = `quiz:${(quiz as any).public_id}:${submissionId}`;
    const leadRaw = {
      type: 'quiz_submission',
      quiz_public_id: (quiz as any).public_id,
      quiz_id: (quiz as any).id,
      submission_id: submissionId,
      contact: { name: contactName, email: contactEmail, phone: contactPhone },
      answers: filteredAnswers,
      created_at: nowIso,
    };

    const { data: leadRow, error: leadErr } = await supabaseAdmin
      .from('leads')
      .upsert(
        [
          {
            company_id: (quiz as any).company_id,
            name: contactName,
            email: contactEmail,
            phone: contactPhone,
            status: 'new',
            source: 'Quiz',
            utm_source: body.utm_source ?? null,
            utm_campaign: body.utm_campaign ?? null,
            external_id: leadExternalId,
            last_interaction_at: nowIso,
            raw: leadRaw,
          },
        ] as any,
        { onConflict: 'company_id,external_id' }
      )
      .select('id')
      .maybeSingle();

    if (leadErr) return jsonResponse(500, { ok: false, error: leadErr.message });

    const leadId = leadRow?.id ? String((leadRow as any).id) : null;
    if (leadId) {
      await supabaseAdmin.from('quiz_submissions').update({ lead_id: leadId }).eq('id', submissionId);
    }

    return jsonResponse(200, { ok: true, submission_id: submissionId, lead_id: leadId });
  } catch (e: any) {
    return jsonResponse(500, { ok: false, error: e?.message ?? 'unknown error' });
  }
});
