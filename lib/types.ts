// Database row types. Keep in sync with supabase/migrations.

export type Role = "student" | "instructor";
export type TeamRole = "architect" | "evidence_lead" | "builder" | "red_team";
export type Stage =
  | "DEFINE" | "EXPLORE" | "DECIDE" | "BUILD" | "TEST" | "IMPROVE" | "SHOW" | "REASSESS" | "REDESIGN";
export type MapType =
  | "problem_map" | "stakeholder_map" | "evidence_map" | "assumption_map" | "idea_map"
  | "decision_matrix" | "workflow_map" | "human_ai_map" | "failure_map" | "version_map";

export interface Profile {
  id: string;
  display_name: string;
  role: Role;
  created_at: string;
}

export interface Lab {
  id: string;
  title: string;
  challenge_title: string;
  challenge_text: string;
  date: string | null;
  start_time: string | null;
  end_time: string | null;
  join_code: string;
  team_size: number;
  status: "draft" | "open" | "active" | "complete";
  gallery_unlocked: boolean;
  cross_team_unlocked: boolean;
  baseline_prompt: string;
  post_prompt: string;
  curriculum_version: string;
  software_version: string;
  lab_version: string;
  created_by: string;
  created_at: string;
}

export interface Team {
  id: string;
  lab_id: string;
  name: string;
  status: "forming" | "active" | "paused" | "complete";
  current_stage: Stage;
  ai_credit_total: number;
  ai_credit_remaining: number;
  current_sprint_objective: string;
  created_at: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  team_role: TeamRole | null;
  joined_at: string;
  active_status: "active" | "inactive";
  last_seen_at: string | null;
}

export interface Project {
  id: string;
  team_id: string;
  lab_id: string;
  title: string;
  flow: "standard" | "returning";
  current_stage: Stage;
  stage_started_at: string;
  current_version: number;
  problem_statement: string;
  primary_user: string;
  desired_outcome: string;
  selected_solution: string;
  success_criteria: string;
  requirements: string;
  constraints: string;
  must_not_do: string;
  current_sprint_objective: string;
  row_version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type SpecField =
  | "problem_statement" | "primary_user" | "desired_outcome" | "selected_solution"
  | "success_criteria" | "requirements" | "constraints" | "must_not_do";

export interface MapRow {
  id: string;
  project_id: string;
  map_type: MapType;
  stage: Stage;
  status: "not_started" | "in_progress" | "complete";
  custom_categories: { key: string; label: string }[];
  created_at: string;
  completed_at: string | null;
}

export interface MapNode {
  id: string;
  map_id: string;
  project_id: string;
  node_type: string;
  content: string;
  author_id: string;
  x_position: number;
  y_position: number;
  parent_node_id: string | null;
  category: string;
  status: "active" | "archived" | "in_matrix";
  metadata: Record<string, unknown>;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MapEdge {
  id: string;
  map_id: string;
  project_id: string;
  from_node_id: string;
  to_node_id: string;
  label: string;
  created_by: string;
  created_at: string;
}

export type Criterion = "value_to_user" | "feasibility" | "time" | "cost" | "accessibility" | "accuracy" | "risk";

export interface MatrixScore {
  id: string;
  project_id: string;
  idea_node_id: string;
  criterion: Criterion;
  score: number;
  updated_by: string;
  updated_at: string;
}

export type DecisionStatus = "proposed" | "under_discussion" | "accepted" | "modified" | "rejected";

export interface Decision {
  id: string;
  project_id: string;
  proposed_by: string;
  title: string;
  description: string;
  status: DecisionStatus;
  rationale: string;
  evidence_reference: string;
  spec_field: SpecField | null;
  spec_value: string;
  resolved_by: string | null;
  created_at: string;
  resolved_at: string | null;
}

export interface DecisionResponse {
  id: string;
  decision_id: string;
  project_id: string;
  user_id: string;
  response_type: "support" | "question" | "modify" | "reject";
  comment: string;
  created_at: string;
  updated_at: string;
}

export type InteractionType = "quick_clarification" | "moderate_analysis" | "substantial_work" | "major_rebuild";

export interface AIInteraction {
  id: string;
  project_id: string;
  user_id: string;
  stage: string;
  tool_name: string;
  task_description: string;
  interaction_type: InteractionType;
  credit_cost: number;
  result_usefulness: "useful" | "partially_useful" | "not_useful" | null;
  disposition: "accepted" | "modified" | "rejected" | null;
  verification_required: boolean;
  verification_completed: boolean;
  over_budget: boolean;
  notes: string;
  created_at: string;
}

export interface AIRejection {
  id: string;
  project_id: string;
  none_rejected: boolean;
  recommendation: string;
  source_tool: string;
  team_decision: string;
  rationale: string;
  justification: string;
  created_by: string;
  created_at: string;
}

export type ArtifactType =
  | "url" | "uploaded_file" | "text_description" | "external_app" | "document" | "presentation" | "physical_prototype";

export interface PrototypeVersion {
  id: string;
  project_id: string;
  version_number: number;
  title: string;
  description: string;
  artifact_url: string;
  artifact_type: ArtifactType;
  notes: string;
  created_by: string;
  created_at: string;
}

export interface TestRow {
  id: string;
  project_id: string;
  prototype_version_id: string | null;
  test_type: string;
  test_description: string;
  expected_result: string;
  actual_result: string;
  passed: boolean | null;
  findings: string;
  created_by: string;
  created_at: string;
}

export type AlertType =
  | "evidence_problem" | "unsupported_assumption" | "usability_problem" | "technical_failure"
  | "ai_concern" | "accessibility_issue" | "ethical_privacy_issue" | "team_decision_needed" | "general";

export interface Alert {
  id: string;
  project_id: string;
  created_by: string;
  alert_type: AlertType;
  is_red_team_flag: boolean;
  message: string;
  status: "unresolved" | "acknowledged" | "resolved";
  status_changed_by: string | null;
  created_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
}

export interface Huddle {
  id: string;
  project_id: string;
  started_at: string;
  completed_at: string | null;
  sprint_objective: string;
  lock_workspace: boolean;
  reason: string;
  triggered_by: string;
}

export interface HuddleResponse {
  id: string;
  huddle_id: string;
  project_id: string;
  user_id: string;
  learned: string;
  recommendation: string;
  uncertainty: string;
  team_need: string;
  created_at: string;
}

export interface Message {
  id: string;
  lab_id: string;
  team_id: string | null;
  author_id: string;
  body: string;
  created_at: string;
}

export interface ActivityEvent {
  id: number;
  project_id: string;
  team_id: string | null;
  lab_id: string | null;
  user_id: string | null;
  event_type: string;
  stage: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ReturnTicket {
  id: string;
  project_id: string;
  lab_id: string;
  current_status: "finished_for_now" | "needs_more_testing" | "needs_redesign" | "continue_building" | "prepare_for_launch";
  what_works: string;
  what_does_not_work: string;
  what_we_learned: string;
  next_build_objective: string;
  created_by: string;
  created_at: string;
}

export interface ReturningCheckin {
  id: string;
  project_id: string;
  lab_id: string;
  what_changed: string;
  still_works: string;
  does_not_work: string;
  next_objective: string;
  created_by: string;
  created_at: string;
}

export interface GateItem {
  key: string;
  label: string;
  met: boolean;
  overridable?: boolean;
}

export interface GateStatus {
  stage: Stage;
  next_stage: Stage | null;
  flow: "standard" | "returning";
  items: GateItem[];
  all_met: boolean;
  gate_override: boolean;
}

export interface MapRequirement {
  key: string;
  label: string;
  have: number;
  need: number;
  met: boolean;
}

export interface GateOverride {
  id: string;
  project_id: string;
  gate_key: string;
  granted_by: string;
  note: string;
  created_at: string;
}

export interface DashboardFlag {
  key: string;
  label: string;
  level: "yellow" | "red";
}

export interface DashboardTeam {
  team_id: string;
  project_id: string;
  team_name: string;
  team_status: string;
  flow: string;
  current_stage: Stage;
  minutes_in_stage: number;
  credits_total: number;
  credits_remaining: number;
  members: number;
  active_members: number;
  last_activity: string | null;
  required_maps: number;
  required_maps_complete: number;
  open_alerts: number;
  open_decisions: number;
  evidence_claims: number;
  evidence_verified: number;
  ai_verification_pending: number;
  prototype_versions: number;
  huddle_open: boolean;
  last_huddle_at: string | null;
  sprint_objective: string;
  gate: GateStatus;
  flags: DashboardFlag[];
  indicator: "green" | "yellow" | "red";
}

export interface GalleryCard {
  team_id: string;
  team_name: string;
  problem_interpretation: string;
  selected_solution: string;
  prototype_title: string | null;
  prototype_link: string | null;
  prototype_type: string | null;
  prototype_version: number | null;
  critical_assumption: string | null;
  biggest_test_finding: string | null;
  major_revision: string | null;
  next_step: string | null;
}
