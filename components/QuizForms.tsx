import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, RefreshCw, Trash2, ClipboardList, X, ExternalLink, Users, HelpCircle, CheckCircle2, Clock, Globe } from 'lucide-react';
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
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onMouseDown={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="w-full max-w-2xl rounded-2xl border border-[hsl(var(--border))] overflow-hidden shadow-2xl"
            style={{ background: 'hsl(220 20% 8%)' }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--border))]">
              <div className="text-sm font-bold text-[hsl(var(--foreground))]">{title}</div>
              <button
                onClick={onClose}
                className="h-7 w-7 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="px-6 py-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
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

  // Aba local do painel de detalhe
  const [detailTab, setDetailTab] = useState<'questions' | 'submissions'>('questions');

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/20 flex items-center justify-center shrink-0">
            <ClipboardList className="w-4.5 h-4.5 text-[hsl(var(--primary))]" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-[hsl(var(--foreground))] leading-none">Quiz & Forms</h2>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">
              {readOnlyMode
                ? 'Configure o Supabase e selecione uma empresa para usar este modulo.'
                : 'Crie quizzes publicos e capture leads diretamente no CR8.'}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => void fetchQuizzes({ keepSelected: true })}
            className="h-9 w-9 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-colors disabled:opacity-40"
            title="Atualizar"
            disabled={readOnlyMode}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 px-4 h-9 rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-all shadow-sm"
            disabled={readOnlyMode}
          >
            <Plus className="w-3.5 h-3.5" />
            Novo Quiz
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
          {error}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4 min-h-0">
        {/* Quiz list */}
        <div className="rounded-2xl border border-[hsl(var(--border))] overflow-hidden flex flex-col"
             style={{ background: 'hsl(220 18% 7%)' }}>
          <div className="px-4 py-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
            <span className="text-xs font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">Seus Quizzes</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">{quizzes.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto cr8-scroll p-2 space-y-1.5">
            {quizzes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-[hsl(var(--muted-foreground))] text-xs">
                <ClipboardList className="w-8 h-8 mb-2 opacity-20" />
                Nenhum quiz criado ainda
              </div>
            ) : (
              quizzes.map((q) => {
                const active = selectedQuizId === q.id;
                return (
                  <button
                    key={q.id}
                    onClick={() => setSelectedQuizId(q.id)}
                    className={`w-full text-left rounded-xl border px-3 py-2.5 transition-all ${
                      active
                        ? 'bg-[hsl(var(--primary))]/8 border-[hsl(var(--primary))]/30'
                        : 'border-[hsl(var(--border))]/50 hover:border-[hsl(var(--border))] hover:bg-[hsl(var(--secondary))]/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className={`text-xs font-semibold truncate ${active ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--foreground))]'}`}>
                          {q.title}
                        </div>
                        {q.description && (
                          <div className="text-[10px] text-[hsl(var(--muted-foreground))] truncate mt-0.5">{q.description}</div>
                        )}
                      </div>
                      <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-full border font-bold uppercase tracking-wide ${statusBadgeClass(q.status)}`}>
                        {formatStatus(q.status)}
                      </span>
                    </div>
                    <div className="mt-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                      {new Date(q.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div className="rounded-2xl border border-[hsl(var(--border))] overflow-hidden flex flex-col"
             style={{ background: 'hsl(220 18% 7%)' }}>
          {!selectedQuiz ? (
            <div className="flex-1 flex flex-col items-center justify-center text-[hsl(var(--muted-foreground))]">
              <ClipboardList className="w-10 h-10 mb-3 opacity-15" />
              <p className="text-sm font-medium text-[hsl(var(--foreground))]">Selecione um quiz</p>
              <p className="text-xs mt-1">Escolha um quiz na lista para editar</p>
            </div>
          ) : (
            <>
              {/* Quiz header */}
              <div className="px-5 py-4 border-b border-[hsl(var(--border))]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-[hsl(var(--foreground))] truncate">{selectedQuiz.title}</h3>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold uppercase tracking-wide ${statusBadgeClass(selectedQuiz.status)}`}>
                        {formatStatus(selectedQuiz.status)}
                      </span>
                    </div>
                    {selectedQuiz.description && (
                      <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 line-clamp-2">{selectedQuiz.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                        <HelpCircle className="w-3 h-3" />
                        {questions.length} {questions.length === 1 ? 'pergunta' : 'perguntas'}
                      </span>
                      <span className="flex items-center gap-1 text-[10px] text-[hsl(var(--muted-foreground))]">
                        <Users className="w-3 h-3" />
                        {submissions.length} {submissions.length === 1 ? 'resposta' : 'respostas'}
                      </span>
                      {selectedQuiz.status === 'published' && publicLink && (
                        <a
                          href={publicLink}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-[10px] text-[hsl(var(--primary))] hover:underline"
                        >
                          <Globe className="w-3 h-3" />
                          Link publico
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {selectedQuiz.status !== 'published' ? (
                      <button
                        onClick={() => void setQuizStatus(selectedQuiz.id, 'published')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 disabled:opacity-40 transition-all"
                        disabled={readOnlyMode}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Publicar
                      </button>
                    ) : (
                      <button
                        onClick={() => void setQuizStatus(selectedQuiz.id, 'draft')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[hsl(var(--secondary))] border border-[hsl(var(--border))] text-xs text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] disabled:opacity-40 transition-all"
                        disabled={readOnlyMode}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        Rascunho
                      </button>
                    )}
                    <button
                      onClick={() => void deleteQuiz(selectedQuiz.id)}
                      className="h-8 w-8 rounded-xl border border-red-500/20 bg-red-500/5 text-red-400/70 hover:text-red-400 hover:bg-red-500/15 disabled:opacity-40 transition-all flex items-center justify-center"
                      disabled={readOnlyMode}
                      title="Excluir quiz"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Detail tabs */}
                <div className="flex gap-1 mt-4">
                  {[
                    { id: 'questions', label: 'Perguntas', count: questions.length },
                    { id: 'submissions', label: 'Respostas', count: submissions.length },
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setDetailTab(t.id as any)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        detailTab === t.id
                          ? 'bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/25 text-[hsl(var(--primary))]'
                          : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]/50'
                      }`}
                    >
                      {t.label}
                      {t.count > 0 && (
                        <span className={`text-[9px] font-bold px-1 rounded-full ${
                          detailTab === t.id ? 'bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]' : 'bg-[hsl(var(--secondary))] text-[hsl(var(--muted-foreground))]'
                        }`}>
                          {t.count}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab content */}
              <div className="flex-1 overflow-y-auto cr8-scroll">
                {detailTab === 'questions' && (
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-[hsl(var(--muted-foreground))]">
                        {questions.length === 0 ? 'Nenhuma pergunta ainda' : `${questions.length} ${questions.length === 1 ? 'pergunta' : 'perguntas'}`}
                      </span>
                      <button
                        onClick={openNewQuestion}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[hsl(var(--primary))]/10 border border-[hsl(var(--primary))]/25 text-[hsl(var(--primary))] text-xs font-semibold hover:bg-[hsl(var(--primary))]/20 disabled:opacity-40 transition-all"
                        disabled={readOnlyMode}
                      >
                        <Plus className="w-3 h-3" />
                        Pergunta
                      </button>
                    </div>
                    {questions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-32 text-[hsl(var(--muted-foreground))] text-xs">
                        <HelpCircle className="w-8 h-8 mb-2 opacity-20" />
                        Adicione a primeira pergunta
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {questions.map((q) => (
                          <div key={q.id} className="rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--card))]/40 px-4 py-3 flex items-start justify-between gap-3 hover:border-[hsl(var(--border))] transition-colors">
                            <button onClick={() => openEditQuestion(q)} className="text-left flex-1 min-w-0">
                              <div className="flex items-start gap-2">
                                <span className="shrink-0 text-[10px] font-bold text-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10 rounded-full w-5 h-5 flex items-center justify-center mt-0.5">
                                  {q.position + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-[hsl(var(--foreground))] leading-snug">
                                    {q.prompt}
                                    {q.required && <span className="text-red-400 ml-0.5">*</span>}
                                  </div>
                                  <div className="mt-0.5 text-[10px] text-[hsl(var(--muted-foreground))]">
                                    {questionTypeLabel[q.type]}
                                    {q.help_text ? ` · ${q.help_text}` : ''}
                                  </div>
                                </div>
                              </div>
                            </button>
                            <button
                              onClick={() => void deleteQuestion(q.id)}
                              className="h-6 w-6 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))]/50 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
                              title="Excluir pergunta"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {detailTab === 'submissions' && (
                  <div className="p-4">
                    {submissions.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-40 text-[hsl(var(--muted-foreground))] text-xs">
                        <Users className="w-8 h-8 mb-2 opacity-20" />
                        <p>Ainda sem respostas</p>
                        <p className="mt-1 text-[10px]">Publique e compartilhe o link para comecar a captar leads</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {submissions.slice(0, 100).map((s) => (
                          <div key={s.id} className="rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--card))]/40 px-4 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-7 h-7 rounded-full bg-[hsl(var(--primary))]/15 flex items-center justify-center shrink-0">
                                  <Users className="w-3 h-3 text-[hsl(var(--primary))]" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-xs font-semibold text-[hsl(var(--foreground))] truncate">
                                    {s.contact_name || s.contact_phone || s.contact_email || 'Anonimo'}
                                  </div>
                                  <div className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">
                                    {[s.contact_phone && `+${s.contact_phone}`, s.contact_email].filter(Boolean).join(' · ') || '—'}
                                  </div>
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-[10px] text-[hsl(var(--muted-foreground))]">
                                  {new Date(s.created_at).toLocaleDateString('pt-BR')}
                                </div>
                                {s.lead_id && (
                                  <div className="text-[9px] text-[hsl(var(--primary))] font-mono mt-0.5">
                                    Lead {s.lead_id.slice(0, 6)}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ModalShell title="Novo Quiz" open={createOpen} onClose={() => setCreateOpen(false)}>
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">Titulo</label>
            <input
              value={createTitle}
              onChange={(e) => setCreateTitle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="Ex: Quiz de Pre-qualificacao"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
              Descricao <span className="normal-case font-normal">(opcional)</span>
            </label>
            <textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              className="w-full min-h-[88px] px-3 py-2.5 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-none"
              placeholder="Ex: Responda para receber uma analise gratuita."
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setCreateOpen(false)}
              className="px-4 py-2 rounded-xl border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => void createQuiz()}
              className="px-5 py-2 rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
            >
              Criar quiz
            </button>
          </div>
        </div>
      </ModalShell>

      <ModalShell
        title={editingQuestion ? 'Editar pergunta' : 'Nova pergunta'}
        open={questionOpen}
        onClose={() => setQuestionOpen(false)}
      >
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">Pergunta</label>
            <input
              value={qPrompt}
              onChange={(e) => setQPrompt(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="Ex: Qual e seu objetivo principal?"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
              Texto de ajuda <span className="normal-case font-normal">(opcional)</span>
            </label>
            <input
              value={qHelp}
              onChange={(e) => setQHelp(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              placeholder="Ex: Responda com o maximo de detalhes."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">Tipo</label>
              <select
                value={qType}
                onChange={(e) => setQType(e.target.value as QuizQuestionType)}
                className="w-full px-3 py-2.5 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]"
              >
                {Object.entries(questionTypeLabel).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-sm text-[hsl(var(--foreground))] cursor-pointer">
                <input
                  type="checkbox"
                  checked={qRequired}
                  onChange={(e) => setQRequired(e.target.checked)}
                  className="rounded"
                />
                Obrigatoria
              </label>
            </div>
          </div>
          {(qType === 'single_choice' || qType === 'multiple_choice') && (
            <div>
              <label className="block text-xs font-semibold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1.5">
                Opcoes <span className="normal-case font-normal">(uma por linha)</span>
              </label>
              <textarea
                value={qChoicesText}
                onChange={(e) => setQChoicesText(e.target.value)}
                className="w-full min-h-[100px] px-3 py-2.5 rounded-xl bg-[hsl(var(--background))] border border-[hsl(var(--border))] text-sm text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] resize-none"
                placeholder={'Sim\nNao\nTalvez'}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => setQuestionOpen(false)}
              className="px-4 py-2 rounded-xl border border-[hsl(var(--border))] text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))] transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => void saveQuestion()}
              className="px-5 py-2 rounded-xl bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] text-sm font-semibold hover:opacity-90 transition-all shadow-sm"
            >
              Salvar
            </button>
          </div>
        </div>
      </ModalShell>
    </div>
  );
}

