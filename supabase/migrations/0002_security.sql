-- AI Project Lab MVP v1.0
-- Migration 0002: access helpers and Row Level Security
-- Rule of the road: students see only their own team's project. Instructors see
-- every team in labs they created. Anything cross-team goes through
-- security-definer functions that check the gallery lock.

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies do not recurse)
-- ---------------------------------------------------------------------------
create or replace function public.is_instructor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'instructor');
$$;

create or replace function public.is_lab_instructor(p_lab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from labs where id = p_lab and created_by = auth.uid());
$$;

create or replace function public.is_lab_member(p_lab uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from lab_members where lab_id = p_lab and user_id = auth.uid());
$$;

create or replace function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = p_team and user_id = auth.uid());
$$;

create or replace function public.team_lab(p_team uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select lab_id from teams where id = p_team;
$$;

create or replace function public.can_access_team(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_team_member(p_team) or public.is_lab_instructor(public.team_lab(p_team));
$$;

create or replace function public.can_access_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    join teams t on t.id = p.team_id
    where p.id = p_project
      and (
        exists (select 1 from team_members tm where tm.team_id = p.team_id and tm.user_id = auth.uid())
        or exists (select 1 from labs l where l.id = t.lab_id and l.created_by = auth.uid())
      )
  );
$$;

create or replace function public.is_project_instructor(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from projects p
    join teams t on t.id = p.team_id
    join labs l on l.id = t.lab_id
    where p.id = p_project and l.created_by = auth.uid()
  );
$$;

create or replace function public.can_see_profile(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_user = auth.uid()
    or exists (
      select 1 from team_members a join team_members b on a.team_id = b.team_id
      where a.user_id = auth.uid() and b.user_id = p_user)
    or exists (
      select 1 from lab_members m join labs l on l.id = m.lab_id
      where m.user_id = p_user and l.created_by = auth.uid())
    or exists (select 1 from labs l where l.created_by = p_user and public.is_lab_member(l.id));
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.labs enable row level security;
alter table public.lab_members enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.role_history enable row level security;
alter table public.projects enable row level security;
alter table public.project_labs enable row level security;
alter table public.gate_overrides enable row level security;
alter table public.maps enable row level security;
alter table public.map_nodes enable row level security;
alter table public.map_edges enable row level security;
alter table public.matrix_scores enable row level security;
alter table public.decisions enable row level security;
alter table public.decision_responses enable row level security;
alter table public.ai_interactions enable row level security;
alter table public.ai_rejections enable row level security;
alter table public.prototype_versions enable row level security;
alter table public.tests enable row level security;
alter table public.alerts enable row level security;
alter table public.huddles enable row level security;
alter table public.huddle_responses enable row level security;
alter table public.messages enable row level security;
alter table public.activity_events enable row level security;
alter table public.assessments enable row level security;
alter table public.reflections enable row level security;
alter table public.return_tickets enable row level security;
alter table public.returning_checkins enable row level security;
alter table public.cross_team_responses enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (public.can_see_profile(id));
-- Display name only; role changes are done by the project owner in SQL.
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Labs and lab membership
-- ---------------------------------------------------------------------------
create policy labs_select on public.labs for select to authenticated
  using (created_by = auth.uid() or public.is_lab_member(id));
create policy labs_insert on public.labs for insert to authenticated
  with check (created_by = auth.uid() and public.is_instructor());
create policy labs_update on public.labs for update to authenticated
  using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy labs_delete on public.labs for delete to authenticated
  using (created_by = auth.uid() and status = 'draft');

create policy lab_members_select on public.lab_members for select to authenticated
  using (user_id = auth.uid() or public.is_lab_instructor(lab_id));
create policy lab_members_delete on public.lab_members for delete to authenticated
  using (public.is_lab_instructor(lab_id));
-- Students join through join_lab(); no direct insert policy.

-- ---------------------------------------------------------------------------
-- Teams, membership, role history
-- ---------------------------------------------------------------------------
create policy teams_select on public.teams for select to authenticated
  using (public.can_access_team(id));
create policy teams_insert on public.teams for insert to authenticated
  with check (public.is_lab_instructor(lab_id));
create policy teams_update on public.teams for update to authenticated
  using (public.is_lab_instructor(lab_id)) with check (public.is_lab_instructor(lab_id));

create policy team_members_select on public.team_members for select to authenticated
  using (public.can_access_team(team_id));
create policy team_members_write on public.team_members for all to authenticated
  using (public.is_lab_instructor(public.team_lab(team_id)))
  with check (public.is_lab_instructor(public.team_lab(team_id)));

create policy role_history_select on public.role_history for select to authenticated
  using (public.can_access_team(team_id));

-- ---------------------------------------------------------------------------
-- Projects (writes only through update_project_fields / stage RPCs)
-- ---------------------------------------------------------------------------
create policy projects_select on public.projects for select to authenticated
  using (public.can_access_project(id));

create policy project_labs_select on public.project_labs for select to authenticated
  using (public.can_access_project(project_id));

create policy gate_overrides_select on public.gate_overrides for select to authenticated
  using (public.can_access_project(project_id));

-- ---------------------------------------------------------------------------
-- Generic project-scoped tables
-- ---------------------------------------------------------------------------
create policy maps_select on public.maps for select to authenticated
  using (public.can_access_project(project_id));
create policy maps_update on public.maps for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

create policy map_nodes_select on public.map_nodes for select to authenticated
  using (public.can_access_project(project_id));
create policy map_nodes_insert on public.map_nodes for insert to authenticated
  with check (public.can_access_project(project_id) and author_id = auth.uid());
create policy map_nodes_update on public.map_nodes for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));
create policy map_nodes_delete on public.map_nodes for delete to authenticated
  using (public.can_access_project(project_id));

create policy map_edges_select on public.map_edges for select to authenticated
  using (public.can_access_project(project_id));
create policy map_edges_insert on public.map_edges for insert to authenticated
  with check (public.can_access_project(project_id) and created_by = auth.uid());
create policy map_edges_delete on public.map_edges for delete to authenticated
  using (public.can_access_project(project_id));

create policy matrix_scores_select on public.matrix_scores for select to authenticated
  using (public.can_access_project(project_id));
create policy matrix_scores_insert on public.matrix_scores for insert to authenticated
  with check (public.can_access_project(project_id) and updated_by = auth.uid());
create policy matrix_scores_update on public.matrix_scores for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id) and updated_by = auth.uid());

create policy decisions_select on public.decisions for select to authenticated
  using (public.can_access_project(project_id));
create policy decisions_insert on public.decisions for insert to authenticated
  with check (public.can_access_project(project_id) and proposed_by = auth.uid());
create policy decisions_update on public.decisions for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

create policy decision_responses_select on public.decision_responses for select to authenticated
  using (public.can_access_project(project_id));
create policy decision_responses_insert on public.decision_responses for insert to authenticated
  with check (public.can_access_project(project_id) and user_id = auth.uid());
create policy decision_responses_update on public.decision_responses for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy ai_interactions_select on public.ai_interactions for select to authenticated
  using (public.can_access_project(project_id));
create policy ai_interactions_insert on public.ai_interactions for insert to authenticated
  with check (public.can_access_project(project_id) and user_id = auth.uid());
create policy ai_interactions_update on public.ai_interactions for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

create policy ai_rejections_select on public.ai_rejections for select to authenticated
  using (public.can_access_project(project_id));
create policy ai_rejections_insert on public.ai_rejections for insert to authenticated
  with check (public.can_access_project(project_id) and created_by = auth.uid());

create policy prototype_versions_select on public.prototype_versions for select to authenticated
  using (public.can_access_project(project_id));
create policy prototype_versions_insert on public.prototype_versions for insert to authenticated
  with check (public.can_access_project(project_id) and created_by = auth.uid());
create policy prototype_versions_update on public.prototype_versions for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

create policy tests_select on public.tests for select to authenticated
  using (public.can_access_project(project_id));
create policy tests_insert on public.tests for insert to authenticated
  with check (public.can_access_project(project_id) and created_by = auth.uid());
create policy tests_update on public.tests for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

create policy alerts_select on public.alerts for select to authenticated
  using (public.can_access_project(project_id));
create policy alerts_insert on public.alerts for insert to authenticated
  with check (public.can_access_project(project_id) and created_by = auth.uid());
create policy alerts_update on public.alerts for update to authenticated
  using (public.can_access_project(project_id)) with check (public.can_access_project(project_id));

create policy huddles_select on public.huddles for select to authenticated
  using (public.can_access_project(project_id));

create policy huddle_responses_select on public.huddle_responses for select to authenticated
  using (public.can_access_project(project_id));
create policy huddle_responses_insert on public.huddle_responses for insert to authenticated
  with check (public.can_access_project(project_id) and user_id = auth.uid());
create policy huddle_responses_update on public.huddle_responses for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy activity_events_select on public.activity_events for select to authenticated
  using (public.can_access_project(project_id));

create policy return_tickets_select on public.return_tickets for select to authenticated
  using (public.can_access_project(project_id));
create policy return_tickets_insert on public.return_tickets for insert to authenticated
  with check (public.can_access_project(project_id) and created_by = auth.uid());

create policy returning_checkins_select on public.returning_checkins for select to authenticated
  using (public.can_access_project(project_id));
create policy returning_checkins_insert on public.returning_checkins for insert to authenticated
  with check (public.can_access_project(project_id) and created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- Messages
-- ---------------------------------------------------------------------------
create policy messages_select on public.messages for select to authenticated
  using (
    public.is_lab_instructor(lab_id)
    or (team_id is null and public.is_lab_member(lab_id))
    or (team_id is not null and public.is_team_member(team_id))
  );
create policy messages_insert on public.messages for insert to authenticated
  with check (public.is_lab_instructor(lab_id) and author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Individual work
-- ---------------------------------------------------------------------------
create policy assessments_select on public.assessments for select to authenticated
  using (user_id = auth.uid() or public.is_lab_instructor(lab_id));
create policy assessments_insert on public.assessments for insert to authenticated
  with check (user_id = auth.uid() and public.is_lab_member(lab_id));
create policy assessments_update on public.assessments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy reflections_select on public.reflections for select to authenticated
  using (user_id = auth.uid() or public.is_lab_instructor(lab_id));
create policy reflections_insert on public.reflections for insert to authenticated
  with check (user_id = auth.uid() and public.is_lab_member(lab_id));
create policy reflections_update on public.reflections for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Cross-team analysis (only once the instructor opens it)
-- ---------------------------------------------------------------------------
create policy cross_team_select on public.cross_team_responses for select to authenticated
  using (
    public.is_lab_instructor(lab_id)
    or (public.is_lab_member(lab_id) and exists (select 1 from labs where id = lab_id and cross_team_unlocked))
  );
create policy cross_team_insert on public.cross_team_responses for insert to authenticated
  with check (
    author_id = auth.uid()
    and (
      public.is_lab_instructor(lab_id)
      or (public.is_lab_member(lab_id) and exists (select 1 from labs where id = lab_id and cross_team_unlocked))
    )
  );

-- ---------------------------------------------------------------------------
-- Grants. RLS decides row access; anon gets nothing.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
