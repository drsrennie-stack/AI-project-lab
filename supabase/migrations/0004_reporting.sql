-- AI Project Lab MVP v1.0
-- Migration 0004: instructor dashboard, prototype gallery, pilot export
-- Indicators describe workflow state only. They never rate student quality.

-- ---------------------------------------------------------------------------
-- Live dashboard: one row per team
-- ---------------------------------------------------------------------------
create or replace function public.lab_dashboard(p_lab uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  cfg jsonb := lab_config();
  result jsonb := '[]'::jsonb;
  r record;
  v_last timestamptz;
  v_active int;
  v_members int;
  v_required int;
  v_required_done int;
  v_alerts int;
  v_old_alerts int;
  v_decisions int;
  v_ai_recent int;
  v_other_recent int;
  v_evidence int;
  v_verified int;
  v_ai_verified int;
  v_ai_needs_verify int;
  v_versions int;
  v_huddle record;
  v_expected numeric;
  v_minutes numeric;
  flags jsonb;
  v_indicator text;
  v_required_maps text[];
begin
  if not is_lab_instructor(p_lab) then
    raise exception 'Instructor only';
  end if;

  for r in
    select t.id as team_id, t.name, t.status as team_status, t.ai_credit_total, t.ai_credit_remaining,
           p.id as project_id, p.current_stage, p.stage_started_at, p.flow, p.current_version,
           p.current_sprint_objective
    from teams t join projects p on p.team_id = t.id
    where t.lab_id = p_lab
    order by t.name
  loop
    select max(created_at) into v_last from activity_events where project_id = r.project_id;
    select count(*) filter (where last_seen_at > now() - make_interval(mins => (cfg ->> 'active_member_minutes')::int)),
           count(*)
      into v_active, v_members
      from team_members where team_id = r.team_id;

    -- Maps required up to and including the current stage.
    v_required_maps := case r.current_stage
      when 'DEFINE' then array['problem_map', 'stakeholder_map']
      when 'EXPLORE' then array['problem_map', 'stakeholder_map', 'assumption_map']
      when 'DECIDE' then array['problem_map', 'stakeholder_map', 'assumption_map', 'decision_matrix']
      when 'BUILD' then array['problem_map', 'stakeholder_map', 'assumption_map', 'decision_matrix', 'human_ai_map']
      when 'TEST' then array['problem_map', 'stakeholder_map', 'assumption_map', 'decision_matrix', 'human_ai_map', 'failure_map']
      else array['problem_map', 'stakeholder_map', 'assumption_map', 'decision_matrix', 'human_ai_map', 'failure_map', 'version_map']
    end;
    select count(*), count(*) filter (where status = 'complete') into v_required, v_required_done
    from maps where project_id = r.project_id and map_type = any (v_required_maps);

    select count(*) filter (where status <> 'resolved'),
           count(*) filter (where status = 'unresolved' and created_at < now() - make_interval(mins => (cfg ->> 'alert_unresolved_minutes')::int))
      into v_alerts, v_old_alerts
      from alerts where project_id = r.project_id;

    select count(*) into v_decisions from decisions
    where project_id = r.project_id and status in ('proposed', 'under_discussion');

    select count(*) into v_ai_recent from ai_interactions
    where project_id = r.project_id and created_at > now() - make_interval(mins => (cfg ->> 'ai_heavy_window_minutes')::int);
    select count(*) into v_other_recent from activity_events
    where project_id = r.project_id and event_type not in ('ai_interaction_logged', 'node_moved')
      and created_at > now() - make_interval(mins => (cfg ->> 'ai_heavy_window_minutes')::int);

    select count(*),
           count(*) filter (where coalesce(n.metadata ->> 'verification_status', 'not_verified') in ('verified', 'contradicted'))
      into v_evidence, v_verified
      from map_nodes n join maps m on m.id = n.map_id
      where m.project_id = r.project_id and m.map_type = 'evidence_map' and n.status <> 'archived';
    select count(*) filter (where verification_required and not verification_completed),
           count(*) filter (where verification_completed)
      into v_ai_needs_verify, v_ai_verified
      from ai_interactions where project_id = r.project_id;

    select count(*) into v_versions from prototype_versions where project_id = r.project_id;
    select id, started_at, completed_at into v_huddle from huddles where project_id = r.project_id order by started_at desc limit 1;

    v_expected := coalesce((cfg -> 'stage_expected_minutes' ->> r.current_stage)::numeric, 45);
    v_minutes := extract(epoch from (now() - r.stage_started_at)) / 60.0;

    flags := '[]'::jsonb;
    -- A team that has not started yet is measured from when its current stage began.
    if coalesce(v_last, r.stage_started_at) < now() - make_interval(mins => (cfg ->> 'inactivity_minutes')::int) then
      flags := flags || jsonb_build_object('key', 'inactivity', 'label', 'No project activity for 20+ minutes', 'level', 'red');
    end if;
    if v_old_alerts > 0 then
      flags := flags || jsonb_build_object('key', 'unresolved_alert', 'label', 'Alert open 15+ minutes', 'level', 'yellow');
    end if;
    if v_ai_recent >= (cfg ->> 'ai_heavy_min_interactions')::int and v_other_recent < v_ai_recent then
      flags := flags || jsonb_build_object('key', 'ai_heavy_use', 'label', 'Several AI logs with little other team activity', 'level', 'yellow');
    end if;
    if (v_evidence >= 2 and v_verified = 0 and v_ai_verified = 0) or (v_ai_needs_verify >= 2 and v_ai_verified = 0) then
      flags := flags || jsonb_build_object('key', 'no_verification', 'label', 'Evidence or AI output not yet verified', 'level', 'yellow');
    end if;
    if r.ai_credit_remaining < (cfg ->> 'credit_low_at')::int then
      flags := flags || jsonb_build_object('key', 'low_credit', 'label',
        case when r.ai_credit_remaining <= 0 then 'Over AI budget' else 'Fewer than 25 AI credits' end, 'level', 'yellow');
    end if;
    if r.current_stage <> 'SHOW' and v_minutes > v_expected then
      flags := flags || jsonb_build_object('key', 'stage_delay', 'label',
        'In ' || r.current_stage || ' for ' || round(v_minutes) || ' min (planned ' || v_expected || ')',
        'level', case when v_minutes > v_expected * (cfg ->> 'stage_delay_red_multiplier')::numeric then 'red' else 'yellow' end);
    end if;

    v_indicator := case
      when exists (select 1 from jsonb_array_elements(flags) f where f ->> 'level' = 'red') then 'red'
      when jsonb_array_length(flags) > 0 then 'yellow'
      else 'green' end;

    result := result || jsonb_build_object(
      'team_id', r.team_id,
      'project_id', r.project_id,
      'team_name', r.name,
      'team_status', r.team_status,
      'flow', r.flow,
      'current_stage', r.current_stage,
      'minutes_in_stage', round(v_minutes),
      'credits_total', r.ai_credit_total,
      'credits_remaining', r.ai_credit_remaining,
      'members', v_members,
      'active_members', v_active,
      'last_activity', v_last,
      'required_maps', v_required,
      'required_maps_complete', v_required_done,
      'open_alerts', v_alerts,
      'open_decisions', v_decisions,
      'evidence_claims', v_evidence,
      'evidence_verified', v_verified,
      'ai_verification_pending', v_ai_needs_verify,
      'prototype_versions', v_versions,
      'huddle_open', v_huddle.id is not null and v_huddle.completed_at is null,
      'last_huddle_at', v_huddle.started_at,
      'sprint_objective', r.current_sprint_objective,
      'gate', gate_status(r.project_id),
      'flags', flags,
      'indicator', v_indicator
    );
  end loop;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Prototype Gallery. Students see it only after the instructor unlocks it.
-- ---------------------------------------------------------------------------
create or replace function public.lab_gallery(p_lab uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_unlocked boolean;
begin
  select gallery_unlocked into v_unlocked from labs where id = p_lab;
  if not (is_lab_instructor(p_lab) or (is_lab_member(p_lab) and coalesce(v_unlocked, false))) then
    raise exception 'The Prototype Gallery is not open yet';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(g) order by g.team_name)
    from (
      select
        t.id as team_id,
        t.name as team_name,
        p.problem_statement as problem_interpretation,
        p.selected_solution,
        (select pv.title from prototype_versions pv where pv.project_id = p.id order by pv.version_number desc limit 1) as prototype_title,
        (select pv.artifact_url from prototype_versions pv where pv.project_id = p.id order by pv.version_number desc limit 1) as prototype_link,
        (select pv.artifact_type from prototype_versions pv where pv.project_id = p.id order by pv.version_number desc limit 1) as prototype_type,
        (select pv.version_number from prototype_versions pv where pv.project_id = p.id order by pv.version_number desc limit 1) as prototype_version,
        (select n.content from map_nodes n join maps m on m.id = n.map_id
           where m.project_id = p.id and m.map_type = 'assumption_map' and n.status <> 'archived'
             and coalesce((n.metadata ->> 'critical')::boolean, false)
           order by n.created_at limit 1) as critical_assumption,
        (select te.findings from tests te where te.project_id = p.id and length(trim(te.findings)) > 0
           order by (te.passed is false) desc, te.created_at desc limit 1) as biggest_test_finding,
        (select n.metadata ->> 'change' from map_nodes n join maps m on m.id = n.map_id
           where m.project_id = p.id and m.map_type = 'version_map' and n.node_type = 'change'
           order by n.created_at desc limit 1) as major_revision,
        coalesce(
          (select rt.next_build_objective from return_tickets rt where rt.project_id = p.id order by rt.created_at desc limit 1),
          nullif(p.current_sprint_objective, '')) as next_step
      from teams t join projects p on p.team_id = t.id
      where t.lab_id = p_lab
    ) g
  ), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- De-identified pilot export
-- People are replaced by per-export codes (P01, P02 ...). Display names,
-- emails and auth ids never leave the database. Free-text answers are
-- included for analysis; review them for names before sharing.
-- ---------------------------------------------------------------------------
create or replace function public.export_pilot_data(p_lab uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  lab_row labs%rowtype;
begin
  if not is_lab_instructor(p_lab) then
    raise exception 'Instructor only';
  end if;
  select * into lab_row from labs where id = p_lab;

  return (
    with people as (
      select user_id, 'P' || lpad(row_number() over (order by joined_at, user_id)::text, 2, '0') as code
      from lab_members where lab_id = p_lab
    ),
    team_codes as (
      select t.id as team_id, 'T' || lpad(row_number() over (order by t.created_at, t.id)::text, 2, '0') as code
      from teams t where t.lab_id = p_lab
    ),
    lab_projects as (
      select p.*, tc.code as team_code from projects p join team_codes tc on tc.team_id = p.team_id
    ),
    stage_timing as (
      select project_id, jsonb_agg(jsonb_build_object(
        'from', metadata ->> 'from', 'to', metadata ->> 'to',
        'minutes_in_stage', (metadata ->> 'minutes_in_stage')::numeric,
        'override', coalesce((metadata ->> 'override')::boolean, false),
        'at', created_at) order by created_at) as timing
      from activity_events
      where lab_id = p_lab and event_type in ('stage_advanced', 'stage_set_by_instructor')
      group by project_id
    )
    select jsonb_build_object(
      'exported_at', now(),
      'lab', jsonb_build_object(
        'title', lab_row.title, 'date', lab_row.date, 'team_size', lab_row.team_size, 'status', lab_row.status,
        'curriculum_version', lab_row.curriculum_version, 'software_version', lab_row.software_version,
        'lab_version', lab_row.lab_version),
      'teams', coalesce((
        select jsonb_agg(jsonb_build_object(
          'lab_version', lab_row.lab_version,
          'curriculum_version', lab_row.curriculum_version,
          'software_version', lab_row.software_version,
          'team_id', lp.team_code,
          'flow', lp.flow,
          'final_stage', lp.current_stage,
          'stage_timing', coalesce((select timing from stage_timing st where st.project_id = lp.id), '[]'::jsonb),
          'maps_complete', (select count(*) from maps where project_id = lp.id and status = 'complete'),
          'map_completion', (select jsonb_object_agg(map_type, status) from maps where project_id = lp.id),
          'map_nodes', (select count(*) from map_nodes where project_id = lp.id),
          'decisions', (select count(*) from decisions where project_id = lp.id),
          'decisions_accepted', (select count(*) from decisions where project_id = lp.id and status in ('accepted', 'modified')),
          'assumptions', (select count(*) from map_nodes n join maps m on m.id = n.map_id where m.project_id = lp.id and m.map_type = 'assumption_map'),
          'critical_assumptions', (select count(*) from map_nodes n join maps m on m.id = n.map_id
             where m.project_id = lp.id and m.map_type = 'assumption_map' and coalesce((n.metadata ->> 'critical')::boolean, false)),
          'evidence_entries', (select count(*) from map_nodes n join maps m on m.id = n.map_id where m.project_id = lp.id and m.map_type = 'evidence_map'),
          'ai_interactions', (select count(*) from ai_interactions where project_id = lp.id),
          'credits_used', (select coalesce(sum(credit_cost), 0) from ai_interactions where project_id = lp.id),
          'ai_over_budget_logs', (select count(*) from ai_interactions where project_id = lp.id and over_budget),
          'ai_outputs_accepted', (select count(*) from ai_interactions where project_id = lp.id and disposition = 'accepted'),
          'ai_outputs_modified', (select count(*) from ai_interactions where project_id = lp.id and disposition = 'modified'),
          'ai_outputs_rejected', (select count(*) from ai_interactions where project_id = lp.id and disposition = 'rejected'),
          'verification_actions', (select count(*) from ai_interactions where project_id = lp.id and verification_completed)
             + (select count(*) from map_nodes n join maps m on m.id = n.map_id where m.project_id = lp.id and m.map_type = 'evidence_map'
                  and coalesce(n.metadata ->> 'verification_status', 'not_verified') in ('verified', 'contradicted')),
          'huddles', (select count(*) from huddles where project_id = lp.id),
          'alerts_raised', (select count(*) from alerts where project_id = lp.id),
          'red_team_flags', (select count(*) from alerts where project_id = lp.id and is_red_team_flag),
          'tests_conducted', (select count(*) from tests where project_id = lp.id),
          'prototype_versions', (select count(*) from prototype_versions where project_id = lp.id),
          'revisions_documented', (select count(*) from map_nodes n join maps m on m.id = n.map_id where m.project_id = lp.id and m.map_type = 'version_map' and n.node_type = 'change'),
          'ai_rejection_reflection', (select jsonb_agg(jsonb_build_object('none_rejected', none_rejected)) from ai_rejections where project_id = lp.id),
          'role_rotations', (select count(*) from activity_events where project_id = lp.id and event_type = 'role_rotated'),
          'completion_status', case when lp.current_stage = 'SHOW' then 'reached_show' else 'in_progress' end,
          'return_ticket_status', (select current_status from return_tickets where project_id = lp.id order by created_at desc limit 1)
        ) order by lp.team_code) from lab_projects lp), '[]'::jsonb),
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'team_id', lp.team_code,
          'person', pe.code,
          'event_type', e.event_type,
          'stage', e.stage,
          'entity_type', e.related_entity_type,
          'metadata', e.metadata - 'tool' - 'reason',
          'at', e.created_at) order by e.created_at)
        from activity_events e
        join lab_projects lp on lp.id = e.project_id
        left join people pe on pe.user_id = e.user_id
        where e.lab_id = p_lab), '[]'::jsonb),
      'ai_interactions', coalesce((
        select jsonb_agg(jsonb_build_object(
          'team_id', lp.team_code, 'person', pe.code, 'stage', a.stage, 'tool_name', a.tool_name,
          'interaction_type', a.interaction_type, 'credit_cost', a.credit_cost,
          'result_usefulness', a.result_usefulness, 'disposition', a.disposition,
          'verification_required', a.verification_required, 'verification_completed', a.verification_completed,
          'over_budget', a.over_budget, 'at', a.created_at) order by a.created_at)
        from ai_interactions a join lab_projects lp on lp.id = a.project_id
        left join people pe on pe.user_id = a.user_id), '[]'::jsonb),
      'assessments', coalesce((
        select jsonb_agg(jsonb_build_object(
          'person', pe.code, 'kind', s.kind, 'response', s.response, 'ai_tool_used', s.ai_tool_used,
          'ai_interaction_count', s.ai_interaction_count, 'verification_performed', s.verification_performed,
          'confidence_rating', s.confidence_rating, 'final_answer', s.final_answer,
          'minutes_to_submit', case when s.started_at is null then null
            else round(extract(epoch from (s.submitted_at - s.started_at)) / 60.0, 1) end) order by pe.code, s.kind)
        from assessments s join people pe on pe.user_id = s.user_id where s.lab_id = p_lab), '[]'::jsonb),
      'reflections', coalesce((
        select jsonb_agg(jsonb_build_object(
          'person', pe.code, 'changed_ai_use', r.changed_ai_use, 'ai_most_useful', r.ai_most_useful,
          'ai_least_useful', r.ai_least_useful, 'team_did_what_ai_could_not', r.team_did_what_ai_could_not,
          'do_differently', r.do_differently, 'confidence_now', r.confidence_now) order by pe.code)
        from reflections r join people pe on pe.user_id = r.user_id where r.lab_id = p_lab), '[]'::jsonb),
      'cross_team', coalesce((
        select jsonb_agg(jsonb_build_object('category', c.category, 'content', c.content,
          'team_id', (select code from team_codes tc where tc.team_id = c.team_id)) order by c.created_at)
        from cross_team_responses c where c.lab_id = p_lab), '[]'::jsonb)
    )
  );
end;
$$;

-- Lab roster for the instructor (names stay inside the app, never in exports).
create or replace function public.lab_roster(p_lab uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_lab_instructor(p_lab) then
    raise exception 'Instructor only';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'user_id', m.user_id,
      'display_name', pr.display_name,
      'joined_at', m.joined_at,
      'team_id', tm.team_id,
      'team_role', tm.team_role,
      'last_seen_at', tm.last_seen_at,
      'baseline_done', exists (select 1 from assessments a where a.lab_id = p_lab and a.user_id = m.user_id and a.kind = 'baseline'),
      'post_done', exists (select 1 from assessments a where a.lab_id = p_lab and a.user_id = m.user_id and a.kind = 'post'),
      'reflection_done', exists (select 1 from reflections r where r.lab_id = p_lab and r.user_id = m.user_id)
    ) order by m.joined_at)
    from lab_members m
    join profiles pr on pr.id = m.user_id
    left join lateral (
      select tm.team_id, tm.team_role, tm.last_seen_at from team_members tm join teams t on t.id = tm.team_id
      where t.lab_id = p_lab and tm.user_id = m.user_id limit 1
    ) tm on true
    where m.lab_id = p_lab and m.user_id <> (select created_by from labs where id = p_lab)
  ), '[]'::jsonb);
end;
$$;

-- Student view: my team in this lab (or null while waiting for assignment).
create or replace function public.my_team(p_lab uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('team_id', t.id, 'team_name', t.name, 'project_id', p.id, 'team_role', tm.team_role)
  from team_members tm join teams t on t.id = tm.team_id join projects p on p.team_id = t.id
  where t.lab_id = p_lab and tm.user_id = auth.uid()
  limit 1;
$$;

-- Returning Builder Mode: last session summary for a project.
create or replace function public.last_session_summary(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  p projects%rowtype;
  v_prev_lab uuid;
begin
  if not can_access_project(p_project) then
    raise exception 'Not allowed';
  end if;
  select * into p from projects where id = p_project;
  select lab_id into v_prev_lab from project_labs where project_id = p_project and lab_id <> p.lab_id
    order by started_at desc limit 1;
  return jsonb_build_object(
    'previous_lab_title', (select title from labs where id = v_prev_lab),
    'return_ticket', (select to_jsonb(rt) - 'created_by' from return_tickets rt where rt.project_id = p_project order by created_at desc limit 1),
    'selected_solution', p.selected_solution,
    'problem_statement', p.problem_statement,
    'latest_prototype', (select jsonb_build_object('version', version_number, 'title', title, 'artifact_url', artifact_url)
      from prototype_versions where project_id = p_project order by version_number desc limit 1),
    'tests', (select count(*) from tests where project_id = p_project)
  );
end;
$$;

grant execute on all functions in schema public to authenticated;
revoke execute on function public.log_event(uuid, uuid, text, text, uuid, jsonb) from authenticated;
