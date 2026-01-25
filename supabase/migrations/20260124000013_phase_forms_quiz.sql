-- Phase: Quiz & Forms (public quiz + internal management)

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'quiz_question_type') then
    create type public.quiz_question_type as enum (
      'short_text',
      'long_text',
      'single_choice',
      'multiple_choice',
      'email',
      'phone',
      'number'
    );
  end if;
end
$$;

-- -----------------------------------------------------------------------------
-- Quizzes
-- -----------------------------------------------------------------------------

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  public_id uuid not null default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists quizzes_public_id_uq on public.quizzes (public_id);
create index if not exists quizzes_company_id_idx on public.quizzes (company_id);

drop trigger if exists set_quizzes_updated_at on public.quizzes;
create trigger set_quizzes_updated_at
before update on public.quizzes
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Quiz questions
-- -----------------------------------------------------------------------------

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  position int not null default 0,
  type public.quiz_question_type not null,
  prompt text not null,
  help_text text,
  required boolean not null default true,
  options jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quiz_questions_quiz_id_idx on public.quiz_questions (quiz_id);
create unique index if not exists quiz_questions_quiz_pos_uq on public.quiz_questions (quiz_id, position);

drop trigger if exists set_quiz_questions_updated_at on public.quiz_questions;
create trigger set_quiz_questions_updated_at
before update on public.quiz_questions
for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Quiz submissions + answers
-- -----------------------------------------------------------------------------

create table if not exists public.quiz_submissions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  contact_name text,
  contact_email text,
  contact_phone text,
  utm_source text,
  utm_campaign text,
  status public.lead_status not null default 'new',
  lead_id uuid references public.leads (id) on delete set null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quiz_submissions_company_id_idx on public.quiz_submissions (company_id);
create index if not exists quiz_submissions_quiz_id_idx on public.quiz_submissions (quiz_id);
create index if not exists quiz_submissions_created_at_idx on public.quiz_submissions (created_at desc);

create table if not exists public.quiz_answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.quiz_submissions (id) on delete cascade,
  question_id uuid references public.quiz_questions (id) on delete set null,
  answer jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists quiz_answers_submission_id_idx on public.quiz_answers (submission_id);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_submissions enable row level security;
alter table public.quiz_answers enable row level security;

drop policy if exists "Members can read quizzes" on public.quizzes;
create policy "Members can read quizzes"
on public.quizzes
for select
using (public.is_company_member(company_id));

drop policy if exists "Admins can manage quizzes" on public.quizzes;
create policy "Admins can manage quizzes"
on public.quizzes
for all
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

drop policy if exists "Members can read quiz questions" on public.quiz_questions;
create policy "Members can read quiz questions"
on public.quiz_questions
for select
using (
  exists (
    select 1
    from public.quizzes q
    where q.id = quiz_id
      and public.is_company_member(q.company_id)
  )
);

drop policy if exists "Admins can manage quiz questions" on public.quiz_questions;
create policy "Admins can manage quiz questions"
on public.quiz_questions
for all
using (
  exists (
    select 1
    from public.quizzes q
    where q.id = quiz_id
      and public.is_company_admin(q.company_id)
  )
)
with check (
  exists (
    select 1
    from public.quizzes q
    where q.id = quiz_id
      and public.is_company_admin(q.company_id)
  )
);

drop policy if exists "Members can read quiz submissions" on public.quiz_submissions;
create policy "Members can read quiz submissions"
on public.quiz_submissions
for select
using (public.is_company_member(company_id));

drop policy if exists "Admins can update quiz submissions" on public.quiz_submissions;
create policy "Admins can update quiz submissions"
on public.quiz_submissions
for update
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

drop policy if exists "Members can read quiz answers" on public.quiz_answers;
create policy "Members can read quiz answers"
on public.quiz_answers
for select
using (
  exists (
    select 1
    from public.quiz_submissions s
    where s.id = submission_id
      and public.is_company_member(s.company_id)
  )
);

