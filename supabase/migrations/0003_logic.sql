-- AI Project Lab MVP v1.0
-- Migration 0003: triggers, stage gates, and team RPCs
-- Every threshold that the pilot may want to tune lives in lab_config() so it
-- can be changed in one place.

-- ---------------------------------------------------------------------------
-- Tunable constants (hardcoded defaults are acceptable for MVP)
-- ---------------------------------------------------------------------------
create or replace function public.lab_config() returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'credit_costs', jsonb_build_object('quick_clarification', 1, 'moderate_analysis', 3, 'substantial_work', 5, 'major_rebuild', 10),
    'credit_reminder_at', 50,
    'credit_low_at', 25,
    'inactivity_minutes', 20,
    'alert_unresolved_minutes', 15,
    'ai_heavy_window_minutes', 20,
    'ai_heavy_min_interactions', 3,
    'active_member_minutes', 5,
    'stage_expected_minutes', jsonb_build_object(
      'DEFINE', 45, 'EXPLORE', 45, 'DECIDE', 40, 'BUILD', 75, 'TEST', 40, 'IMPROVE', 40, 'SHOW', 30,
      'REASSESS', 20, 'REDESIGN', 30),
    'stage_delay_red_multiplier', 2.0
  );
$$;

create or replace function public.stage_order(p_flow text) returns text[]
language sql immutable as $$
  select case when p_flow = 'returning'
    then array['REASSESS', 'TEST', 'REDESIGN', 'BUILD', 'SHOW']
    else array['DEFINE', 'EXPLORE', 'DECIDE', 'BUILD', 'TEST', 'IMPROVE', 'SHOW']
  end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles: created automatically for every new auth user
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Student'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Students may only change their display name, never their role.
create or replace function public.protect_profile_role() returns trigger
language plpgsql as $$
begin
  if new.role <> old.role and current_user = 'authenticated' then
    raise exception 'Role changes are not allowed from the app';
  end if;
  return new;
end;
$$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ---------------------------------------------------------------------------
-- Activity event writer (used by triggers and RPCs)
-- ---------------------------------------------------------------------------
create or replace function public.log_event(
  p_project uuid, p_user uuid, p_type text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid; v_lab uuid; v_stage text;
begin
  select p.team_id, t.lab_id, p.current_stage into v_team, v_lab, v_stage
  from projects p join teams t on t.id = p.team_id where p.id = p_project;
  insert into activity_events (project_id, team_id, lab_id, user_id, event_type, stage, related_entity_type, related_entity_id, metadata)
  values (p_project, v_team, v_lab, p_user, p_type, v_stage, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
end;
$$;
revoke execute on function public.log_event(uuid, uuid, text, text, uuid, jsonb) from public, authenticated;

-- ---------------------------------------------------------------------------
-- Team creation automatically creates the persistent project and its maps
-- ---------------------------------------------------------------------------
create or replace function public.create_project_for_team() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
begin
  -- A team created by import_returning_project already has a project attached.
  if current_setting('app.skip_project_create', true) = 'on' then
    return new;
  end if;
  insert into projects (team_id, lab_id, title) values (new.id, new.lab_id, new.name || ' Project')
  returning id into v_project;
  insert into project_labs (project_id, lab_id, team_id) values (v_project, new.lab_id, new.id);
  insert into maps (project_id, map_type, stage)
  select v_project, m.map_type, m.stage from (values
    ('problem_map', 'DEFINE'), ('stakeholder_map', 'DEFINE'), ('evidence_map', 'EXPLORE'),
    ('assumption_map', 'EXPLORE'), ('idea_map', 'DECIDE'), ('decision_matrix', 'DECIDE'),
    ('workflow_map', 'BUILD'), ('human_ai_map', 'BUILD'), ('failure_map', 'TEST'), ('version_map', 'IMPROVE')
  ) as m(map_type, stage);
  return new;
end;
$$;
create trigger teams_create_project after insert on public.teams
  for each row execute function public.create_project_for_team();

-- ---------------------------------------------------------------------------
-- Map nodes and edges: keep project_id honest, stamp edits, log events
-- ---------------------------------------------------------------------------
create or replace function public.map_nodes_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select project_id into new.project_id from maps where id = new.map_id;
  if new.project_id is null then
    raise exception 'Map not found';
  end if;
  if tg_op = 'UPDATE' then
    if new.map_id <> old.map_id then
      raise exception 'Cards cannot move between maps';
    end if;
    new.updated_at := now();
    new.updated_by := auth.uid();
  else
    new.updated_by := auth.uid();
  end if;
  if new.parent_node_id is not null and not exists (
    select 1 from map_nodes where id = new.parent_node_id and map_id = new.map_id) then
    raise exception 'Group must be on the same map';
  end if;
  return new;
end;
$$;
create trigger map_nodes_before_write before insert or update on public.map_nodes
  for each row execute function public.map_nodes_before();

create or replace function public.map_nodes_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_map_type text;
  v_type text;
begin
  if tg_op = 'DELETE' then
    select map_type into v_map_type from maps where id = old.map_id;
    if v_map_type is not null then
      perform log_event(old.project_id, auth.uid(), 'node_deleted', 'map_node', old.id,
        jsonb_build_object('map_type', v_map_type, 'category', old.category));
    end if;
    return old;
  end if;

  select map_type into v_map_type from maps where id = new.map_id;

  if tg_op = 'INSERT' then
    v_type := case v_map_type
      when 'evidence_map' then 'evidence_added'
      when 'assumption_map' then 'assumption_created'
      when 'idea_map' then 'idea_created'
      else 'node_created' end;
    update maps set status = 'in_progress' where id = new.map_id and status = 'not_started';
    perform log_event(new.project_id, auth.uid(), v_type, 'map_node', new.id,
      jsonb_build_object('map_type', v_map_type, 'category', new.category));
  else
    if new.content is distinct from old.content or new.category is distinct from old.category
       or new.status is distinct from old.status or new.metadata is distinct from old.metadata
       or new.parent_node_id is distinct from old.parent_node_id then
      v_type := case
        when new.status = 'in_matrix' and old.status <> 'in_matrix' then 'idea_moved_to_matrix'
        when new.status = 'archived' and old.status <> 'archived' then 'node_archived'
        else 'node_updated' end;
      perform log_event(new.project_id, auth.uid(), v_type, 'map_node', new.id,
        jsonb_build_object('map_type', v_map_type, 'category', new.category, 'from_category', old.category));
    elsif new.x_position is distinct from old.x_position or new.y_position is distinct from old.y_position then
      perform log_event(new.project_id, auth.uid(), 'node_moved', 'map_node', new.id,
        jsonb_build_object('map_type', v_map_type));
    end if;
  end if;
  return new;
end;
$$;
create trigger map_nodes_after_write after insert or update or delete on public.map_nodes
  for each row execute function public.map_nodes_after();

create or replace function public.map_edges_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select project_id into new.project_id from maps where id = new.map_id;
  if not exists (select 1 from map_nodes where id = new.from_node_id and map_id = new.map_id)
     or not exists (select 1 from map_nodes where id = new.to_node_id and map_id = new.map_id) then
    raise exception 'Both cards must be on the same map';
  end if;
  return new;
end;
$$;
create trigger map_edges_before_insert before insert on public.map_edges
  for each row execute function public.map_edges_before();

create or replace function public.map_edges_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event(new.project_id, auth.uid(), 'nodes_connected', 'map_edge', new.id, '{}'::jsonb);
    return new;
  end if;
  perform log_event(old.project_id, auth.uid(), 'nodes_disconnected', 'map_edge', old.id, '{}'::jsonb);
  return old;
end;
$$;
create trigger map_edges_after_write after insert or delete on public.map_edges
  for each row execute function public.map_edges_after();

create or replace function public.matrix_scores_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select project_id into new.project_id from map_nodes where id = new.idea_node_id;
  new.updated_at := now();
  return new;
end;
$$;
create trigger matrix_scores_before_write before insert or update on public.matrix_scores
  for each row execute function public.matrix_scores_before();

-- ---------------------------------------------------------------------------
-- Completion rules for each map
-- ---------------------------------------------------------------------------
create or replace function public.has_override(p_project uuid, p_key text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from gate_overrides where project_id = p_project and gate_key = p_key);
$$;

create or replace function public.map_requirements(p_map uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  m maps%rowtype;
  items jsonb := '[]'::jsonb;
  function_count int;
  cat_counts jsonb;
  v_in_matrix int;
  v_unscored int;
begin
  select * into m from maps where id = p_map;
  if not found then return '[]'::jsonb; end if;

  select coalesce(jsonb_object_agg(category, n), '{}'::jsonb) into cat_counts
  from (
    select category, count(*) n from map_nodes
    where map_id = p_map and status <> 'archived' and node_type <> 'group' and length(trim(content)) > 0
    group by category
  ) c;

  select count(*) into function_count from map_nodes
  where map_id = p_map and status <> 'archived' and node_type <> 'group' and length(trim(content)) > 0;

  case m.map_type
    when 'problem_map' then
      items := jsonb_build_array(
        jsonb_build_object('key', 'problem', 'label', 'One problem statement', 'have', coalesce((cat_counts ->> 'problem')::int, 0), 'need', 1),
        jsonb_build_object('key', 'causes', 'label', 'Two causes', 'have', coalesce((cat_counts ->> 'causes')::int, 0), 'need', 2),
        jsonb_build_object('key', 'effects', 'label', 'Two effects', 'have', coalesce((cat_counts ->> 'effects')::int, 0), 'need', 2),
        jsonb_build_object('key', 'unknowns', 'label', 'One unknown', 'have', coalesce((cat_counts ->> 'unknowns')::int, 0), 'need', 1));
    when 'stakeholder_map' then
      items := jsonb_build_array(
        jsonb_build_object('key', 'primary_user', 'label', 'Primary user identified', 'have', coalesce((cat_counts ->> 'primary_user')::int, 0), 'need', 1));
    when 'assumption_map' then
      items := jsonb_build_array(
        jsonb_build_object('key', 'we_know', 'label', 'One card in WE KNOW', 'have', coalesce((cat_counts ->> 'we_know')::int, 0), 'need', 1),
        jsonb_build_object('key', 'we_think', 'label', 'One card in WE THINK', 'have', coalesce((cat_counts ->> 'we_think')::int, 0), 'need', 1),
        jsonb_build_object('key', 'we_must_verify', 'label', 'One card in WE MUST VERIFY', 'have', coalesce((cat_counts ->> 'we_must_verify')::int, 0), 'need', 1));
    when 'decision_matrix' then
      select count(*) into v_in_matrix from map_nodes n join maps mm on mm.id = n.map_id
      where mm.project_id = m.project_id and mm.map_type = 'idea_map' and n.status = 'in_matrix';
      select count(*) into v_unscored from map_nodes n join maps mm on mm.id = n.map_id
      where mm.project_id = m.project_id and mm.map_type = 'idea_map' and n.status = 'in_matrix'
        and (select count(*) from matrix_scores s where s.idea_node_id = n.id) < 7;
      items := jsonb_build_array(
        jsonb_build_object('key', 'three_concepts', 'label', 'Three solution concepts compared', 'have', v_in_matrix,
          'need', case when has_override(m.project_id, 'three_concepts') then least(v_in_matrix, 1) else 3 end),
        jsonb_build_object('key', 'all_scored', 'label', 'Every concept scored on every criterion', 'have',
          case when v_in_matrix > 0 and v_unscored = 0 then 1 else 0 end, 'need', 1));
    when 'version_map' then
      items := jsonb_build_array(
        jsonb_build_object('key', 'changes', 'label', 'One fully documented change (three encouraged)', 'have',
          (select count(*) from map_nodes where map_id = p_map and node_type = 'change'
             and length(trim(coalesce(metadata ->> 'what_happened', ''))) > 0
             and length(trim(coalesce(metadata ->> 'why', ''))) > 0
             and length(trim(coalesce(metadata ->> 'evidence', ''))) > 0
             and length(trim(coalesce(metadata ->> 'decision', ''))) > 0
             and length(trim(coalesce(metadata ->> 'change', ''))) > 0), 'need', 1));
    when 'human_ai_map' then
      items := jsonb_build_array(
        jsonb_build_object('key', 'tasks', 'label', 'Project tasks placed in HUMAN, AI, or HUMAN + AI', 'have', function_count, 'need', 3));
    else
      items := jsonb_build_array(
        jsonb_build_object('key', 'cards', 'label', 'At least one card', 'have', function_count, 'need', 1));
  end case;

  return (
    select coalesce(jsonb_agg(i || jsonb_build_object('met', (i ->> 'have')::int >= (i ->> 'need')::int)), '[]'::jsonb)
    from jsonb_array_elements(items) i
  );
end;
$$;

create or replace function public.map_minimum_met(p_map uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(bool_and((i ->> 'met')::boolean), false)
  from jsonb_array_elements(public.map_requirements(p_map)) i;
$$;

create or replace function public.maps_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_id <> old.project_id or new.map_type <> old.map_type then
    raise exception 'Map identity cannot change';
  end if;
  if new.status = 'complete' and old.status <> 'complete' then
    if not (map_minimum_met(new.id)
            or is_project_instructor(new.project_id)
            or has_override(new.project_id, 'map:' || new.map_type)) then
      raise exception 'This map does not meet its minimum requirements yet';
    end if;
    new.completed_at := now();
  elsif new.status <> 'complete' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger maps_before_update before update on public.maps
  for each row execute function public.maps_before_update();

create or replace function public.maps_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'complete' and old.status <> 'complete' then
    perform log_event(new.project_id, auth.uid(), 'map_completed', 'map', new.id, jsonb_build_object('map_type', new.map_type));
  elsif old.status = 'complete' and new.status <> 'complete' then
    perform log_event(new.project_id, auth.uid(), 'map_reopened', 'map', new.id, jsonb_build_object('map_type', new.map_type));
  end if;
  return new;
end;
$$;
create trigger maps_after_update after update on public.maps
  for each row execute function public.maps_after_update();

-- ---------------------------------------------------------------------------
-- Project specification and stage gates
-- ---------------------------------------------------------------------------
create or replace function public.map_status(p_project uuid, p_type text) returns text
language sql stable security definer set search_path = public as $$
  select status from maps where project_id = p_project and map_type = p_type;
$$;

create or replace function public.map_card_count(p_project uuid, p_type text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from map_nodes n join maps m on m.id = n.map_id
  where m.project_id = p_project and m.map_type = p_type and n.status <> 'archived' and n.node_type <> 'group';
$$;

create or replace function public.spec_checks(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p projects%rowtype;
  v_critical int;
  v_evidence int;
begin
  select * into p from projects where id = p_project;
  select count(*) into v_critical from map_nodes n join maps m on m.id = n.map_id
    where m.project_id = p_project and m.map_type = 'assumption_map' and n.status <> 'archived'
      and coalesce((n.metadata ->> 'critical')::boolean, false);
  select count(*) into v_evidence from map_nodes n join maps m on m.id = n.map_id
    where m.project_id = p_project and m.map_type = 'evidence_map' and n.status <> 'archived';
  return jsonb_build_array(
    jsonb_build_object('key', 'problem', 'label', 'Problem', 'met', length(trim(p.problem_statement)) > 0),
    jsonb_build_object('key', 'primary_user', 'label', 'Primary user', 'met', length(trim(p.primary_user)) > 0),
    jsonb_build_object('key', 'desired_outcome', 'label', 'Desired outcome', 'met', length(trim(p.desired_outcome)) > 0),
    jsonb_build_object('key', 'selected_solution', 'label', 'Selected solution', 'met', length(trim(p.selected_solution)) > 0),
    jsonb_build_object('key', 'requirements', 'label', 'Requirements', 'met', length(trim(p.requirements)) > 0),
    jsonb_build_object('key', 'constraints', 'label', 'Constraints', 'met', length(trim(p.constraints)) > 0),
    jsonb_build_object('key', 'success_criteria', 'label', 'Success criteria', 'met', length(trim(p.success_criteria)) > 0),
    jsonb_build_object('key', 'critical_assumptions', 'label', 'Critical assumptions', 'met', v_critical > 0),
    jsonb_build_object('key', 'relevant_evidence', 'label', 'Relevant evidence', 'met', v_evidence > 0),
    jsonb_build_object('key', 'must_not_do', 'label', 'Things the solution must not do', 'met', length(trim(p.must_not_do)) > 0)
  );
end;
$$;

create or replace function public.current_checkin_at(p_project uuid) returns timestamptz
language sql stable security definer set search_path = public as $$
  select max(c.created_at) from returning_checkins c join projects p on p.id = c.project_id
  where c.project_id = p_project and c.lab_id = p.lab_id;
$$;

-- Returns the checklist that must be met to leave the current stage.
create or replace function public.gate_status(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p projects%rowtype;
  items jsonb;
  v_next text;
  v_order text[];
  v_idx int;
  v_checkin timestamptz;
  v_idea_in_matrix int;
begin
  if not can_access_project(p_project) then
    raise exception 'Not allowed';
  end if;
  select * into p from projects where id = p_project;
  v_order := stage_order(p.flow);
  v_idx := array_position(v_order, p.current_stage);
  v_next := case when v_idx is null or v_idx >= array_length(v_order, 1) then null else v_order[v_idx + 1] end;
  v_checkin := current_checkin_at(p_project);

  if p.flow = 'standard' then
    case p.current_stage
      when 'DEFINE' then
        items := jsonb_build_array(
          jsonb_build_object('key', 'problem_map', 'label', 'Problem Map completed', 'met', map_status(p_project, 'problem_map') = 'complete'),
          jsonb_build_object('key', 'stakeholder_map', 'label', 'Stakeholder Map completed', 'met', map_status(p_project, 'stakeholder_map') = 'complete'),
          jsonb_build_object('key', 'success_criteria', 'label', 'Success criteria defined', 'met', length(trim(p.success_criteria)) > 0));
      when 'EXPLORE' then
        items := jsonb_build_array(
          jsonb_build_object('key', 'evidence_map', 'label', 'Evidence Map started', 'met', map_card_count(p_project, 'evidence_map') > 0),
          jsonb_build_object('key', 'assumption_map', 'label', 'Assumption Map completed', 'met', map_status(p_project, 'assumption_map') = 'complete'),
          jsonb_build_object('key', 'critical_unknown', 'label', 'At least one critical assumption flagged', 'met', exists (
            select 1 from map_nodes n join maps m on m.id = n.map_id
            where m.project_id = p_project and m.map_type = 'assumption_map' and n.status <> 'archived'
              and coalesce((n.metadata ->> 'critical')::boolean, false))));
      when 'DECIDE' then
        select count(*) into v_idea_in_matrix from map_nodes n join maps m on m.id = n.map_id
          where m.project_id = p_project and m.map_type = 'idea_map' and n.status = 'in_matrix';
        items := jsonb_build_array(
          jsonb_build_object('key', 'three_concepts', 'label', 'At least three solution concepts compared', 'met',
            v_idea_in_matrix >= 3 or has_override(p_project, 'three_concepts'), 'overridable', true),
          jsonb_build_object('key', 'decision_matrix', 'label', 'Decision Matrix completed', 'met', map_status(p_project, 'decision_matrix') = 'complete'),
          jsonb_build_object('key', 'selected_solution', 'label', 'Team selected a solution', 'met', length(trim(p.selected_solution)) > 0),
          jsonb_build_object('key', 'project_spec', 'label', 'Project Specification completed', 'met',
            (select bool_and((i ->> 'met')::boolean) from jsonb_array_elements(spec_checks(p_project)) i)));
      when 'BUILD' then
        items := jsonb_build_array(
          jsonb_build_object('key', 'prototype_v1', 'label', 'Prototype V1 created', 'met', exists (select 1 from prototype_versions where project_id = p_project)),
          jsonb_build_object('key', 'human_ai_map', 'label', 'Human / AI Map completed', 'met', map_status(p_project, 'human_ai_map') = 'complete'),
          jsonb_build_object('key', 'workflow_map', 'label', 'Workflow Map started', 'met', map_card_count(p_project, 'workflow_map') > 0));
      when 'TEST' then
        items := jsonb_build_array(
          jsonb_build_object('key', 'failure_map', 'label', 'Failure Map completed', 'met', map_status(p_project, 'failure_map') = 'complete'),
          jsonb_build_object('key', 'test_performed', 'label', 'At least one test performed', 'met', exists (select 1 from tests where project_id = p_project)),
          jsonb_build_object('key', 'finding_recorded', 'label', 'At least one finding recorded', 'met', exists (
            select 1 from tests where project_id = p_project and length(trim(findings)) > 0)));
      when 'IMPROVE' then
        items := jsonb_build_array(
          jsonb_build_object('key', 'version_map', 'label', 'Version Map completed', 'met', map_status(p_project, 'version_map') = 'complete'),
          jsonb_build_object('key', 'prototype_v2', 'label', 'Prototype V2 or documented revision created', 'met',
            (select count(*) from prototype_versions where project_id = p_project) >= 2),
          jsonb_build_object('key', 'ai_rejection', 'label', 'AI modification or rejection reflection completed', 'met',
            exists (select 1 from ai_rejections where project_id = p_project)));
      else
        items := '[]'::jsonb;
    end case;
  else
    case p.current_stage
      when 'REASSESS' then
        items := jsonb_build_array(
          jsonb_build_object('key', 'checkin', 'label', 'Returning team check-in completed', 'met', v_checkin is not null));
      when 'TEST' then
        items := jsonb_build_array(
          jsonb_build_object('key', 'test_performed', 'label', 'At least one test this session with a finding', 'met', exists (
            select 1 from tests where project_id = p_project and created_at >= coalesce(v_checkin, p.stage_started_at)
              and length(trim(findings)) > 0)));
      when 'REDESIGN' then
        items := jsonb_build_array(
          jsonb_build_object('key', 'decision', 'label', 'At least one redesign decision accepted this session', 'met', exists (
            select 1 from decisions where project_id = p_project and status in ('accepted', 'modified')
              and resolved_at >= coalesce(v_checkin, p.stage_started_at))));
      when 'BUILD' then
        items := jsonb_build_array(
          jsonb_build_object('key', 'new_version', 'label', 'New prototype version created this session', 'met', exists (
            select 1 from prototype_versions where project_id = p_project and created_at >= coalesce(v_checkin, p.stage_started_at))));
      else
        items := '[]'::jsonb;
    end case;
  end if;

  return jsonb_build_object(
    'stage', p.current_stage,
    'next_stage', v_next,
    'flow', p.flow,
    'items', coalesce(items, '[]'::jsonb),
    'all_met', coalesce((select bool_and((i ->> 'met')::boolean) from jsonb_array_elements(coalesce(items, '[]'::jsonb)) i), true),
    'gate_override', has_override(p_project, 'gate:' || p.current_stage || ':' || p.lab_id::text)
  );
end;
$$;

create or replace function public.advance_stage(p_project uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  g jsonb;
  p projects%rowtype;
  v_instructor boolean;
  v_used_override boolean := false;
begin
  if not can_access_project(p_project) then
    raise exception 'Not allowed';
  end if;
  select * into p from projects where id = p_project for update;
  g := gate_status(p_project);
  v_instructor := is_project_instructor(p_project);

  if g ->> 'next_stage' is null then
    return jsonb_build_object('ok', false, 'reason', 'final_stage', 'gate', g);
  end if;
  if not (g ->> 'all_met')::boolean then
    if (g ->> 'gate_override')::boolean or v_instructor then
      v_used_override := true;
    else
      return jsonb_build_object('ok', false, 'reason', 'requirements_not_met', 'gate', g);
    end if;
  end if;

  update projects set current_stage = g ->> 'next_stage', stage_started_at = now(), updated_at = now()
  where id = p_project;
  update teams set current_stage = g ->> 'next_stage', status = case when status = 'forming' then 'active' else status end
  where id = p.team_id;
  perform log_event(p_project, auth.uid(), 'stage_advanced', 'project', p_project,
    jsonb_build_object('from', p.current_stage, 'to', g ->> 'next_stage', 'override', v_used_override,
      'minutes_in_stage', round(extract(epoch from (now() - p.stage_started_at)) / 60.0, 1)));
  return jsonb_build_object('ok', true, 'stage', g ->> 'next_stage');
end;
$$;

-- Instructor: jump a project to any stage (manual unlock).
create or replace function public.set_stage(p_project uuid, p_stage text) returns void
language plpgsql security definer set search_path = public as $$
declare
  p projects%rowtype;
begin
  if not is_project_instructor(p_project) then
    raise exception 'Instructor only';
  end if;
  select * into p from projects where id = p_project for update;
  if not (p_stage = any (stage_order(p.flow))) then
    raise exception 'Stage % is not part of this project flow', p_stage;
  end if;
  update projects set current_stage = p_stage, stage_started_at = now(), updated_at = now() where id = p_project;
  update teams set current_stage = p_stage where id = p.team_id;
  perform log_event(p_project, auth.uid(), 'stage_set_by_instructor', 'project', p_project,
    jsonb_build_object('from', p.current_stage, 'to', p_stage,
      'minutes_in_stage', round(extract(epoch from (now() - p.stage_started_at)) / 60.0, 1)));
end;
$$;

-- Instructor: approve an override. Keys: 'three_concepts', 'map:<map_type>',
-- or 'gate:<STAGE>:<lab_id>' to wave the whole current gate through.
create or replace function public.grant_override(p_project uuid, p_key text, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_project_instructor(p_project) then
    raise exception 'Instructor only';
  end if;
  insert into gate_overrides (project_id, gate_key, granted_by, note)
  values (p_project, p_key, auth.uid(), coalesce(p_note, ''))
  on conflict (project_id, gate_key) do nothing;
  perform log_event(p_project, auth.uid(), 'override_granted', 'project', p_project, jsonb_build_object('key', p_key));
end;
$$;

create or replace function public.revoke_override(p_project uuid, p_key text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_project_instructor(p_project) then
    raise exception 'Instructor only';
  end if;
  delete from gate_overrides where project_id = p_project and gate_key = p_key;
  perform log_event(p_project, auth.uid(), 'override_revoked', 'project', p_project, jsonb_build_object('key', p_key));
end;
$$;

-- ---------------------------------------------------------------------------
-- Project fields with optimistic locking
-- ---------------------------------------------------------------------------
create or replace function public.update_project_fields(p_project uuid, p_expected_version int, p_patch jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array['title', 'problem_statement', 'primary_user', 'desired_outcome', 'selected_solution',
    'success_criteria', 'requirements', 'constraints', 'must_not_do', 'current_sprint_objective'];
  k text;
  p projects%rowtype;
begin
  if not can_access_project(p_project) then
    raise exception 'Not allowed';
  end if;
  for k in select jsonb_object_keys(p_patch) loop
    if not (k = any (allowed)) then
      raise exception 'Field % cannot be edited here', k;
    end if;
  end loop;

  select * into p from projects where id = p_project for update;
  if p.row_version <> p_expected_version then
    return jsonb_build_object('ok', false, 'conflict', true, 'project', to_jsonb(p));
  end if;

  update projects set
    title = coalesce(p_patch ->> 'title', title),
    problem_statement = coalesce(p_patch ->> 'problem_statement', problem_statement),
    primary_user = coalesce(p_patch ->> 'primary_user', primary_user),
    desired_outcome = coalesce(p_patch ->> 'desired_outcome', desired_outcome),
    selected_solution = coalesce(p_patch ->> 'selected_solution', selected_solution),
    success_criteria = coalesce(p_patch ->> 'success_criteria', success_criteria),
    requirements = coalesce(p_patch ->> 'requirements', requirements),
    constraints = coalesce(p_patch ->> 'constraints', constraints),
    must_not_do = coalesce(p_patch ->> 'must_not_do', must_not_do),
    current_sprint_objective = coalesce(p_patch ->> 'current_sprint_objective', current_sprint_objective),
    row_version = row_version + 1,
    updated_by = auth.uid(),
    updated_at = now()
  where id = p_project
  returning * into p;

  if p_patch ? 'current_sprint_objective' then
    update teams set current_sprint_objective = p.current_sprint_objective where id = p.team_id;
  end if;

  perform log_event(p_project, auth.uid(), 'project_updated', 'project', p_project,
    jsonb_build_object('fields', (select jsonb_agg(x) from jsonb_object_keys(p_patch) x)));
  return jsonb_build_object('ok', true, 'project', to_jsonb(p));
end;
$$;

-- ---------------------------------------------------------------------------
-- Decisions
-- ---------------------------------------------------------------------------
create or replace function public.decisions_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.project_id <> old.project_id or new.proposed_by <> old.proposed_by then
    raise exception 'Decision identity cannot change';
  end if;
  if new.status <> old.status then
    if new.status in ('accepted', 'modified', 'rejected') then
      if length(trim(new.rationale)) = 0 then
        raise exception 'A rationale is required to resolve a decision';
      end if;
      new.resolved_at := now();
      new.resolved_by := auth.uid();
    else
      new.resolved_at := null;
      new.resolved_by := null;
    end if;
  end if;
  return new;
end;
$$;
create trigger decisions_before_update before update on public.decisions
  for each row execute function public.decisions_before_update();

create or replace function public.decisions_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event(new.project_id, auth.uid(), 'decision_proposed', 'decision', new.id,
      jsonb_build_object('spec_field', new.spec_field));
    return new;
  end if;
  if new.status <> old.status then
    perform log_event(new.project_id, auth.uid(), 'decision_' || new.status, 'decision', new.id,
      jsonb_build_object('spec_field', new.spec_field, 'from', old.status));
    -- Accepted (or accepted with modification) decisions write into the Project Specification.
    if new.status in ('accepted', 'modified') and new.spec_field is not null and length(trim(new.spec_value)) > 0 then
      execute format('update projects set %I = $1, row_version = row_version + 1, updated_at = now(), updated_by = $2 where id = $3',
        new.spec_field) using new.spec_value, auth.uid(), new.project_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger decisions_after_write after insert or update on public.decisions
  for each row execute function public.decisions_after_write();

create or replace function public.decision_responses_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select project_id into new.project_id from decisions where id = new.decision_id;
  new.updated_at := now();
  return new;
end;
$$;
create trigger decision_responses_before before insert or update on public.decision_responses
  for each row execute function public.decision_responses_before();

create or replace function public.decision_responses_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update decisions set status = 'under_discussion' where id = new.decision_id and status = 'proposed';
  perform log_event(new.project_id, auth.uid(), 'decision_response', 'decision', new.decision_id,
    jsonb_build_object('response', new.response_type));
  return new;
end;
$$;
create trigger decision_responses_after after insert or update on public.decision_responses
  for each row execute function public.decision_responses_after();

-- ---------------------------------------------------------------------------
-- AI interactions and the credit budget
-- ---------------------------------------------------------------------------
create or replace function public.ai_interactions_before() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_remaining int;
begin
  if tg_op = 'INSERT' then
    new.credit_cost := (lab_config() -> 'credit_costs' ->> new.interaction_type)::int;
    select t.ai_credit_remaining, p.current_stage into v_remaining, new.stage
    from projects p join teams t on t.id = p.team_id where p.id = new.project_id for update of t;
    new.over_budget := v_remaining - new.credit_cost < 0;
  else
    if new.credit_cost <> old.credit_cost or new.interaction_type <> old.interaction_type
       or new.project_id <> old.project_id or new.user_id <> old.user_id or new.over_budget <> old.over_budget then
      raise exception 'Cost and author of a logged AI interaction cannot change';
    end if;
  end if;
  return new;
end;
$$;
create trigger ai_interactions_before before insert or update on public.ai_interactions
  for each row execute function public.ai_interactions_before();

create or replace function public.ai_interactions_after() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_remaining int;
begin
  if tg_op = 'INSERT' then
    update teams t set ai_credit_remaining = t.ai_credit_remaining - new.credit_cost
    from projects p where p.id = new.project_id and t.id = p.team_id
    returning t.ai_credit_remaining into v_remaining;
    perform log_event(new.project_id, new.user_id, 'ai_interaction_logged', 'ai_interaction', new.id,
      jsonb_build_object('cost', new.credit_cost, 'remaining', v_remaining, 'over_budget', new.over_budget,
        'tool', new.tool_name, 'type', new.interaction_type, 'disposition', new.disposition,
        'verification_required', new.verification_required));
  elsif new.verification_completed and not old.verification_completed then
    perform log_event(new.project_id, auth.uid(), 'ai_output_verified', 'ai_interaction', new.id, '{}'::jsonb);
  elsif new.disposition is distinct from old.disposition then
    perform log_event(new.project_id, auth.uid(), 'ai_disposition_changed', 'ai_interaction', new.id,
      jsonb_build_object('disposition', new.disposition));
  end if;
  return new;
end;
$$;
create trigger ai_interactions_after after insert or update on public.ai_interactions
  for each row execute function public.ai_interactions_after();

create or replace function public.ai_rejections_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_event(new.project_id, new.created_by, 'ai_rejection_recorded', 'ai_rejection', new.id,
    jsonb_build_object('none_rejected', new.none_rejected));
  return new;
end;
$$;
create trigger ai_rejections_after after insert on public.ai_rejections
  for each row execute function public.ai_rejections_after();

-- ---------------------------------------------------------------------------
-- Prototypes and tests
-- ---------------------------------------------------------------------------
create or replace function public.prototype_versions_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform 1 from projects where id = new.project_id for update;
    select coalesce(max(version_number), 0) + 1 into new.version_number
    from prototype_versions where project_id = new.project_id;
  elsif new.version_number <> old.version_number or new.project_id <> old.project_id then
    raise exception 'Version numbers cannot change';
  end if;
  return new;
end;
$$;
create trigger prototype_versions_before before insert or update on public.prototype_versions
  for each row execute function public.prototype_versions_before();

create or replace function public.prototype_versions_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update projects set current_version = new.version_number, updated_at = now() where id = new.project_id;
  perform log_event(new.project_id, new.created_by, 'prototype_version_created', 'prototype_version', new.id,
    jsonb_build_object('version', new.version_number, 'artifact_type', new.artifact_type));
  return new;
end;
$$;
create trigger prototype_versions_after after insert on public.prototype_versions
  for each row execute function public.prototype_versions_after();

create or replace function public.tests_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event(new.project_id, new.created_by, 'test_completed', 'test', new.id,
      jsonb_build_object('passed', new.passed, 'has_findings', length(trim(new.findings)) > 0));
  else
    perform log_event(new.project_id, auth.uid(), 'test_updated', 'test', new.id,
      jsonb_build_object('passed', new.passed, 'has_findings', length(trim(new.findings)) > 0));
  end if;
  return new;
end;
$$;
create trigger tests_after after insert or update on public.tests
  for each row execute function public.tests_after();

-- ---------------------------------------------------------------------------
-- Alerts
-- ---------------------------------------------------------------------------
create or replace function public.alerts_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.status := 'unresolved';
    -- Only the current Red Team member raises a red-team flag.
    new.is_red_team_flag := new.is_red_team_flag and exists (
      select 1 from team_members tm join projects p on p.team_id = tm.team_id
      where p.id = new.project_id and tm.user_id = auth.uid() and tm.team_role = 'red_team');
  else
    if new.project_id <> old.project_id or new.created_by <> old.created_by or new.message <> old.message then
      raise exception 'Only the alert status can change';
    end if;
    if new.status <> old.status then
      new.status_changed_by := auth.uid();
      if new.status = 'acknowledged' then new.acknowledged_at := now(); end if;
      if new.status = 'resolved' then new.resolved_at := now(); end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger alerts_before before insert or update on public.alerts
  for each row execute function public.alerts_before();

create or replace function public.alerts_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform log_event(new.project_id, new.created_by,
      case when new.is_red_team_flag then 'red_team_flag_raised' else 'alert_raised' end,
      'alert', new.id, jsonb_build_object('alert_type', new.alert_type));
  elsif new.status <> old.status then
    perform log_event(new.project_id, auth.uid(), 'alert_' || new.status, 'alert', new.id,
      jsonb_build_object('alert_type', new.alert_type,
        'minutes_open', round(extract(epoch from (now() - new.created_at)) / 60.0, 1)));
  end if;
  return new;
end;
$$;
create trigger alerts_after after insert or update on public.alerts
  for each row execute function public.alerts_after();

-- ---------------------------------------------------------------------------
-- Huddles
-- ---------------------------------------------------------------------------
create or replace function public.start_huddle(p_project uuid, p_reason text default '', p_lock boolean default false) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not can_access_project(p_project) then
    raise exception 'Not allowed';
  end if;
  select id into v_id from huddles where project_id = p_project and completed_at is null;
  if v_id is not null then
    return v_id;
  end if;
  insert into huddles (project_id, triggered_by, reason, lock_workspace)
  values (p_project, auth.uid(), coalesce(p_reason, ''), coalesce(p_lock, false) and is_project_instructor(p_project))
  returning id into v_id;
  perform log_event(p_project, auth.uid(), 'huddle_started', 'huddle', v_id,
    jsonb_build_object('by_instructor', is_project_instructor(p_project), 'reason', p_reason));
  return v_id;
end;
$$;

create or replace function public.start_huddle_for_lab(p_lab uuid, p_reason text default '', p_lock boolean default false) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  if not is_lab_instructor(p_lab) then
    raise exception 'Instructor only';
  end if;
  for r in select p.id from projects p join teams t on t.id = p.team_id where t.lab_id = p_lab loop
    perform start_huddle(r.id, p_reason, p_lock);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.complete_huddle(p_huddle uuid, p_objective text) returns void
language plpgsql security definer set search_path = public as $$
declare
  h huddles%rowtype;
  v_team uuid;
begin
  select * into h from huddles where id = p_huddle for update;
  if not found or not can_access_project(h.project_id) then
    raise exception 'Not allowed';
  end if;
  if h.completed_at is not null then
    return;
  end if;
  if length(trim(coalesce(p_objective, ''))) = 0 then
    raise exception 'Enter the next sprint objective';
  end if;
  update huddles set completed_at = now(), sprint_objective = trim(p_objective) where id = p_huddle;
  update projects set current_sprint_objective = trim(p_objective), row_version = row_version + 1, updated_at = now()
  where id = h.project_id returning team_id into v_team;
  update teams set current_sprint_objective = trim(p_objective) where id = v_team;
  perform log_event(h.project_id, auth.uid(), 'huddle_completed', 'huddle', p_huddle,
    jsonb_build_object('responses', (select count(*) from huddle_responses where huddle_id = p_huddle),
      'minutes', round(extract(epoch from (now() - h.started_at)) / 60.0, 1)));
end;
$$;

create or replace function public.huddle_responses_before() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select project_id into new.project_id from huddles where id = new.huddle_id;
  return new;
end;
$$;
create trigger huddle_responses_before before insert or update on public.huddle_responses
  for each row execute function public.huddle_responses_before();

-- ---------------------------------------------------------------------------
-- Return tickets and returning check-ins
-- ---------------------------------------------------------------------------
create or replace function public.return_tickets_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform log_event(new.project_id, new.created_by, 'return_ticket_created', 'return_ticket', new.id,
    jsonb_build_object('status', new.current_status));
  return new;
end;
$$;
create trigger return_tickets_after after insert on public.return_tickets
  for each row execute function public.return_tickets_after();

create or replace function public.returning_checkins_after() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update projects set current_sprint_objective = new.next_objective, row_version = row_version + 1 where id = new.project_id;
  update teams t set current_sprint_objective = new.next_objective from projects p where p.id = new.project_id and t.id = p.team_id;
  perform log_event(new.project_id, new.created_by, 'returning_checkin', 'returning_checkin', new.id, '{}'::jsonb);
  return new;
end;
$$;
create trigger returning_checkins_after after insert on public.returning_checkins
  for each row execute function public.returning_checkins_after();

-- ---------------------------------------------------------------------------
-- Joining, teams, roles
-- ---------------------------------------------------------------------------
create or replace function public.join_lab(p_code text, p_display_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_lab uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  select id into v_lab from labs where join_code = upper(trim(p_code)) and status in ('open', 'active');
  if v_lab is null then
    raise exception 'That lab code is not open. Check the code with your instructor.';
  end if;
  if length(trim(coalesce(p_display_name, ''))) > 0 then
    update profiles set display_name = left(trim(p_display_name), 60) where id = auth.uid();
  end if;
  insert into lab_members (lab_id, user_id) values (v_lab, auth.uid()) on conflict do nothing;
  return v_lab;
end;
$$;

create or replace function public.next_open_role(p_team uuid) returns text
language sql stable security definer set search_path = public as $$
  select r from unnest(array['architect', 'evidence_lead', 'builder', 'red_team']) with ordinality as x(r, o)
  where r not in (select team_role from team_members where team_id = p_team and team_role is not null)
  order by o limit 1;
$$;

create or replace function public.assign_member(p_team uuid, p_user uuid, p_role text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_lab uuid;
  v_role text;
begin
  select lab_id into v_lab from teams where id = p_team;
  if not is_lab_instructor(v_lab) then
    raise exception 'Instructor only';
  end if;
  if not exists (select 1 from lab_members where lab_id = v_lab and user_id = p_user) then
    raise exception 'Student has not joined this lab';
  end if;
  -- One team per student per lab.
  delete from team_members tm using teams t
  where tm.team_id = t.id and t.lab_id = v_lab and tm.user_id = p_user and tm.team_id <> p_team;
  update role_history rh set ended_at = now() from teams t
  where rh.team_id = t.id and t.lab_id = v_lab and rh.user_id = p_user and rh.team_id <> p_team and rh.ended_at is null;

  v_role := coalesce(p_role, next_open_role(p_team));
  insert into team_members (team_id, user_id, team_role) values (p_team, p_user, v_role)
  on conflict (team_id, user_id) do update set team_role = coalesce(excluded.team_role, team_members.team_role);
  if v_role is not null and not exists (
    select 1 from role_history where team_id = p_team and user_id = p_user and ended_at is null and role = v_role) then
    update role_history set ended_at = now() where team_id = p_team and user_id = p_user and ended_at is null;
    insert into role_history (team_id, user_id, role, assigned_by) values (p_team, p_user, v_role, auth.uid());
  end if;
end;
$$;

create or replace function public.set_member_role(p_team uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
begin
  if not is_lab_instructor(team_lab(p_team)) then
    raise exception 'Instructor only';
  end if;
  update team_members set team_role = p_role where team_id = p_team and user_id = p_user;
  update role_history set ended_at = now() where team_id = p_team and user_id = p_user and ended_at is null;
  insert into role_history (team_id, user_id, role, assigned_by) values (p_team, p_user, p_role, auth.uid());
  select id into v_project from projects where team_id = p_team;
  perform log_event(v_project, auth.uid(), 'role_assigned', 'team_member', null, jsonb_build_object('role', p_role));
end;
$$;

-- Fill teams in join order. Creates "Team 1", "Team 2" ... when no team has room.
create or replace function public.auto_assign_teams(p_lab uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_size int;
  r record;
  v_team uuid;
  v_n int := 0;
  v_count int;
begin
  if not is_lab_instructor(p_lab) then
    raise exception 'Instructor only';
  end if;
  select team_size into v_size from labs where id = p_lab;
  for r in
    select m.user_id from lab_members m
    where m.lab_id = p_lab
      and m.user_id <> (select created_by from labs where id = p_lab)
      and not exists (select 1 from team_members tm join teams t on t.id = tm.team_id where t.lab_id = p_lab and tm.user_id = m.user_id)
    order by m.joined_at
  loop
    select t.id into v_team from teams t
    where t.lab_id = p_lab and (select count(*) from team_members where team_id = t.id) < v_size
    order by t.created_at, t.name limit 1;
    if v_team is null then
      select count(*) into v_count from teams where lab_id = p_lab;
      insert into teams (lab_id, name) values (p_lab, 'Team ' || (v_count + 1)) returning id into v_team;
    end if;
    perform assign_member(v_team, r.user_id, null);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

-- Architect -> Evidence Lead -> Builder -> Red Team -> Architect
create or replace function public.rotate_roles(p_team uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_project uuid;
begin
  if not is_lab_instructor(team_lab(p_team)) then
    raise exception 'Instructor only';
  end if;
  update role_history set ended_at = now() where team_id = p_team and ended_at is null;
  update team_members set team_role = case team_role
    when 'architect' then 'evidence_lead'
    when 'evidence_lead' then 'builder'
    when 'builder' then 'red_team'
    when 'red_team' then 'architect'
    else team_role end
  where team_id = p_team;
  insert into role_history (team_id, user_id, role, assigned_by)
  select team_id, user_id, team_role, auth.uid() from team_members where team_id = p_team and team_role is not null;
  select id into v_project from projects where team_id = p_team;
  perform log_event(v_project, auth.uid(), 'role_rotated', 'team', p_team, '{}'::jsonb);
end;
$$;

create or replace function public.rotate_roles_for_lab(p_lab uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  if not is_lab_instructor(p_lab) then
    raise exception 'Instructor only';
  end if;
  for r in select id from teams where lab_id = p_lab loop
    perform rotate_roles(r.id);
  end loop;
end;
$$;

-- Presence heartbeat for "active members".
create or replace function public.heartbeat(p_team uuid) returns void
language sql security definer set search_path = public as $$
  update team_members set last_seen_at = now(), active_status = 'active'
  where team_id = p_team and user_id = auth.uid();
$$;

-- ---------------------------------------------------------------------------
-- Returning Builder Mode: attach an earlier project to a new lab
-- ---------------------------------------------------------------------------
create or replace function public.import_returning_project(p_project uuid, p_new_lab uuid, p_team_name text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_team uuid;
  p projects%rowtype;
  v_old_team uuid;
begin
  if not is_project_instructor(p_project) or not is_lab_instructor(p_new_lab) then
    raise exception 'Instructor only';
  end if;
  select * into p from projects where id = p_project for update;
  if p.lab_id = p_new_lab then
    raise exception 'This project already belongs to that lab';
  end if;
  v_old_team := p.team_id;

  perform set_config('app.skip_project_create', 'on', true);
  insert into teams (lab_id, name, status, current_stage, current_sprint_objective)
  values (p_new_lab, p_team_name, 'active', 'REASSESS', p.current_sprint_objective)
  returning id into v_team;
  perform set_config('app.skip_project_create', 'off', true);

  update projects set team_id = v_team, lab_id = p_new_lab, flow = 'returning', current_stage = 'REASSESS',
    stage_started_at = now(), updated_at = now()
  where id = p_project;
  insert into project_labs (project_id, lab_id, team_id) values (p_project, p_new_lab, v_team);

  -- Bring the same students along when they have joined the new lab.
  insert into team_members (team_id, user_id, team_role)
  select v_team, tm.user_id, tm.team_role from team_members tm
  where tm.team_id = v_old_team and exists (select 1 from lab_members m where m.lab_id = p_new_lab and m.user_id = tm.user_id)
  on conflict do nothing;

  perform log_event(p_project, auth.uid(), 'project_returned', 'project', p_project,
    jsonb_build_object('from_lab', p.lab_id, 'to_lab', p_new_lab));
  return v_team;
end;
$$;
