import React, { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';

import { isSupabaseConfigured, supabase } from '../lib/supabase';

type QuizStatus = 'draft' | 'published' | 'archived';
type QuizQuestionType =
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multiple_choice'
  | 'email'
  | 'phone'
  | 'number';

type QuizRow = {
  id: string;
  company_id: string;
  public_id: string;
  title: string;
  description: string | null;
  status: QuizStatus;
  created_at: string;
  updated_at: string;
};

type QuizQuestionRow = {
  id: string;
  quiz_id: string;
  position: number;
  type: QuizQuestionType;
  prompt: string;
  help_text: string | null;
  required: boolean;
  options: any;
  created_at: string;
  updated_at: string;
};

type QuizSubmissionRow = {
  id: string;
  quiz_id: string;
  created_at: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  lead_id: string | null;
};

const ModalShell = ({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) => {
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onMouseDown={onClose}>
      <div
        className="w-full max-w-2xl cr8-card p-5"
        onMouseDown={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold text-[hsl(var(--foreground))]">{title}</div>
          <button
            onClick={onClose}
            className="px-2 py-1 rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>,
    document.body
  );
};

const formatStatus = (s: QuizStatus) => {
  if (s === 'published') return 'Publicado';
  if (s === 'archived') return 'Arquivado';
  return 'Rascunho';
};

const statusBadgeClass = (s: QuizStatus) => {
  if (s === 'published') return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
  if (s === 'archived') return 'bg-zinc-500/10 text-zinc-300 border-zinc-500/20';
  return 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] border-[hsl(var(--border))]';
};

const questionTypeLabel: Record<QuizQuestionType, string> = {
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  single_choice: 'Uma opção',
  multiple_choice: 'Múltiplas opções',
  email: 'E-mail',
  phone: 'Telefone',
  number: 'Número',
};

export function QuizForms({ companyId }: { companyId?: string }) {
  const readOnlyMode = useMemo(() => !isSupabaseConfigured() || !companyId, [companyId]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [quizzes, setQuizzes] = useState<QuizRow[]>([]);
  const [selectedQuizId, setSelectedQuizId] = useState<string | null>(null);
  const selectedQuiz = useMemo(() => quizzes.find((q) => q.id === selectedQuizId) ?? null, [quizzes, selectedQuizId]);

  const [questions, setQuestions] = useState<QuizQuestionRow[]>([]);
  const [submissions, setSubmissions] = useState<QuizSubmissionRow[]>([]);

  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState('');
  const [createDescription, setCreateDescription] = useState('');

  const [questionOpen, setQuestionOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuizQuestionRow | null>(null);
  const [qPrompt, setQPrompt] = useState('');
  const [qHelp, setQHelp] = useState('');
  const [qType, setQType] = useState<QuizQuestionType>('short_text');
  const [qRequired, setQRequired] = useState(true);
  const [qChoicesText, setQChoicesText] = useState('');

  const publicLink = useMemo(() => {
    if (!selectedQuiz?.public_id) return null;
    try {
      return `${window.location.origin}/quiz/${selectedQuiz.public_id}`;
    } catch {
      return `/quiz/${selectedQuiz.public_id}`;
    }
  }, [selectedQuiz?.public_id]);

  const fetchQuizzes = async (opts?: { keepSelected?: boolean }) => {
    if (readOnlyMode) return;
    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('quizzes')
        .select('id,company_id,public_id,title,description,status,created_at,updated_at')
        .eq('company_id', companyId as string)
        .order('created_at', { ascending: false });
      if (err) throw err;
      const rows = (data ?? []) as any as QuizRow[];
      setQuizzes(rows);

      if (!opts?.keepSelected) {
        setSelectedQuizId(rows[0]?.id ?? null);
      } else if (selectedQuizId && !rows.some((r) => r.id === selectedQuizId)) {
        setSelectedQuizId(rows[0]?.id ?? null);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao carregar quizzes');
    } finally {
      setLoading(false);
    }
  };

  const fetchQuestions = async (quizId: string) => {
    if (readOnlyMode) return;
    const { data, error: err } = await supabase
      .from('quiz_questions')
      .select('id,quiz_id,position,type,prompt,help_text,required,options,created_at,updated_at')
      .eq('quiz_id', quizId)
      .order('position', { ascending: true });
    if (err) throw err;
    setQuestions((data ?? []) as any as QuizQuestionRow[]);
  };

  const fetchSubmissions = async (quizId: string) => {
    if (readOnlyMode) return;
    const { data, error: err } = await supabase
      .from('quiz_submissions')
      .select('id,quiz_id,created_at,contact_name,contact_email,contact_phone,status,lead_id')
      .eq('quiz_id', quizId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (err) throw err;
    setSubmissions((data ?? []) as any as QuizSubmissionRow[]);
  };

  useEffect(() => {
    void fetchQuizzes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  useEffect(() => {
    if (!selectedQuizId || readOnlyMode) {
      setQuestions([]);
      setSubmissions([]);
      return;
    }

    let alive = true;
    const run = async () => {
      try {
        setError(null);
        await Promise.all([fetchQuestions(selectedQuizId), fetchSubmissions(selectedQuizId)]);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? 'Erro ao carregar detalhes do quiz');
      }
    };
    void run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedQuizId, readOnlyMode]);

  const createQuiz = async () => {
    if (readOnlyMode) return;
    if (!createTitle.trim()) {
      setError('Defina um título.');
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('quizzes')
        .insert([{ company_id: companyId as string, title: createTitle.trim(), description: createDescription.trim() || null }])
        .select('id')
        .maybeSingle();
      if (err) throw err;

      setCreateOpen(false);
      setCreateTitle('');
      setCreateDescription('');
      await fetchQuizzes({ keepSelected: true });
      if (data?.id) setSelectedQuizId(String((data as any).id));
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao criar quiz');
    } finally {
      setLoading(false);
    }
  };

  const deleteQuiz = async (quizId: string) => {
    if (readOnlyMode) return;
    if (!confirm('Excluir este quiz? Isso apagará perguntas e respostas.')) return;
    try {
      setLoading(true);
      setError(null);
      const { error: err } = await supabase.from('quizzes').delete().eq('id', quizId);
      if (err) throw err;
      await fetchQuizzes();
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao excluir quiz');
    } finally {
      setLoading(false);
    }
  };

  const setQuizStatus = async (quizId: string, status: QuizStatus) => {
    if (readOnlyMode) return;
    try {
      setLoading(true);
      setError(null);
      const { error: err } = await supabase.from('quizzes').update({ status }).eq('id', quizId);
      if (err) throw err;
      await fetchQuizzes({ keepSelected: true });
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao atualizar status');
    } finally {
      setLoading(false);
    }
  };

  const openNewQuestion = () => {
    setEditingQuestion(null);
    setQPrompt('');
    setQHelp('');
    setQType('short_text');
    setQRequired(true);
    setQChoicesText('');
    setQuestionOpen(true);
  };

  const openEditQuestion = (q: QuizQuestionRow) => {
    setEditingQuestion(q);
    setQPrompt(q.prompt ?? '');
    setQHelp(q.help_text ?? '');
    setQType(q.type);
    setQRequired(Boolean(q.required));

    const choices = Array.isArray(q.options?.choices) ? (q.options.choices as string[]) : [];
    setQChoicesText(choices.join('\n'));
    setQuestionOpen(true);
  };

  const saveQuestion = async () => {
    if (readOnlyMode || !selectedQuizId) return;
    if (!qPrompt.trim()) {
      setError('Defina a pergunta.');
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const options =
        qType === 'single_choice' || qType === 'multiple_choice'
          ? { choices: qChoicesText.split('\n').map((s) => s.trim()).filter(Boolean) }
          : {};

      if (editingQuestion) {
        const { error: err } = await supabase
          .from('quiz_questions')
          .update({
            prompt: qPrompt.trim(),
            help_text: qHelp.trim() || null,
            type: qType,
            required: qRequired,
            options,
          })
          .eq('id', editingQuestion.id);
        if (err) throw err;
      } else {
        const nextPos = (questions.at(-1)?.position ?? -1) + 1;
        const { error: err } = await supabase.from('quiz_questions').insert([
          {
            quiz_id: selectedQuizId,
            position: nextPos,
            prompt: qPrompt.trim(),
            help_text: qHelp.trim() || null,
            type: qType,
            required: qRequired,
            options,
          },
        ]);
        if (err) throw err;
      }

      setQuestionOpen(false);
      await fetchQuestions(selectedQuizId);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao salvar pergunta');
    } finally {
      setLoading(false);
    }
  };

  const deleteQuestion = async (id: string) => {
    if (readOnlyMode || !selectedQuizId) return;
    if (!confirm('Excluir esta pergunta?')) return;
    try {
      setLoading(true);
      setError(null);
      const { error: err } = await supabase.from('quiz_questions').delete().eq('id', id);
      if (err) throw err;
      await fetchQuestions(selectedQuizId);
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao excluir pergunta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">Quiz & Forms</h2>
          {readOnlyMode ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
              Configure o Supabase (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) e selecione uma empresa para usar este módulo.
            </p>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Crie quizzes públicos e capture leads diretamente no CR8.</p>
          )}
          {error && <p className="text-sm text-[hsl(var(--destructive))] mt-2">{error}</p>}
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void fetchQuizzes({ keepSelected: true })}
            className="p-2 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-lg hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors"
            title="Atualizar"
            disabled={readOnlyMode}
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] px-4 py-2 rounded-lg hover:opacity-90 disabled:opacity-50"
            disabled={readOnlyMode}
          >
            <span className="inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Novo Quiz
            </span>
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4 min-h-0">
        <div className="cr8-card p-3 min-h-0 flex flex-col">
          <div className="text-sm font-semibold text-[hsl(var(--foreground))] px-2 py-2">Quizzes</div>
          <div className="flex-1 overflow-y-auto">
            {quizzes.length === 0 ? (
              <div className="p-3 text-sm text-[hsl(var(--muted-foreground))]">Nenhum quiz criado ainda.</div>
            ) : (
              <div className="space-y-2 p-2">
                {quizzes.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => setSelectedQuizId(q.id)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${
                      selectedQuizId === q.id
                        ? 'bg-[hsl(var(--secondary))] border-[hsl(var(--ring))]'
                        : 'bg-[hsl(var(--card))] border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-[hsl(var(--foreground))] truncate">{q.title}</div>
                        <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))] truncate">{q.description || '—'}</div>
                      </div>
                      <span className={`shrink-0 text-[11px] px-2 py-1 rounded-full border ${statusBadgeClass(q.status)}`}>
                        {formatStatus(q.status)}
                      </span>
                    </div>
                    <div className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                      {new Date(q.created_at).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="cr8-card p-4 min-h-0 flex flex-col">
          {!selectedQuiz ? (
            <div className="flex-1 flex items-center justify-center text-[hsl(var(--muted-foreground))]">
              Selecione um quiz para editar.
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-xl font-bold text-[hsl(var(--foreground))]">{selectedQuiz.title}</div>
                  {selectedQuiz.description && (
                    <div className="mt-1 text-sm text-[hsl(var(--muted-foreground))]">{selectedQuiz.description}</div>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`text-[11px] px-2 py-1 rounded-full border ${statusBadgeClass(selectedQuiz.status)}`}>
                      {formatStatus(selectedQuiz.status)}
                    </span>
                    {selectedQuiz.status === 'published' && publicLink && (
                      <a
                        href={publicLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] px-2 py-1 rounded-full border border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))]"
                      >
                        Abrir link público
                      </a>
                    )}
                    <div className="text-[11px] text-[hsl(var(--muted-foreground))]">
                      Respostas: <span className="font-semibold">{submissions.length}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-end">
                  {selectedQuiz.status !== 'published' ? (
                    <button
                      onClick={() => void setQuizStatus(selectedQuiz.id, 'published')}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white hover:opacity-90 disabled:opacity-50"
                      disabled={readOnlyMode}
                    >
                      Publicar
                    </button>
                  ) : (
                    <button
                      onClick={() => void setQuizStatus(selectedQuiz.id, 'draft')}
                      className="px-3 py-2 rounded-lg bg-[hsl(var(--secondary))] text-[hsl(var(--foreground))] border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))]"
                      disabled={readOnlyMode}
                    >
                      Voltar para rascunho
                    </button>
                  )}
                  <button
                    onClick={() => void deleteQuiz(selectedQuiz.id)}
                    className="px-3 py-2 rounded-lg bg-[hsl(var(--destructive))] text-[hsl(var(--destructive-foreground))] hover:opacity-90 disabled:opacity-50"
                    disabled={readOnlyMode}
                    title="Excluir quiz"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Trash2 className="w-4 h-4" />
                      Excluir
                    </span>
                  </button>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4 min-h-0 flex-1">
                <div className="min-h-0 flex flex-col">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Perguntas</div>
                    <button
                      onClick={openNewQuestion}
                      className="px-3 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-50"
                      disabled={readOnlyMode}
                    >
                      + Pergunta
                    </button>
                  </div>
                  <div className="mt-3 flex-1 overflow-y-auto border border-[hsl(var(--border))] rounded-xl">
                    {questions.length === 0 ? (
                      <div className="p-3 text-sm text-[hsl(var(--muted-foreground))]">Nenhuma pergunta ainda.</div>
                    ) : (
                      <div className="divide-y divide-[hsl(var(--border))]">
                        {questions.map((q) => (
                          <div key={q.id} className="p-3 flex items-start justify-between gap-3">
                            <button onClick={() => openEditQuestion(q)} className="text-left flex-1 min-w-0">
                              <div className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
                                {q.position + 1}. {q.prompt}
                                {q.required && <span className="text-[hsl(var(--destructive))]"> *</span>}
                              </div>
                              <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
                                {questionTypeLabel[q.type]}
                                {q.help_text ? ` · ${q.help_text}` : ''}
                              </div>
                            </button>
                            <button
                              onClick={() => void deleteQuestion(q.id)}
                              className="p-2 rounded-lg hover:bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--destructive))]"
                              title="Excluir pergunta"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="min-h-0 flex flex-col">
                  <div className="text-sm font-semibold text-[hsl(var(--foreground))]">Respostas recentes</div>
                  <div className="mt-3 flex-1 overflow-y-auto border border-[hsl(var(--border))] rounded-xl">
                    {submissions.length === 0 ? (
                      <div className="p-3 text-sm text-[hsl(var(--muted-foreground))]">
                        Ainda sem respostas. Publique e compartilhe o link para começar a captar leads.
                      </div>
                    ) : (
                      <div className="divide-y divide-[hsl(var(--border))]">
                        {submissions.slice(0, 100).map((s) => (
                          <div key={s.id} className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold text-[hsl(var(--foreground))] truncate">
                                  {s.contact_name || s.contact_phone || s.contact_email || 'Anônimo'}
                                </div>
                                <div className="mt-1 text-xs text-[hsl(var(--muted-foreground))] truncate">
                                  {s.contact_phone ? `+${s.contact_phone}` : ''} {s.contact_email ? `· ${s.contact_email}` : ''}
                                </div>
                              </div>
                              <div className="text-xs text-[hsl(var(--muted-foreground))]">
                                {new Date(s.created_at).toLocaleString()}
                              </div>
                            </div>
                            <div className="mt-2 text-[11px] text-[hsl(var(--muted-foreground))]">
                              Status: <span className="font-semibold">{s.status}</span>
                              {s.lead_id ? (
                                <span className="ml-2">
                                  Lead: <span className="font-mono">{s.lead_id.slice(0, 8)}…</span>
                                </span>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ModalShell title="Novo Quiz" open={createOpen} onClose={() => setCreateOpen(false)}>
        <div className="grid grid-cols-1 gap-3">
          <label className="text-sm text-[hsl(var(--foreground))]">
            Título
            <input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="Ex: Quiz de Pré-qualificação"
            />
          </label>
          <label className="text-sm text-[hsl(var(--foreground))]">
            Descrição (opcional)
            <textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              className="mt-1 w-full min-h-[96px] px-3 py-2 rounded-lg bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="Ex: Responda para receber uma análise gratuita."
            />
          </label>

          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]"
            >
              Cancelar
            </button>
            <button
              onClick={() => void createQuiz()}
              className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
            >
              Criar
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        title={editingQuestion ? 'Editar pergunta' : 'Nova pergunta'}
        open={questionOpen}
        onClose={() => setQuestionOpen(false)}
      >
        <div className="grid grid-cols-1 gap-3">
          <label className="text-sm text-[hsl(var(--foreground))]">
            Pergunta
            <input
              value={qPrompt}
              onChange={(e) => setQPrompt(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="Ex: Qual é seu objetivo principal?"
            />
          </label>

          <label className="text-sm text-[hsl(var(--foreground))]">
            Ajuda (opcional)
            <input
              value={qHelp}
              onChange={(e) => setQHelp(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="Ex: Responda com o máximo de detalhes."
            />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm text-[hsl(var(--foreground))]">
              Tipo
              <select
                value={qType}
                onChange={(e) => setQType(e.target.value as QuizQuestionType)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-sm"
              >
                {Object.entries(questionTypeLabel).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>

            <label className="text-sm text-[hsl(var(--foreground))] flex items-center gap-2 mt-7">
              <input type="checkbox" checked={qRequired} onChange={(e) => setQRequired(e.target.checked)} />
              Obrigatória
            </label>
          </div>

          {(qType === 'single_choice' || qType === 'multiple_choice') && (
            <label className="text-sm text-[hsl(var(--foreground))]">
              Opções (uma por linha)
              <textarea
                value={qChoicesText}
                onChange={(e) => setQChoicesText(e.target.value)}
                className="mt-1 w-full min-h-[120px] px-3 py-2 rounded-lg bg-[hsl(var(--input))] border border-[hsl(var(--border))] text-sm"
                placeholder={'Ex:\nSim\nNão\nTalvez'}
              />
            </label>
          )}

          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => setQuestionOpen(false)}
              className="px-4 py-2 rounded-lg border border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]"
            >
              Cancelar
            </button>
            <button
              onClick={() => void saveQuestion()}
              className="px-4 py-2 rounded-lg bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90"
            >
              Salvar
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}

