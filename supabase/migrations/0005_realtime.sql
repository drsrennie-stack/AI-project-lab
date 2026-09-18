-- AI Project Lab MVP v1.0
-- Migration 0005: realtime publication and final grants

-- Supabase Realtime respects RLS, so each subscriber only receives rows they can select.
alter publication supabase_realtime add table
  public.projects,
  public.teams,
  public.team_members,
  public.maps,
  public.map_nodes,
  public.map_edges,
  public.matrix_scores,
  public.decisions,
  public.decision_responses,
  public.ai_interactions,
  public.ai_rejections,
  public.prototype_versions,
  public.tests,
  public.alerts,
  public.huddles,
  public.huddle_responses,
  public.messages,
  public.activity_events,
  public.labs,
  public.gate_overrides,
  public.cross_team_responses;

-- Deletes need the full old row so clients can remove the right card.
alter table public.map_nodes replica identity full;
alter table public.map_edges replica identity full;

-- Functions: signed-in users only. Every function checks access itself.
revoke execute on all functions in schema public from public;
revoke execute on all functions in schema public from anon;
grant execute on all functions in schema public to authenticated;
revoke execute on function public.log_event(uuid, uuid, text, text, uuid, jsonb) from authenticated;
