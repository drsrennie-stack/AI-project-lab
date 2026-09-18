-- AI Project Lab MVP v1.0
-- DEVELOPMENT SEED ONLY. Do not run against the pilot database.
-- Creates: 1 demo instructor, 1 lab, 4 teams of 4 demo students,
-- and one partially completed project (Team Atlas, currently in EXPLORE).
-- Every demo account uses the password: LabDemo2026!

do $$
declare
  v_instructor uuid := '00000000-0000-4000-a000-000000000001';
  v_lab uuid := '00000000-0000-4000-b000-000000000001';
  v_team uuid;
  v_project uuid;
  v_user uuid;
  v_map uuid;
  v_node uuid;
  v_decision uuid;
  team_names text[] := array['Team Atlas', 'Team Catalyst', 'Team Nexus', 'Team Orbit'];
  roles text[] := array['architect', 'evidence_lead', 'builder', 'red_team'];
  i int;
  j int;
  v_email text;
begin
  -- -------------------------------------------------------------------------
  -- Demo accounts
  -- -------------------------------------------------------------------------
  for i in 0..4 loop
    for j in 1..(case when i = 0 then 1 else 4 end) loop
      if i = 0 then
        v_user := v_instructor;
        v_email := 'instructor@demo.lab';
      else
        v_user := ('00000000-0000-4000-c00' || i || '-00000000000' || j)::uuid;
        v_email := lower(replace(team_names[i], 'Team ', '')) || j || '@demo.lab';
      end if;
      insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new, email_change)
      values ('00000000-0000-0000-0000-000000000000', v_user, 'authenticated', 'authenticated', v_email,
        crypt('LabDemo2026!', gen_salt('bf')), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('display_name', case when i = 0 then 'Demo Instructor'
          else replace(team_names[i], 'Team ', '') || ' Student ' || j end),
        now(), now(), '', '', '', '')
      on conflict (id) do nothing;
      insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_user, v_user::text,
        jsonb_build_object('sub', v_user::text, 'email', v_email, 'email_verified', true), 'email', now(), now(), now())
      on conflict do nothing;
    end loop;
  end loop;

  update public.profiles set role = 'instructor' where id = v_instructor;

  -- -------------------------------------------------------------------------
  -- Lab and challenge
  -- -------------------------------------------------------------------------
  insert into public.labs (id, title, challenge_title, challenge_text, date, start_time, end_time, join_code,
    team_size, status, baseline_prompt, post_prompt, created_by)
  values (v_lab, 'AI Project Lab: Pilot 1', 'The Learning Problem',
    'College students spend a lot of time studying, but the hours they put in do not tell them what they will be able to remember later.' || E'\n\n' ||
    'Your challenge: design and prototype a system that helps college students' || E'\n' ||
    '- learn something over time' || E'\n' ||
    '- figure out what they do and do not know' || E'\n' ||
    '- make better decisions about what to study next' || E'\n\n' ||
    'Your solution should' || E'\n' ||
    '- get learners actively pulling information from memory instead of rereading' || E'\n' ||
    '- help the learner find their weak spots' || E'\n' ||
    '- work across more than one study session' || E'\n' ||
    '- help the learner decide what to do next',
    current_date, '09:00', '16:00', 'PILOT1', 4, 'active',
    'DRAFT BASELINE TASK (edit before the pilot): A campus club throws away a large amount of food after every event. Using any AI tool you want, recommend one change the club should try first. Explain how you decided, what you checked, and how confident you are.',
    'DRAFT POST TASK (edit before the pilot): The campus tutoring center is open most afternoons, but very few students use it. Using any AI tool you want, recommend one change the center should try first. Explain how you decided, what you checked, and how confident you are.',
    v_instructor)
  on conflict (id) do nothing;

  insert into public.lab_members (lab_id, user_id) values (v_lab, v_instructor) on conflict do nothing;

  -- -------------------------------------------------------------------------
  -- Teams (projects and maps are created by trigger)
  -- -------------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_instructor, 'role', 'authenticated')::text, true);
  for i in 1..4 loop
    insert into public.teams (lab_id, name, status) values (v_lab, team_names[i], 'active') returning id into v_team;
    for j in 1..4 loop
      v_user := ('00000000-0000-4000-c00' || i || '-00000000000' || j)::uuid;
      insert into public.lab_members (lab_id, user_id) values (v_lab, v_user) on conflict do nothing;
      perform public.assign_member(v_team, v_user, roles[j]);
      update public.team_members set last_seen_at = now() where team_id = v_team and user_id = v_user;
    end loop;
  end loop;

  -- -------------------------------------------------------------------------
  -- Team Atlas: partially completed project for UI testing
  -- -------------------------------------------------------------------------
  select p.id into v_project from public.projects p join public.teams t on t.id = p.team_id
  where t.lab_id = v_lab and t.name = 'Team Atlas';

  -- Act as Atlas Student 1 (architect) so events carry an author.
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-c001-000000000001', 'role', 'authenticated')::text, true);

  update public.projects set
    problem_statement = 'Students cannot tell which material they will actually remember on an exam, so they spend study time on the wrong things.',
    primary_user = 'First-year students taking a content-heavy science course',
    desired_outcome = 'Students can see what they can and cannot recall and choose their next study task with that information.',
    success_criteria = 'A tester can name their two weakest topics after using the prototype across two sessions.',
    current_sprint_objective = 'Sort our assumptions and find evidence for the two riskiest ones.',
    row_version = row_version + 1
  where id = v_project;
  update public.teams set current_sprint_objective = 'Sort our assumptions and find evidence for the two riskiest ones.'
  where id = (select team_id from public.projects where id = v_project);

  -- Problem Map
  select id into v_map from public.maps where project_id = v_project and map_type = 'problem_map';
  insert into public.map_nodes (map_id, content, author_id, category, x_position, y_position) values
    (v_map, 'Students cannot tell what they will remember later', '00000000-0000-4000-c001-000000000001', 'problem', 380, 220),
    (v_map, 'Rereading feels productive because the page looks familiar', '00000000-0000-4000-c001-000000000002', 'causes', 60, 60),
    (v_map, 'Nobody checks recall between classes', '00000000-0000-4000-c001-000000000003', 'causes', 60, 150),
    (v_map, 'Surprise gaps show up on the exam', '00000000-0000-4000-c001-000000000004', 'effects', 700, 60),
    (v_map, 'Study time goes to topics students already know', '00000000-0000-4000-c001-000000000001', 'effects', 700, 150),
    (v_map, 'Do students notice when they forget something?', '00000000-0000-4000-c001-000000000002', 'unknowns', 700, 380);
  update public.maps set status = 'complete' where id = v_map;

  -- Stakeholder Map
  select id into v_map from public.maps where project_id = v_project and map_type = 'stakeholder_map';
  insert into public.map_nodes (map_id, content, author_id, category, x_position, y_position) values
    (v_map, 'First-year science students', '00000000-0000-4000-c001-000000000001', 'primary_user', 40, 60),
    (v_map, 'Tutors and study group leaders', '00000000-0000-4000-c001-000000000002', 'secondary_users', 340, 60),
    (v_map, 'Course instructors', '00000000-0000-4000-c001-000000000003', 'decision_makers', 640, 60),
    (v_map, 'Students with jobs and little free time', '00000000-0000-4000-c001-000000000004', 'barriers', 640, 300);
  update public.maps set status = 'complete' where id = v_map;

  -- Advance DEFINE -> EXPLORE through the real gate.
  perform public.advance_stage(v_project);

  -- Evidence Map (started)
  select id into v_map from public.maps where project_id = v_project and map_type = 'evidence_map';
  insert into public.map_nodes (map_id, content, author_id, category, metadata, x_position, y_position) values
    (v_map, 'Students often rate rereading as more effective than self-testing', '00000000-0000-4000-c001-000000000002', 'needs_evidence',
      jsonb_build_object('claim', 'Students often rate rereading as more effective than self-testing', 'source', '', 'url', '', 'notes', 'Find a peer-reviewed source', 'verification_status', 'not_verified'), 40, 60);

  -- Assumption Map (in progress, one critical assumption)
  select id into v_map from public.maps where project_id = v_project and map_type = 'assumption_map';
  insert into public.map_nodes (map_id, content, author_id, category, metadata, x_position, y_position) values
    (v_map, 'Our testers study for at least one course with frequent exams', '00000000-0000-4000-c001-000000000001', 'we_know', '{}'::jsonb, 40, 60),
    (v_map, 'Students will come back for a second session if the first one is short', '00000000-0000-4000-c001-000000000003', 'we_think', '{"critical": true}'::jsonb, 340, 60);

  -- One logged AI interaction
  insert into public.ai_interactions (project_id, user_id, tool_name, task_description, interaction_type, credit_cost,
    result_usefulness, disposition, verification_required, notes)
  values (v_project, '00000000-0000-4000-c001-000000000002', 'Claude',
    'Asked AI to critique our Problem Map and point out causes we missed', 'moderate_analysis', 3,
    'partially_useful', 'modified', true, 'Kept one suggested cause, rejected two that did not fit our user');

  -- One open decision
  insert into public.decisions (project_id, proposed_by, title, description, spec_field, spec_value)
  values (v_project, '00000000-0000-4000-c001-000000000001', 'Focus on first-year science students',
    'Narrow our primary user so testing is realistic today', 'primary_user',
    'First-year students taking a content-heavy science course')
  returning id into v_decision;
  perform set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-4000-c001-000000000004', 'role', 'authenticated')::text, true);
  insert into public.decision_responses (decision_id, user_id, response_type, comment)
  values (v_decision, '00000000-0000-4000-c001-000000000004', 'question', 'Do we have any testers who fit this group?');

  -- Class announcement
  insert into public.messages (lab_id, team_id, author_id, body)
  values (v_lab, null, v_instructor, 'Welcome to the AI Project Lab. Start in DEFINE and build your maps as a team before you open any AI tool.');

  perform set_config('request.jwt.claims', '', true);
end $$;
