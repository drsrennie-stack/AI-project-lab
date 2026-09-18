import type {
  AlertType, ArtifactType, Criterion, InteractionType, MapType, SpecField, Stage, TeamRole,
} from "./types";

export const SOFTWARE_VERSION = process.env.NEXT_PUBLIC_SOFTWARE_VERSION || "1.0";

export const STANDARD_STAGES: Stage[] = ["DEFINE", "EXPLORE", "DECIDE", "BUILD", "TEST", "IMPROVE", "SHOW"];
export const RETURNING_STAGES: Stage[] = ["REASSESS", "TEST", "REDESIGN", "BUILD", "SHOW"];
export const stagesFor = (flow: "standard" | "returning") => (flow === "returning" ? RETURNING_STAGES : STANDARD_STAGES);

export const STAGE_LABEL: Record<Stage, string> = {
  DEFINE: "Define", EXPLORE: "Explore", DECIDE: "Decide", BUILD: "Build", TEST: "Test",
  IMPROVE: "Improve", SHOW: "Show", REASSESS: "Reassess", REDESIGN: "Redesign",
};

export interface StageActivity {
  label: string;
  href: string; // relative to /project/[id]
}

export interface StageGuide {
  why: string;
  mustDo: string[];
  activities: StageActivity[];
}

// In-context instruction: why it matters (2 to 3 sentences), what to do, done when (from the live gate).
export const STAGE_GUIDE: Record<Stage, StageGuide> = {
  DEFINE: {
    why: "The first solution you imagine is not necessarily solving the real problem. Mapping the problem and the people it affects keeps your team from building the wrong thing well.",
    mustDo: ["Map the problem", "Identify who the users are", "Name causes and effects", "Define what success looks like"],
    activities: [
      { label: "Problem Map", href: "map/problem" },
      { label: "Stakeholder Map", href: "map/stakeholders" },
      { label: "Success criteria", href: "#project-spec" },
    ],
  },
  EXPLORE: {
    why: "Teams move fastest when they know which of their beliefs are facts and which are guesses. Finding evidence now saves you from testing a prototype built on a wrong assumption.",
    mustDo: ["Collect evidence and mark how well it holds up", "Sort what you know, think, and must verify", "Flag the assumption that would hurt most if it were wrong"],
    activities: [
      { label: "Evidence Map", href: "map/evidence" },
      { label: "Assumption Map", href: "map/assumptions" },
    ],
  },
  DECIDE: {
    why: "Comparing several ideas side by side helps you see tradeoffs you would miss by falling for the first one. The scores inform the choice, but your team makes the decision.",
    mustDo: ["Generate solution ideas as a team", "Compare at least three in the Decision Matrix", "Choose a solution together", "Complete the Project Specification"],
    activities: [
      { label: "Idea Map", href: "ideas" },
      { label: "Decision Matrix and decisions", href: "decision" },
      { label: "Project Specification", href: "#project-spec" },
    ],
  },
  BUILD: {
    why: "A first version exists so you can learn from it, not so it can be perfect. Deciding which work belongs to people and which to AI keeps your team in charge of the project.",
    mustDo: ["Build and save Prototype V1", "Place project tasks on the Human / AI Map", "Sketch how your solution works on the Workflow Map"],
    activities: [
      { label: "Prototype versions", href: "build?tab=prototype" },
      { label: "Human / AI Map", href: "build?tab=human_ai" },
      { label: "Workflow Map", href: "build?tab=workflow" },
    ],
  },
  TEST: {
    why: "Testing shows you what actually happens when someone uses your prototype. Every failure you find now is one your users will not run into later.",
    mustDo: ["Map the ways your prototype could fail", "Run at least one test", "Record what you found"],
    activities: [
      { label: "Tests", href: "test?tab=tests" },
      { label: "Failure Map", href: "test?tab=failure" },
    ],
  },
  IMPROVE: {
    why: "Revising based on evidence is what turns a prototype into a real solution. Documenting each change shows how your thinking moved from Version 1 to Version 2.",
    mustDo: ["Trace each change from test result to decision", "Create Prototype V2 or document the revision", "Name one AI recommendation your team changed or rejected"],
    activities: [
      { label: "Version Map", href: "improve?tab=version" },
      { label: "Prototype V2", href: "improve?tab=prototype" },
      { label: "AI recommendation reflection", href: "improve?tab=ai" },
    ],
  },
  SHOW: {
    why: "Explaining your project to others makes your reasoning visible, including the parts that did not work. The Project Story is built from the work you already saved.",
    mustDo: ["Review your Project Story", "Complete the Return Ticket", "Visit the Prototype Gallery when your instructor opens it"],
    activities: [
      { label: "Project Story", href: "show" },
      { label: "Return Ticket", href: "show#return-ticket" },
    ],
  },
  REASSESS: {
    why: "Your project may have changed since the last session, and so might your team. A quick check-in makes sure you start from what is true today.",
    mustDo: ["Read the last session summary", "Answer the returning team check-in"],
    activities: [{ label: "Returning check-in", href: "reassess" }],
  },
  REDESIGN: {
    why: "Test results only help if they change what you build. Decide what to change before you start building again.",
    mustDo: ["Review your latest test findings", "Propose and accept at least one redesign decision"],
    activities: [
      { label: "Decisions", href: "decision" },
      { label: "Version Map", href: "improve?tab=version" },
    ],
  },
};

export const ROLE_LABEL: Record<TeamRole, string> = {
  architect: "Architect",
  evidence_lead: "Evidence Lead",
  builder: "Builder",
  red_team: "Red Team",
};

// Draft role descriptions. Edit freely.
export const ROLE_DESCRIPTION: Record<TeamRole, string> = {
  architect: "Keeps the team's plan organized, makes sure every map and the Project Specification match what the team decided.",
  evidence_lead: "Finds sources, checks claims, and keeps track of what the team has actually verified.",
  builder: "Leads the hands-on work of building each prototype version.",
  red_team: "Looks for weak evidence, risky assumptions, and problems in the prototype, then flags them for the team.",
};

export const ROLE_ORDER: TeamRole[] = ["architect", "evidence_lead", "builder", "red_team"];

// ---------------------------------------------------------------------------
// Maps
// ---------------------------------------------------------------------------
export interface Zone {
  key: string;
  label: string;
  help?: string;
  x: number; y: number; w: number; h: number; // board pixels
}

export interface MapConfig {
  type: MapType;
  title: string;
  stage: Stage;
  route: string;
  thinkFirst: boolean;
  intro: string;
  addLabel: string;
  nodeTypes?: { key: string; label: string }[];
  allowCustomCategories?: boolean;
  categories: { key: string; label: string; help?: string }[];
  layout: "problem" | "grid";
  cols?: number;
}

export const BOARD_WIDTH = 960;
export const CARD_WIDTH = 176;
export const CARD_HEIGHT = 96;
const ROW_HEIGHT = 300;

export const MAP_CONFIG: Record<Exclude<MapType, "decision_matrix" | "version_map">, MapConfig> = {
  problem_map: {
    type: "problem_map", title: "Problem Map", stage: "DEFINE", route: "map/problem", thinkFirst: true, layout: "problem",
    intro: "Put your team's statement of the problem in the center. Then add causes, effects, evidence, and the things you still do not know.",
    addLabel: "Add card",
    categories: [
      { key: "problem", label: "Problem", help: "What is the problem, in one sentence?" },
      { key: "causes", label: "Causes", help: "Why does this problem happen?" },
      { key: "effects", label: "Effects", help: "What happens because of it?" },
      { key: "evidence", label: "Evidence", help: "What have you seen or read that shows this is real?" },
      { key: "unknowns", label: "Unknowns", help: "What do you still need to find out?" },
    ],
  },
  stakeholder_map: {
    type: "stakeholder_map", title: "Stakeholder Map", stage: "DEFINE", route: "map/stakeholders", thinkFirst: true, layout: "grid", cols: 3,
    intro: "List everyone connected to this problem. Your team must name one primary user: the person your solution is mainly for.",
    addLabel: "Add person or group",
    categories: [
      { key: "primary_user", label: "Primary user", help: "Who is this mainly for?" },
      { key: "secondary_users", label: "Secondary users", help: "Who else would use it?" },
      { key: "decision_makers", label: "Decision makers", help: "Who decides whether it gets used?" },
      { key: "resource_holders", label: "Resource holders", help: "Who controls time, money, or tools?" },
      { key: "other_affected", label: "Other affected people", help: "Who else feels the effects?" },
      { key: "barriers", label: "Barriers", help: "What or who could get in the way?" },
    ],
  },
  evidence_map: {
    type: "evidence_map", title: "Evidence Map", stage: "EXPLORE", route: "map/evidence", thinkFirst: false, layout: "grid", cols: 4,
    intro: "Add each claim your project depends on. Record the source, then place it by how well the evidence holds up.",
    addLabel: "Add claim",
    categories: [
      { key: "supported", label: "Supported", help: "Good evidence backs this up." },
      { key: "uncertain", label: "Uncertain", help: "Evidence is mixed or weak." },
      { key: "contradicted", label: "Contradicted", help: "Evidence says this is wrong." },
      { key: "needs_evidence", label: "Needs evidence", help: "We have not looked yet." },
    ],
  },
  assumption_map: {
    type: "assumption_map", title: "Assumption Map", stage: "EXPLORE", route: "map/assumptions", thinkFirst: true, layout: "grid", cols: 3,
    intro: "Sort your team's beliefs about the problem and the user. Move cards as you learn more. Flag any assumption that would sink the project if it turned out to be wrong.",
    addLabel: "Add assumption",
    categories: [
      { key: "we_know", label: "We know", help: "We have evidence for this." },
      { key: "we_think", label: "We think", help: "This seems true but we have not checked." },
      { key: "we_must_verify", label: "We must verify", help: "We need to check this before building on it." },
    ],
  },
  idea_map: {
    type: "idea_map", title: "Idea Map", stage: "DECIDE", route: "ideas", thinkFirst: true, layout: "grid", cols: 1,
    intro: "Generate as many solution ideas as your team can. Group similar ideas, combine ideas that work well together, and send your strongest ones to the Decision Matrix.",
    addLabel: "Add idea",
    categories: [{ key: "ideas", label: "Solution ideas" }],
  },
  workflow_map: {
    type: "workflow_map", title: "Workflow Map", stage: "BUILD", route: "build?tab=workflow", thinkFirst: false, layout: "grid", cols: 1,
    intro: "Show how your solution works from start to finish. Add steps, then connect them with arrows.",
    addLabel: "Add step",
    nodeTypes: [
      { key: "input", label: "Input" },
      { key: "action", label: "Action" },
      { key: "decision", label: "Decision" },
      { key: "output", label: "Output" },
      { key: "feedback", label: "Feedback" },
      { key: "loop", label: "Loop" },
    ],
    categories: [{ key: "flow", label: "Workflow" }],
  },
  human_ai_map: {
    type: "human_ai_map", title: "Human / AI Responsibility Map", stage: "BUILD", route: "build?tab=human_ai", thinkFirst: false, layout: "grid", cols: 3,
    intro: "Place each major project task in one column. Add a short reason for each choice.",
    addLabel: "Add task",
    categories: [
      { key: "human", label: "Human", help: "People on the team do this." },
      { key: "ai", label: "AI", help: "An AI tool does this." },
      { key: "human_ai", label: "Human + AI", help: "People and AI do this together." },
    ],
  },
  failure_map: {
    type: "failure_map", title: "Failure Map", stage: "TEST", route: "test?tab=failure", thinkFirst: true, layout: "grid", cols: 4,
    allowCustomCategories: true,
    intro: "List the ways your prototype could fail. Add your own categories if these do not cover it.",
    addLabel: "Add failure",
    categories: [
      { key: "user_failure", label: "User failure" },
      { key: "ai_failure", label: "AI failure" },
      { key: "bad_information", label: "Bad information" },
      { key: "technical_failure", label: "Technical failure" },
      { key: "cost", label: "Cost" },
      { key: "accessibility", label: "Accessibility" },
      { key: "privacy", label: "Privacy" },
      { key: "misuse", label: "Misuse" },
      { key: "bias", label: "Bias" },
      { key: "usability", label: "Usability" },
      { key: "unexpected_behavior", label: "Unexpected behavior" },
    ],
  },
};

export function zonesFor(config: MapConfig, extraCategories: { key: string; label: string }[] = []): { zones: Zone[]; height: number } {
  const cats = [...config.categories, ...extraCategories];
  if (config.layout === "problem") {
    const find = (k: string) => cats.find((c) => c.key === k)!;
    const pad = 12;
    const colW = 300;
    const zones: Zone[] = [
      { ...find("causes"), x: pad, y: pad, w: colW, h: 290 },
      { ...find("evidence"), x: pad, y: 314, w: colW, h: 290 },
      { ...find("problem"), x: BOARD_WIDTH / 2 - 160, y: 160, w: 320, h: 300 },
      { ...find("effects"), x: BOARD_WIDTH - colW - pad, y: pad, w: colW, h: 290 },
      { ...find("unknowns"), x: BOARD_WIDTH - colW - pad, y: 314, w: colW, h: 290 },
    ];
    return { zones, height: 616 };
  }
  const cols = config.cols ?? 3;
  const pad = 12;
  const rows = Math.ceil(cats.length / cols);
  const w = (BOARD_WIDTH - pad * (cols + 1)) / cols;
  const single = cols === 1;
  const h = single ? 600 : ROW_HEIGHT;
  const zones = cats.map((c, i) => ({
    ...c,
    x: pad + (i % cols) * (w + pad),
    y: pad + Math.floor(i / cols) * (h + pad),
    w,
    h,
  }));
  return { zones, height: pad + rows * (h + pad) };
}

export const THINK_FIRST_TEXT = "Complete your team's initial thinking before using AI to critique it.";

// Copyable prompts. The app never calls AI itself.
export function critiquePrompts(mapTitle: string, challengeTitle: string, mapText: string): { label: string; text: string }[] {
  const context = `Our team is working on a college project called "${challengeTitle}". Here is our ${mapTitle}, written by our team:\n\n${mapText || "(empty)"}\n\n`;
  return [
    {
      label: "Find gaps",
      text: context + "Critique this map. What important points are missing? Which items are vague or overlap? Do not suggest a solution to the problem. Keep your answer to a short list we can discuss.",
    },
    {
      label: "Challenge our assumptions",
      text: context + "Which items on this map are assumptions rather than facts? For each one, suggest how a student team could check it in less than an hour. Do not suggest a solution.",
    },
    {
      label: "Check the evidence",
      text: context + "Which claims on this map would need evidence to be believable? What kind of source would be strong evidence for each? Tell us when you are unsure, and do not invent sources.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Decision matrix, decisions, spec
// ---------------------------------------------------------------------------
export const CRITERIA: { key: Criterion; label: string; help: string }[] = [
  { key: "value_to_user", label: "Value to user", help: "5 means it helps the primary user a lot." },
  { key: "feasibility", label: "Feasibility", help: "5 means the team can definitely build it today." },
  { key: "time", label: "Time", help: "5 means it takes very little time." },
  { key: "cost", label: "Cost", help: "5 means it costs little or nothing." },
  { key: "accessibility", label: "Accessibility", help: "5 means people with different needs can use it." },
  { key: "accuracy", label: "Accuracy", help: "5 means it gives learners correct information." },
  { key: "risk", label: "Risk", help: "5 means low risk." },
];

export const MATRIX_NOTICE = "Highest numerical score does not automatically determine the team's decision.";

export const SPEC_FIELDS: { key: SpecField; label: string; help: string }[] = [
  { key: "problem_statement", label: "Problem", help: "One or two sentences. What problem are you solving?" },
  { key: "primary_user", label: "Primary user", help: "Who is this mainly for?" },
  { key: "desired_outcome", label: "Desired outcome", help: "What will be different for the user?" },
  { key: "selected_solution", label: "Selected solution", help: "Filled in when the team accepts a solution decision." },
  { key: "requirements", label: "Requirements", help: "What must the solution do?" },
  { key: "constraints", label: "Constraints", help: "Limits on time, cost, tools, or rules." },
  { key: "success_criteria", label: "Success criteria", help: "How will you know it worked?" },
  { key: "must_not_do", label: "Things the solution must not do", help: "For example, collect private data." },
];

export const DECISION_STATUS_LABEL = {
  proposed: "Proposed",
  under_discussion: "Under discussion",
  accepted: "Accepted",
  modified: "Accepted with changes",
  rejected: "Rejected",
} as const;

export const RESPONSE_LABEL = {
  support: "Support",
  question: "Question",
  modify: "Modify",
  reject: "Reject",
} as const;

// ---------------------------------------------------------------------------
// AI credits
// ---------------------------------------------------------------------------
export const INTERACTION_TYPES: { key: InteractionType; label: string; cost: number; help: string }[] = [
  { key: "quick_clarification", label: "Quick clarification", cost: 1, help: "A short question or definition." },
  { key: "moderate_analysis", label: "Moderate analysis", cost: 3, help: "Analysis, comparison, or structured generation." },
  { key: "substantial_work", label: "Substantial work", cost: 5, help: "Research, coding, design, or content generation." },
  { key: "major_rebuild", label: "Major rebuild", cost: 10, help: "Major regeneration, rebuild, or complex troubleshooting." },
];

export const AI_TOOLS = ["ChatGPT", "Claude", "Gemini", "Copilot", "Other approved tool"];

export function creditMessage(remaining: number, total: number): { tone: "neutral" | "low" | "over"; text: string } | null {
  if (remaining <= 0) {
    return { tone: "over", text: "OVER BUDGET. Your team can keep working and logging AI use. New logs are marked over budget and your instructor can see them." };
  }
  if (remaining < 25) {
    return { tone: "low", text: "AI budget is getting low. Consider whether the next task requires AI, team discussion, or a narrower request." };
  }
  if (remaining <= 50 && total >= 50) {
    return { tone: "neutral", text: "Your team has used about half of its AI credits." };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Alerts, prototypes, return ticket
// ---------------------------------------------------------------------------
export const ALERT_TYPES: { key: AlertType; label: string }[] = [
  { key: "evidence_problem", label: "Evidence problem" },
  { key: "unsupported_assumption", label: "Unsupported assumption" },
  { key: "usability_problem", label: "Usability problem" },
  { key: "technical_failure", label: "Technical failure" },
  { key: "ai_concern", label: "AI concern" },
  { key: "accessibility_issue", label: "Accessibility issue" },
  { key: "ethical_privacy_issue", label: "Ethical or privacy issue" },
  { key: "team_decision_needed", label: "Team decision needed" },
  { key: "general", label: "Something else" },
];
export const alertLabel = (k: string) => ALERT_TYPES.find((a) => a.key === k)?.label ?? k;

export const ARTIFACT_TYPES: { key: ArtifactType; label: string }[] = [
  { key: "url", label: "Link (URL)" },
  { key: "uploaded_file", label: "Uploaded file (paste the shared link)" },
  { key: "text_description", label: "Text description" },
  { key: "external_app", label: "External app" },
  { key: "document", label: "Document" },
  { key: "presentation", label: "Presentation" },
  { key: "physical_prototype", label: "Physical prototype description" },
];

export const RETURN_STATUS: { key: string; label: string }[] = [
  { key: "finished_for_now", label: "Finished for now" },
  { key: "needs_more_testing", label: "Needs more testing" },
  { key: "needs_redesign", label: "Needs redesign" },
  { key: "continue_building", label: "Continue building" },
  { key: "prepare_for_launch", label: "Prepare for launch" },
];

export const CROSS_TEAM_CATEGORIES = [
  { key: "same", label: "Same", prompt: "What did multiple teams recognize?" },
  { key: "different", label: "Different", prompt: "Where did teams define the problem differently?" },
  { key: "surprising", label: "Surprising", prompt: "What solution approach was unexpected?" },
  { key: "ai_effect", label: "AI effect", prompt: "Where might AI have pushed teams toward similar ideas?" },
  { key: "human_effect", label: "Human effect", prompt: "Where did human judgment or experience create different directions?" },
] as const;

export const REFLECTION_QUESTIONS = [
  { key: "changed_ai_use", label: "What changed about how you use AI?" },
  { key: "ai_most_useful", label: "Where was AI most useful?" },
  { key: "ai_least_useful", label: "Where was AI least useful?" },
  { key: "team_did_what_ai_could_not", label: "What did your team do that AI could not?" },
  { key: "do_differently", label: "What will you do differently next time?" },
] as const;

// ---------------------------------------------------------------------------
// Feed wording
// ---------------------------------------------------------------------------
const MAP_NAME: Record<string, string> = {
  problem_map: "Problem Map", stakeholder_map: "Stakeholder Map", evidence_map: "Evidence Map",
  assumption_map: "Assumption Map", idea_map: "Idea Map", decision_matrix: "Decision Matrix",
  workflow_map: "Workflow Map", human_ai_map: "Human / AI Map", failure_map: "Failure Map", version_map: "Version Map",
};
export const mapName = (t: unknown) => MAP_NAME[String(t)] ?? "a map";

export function describeEvent(type: string, m: Record<string, unknown>): string {
  switch (type) {
    case "node_created": return `added a card to the ${mapName(m.map_type)}`;
    case "evidence_added": return "added evidence";
    case "assumption_created": return "created an assumption";
    case "idea_created": return "added a solution idea";
    case "node_updated": return `edited a card on the ${mapName(m.map_type)}`;
    case "node_moved": return `moved a card on the ${mapName(m.map_type)}`;
    case "node_deleted": return `deleted a card from the ${mapName(m.map_type)}`;
    case "node_archived": return `archived a card on the ${mapName(m.map_type)}`;
    case "idea_moved_to_matrix": return "moved an idea into the Decision Matrix";
    case "nodes_connected": return "connected two cards";
    case "nodes_disconnected": return "removed a connection";
    case "map_completed": return `completed the ${mapName(m.map_type)}`;
    case "map_reopened": return `reopened the ${mapName(m.map_type)}`;
    case "decision_proposed": return "proposed a decision";
    case "decision_response": return `responded to a decision (${String(m.response)})`;
    case "decision_under_discussion": return "opened a decision for discussion";
    case "decision_accepted": return "marked a decision accepted";
    case "decision_modified": return "accepted a decision with changes";
    case "decision_rejected": return "rejected a decision";
    case "ai_interaction_logged":
      return `logged AI use (${String(m.cost)} credits${m.over_budget ? ", OVER BUDGET" : ""})`;
    case "ai_output_verified": return "verified an AI output";
    case "ai_disposition_changed": return "updated what the team did with an AI output";
    case "ai_rejection_recorded": return "completed the AI recommendation reflection";
    case "prototype_version_created": return `created Prototype V${String(m.version)}`;
    case "test_completed": return "recorded a test";
    case "test_updated": return "updated a test";
    case "alert_raised": return "raised a team alert";
    case "red_team_flag_raised": return "raised a Red Team flag";
    case "alert_acknowledged": return "acknowledged an alert";
    case "alert_resolved": return "resolved an alert";
    case "alert_unresolved": return "reopened an alert";
    case "huddle_started": return "started a huddle";
    case "huddle_completed": return "completed the huddle and set the next sprint objective";
    case "stage_advanced": return `completed ${String(m.from)} and moved to ${String(m.to)}${m.override ? " (instructor approved)" : ""}`;
    case "stage_set_by_instructor": return `moved the project to ${String(m.to)}`;
    case "role_rotated": return "rotated team roles";
    case "role_assigned": return "assigned a role";
    case "project_updated": return "updated the Project Specification";
    case "override_granted": return "approved an override";
    case "override_revoked": return "removed an override";
    case "return_ticket_created": return "completed the Return Ticket";
    case "returning_checkin": return "completed the returning team check-in";
    case "project_returned": return "reopened this project for a new session";
    default: return type.replace(/_/g, " ");
  }
}
