-- Database acceptance tests. Run after 00_supabase_stub.sql, migrations, and seed.sql.
-- Any failed assert stops the script (psql -v ON_ERROR_STOP=1).
\set ON_ERROR_STOP 1
\set instructor '00000000-0000-4000-a000-000000000001'
\set atlas1 '00000000-0000-4000-c001-000000000001'
\set atlas2 '00000000-0000-4000-c001-000000000002'
\set atlas4 '00000000-0000-4000-c001-000000000004'
\set cat1 '00000000-0000-4000-c002-000000000001'
\set cat2 '00000000-0000-4000-c002-000000000002'
\set cat3 '00000000-0000-4000-c002-000000000003'
\set cat4 '00000000-0000-4000-c002-000000000004'
\set lab '00000000-0000-4000-b000-000000000001'

create or replace function pg_temp.as_user(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
$$;

-- Keep ids handy
select p.id as atlas_project from projects p join teams t on t.id = p.team_id where t.name = 'Team Atlas' \gset
select p.id as cat_project, t.id as cat_team from projects p join teams t on t.id = p.team_id where t.name = 'Team Catalyst' \gset

\echo '--- 1. Team isolation'
select pg_temp.as_user(:'atlas1');
set role authenticated;
do $$ begin
  assert (select count(*) from projects) = 1, 'student should see exactly one project';
  assert (select count(*) from teams) = 1, 'student should see exactly one team';
  assert (select count(distinct project_id) from map_nodes) = 1, 'student should see only own nodes';
  assert (select count(*) from team_members) = 4, 'student should see own 4 teammates';
  assert (select count(*) from profiles) = 5, 'student sees 4 teammates + instructor';
  assert (select count(*) from activity_events where project_id <> (select id from projects limit 1)) = 0, 'no foreign events';
end $$;

\echo '--- 2. Direct project updates are blocked; stage cannot be forced'
update projects set current_stage = 'SHOW';
do $$ begin
  assert (select current_stage from projects limit 1) = 'EXPLORE', 'direct stage update must not work';
end $$;

\echo '--- 3. Writing into another team is rejected'
reset role;
select id as cat_problem_map from maps where project_id = :'cat_project' and map_type = 'problem_map' \gset
select set_config('test.cat_map', :'cat_problem_map', false);
select pg_temp.as_user(:'atlas1');
set role authenticated;
do $$ begin
  begin
    insert into map_nodes (map_id, content, author_id, category)
    values (current_setting('test.cat_map')::uuid, 'intrusion', auth.uid(), 'causes');
    raise exception 'insert into another team should fail';
  exception when others then
    if sqlerrm like '%should fail%' then raise; end if;
  end;
end $$;

\echo '--- 4. Gate blocks advancing from EXPLORE while requirements are missing'
do $$
declare r jsonb;
begin
  r := advance_stage((select id from projects limit 1));
  assert (r ->> 'ok')::boolean = false, 'advance should fail';
  assert r ->> 'reason' = 'requirements_not_met', 'reason should be requirements_not_met';
end $$;

\echo '--- 5. Students cannot use instructor RPCs'
do $$ begin
  begin
    perform set_stage((select id from projects limit 1), 'BUILD');
    raise exception 'set_stage should fail';
  exception when others then
    if sqlerrm like '%should fail%' then raise; end if;
  end;
  begin
    perform lab_dashboard((select lab_id from projects limit 1));
    raise exception 'dashboard should fail';
  exception when others then
    if sqlerrm like '%should fail%' then raise; end if;
  end;
end $$;

\echo '--- 6. A map cannot be marked complete before its minimum is met'
do $$ begin
  begin
    update maps set status = 'complete' where map_type = 'decision_matrix';
    raise exception 'completion should fail';
  exception when others then
    if sqlerrm like '%should fail%' then raise; end if;
  end;
end $$;

\echo '--- 7. AI credits: server sets cost, deducts, flags over budget, never blocks'
select pg_temp.as_user(:'atlas2');
do $$
declare v_proj uuid := (select id from projects limit 1); i int;
begin
  insert into ai_interactions (project_id, user_id, tool_name, task_description, interaction_type, credit_cost)
  values (v_proj, auth.uid(), 'ChatGPT', 'rebuild', 'major_rebuild', 1);
  assert (select credit_cost from ai_interactions where tool_name = 'ChatGPT') = 10, 'cost must follow type';
  assert (select ai_credit_remaining from teams limit 1) = 87, 'credits should be 87';
  for i in 1..9 loop
    insert into ai_interactions (project_id, user_id, tool_name, task_description, interaction_type, credit_cost)
    values (v_proj, auth.uid(), 'Gemini', 'rebuild ' || i, 'major_rebuild', 10);
  end loop;
  assert (select ai_credit_remaining from teams limit 1) = -3, 'credits can go below zero';
  assert (select count(*) from ai_interactions where over_budget) = 1, 'exactly one over-budget log';
  begin
    update ai_interactions set credit_cost = 1 where tool_name = 'Gemini';
    raise exception 'cost edit should fail';
  exception when others then
    if sqlerrm like '%should fail%' then raise; end if;
  end;
end $$;

\echo '--- 8. Red Team flag only counts for the Red Team role'
do $$ begin
  insert into alerts (project_id, created_by, alert_type, message, is_red_team_flag)
  values ((select id from projects limit 1), auth.uid(), 'usability_problem', 'not red team', true);
  assert not (select is_red_team_flag from alerts where message = 'not red team'), 'evidence lead cannot raise red flag';
end $$;
select pg_temp.as_user(:'atlas4');
do $$ begin
  insert into alerts (project_id, created_by, alert_type, message, is_red_team_flag)
  values ((select id from projects limit 1), auth.uid(), 'ai_concern', 'red team flag', true);
  assert (select is_red_team_flag from alerts where message = 'red team flag'), 'red team flag should stick';
  update alerts set status = 'resolved' where message = 'red team flag';
  assert (select resolved_at is not null from alerts where message = 'red team flag'), 'resolved_at set';
end $$;

\echo '--- 9. Decision accepted writes into the Project Specification'
do $$ begin
  begin
    update decisions set status = 'accepted' where title = 'Focus on first-year science students';
    raise exception 'accept without rationale should fail';
  exception when others then
    if sqlerrm like '%should fail%' then raise; end if;
  end;
  update projects set primary_user = 'x'; -- ignored (no policy)
  update decisions set status = 'accepted', rationale = 'All four testers fit this group'
  where title = 'Focus on first-year science students';
  assert (select primary_user from projects limit 1) = 'First-year students taking a content-heavy science course', 'spec updated';
end $$;

\echo '--- 10. Optimistic locking returns a conflict for stale versions'
do $$
declare r jsonb; v int;
begin
  select row_version into v from projects limit 1;
  r := update_project_fields((select id from projects limit 1), v, '{"requirements":"Works on a laptop"}');
  assert (r ->> 'ok')::boolean, 'first save ok';
  r := update_project_fields((select id from projects limit 1), v, '{"requirements":"Stale write"}');
  assert (r ->> 'conflict')::boolean, 'stale save should conflict';
  assert (select requirements from projects limit 1) = 'Works on a laptop', 'stale write must not land';
  begin
    r := update_project_fields((select id from projects limit 1), v + 1, '{"current_stage":"SHOW"}');
    raise exception 'stage via fields should fail';
  exception when others then
    if sqlerrm like '%should fail%' then raise; end if;
  end;
end $$;

\echo '--- 11. Gallery is hidden until the instructor unlocks it'
do $$ begin
  begin
    perform lab_gallery((select lab_id from projects limit 1));
    raise exception 'gallery should be locked';
  exception when others then
    if sqlerrm like '%should be locked%' then raise; end if;
  end;
end $$;
reset role;
select pg_temp.as_user(:'instructor');
set role authenticated;
do $$ begin
  assert jsonb_array_length(lab_gallery('00000000-0000-4000-b000-000000000001')) = 4, 'instructor sees gallery';
  update labs set gallery_unlocked = true where id = '00000000-0000-4000-b000-000000000001';
end $$;
reset role;
select pg_temp.as_user(:'atlas1');
set role authenticated;
do $$ begin
  assert jsonb_array_length(lab_gallery('00000000-0000-4000-b000-000000000001')) = 4, 'student sees unlocked gallery';
  assert (select count(*) from projects) = 1, 'unlocking gallery does not expose other rooms';
end $$;
reset role;
update labs set gallery_unlocked = false where id = :'lab';

\echo '--- 12. Profile role cannot be self-promoted'
select pg_temp.as_user(:'atlas1');
set role authenticated;
do $$ begin
  begin
    update profiles set role = 'instructor' where id = auth.uid();
    raise exception 'role change should fail';
  exception when others then
    if sqlerrm like '%should fail%' then raise; end if;
  end;
end $$;

\echo '--- 13. Anonymous users see nothing'
reset role;
set role anon;
do $$ begin
  begin
    perform count(*) from projects;
    raise exception 'anon select should fail';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;

\echo '--- 14. Team Catalyst walks every gate from DEFINE to SHOW'
select pg_temp.as_user(:'cat1');
set role authenticated;
do $$
declare
  v_proj uuid := (select id from projects limit 1);
  m uuid; n1 uuid; n2 uuid; n3 uuid; r jsonb; v int; crit text;
begin
  assert (select current_stage from projects) = 'DEFINE', 'starts in DEFINE';

  -- DEFINE
  select id into m from maps where map_type = 'problem_map';
  insert into map_nodes (map_id, content, author_id, category) values
    (m, 'Problem', auth.uid(), 'problem'), (m, 'Cause 1', auth.uid(), 'causes'), (m, 'Cause 2', auth.uid(), 'causes'),
    (m, 'Effect 1', auth.uid(), 'effects');
  begin
    update maps set status = 'complete' where id = m;
    raise exception 'incomplete problem map should not complete';
  exception when others then
    if sqlerrm like '%should not%' then raise; end if;
  end;
  insert into map_nodes (map_id, content, author_id, category) values
    (m, 'Effect 2', auth.uid(), 'effects'), (m, 'Unknown 1', auth.uid(), 'unknowns');
  update maps set status = 'complete' where id = m;
  select id into m from maps where map_type = 'stakeholder_map';
  insert into map_nodes (map_id, content, author_id, category) values (m, 'Students', auth.uid(), 'primary_user');
  update maps set status = 'complete' where id = m;
  r := advance_stage(v_proj);
  assert not (r ->> 'ok')::boolean, 'success criteria still missing';
  select row_version into v from projects;
  r := update_project_fields(v_proj, v, '{"success_criteria":"Testers find weak topics"}');
  r := advance_stage(v_proj);
  assert (r ->> 'ok')::boolean, 'DEFINE -> EXPLORE: ' || r::text;

  -- EXPLORE
  select id into m from maps where map_type = 'evidence_map';
  insert into map_nodes (map_id, content, author_id, category, metadata) values (m, 'Claim', auth.uid(), 'supported', '{"verification_status":"verified"}');
  select id into m from maps where map_type = 'assumption_map';
  insert into map_nodes (map_id, content, author_id, category, metadata) values
    (m, 'Know', auth.uid(), 'we_know', '{}'), (m, 'Think', auth.uid(), 'we_think', '{}'), (m, 'Verify', auth.uid(), 'we_must_verify', '{"critical":true}');
  update maps set status = 'complete' where id = m;
  r := advance_stage(v_proj);
  assert (r ->> 'ok')::boolean, 'EXPLORE -> DECIDE: ' || r::text;

  -- DECIDE
  select id into m from maps where map_type = 'idea_map';
  insert into map_nodes (map_id, content, author_id, category, status) values (m, 'Idea A', auth.uid(), 'ideas', 'in_matrix') returning id into n1;
  insert into map_nodes (map_id, content, author_id, category, status) values (m, 'Idea B', auth.uid(), 'ideas', 'in_matrix') returning id into n2;
  insert into matrix_scores (idea_node_id, project_id, criterion, score, updated_by)
  select n, v_proj, c, 3, auth.uid() from unnest(array[n1, n2]) n,
    unnest(array['value_to_user','feasibility','time','cost','accessibility','accuracy','risk']) c;
  begin
    update maps set status = 'complete' where map_type = 'decision_matrix';
    raise exception 'two concepts should not complete matrix';
  exception when others then
    if sqlerrm like '%should not%' then raise; end if;
  end;
  insert into map_nodes (map_id, content, author_id, category, status) values (m, 'Idea C', auth.uid(), 'ideas', 'in_matrix') returning id into n3;
  insert into matrix_scores (idea_node_id, project_id, criterion, score, updated_by)
  select n3, v_proj, c, 4, auth.uid() from unnest(array['value_to_user','feasibility','time','cost','accessibility','accuracy','risk']) c;
  update maps set status = 'complete' where map_type = 'decision_matrix';
  select row_version into v from projects;
  r := update_project_fields(v_proj, v, jsonb_build_object(
    'problem_statement', 'P', 'primary_user', 'U', 'desired_outcome', 'O', 'requirements', 'R',
    'constraints', 'C', 'must_not_do', 'N'));
  r := advance_stage(v_proj);
  assert not (r ->> 'ok')::boolean, 'no solution selected yet';
  insert into decisions (project_id, proposed_by, title, spec_field, spec_value)
  values (v_proj, auth.uid(), 'Choose Idea C', 'selected_solution', 'Idea C');
  update decisions set status = 'accepted', rationale = 'Best fit for our user' where title = 'Choose Idea C';
  r := advance_stage(v_proj);
  assert (r ->> 'ok')::boolean, 'DECIDE -> BUILD: ' || r::text;

  -- BUILD
  insert into prototype_versions (project_id, title, artifact_type, created_by, version_number)
  values (v_proj, 'V1 paper sketch', 'text_description', auth.uid(), 99);
  assert (select version_number from prototype_versions where title = 'V1 paper sketch') = 1, 'version auto-numbered';
  select id into m from maps where map_type = 'human_ai_map';
  insert into map_nodes (map_id, content, author_id, category) values
    (m, 'Pick topics', auth.uid(), 'human'), (m, 'Draft items', auth.uid(), 'ai'), (m, 'Check items', auth.uid(), 'human_ai');
  update maps set status = 'complete' where id = m;
  select id into m from maps where map_type = 'workflow_map';
  insert into map_nodes (map_id, content, author_id, node_type, category) values (m, 'Learner opens session', auth.uid(), 'input', 'flow');
  r := advance_stage(v_proj);
  assert (r ->> 'ok')::boolean, 'BUILD -> TEST: ' || r::text;

  -- TEST
  select id into m from maps where map_type = 'failure_map';
  insert into map_nodes (map_id, content, author_id, category) values (m, 'Learner skips session two', auth.uid(), 'user_failure');
  update maps set status = 'complete' where id = m;
  insert into tests (project_id, test_description, findings, passed, created_by)
  values (v_proj, 'Two testers tried V1', 'Both lost track of weak topics after session one', false, auth.uid());
  r := advance_stage(v_proj);
  assert (r ->> 'ok')::boolean, 'TEST -> IMPROVE: ' || r::text;

  -- IMPROVE
  select id into m from maps where map_type = 'version_map';
  insert into map_nodes (map_id, content, author_id, node_type, category, metadata) values
    (m, 'Change 1', auth.uid(), 'change', 'change', '{"what_happened":"lost track","why":"no summary","evidence":"test 1","decision":"add summary","change":"End-of-session summary"}');
  update maps set status = 'complete' where id = m;
  insert into prototype_versions (project_id, title, artifact_type, created_by, version_number)
  values (v_proj, 'V2 with summary', 'text_description', auth.uid(), 0);
  begin
    insert into ai_rejections (project_id, none_rejected, created_by) values (v_proj, true, auth.uid());
    raise exception 'none rejected without justification should fail';
  exception when check_violation then null;
  end;
  insert into ai_rejections (project_id, recommendation, source_tool, team_decision, rationale, created_by)
  values (v_proj, 'Add a points system', 'ChatGPT', 'rejected', 'Our spec says no gamification', auth.uid());
  r := advance_stage(v_proj);
  assert (r ->> 'ok')::boolean, 'IMPROVE -> SHOW: ' || r::text;
  r := advance_stage(v_proj);
  assert r ->> 'reason' = 'final_stage', 'SHOW is last';
  assert (select current_version from projects) = 2, 'current version 2';
end $$;

\echo '--- 15. Huddle: instructor starts for the lab, team completes, objective shows'
reset role;
select pg_temp.as_user(:'instructor');
set role authenticated;
do $$ begin
  assert start_huddle_for_lab('00000000-0000-4000-b000-000000000001', 'After EXPLORE', false) = 4, 'four huddles';
end $$;
reset role;
select pg_temp.as_user(:'cat2');
set role authenticated;
do $$
declare h uuid;
begin
  select id into h from huddles where completed_at is null;
  assert h is not null, 'student sees open huddle';
  insert into huddle_responses (huddle_id, project_id, user_id, learned, recommendation, uncertainty, team_need)
  values (h, (select id from projects), auth.uid(), 'L', 'R', 'U', 'N');
  perform complete_huddle(h, 'Test V2 with two new testers');
  assert (select current_sprint_objective from projects) = 'Test V2 with two new testers', 'objective on project';
  assert (select current_sprint_objective from teams) = 'Test V2 with two new testers', 'objective on team';
end $$;

\echo '--- 16. Roles rotate for every team and history is kept'
reset role;
select pg_temp.as_user(:'instructor');
set role authenticated;
do $$ begin
  perform rotate_roles_for_lab('00000000-0000-4000-b000-000000000001');
end $$;
reset role;
do $$ begin
  assert (select team_role from team_members where user_id = '00000000-0000-4000-c002-000000000001') = 'evidence_lead', 'architect -> evidence lead';
  assert (select team_role from team_members where user_id = '00000000-0000-4000-c002-000000000004') = 'architect', 'red team -> architect';
  assert (select count(*) from role_history where user_id = '00000000-0000-4000-c002-000000000001') = 2, 'history kept';
end $$;

\echo '--- 17. Join by code, auto-assign, my_team'
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-4000-d000-000000000001', 'new1@demo.lab', '{"display_name":"New One"}'),
  ('00000000-0000-4000-d000-000000000002', 'new2@demo.lab', '{}');
select pg_temp.as_user('00000000-0000-4000-d000-000000000001');
set role authenticated;
do $$ begin
  assert join_lab('pilot1', 'Newcomer') = '00000000-0000-4000-b000-000000000001', 'join by code (case insensitive)';
  assert my_team('00000000-0000-4000-b000-000000000001') is null, 'no team yet';
  begin
    perform join_lab('WRONG1', 'x');
    raise exception 'bad code should fail';
  exception when others then
    if sqlerrm like '%should fail%' then raise; end if;
  end;
end $$;
reset role;
select pg_temp.as_user('00000000-0000-4000-d000-000000000002');
set role authenticated;
select join_lab('PILOT1', 'Second New');
reset role;
select pg_temp.as_user(:'instructor');
set role authenticated;
do $$ begin
  assert auto_assign_teams('00000000-0000-4000-b000-000000000001') = 2, 'two assigned';
  assert (select count(*) from teams where name = 'Team 5') = 1, 'new team created since all four are full';
  assert (select count(*) from projects p join teams t on t.id = p.team_id where t.name = 'Team 5') = 1, 'project auto-created';
  assert jsonb_array_length(lab_dashboard('00000000-0000-4000-b000-000000000001')) = 5, 'dashboard lists 5 teams';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-4000-d000-000000000002');
set role authenticated;
do $$ begin
  assert my_team('00000000-0000-4000-b000-000000000001') ->> 'team_role' = 'evidence_lead', 'second joiner gets next role';
  assert (select display_name from profiles where id = auth.uid()) = 'Second New', 'display name saved';
end $$;

\echo '--- 18. Export is de-identified'
reset role;
select pg_temp.as_user(:'instructor');
set role authenticated;
do $$
declare e jsonb := export_pilot_data('00000000-0000-4000-b000-000000000001');
begin
  assert jsonb_array_length(e -> 'teams') = 5, 'five teams exported';
  assert jsonb_array_length(e -> 'events') > 50, 'events exported';
  assert position('Student' in e::text) = 0, 'no display names in export';
  assert position('demo.lab' in e::text) = 0, 'no emails in export';
  assert position('00000000-0000-4000-c' in e::text) = 0, 'no user ids in export';
  assert (e -> 'teams' -> 0 ->> 'team_id') like 'T%', 'team codes';
end $$;

\echo '--- 19. Dashboard flags describe workflow state'
do $$
declare d jsonb := lab_dashboard('00000000-0000-4000-b000-000000000001'); atlas jsonb;
begin
  select x into atlas from jsonb_array_elements(d) x where x ->> 'team_name' = 'Team Atlas';
  assert (atlas ->> 'credits_remaining')::int = -3, 'credits shown';
  assert exists (select 1 from jsonb_array_elements(atlas -> 'flags') f where f ->> 'key' = 'low_credit'), 'low credit flag';
  assert atlas ->> 'indicator' in ('yellow', 'red'), 'atlas needs attention';
end $$;

\echo '--- 20. Instructor override lets a team through a gate'
do $$
declare r jsonb; p uuid; lab uuid;
begin
  select p2.id, p2.lab_id into p, lab from projects p2 join teams t on t.id = p2.team_id where t.name = 'Team Nexus';
  perform grant_override(p, 'gate:DEFINE:' || lab::text, 'Demo override');
  assert (gate_status(p) ->> 'gate_override')::boolean, 'override visible in gate';
end $$;
reset role;
select pg_temp.as_user('00000000-0000-4000-c003-000000000001');
set role authenticated;
do $$
declare r jsonb;
begin
  r := advance_stage((select id from projects limit 1));
  assert (r ->> 'ok')::boolean, 'override lets student advance';
  assert (select current_stage from projects) = 'EXPLORE', 'Nexus now in EXPLORE';
end $$;

\echo '--- 21. Returning Builder Mode'
reset role;
select pg_temp.as_user(:'instructor');
set role authenticated;
insert into labs (id, title, challenge_title, challenge_text, join_code, status, created_by)
values ('00000000-0000-4000-b000-000000000002', 'Pilot 1 Return Session', 'The Learning Problem', 'Same challenge', 'RETURN', 'open', auth.uid());
reset role;
select pg_temp.as_user(:'cat1');
set role authenticated;
select join_lab('RETURN', null);
reset role;
select pg_temp.as_user(:'instructor');
set role authenticated;
do $$
declare v_team uuid; p uuid;
begin
  select p2.id into p from projects p2 join teams t on t.id = p2.team_id where t.name = 'Team Catalyst';
  v_team := import_returning_project(p, '00000000-0000-4000-b000-000000000002', 'Team Catalyst');
  assert (select current_stage from projects where id = p) = 'REASSESS', 'returning flow starts at REASSESS';
  assert (select count(*) from team_members where team_id = v_team) = 1, 'returning student carried over';
  assert (select count(*) from maps where project_id = p) = 10, 'no duplicate maps';
end $$;
reset role;
select pg_temp.as_user(:'cat1');
set role authenticated;
do $$
declare r jsonb; p uuid;
begin
  select id into p from projects where flow = 'returning';
  assert (last_session_summary(p) ->> 'previous_lab_title') = 'AI Project Lab: Pilot 1', 'last session summary';
  r := advance_stage(p);
  assert not (r ->> 'ok')::boolean, 'needs check-in';
  insert into returning_checkins (project_id, lab_id, what_changed, still_works, does_not_work, next_objective, created_by)
  values (p, '00000000-0000-4000-b000-000000000002', 'New testers', 'Summary', 'Reminders', 'Add reminders', auth.uid());
  r := advance_stage(p);
  assert (r ->> 'ok')::boolean and r ->> 'stage' = 'TEST', 'REASSESS -> TEST';
end $$;

reset role;
\echo 'ALL DATABASE ACCEPTANCE TESTS PASSED'
