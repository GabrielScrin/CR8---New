import React, { useEffect, useMemo, useState } from 'react';
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseConfigured } from '../lib/supabase';

type QuizQuestionType =
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multiple_choice'
  | 'email'
  | 'phone'
  | 'number';

type PublicQuizQuestion = {
  id: string;
  position: number;
  type: QuizQuestionType;
  prompt: string;
  help_text?: string | null;
  required: boolean;
  options: any;
};

type PublicQuizData = {
  id: string;
  public_id: string;
  title: string;
  description?: string | null;
  settings?: any;
};

type AnswerValue = string | number | string[] | null;

const sanitizePhone = (value: string) => value.replace(/\D/g, '');

const getCookie = (name: string): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
};

const getAttributionFromUrl = (url: URL) => {
  const utm_source = url.searchParams.get('utm_source') ?? undefined;
  const utm_medium = url.searchParams.get('utm_medium') ?? undefined;
  const utm_campaign = url.searchParams.get('utm_campaign') ?? undefined;
  const utm_content = url.searchParams.get('utm_content') ?? undefined;
  const utm_term = url.searchParams.get('utm_term') ?? undefined;

  const gclid = url.searchParams.get('gclid') ?? undefined;
  const gbraid = url.searchParams.get('gbraid') ?? undefined;
  const wbraid = url.searchParams.get('wbraid') ?? undefined;

  const fbclid = url.searchParams.get('fbclid') ?? undefined;
  const fbc = getCookie('_fbc');
  const fbp = getCookie('_fbp');

  const landing_page_url = url.href;
  const referrer_url = typeof document !== 'undefined' ? document.referrer || undefined : undefined;

  return {
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term,
    gclid,
    gbraid,
    wbraid,
    fbclid,
    fbc,
    fbp,
    landing_page_url,
    referrer_url,
  };
};

export function PublicQuiz({ publicId }: { publicId: string }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [quiz, setQuiz] = useState<PublicQuizData | null>(null);
  const [questions, setQuestions] = useState<PublicQuizQuestion[]>([]);

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});

  const baseUrl = useMemo(() => getSupabaseUrl(), []);
  const anonKey = useMemo(() => getSupabaseAnonKey(), []);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      setError('Supabase não está configurado no app (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
      return;
    }

    let alive = true;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        setSuccess(false);

        const res = await fetch(`${baseUrl}/functions/v1/quiz?public_id=${encodeURIComponent(publicId)}`, {
          headers: {
            apikey: anonKey,
            authorization: `Bearer ${anonKey}`,
          },
        });

        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!json?.ok) throw new Error(json?.error || 'Falha ao carregar quiz');

        if (!alive) return;
        setQuiz(json.quiz as PublicQuizData);
        setQuestions((json.questions ?? []) as PublicQuizQuestion[]);
        setAnswers({});
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? 'Erro ao carregar quiz');
      } finally {
        if (alive) setLoading(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [anonKey, baseUrl, publicId]);

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError(null);

      const url = new URL(window.location.href);
      const attribution = getAttributionFromUrl(url);

      const requiredMissing = questions
        .filter((q) => q.required)
        .some((q) => {
          const v = answers[q.id];
          if (q.type === 'multiple_choice') return !Array.isArray(v) || v.length === 0;
          return v == null || String(v).trim() === '';
        });

      if (requiredMissing) {
        setError('Preencha as perguntas obrigatórias.');
        return;
      }

      const payload = {
        public_id: publicId,
        contact: {
          name: contactName.trim() || undefined,
          email: contactEmail.trim() || undefined,
          phone: contactPhone.trim() ? sanitizePhone(contactPhone) : undefined,
        },
        ...attribution,
        answers: questions.map((q) => ({ question_id: q.id, answer: answers[q.id] ?? null })),
        raw: {
          page_url: window.location.href,
          referrer_url: typeof document !== 'undefined' ? document.referrer || null : null,
          user_agent: navigator.userAgent,
        },
      };

      const res = await fetch(`${baseUrl}/functions/v1/quiz`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      if (!json?.ok) throw new Error(json?.error || 'Falha ao enviar');

      setSuccess(true);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao enviar');
    } finally {
      setSubmitting(false);
    }
  };

  const setAnswer = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const toggleMultiChoice = (questionId: string, option: string) => {
    setAnswers((prev) => {
      const current = prev[questionId];
      const arr = Array.isArray(current) ? current.slice() : [];
      const idx = arr.indexOf(option);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(option);
      return { ...prev, [questionId]: arr };
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        <div className="cr8-card p-6 text-center">
          <div className="text-lg font-semibold">Carregando…</div>
          <div className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">Aguarde um momento.</div>
        </div>
      </div>
    );
  }

  if (error && !quiz) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        <div className="cr8-card p-6 max-w-lg w-full">
          <div className="text-lg font-semibold">Não foi possível abrir este quiz</div>
          <div className="mt-2 text-sm text-[hsl(var(--destructive))]">{error}</div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
        <div className="cr8-card p-8 max-w-lg w-full text-center">
          <div className="text-2xl font-extrabold cr8-text-gradient">Obrigado!</div>
          <div className="mt-2 text-sm text-[hsl(var(--muted-foreground))]">
            Sua resposta foi enviada com sucesso. Em breve entraremos em contato.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--background))] text-[hsl(var(--foreground))]">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="cr8-card p-6">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] flex items-center justify-center overflow-hidden">
              <img src="/cr8-logo.svg" alt="CR8" className="h-8 w-8 object-contain" />
            </div>
            <div>
              <div className="text-2xl font-bold">{quiz?.title ?? 'Quiz'}</div>
              {quiz?.description && <div className="text-sm text-[hsl(var(--muted-foreground))]">{quiz.description}</div>}
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3">
            <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Seus dados</div>
            <input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              placeholder="Nome (opcional)"
              className="px-3 py-2 rounded-lg bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
            <input
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="E-mail (opcional)"
              className="px-3 py-2 rounded-lg bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
            <input
              value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)}
              placeholder="WhatsApp (opcional)"
              className="px-3 py-2 rounded-lg bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
            />
          </div>

          <div className="mt-8 space-y-6">
            {questions.map((q) => {
              const opts = q.options ?? {};
              const choices: string[] = Array.isArray(opts?.choices) ? opts.choices : [];
              const value = answers[q.id];

              return (
                <div key={q.id} className="border border-[hsl(var(--border))] rounded-xl p-4 bg-[hsl(var(--card))]">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold">
                        {q.prompt} {q.required && <span className="text-[hsl(var(--destructive))]">*</span>}
                      </div>
                      {q.help_text && <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{q.help_text}</div>}
                    </div>
                    <div className="text-[10px] uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{q.type}</div>
                  </div>

                  <div className="mt-3">
                    {q.type === 'long_text' ? (
                      <textarea
                        value={typeof value === 'string' ? value : ''}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        className="w-full min-h-[96px] px-3 py-2 rounded-lg bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                      />
                    ) : q.type === 'single_choice' ? (
                      <div className="space-y-2">
                        {choices.map((c) => (
                          <label key={c} className="flex items-center gap-2 text-sm">
                            <input
                              type="radio"
                              name={q.id}
                              checked={value === c}
                              onChange={() => setAnswer(q.id, c)}
                            />
                            <span>{c}</span>
                          </label>
                        ))}
                        {choices.length === 0 && (
                          <div className="text-xs text-[hsl(var(--muted-foreground))]">Sem opções configuradas.</div>
                        )}
                      </div>
                    ) : q.type === 'multiple_choice' ? (
                      <div className="space-y-2">
                        {choices.map((c) => (
                          <label key={c} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={Array.isArray(value) ? value.includes(c) : false}
                              onChange={() => toggleMultiChoice(q.id, c)}
                            />
                            <span>{c}</span>
                          </label>
                        ))}
                        {choices.length === 0 && (
                          <div className="text-xs text-[hsl(var(--muted-foreground))]">Sem opções configuradas.</div>
                        )}
                      </div>
                    ) : (
                      <input
                        type={q.type === 'number' ? 'number' : q.type === 'email' ? 'email' : 'text'}
                        value={typeof value === 'string' || typeof value === 'number' ? String(value ?? '') : ''}
                        onChange={(e) => setAnswer(q.id, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {error && <div className="mt-6 text-sm text-[hsl(var(--destructive))]">{error}</div>}

          <div className="mt-8 flex gap-3">
            <button
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="flex-1 bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-4 py-3 rounded-xl font-semibold hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Enviando…' : 'Enviar'}
            </button>
          </div>

          <div className="mt-4 text-xs text-[hsl(var(--muted-foreground))]">
            Powered by <span className="font-semibold">CR8</span>
          </div>
        </div>
      </div>
    </div>
  );
}
