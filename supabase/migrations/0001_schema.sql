-- AI Project Lab MVP v1.0
-- Migration 0001: tables
-- Run order: 0001_schema.sql, 0002_security.sql, 0003_logic.sql, 0004_reporting.sql, 0005_realtime.sql

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Profiles (one row per auth user)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Student',
  role text not null default 'student' check (role in ('student', 'instructor')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Labs
-- ---------------------------------------------------------------------------
create or replace function public.generate_join_code() returns text
language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 6);
$$;

create table public.labs (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  challenge_title text not null,
  challenge_text text not null,
  date date,
  start_time time,
  end_time time,
  join_code text not null unique default public.generate_join_code(),
  team_size int not null default 4 check (team_size between 2 and 8),
  status text not null default 'draft' check (status in ('draft', 'open', 'active', 'complete')),
  gallery_unlocked boolean not null default false,
  cross_team_unlocked boolean not null default false,
  baseline_prompt text not null default '',
  post_prompt text not null default '',
  curriculum_version text not null default '1.0',
  software_version text not null default '1.0',
  lab_version text not null default '1.0',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.lab_members (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  unique (lab_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Teams and membership
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs (id) on delete cascade,
  name text not null,
  status text not null default 'forming' check (status in ('forming', 'active', 'paused', 'complete')),
  current_stage text not null default 'DEFINE',
  ai_credit_total int not null default 100,
  ai_credit_remaining int not null default 100,
  current_sprint_objective text not null default '',
  created_at timestamptz not null default now(),
  unique (lab_id, name)
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  team_role text check (team_role in ('architect', 'evidence_lead', 'builder', 'red_team')),
  joined_at timestamptz not null default now(),
  active_status text not null default 'active' check (active_status in ('active', 'inactive')),
  last_seen_at timestamptz,
  unique (team_id, user_id)
);

create table public.role_history (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid references public.profiles (id)
);

-- ---------------------------------------------------------------------------
-- Projects
-- One persistent project per team. A returning project can be re-attached to a
-- team in a later lab (project_labs keeps the history).
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null unique references public.teams (id) on delete restrict,
  lab_id uuid not null references public.labs (id),
  title text not null default '',
  flow text not null default 'standard' check (flow in ('standard', 'returning')),
  current_stage text not null default 'DEFINE'
    check (current_stage in ('DEFINE', 'EXPLORE', 'DECIDE', 'BUILD', 'TEST', 'IMPROVE', 'SHOW', 'REASSESS', 'REDESIGN')),
  stage_started_at timestamptz not null default now(),
  current_version int not null default 0,
  problem_statement text not null default '',
  primary_user text not null default '',
  desired_outcome text not null default '',
  selected_solution text not null default '',
  success_criteria text not null default '',
  requirements text not null default '',
  constraints text not null default '',
  must_not_do text not null default '',
  current_sprint_objective text not null default '',
  row_version int not null default 1,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_labs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  lab_id uuid not null references public.labs (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  started_at timestamptz not null default now(),
  unique (project_id, lab_id)
);

create table public.gate_overrides (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  gate_key text not null,
  granted_by uuid not null references public.profiles (id),
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (project_id, gate_key)
);

-- ---------------------------------------------------------------------------
-- Visual maps (structured data, never images)
-- ---------------------------------------------------------------------------
create table public.maps (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  map_type text not null check (map_type in (
    'problem_map', 'stakeholder_map', 'evidence_map', 'assumption_map', 'idea_map',
    'decision_matrix', 'workflow_map', 'human_ai_map', 'failure_map', 'version_map')),
  stage text not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'complete')),
  custom_categories jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (project_id, map_type)
);

create table public.map_nodes (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  node_type text not null default 'card',
  content text not null default '',
  author_id uuid not null references public.profiles (id),
  x_position double precision not null default 0,
  y_position double precision not null default 0,
  parent_node_id uuid references public.map_nodes (id) on delete set null,
  category text not null default '',
  status text not null default 'active' check (status in ('active', 'archived', 'in_matrix')),
  metadata jsonb not null default '{}'::jsonb,
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index map_nodes_map_idx on public.map_nodes (map_id);
create index map_nodes_project_idx on public.map_nodes (project_id);

create table public.map_edges (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.maps (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  from_node_id uuid not null references public.map_nodes (id) on delete cascade,
  to_node_id uuid not null references public.map_nodes (id) on delete cascade,
  label text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (from_node_id, to_node_id),
  check (from_node_id <> to_node_id)
);
create index map_edges_project_idx on public.map_edges (project_id);

create table public.matrix_scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  idea_node_id uuid not null references public.map_nodes (id) on delete cascade,
  criterion text not null check (criterion in ('value_to_user', 'feasibility', 'time', 'cost', 'accessibility', 'accuracy', 'risk')),
  score int not null check (score between 1 and 5),
  updated_by uuid not null references public.profiles (id),
  updated_at timestamptz not null default now(),
  unique (idea_node_id, criterion)
);
create index matrix_scores_project_idx on public.matrix_scores (project_id);

-- ---------------------------------------------------------------------------
-- Decisions
-- ---------------------------------------------------------------------------
create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  proposed_by uuid not null references public.profiles (id),
  title text not null,
  description text not null default '',
  status text not null default 'proposed' check (status in ('proposed', 'under_discussion', 'accepted', 'modified', 'rejected')),
  rationale text not null default '',
  evidence_reference text not null default '',
  spec_field text check (spec_field in (
    'problem_statement', 'primary_user', 'desired_outcome', 'selected_solution',
    'success_criteria', 'requirements', 'constraints', 'must_not_do')),
  spec_value text not null default '',
  resolved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index decisions_project_idx on public.decisions (project_id);

create table public.decision_responses (
  id uuid primary key default gen_random_uuid(),
  decision_id uuid not null references public.decisions (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  response_type text not null check (response_type in ('support', 'question', 'modify', 'reject')),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (decision_id, user_id)
);

-- ---------------------------------------------------------------------------
-- AI use
-- ---------------------------------------------------------------------------
create table public.ai_interactions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  stage text not null default '',
  tool_name text not null,
  task_description text not null,
  interaction_type text not null check (interaction_type in ('quick_clarification', 'moderate_analysis', 'substantial_work', 'major_rebuild')),
  credit_cost int not null check (credit_cost in (1, 3, 5, 10)),
  result_usefulness text check (result_usefulness in ('useful', 'partially_useful', 'not_useful')),
  disposition text check (disposition in ('accepted', 'modified', 'rejected')),
  verification_required boolean not null default false,
  verification_completed boolean not null default false,
  over_budget boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now()
);
create index ai_interactions_project_idx on public.ai_interactions (project_id);

create table public.ai_rejections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  none_rejected boolean not null default false,
  recommendation text not null default '',
  source_tool text not null default '',
  team_decision text not null default '',
  rationale text not null default '',
  justification text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check (
    (none_rejected and length(trim(justification)) > 0)
    or (not none_rejected and length(trim(recommendation)) > 0 and length(trim(rationale)) > 0)
  )
);

-- ---------------------------------------------------------------------------
-- Prototypes and tests
-- ---------------------------------------------------------------------------
create table public.prototype_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  version_number int not null,
  title text not null,
  description text not null default '',
  artifact_url text not null default '',
  artifact_type text not null check (artifact_type in (
    'url', 'uploaded_file', 'text_description', 'external_app', 'document', 'presentation', 'physical_prototype')),
  notes text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (project_id, version_number)
);

create table public.tests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  prototype_version_id uuid references public.prototype_versions (id) on delete set null,
  test_type text not null default 'user_test',
  test_description text not null,
  expected_result text not null default '',
  actual_result text not null default '',
  passed boolean,
  findings text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Alerts, huddles, messages
-- ---------------------------------------------------------------------------
create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  created_by uuid not null references public.profiles (id),
  alert_type text not null check (alert_type in (
    'evidence_problem', 'unsupported_assumption', 'usability_problem', 'technical_failure',
    'ai_concern', 'accessibility_issue', 'ethical_privacy_issue', 'team_decision_needed', 'general')),
  is_red_team_flag boolean not null default false,
  message text not null,
  status text not null default 'unresolved' check (status in ('unresolved', 'acknowledged', 'resolved')),
  status_changed_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz
);

create table public.huddles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  sprint_objective text not null default '',
  lock_workspace boolean not null default false,
  reason text not null default '',
  triggered_by uuid not null references public.profiles (id)
);

create table public.huddle_responses (
  id uuid primary key default gen_random_uuid(),
  huddle_id uuid not null references public.huddles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  learned text not null default '',
  recommendation text not null default '',
  uncertainty text not null default '',
  team_need text not null default '',
  created_at timestamptz not null default now(),
  unique (huddle_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Activity events (pilot analytics backbone)
-- ---------------------------------------------------------------------------
create table public.activity_events (
  id bigint generated always as identity primary key,
  project_id uuid not null references public.projects (id) on delete cascade,
  team_id uuid,
  lab_id uuid,
  user_id uuid references public.profiles (id),
  event_type text not null,
  stage text,
  related_entity_type text,
  related_entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activity_events_project_idx on public.activity_events (project_id, created_at desc);
create index activity_events_lab_idx on public.activity_events (lab_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Individual assessments (stored separately from team collaboration)
-- ---------------------------------------------------------------------------
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('baseline', 'post')),
  response text not null default '',
  ai_tool_used text not null default '',
  ai_interaction_count int not null default 0 check (ai_interaction_count >= 0),
  verification_performed text not null default '',
  confidence_rating int check (confidence_rating between 1 and 5),
  final_answer text not null default '',
  started_at timestamptz,
  submitted_at timestamptz not null default now(),
  unique (lab_id, user_id, kind)
);

create table public.reflections (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  changed_ai_use text not null default '',
  ai_most_useful text not null default '',
  ai_least_useful text not null default '',
  team_did_what_ai_could_not text not null default '',
  do_differently text not null default '',
  confidence_now int check (confidence_now between 1 and 5),
  submitted_at timestamptz not null default now(),
  unique (lab_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Return ticket and returning builder check-in
-- ---------------------------------------------------------------------------
create table public.return_tickets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  lab_id uuid not null references public.labs (id) on delete cascade,
  current_status text not null check (current_status in (
    'finished_for_now', 'needs_more_testing', 'needs_redesign', 'continue_building', 'prepare_for_launch')),
  what_works text not null default '',
  what_does_not_work text not null default '',
  what_we_learned text not null default '',
  next_build_objective text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.returning_checkins (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  lab_id uuid not null references public.labs (id) on delete cascade,
  what_changed text not null,
  still_works text not null,
  does_not_work text not null,
  next_objective text not null,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Cross-team analysis (after gallery)
-- ---------------------------------------------------------------------------
create table public.cross_team_responses (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  category text not null check (category in ('same', 'different', 'surprising', 'ai_effect', 'human_effect')),
  content text not null,
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);
