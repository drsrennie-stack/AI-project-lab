"use client";
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { useSave } from "@/components/ui/SaveStatus";
import type {
  AIInteraction, AIRejection, ActivityEvent, Alert, Decision, DecisionResponse, GateOverride, GateStatus, Huddle,
  HuddleResponse, Lab, MapEdge, MapNode, MapRow, MapType, MatrixScore, Message, Profile, Project, PrototypeVersion,
  ReturnTicket, ReturningCheckin, Team, TeamMember, TeamRole, TestRow,
} from "@/lib/types";

export interface ProjectData {
  project: Project | null;
  team: Team | null;
  lab: Lab | null;
  members: TeamMember[];
  profiles: Record<string, Profile>;
  maps: MapRow[];
  nodes: MapNode[];
  edges: MapEdge[];
  scores: MatrixScore[];
  decisions: Decision[];
  responses: DecisionResponse[];
  ai: AIInteraction[];
  aiRejections: AIRejection[];
  prototypes: PrototypeVersion[];
  tests: TestRow[];
  alerts: Alert[];
  huddles: Huddle[];
  huddleResponses: HuddleResponse[];
  events: ActivityEvent[];
  messages: Message[];
  overrides: GateOverride[];
  returnTickets: ReturnTicket[];
  checkins: ReturningCheckin[];
  gate: GateStatus | null;
}

type TableKey =
  | "project" | "team" | "lab" | "members" | "maps" | "nodes" | "edges" | "scores" | "decisions" | "responses" | "ai"
  | "aiRejections" | "prototypes" | "tests" | "alerts" | "huddles" | "huddleResponses" | "events" | "messages"
  | "overrides" | "returnTickets" | "checkins";

const EMPTY: ProjectData = {
  project: null, team: null, lab: null, members: [], profiles: {}, maps: [], nodes: [], edges: [], scores: [],
  decisions: [], responses: [], ai: [], aiRejections: [], prototypes: [], tests: [], alerts: [], huddles: [],
  huddleResponses: [], events: [], messages: [], overrides: [], returnTickets: [], checkins: [], gate: null,
};

// project-scoped tables: [state key, db table, order column, ascending]
const PROJECT_TABLES: [TableKey, string, string, boolean][] = [
  ["maps", "maps", "created_at", true],
  ["nodes", "map_nodes", "created_at", true],
  ["edges", "map_edges", "created_at", true],
  ["scores", "matrix_scores", "updated_at", true],
  ["decisions", "decisions", "created_at", false],
  ["responses", "decision_responses", "created_at", true],
  ["ai", "ai_interactions", "created_at", false],
  ["aiRejections", "ai_rejections", "created_at", false],
  ["prototypes", "prototype_versions", "version_number", true],
  ["tests", "tests", "created_at", false],
  ["alerts", "alerts", "created_at", false],
  ["huddles", "huddles", "started_at", false],
  ["huddleResponses", "huddle_responses", "created_at", true],
  ["overrides", "gate_overrides", "created_at", true],
  ["returnTickets", "return_tickets", "created_at", false],
  ["checkins", "returning_checkins", "created_at", false],
];

interface Ctx {
  data: ProjectData;
  loading: boolean;
  error: string;
  supabase: SupabaseClient;
  me: string | null;
  isInstructor: boolean;
  myRole: TeamRole | null;
  connection: "connecting" | "live" | "offline";
  refresh: (keys?: TableKey[]) => void;
  nameOf: (userId: string | null | undefined) => string;
  mapOf: (type: MapType) => MapRow | undefined;
  nodesOf: (type: MapType, includeArchived?: boolean) => MapNode[];
  patchNodesLocal: (updater: (nodes: MapNode[]) => MapNode[]) => void;
}

const ProjectCtx = createContext<Ctx | null>(null);

export function useProject() {
  const ctx = useContext(ProjectCtx);
  if (!ctx) throw new Error("useProject must be used inside ProjectProvider");
  return ctx;
}

export function ProjectProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const supabase = getSupabase();
  const [data, setData] = useState<ProjectData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [me, setMe] = useState<string | null>(null);
  const [connection, setConnection] = useState<Ctx["connection"]>("connecting");
  const dataRef = useRef(data);
  dataRef.current = data;
  const pending = useRef<Set<TableKey>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadProfiles = useCallback(async (ids: string[]) => {
    const missing = Array.from(new Set(ids.filter(Boolean))).filter((id) => !dataRef.current.profiles[id]);
    if (missing.length === 0) return;
    const { data: rows } = await supabase.from("profiles").select("*").in("id", missing);
    if (rows) {
      setData((d) => {
        const profiles = { ...d.profiles };
        (rows as Profile[]).forEach((p) => { profiles[p.id] = p; });
        return { ...d, profiles };
      });
    }
  }, [supabase]);

  const fetchKey = useCallback(async (key: TableKey, project: Project | null, team: Team | null): Promise<Partial<ProjectData>> => {
    if (key === "project") {
      const { data: p, error: e } = await supabase.from("projects").select("*").eq("id", projectId).maybeSingle();
      if (e) throw e;
      return { project: p as Project | null };
    }
    if (key === "team") {
      if (!project) return {};
      const { data: t } = await supabase.from("teams").select("*").eq("id", project.team_id).maybeSingle();
      return { team: t as Team | null };
    }
    if (key === "lab") {
      if (!project) return {};
      const { data: l } = await supabase.from("labs").select("*").eq("id", project.lab_id).maybeSingle();
      return { lab: l as Lab | null };
    }
    if (key === "members") {
      if (!project) return {};
      const { data: m } = await supabase.from("team_members").select("*").eq("team_id", team?.id ?? project.team_id).order("joined_at");
      return { members: (m as TeamMember[]) ?? [] };
    }
    if (key === "events") {
      const { data: ev } = await supabase.from("activity_events").select("*").eq("project_id", projectId)
        .order("created_at", { ascending: false }).limit(150);
      return { events: (ev as ActivityEvent[]) ?? [] };
    }
    if (key === "messages") {
      if (!project) return {};
      const { data: msg } = await supabase.from("messages").select("*").eq("lab_id", project.lab_id)
        .or(`team_id.is.null,team_id.eq.${project.team_id}`).order("created_at", { ascending: false }).limit(20);
      return { messages: (msg as Message[]) ?? [] };
    }
    const def = PROJECT_TABLES.find((t) => t[0] === key);
    if (!def) return {};
    const { data: rows } = await supabase.from(def[1]).select("*").eq("project_id", projectId).order(def[2], { ascending: def[3] });
    return { [key]: rows ?? [] } as Partial<ProjectData>;
  }, [projectId, supabase]);

  const loadGate = useCallback(async () => {
    const { data: g } = await supabase.rpc("gate_status", { p_project: projectId });
    if (g) setData((d) => ({ ...d, gate: g as GateStatus }));
  }, [projectId, supabase]);

  const loadAll = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      setMe(auth.user?.id ?? null);
      const base = await fetchKey("project", null, null);
      const project = base.project ?? null;
      if (!project) {
        setError("This project is not available to you. You may not be on this team.");
        setLoading(false);
        return;
      }
      const keys: TableKey[] = ["team", "lab", "members", "events", "messages", ...PROJECT_TABLES.map((t) => t[0])];
      const parts = await Promise.all(keys.map((k) => fetchKey(k, project, null)));
      const merged = Object.assign({}, ...parts, { project }) as Partial<ProjectData>;
      setData((d) => ({ ...d, ...merged }));
      setError("");
      const ids = [
        ...(merged.members ?? []).map((m) => m.user_id),
        merged.lab?.created_by ?? "",
        auth.user?.id ?? "",
      ];
      await loadProfiles(ids);
      await loadGate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the project");
    } finally {
      setLoading(false);
    }
  }, [fetchKey, loadGate, loadProfiles, supabase]);

  const flush = useCallback(async () => {
    const keys = Array.from(pending.current);
    pending.current.clear();
    if (keys.length === 0) return;
    const { project, team } = dataRef.current;
    const needsProjectFirst = keys.includes("project");
    let proj = project;
    if (needsProjectFirst) {
      const r = await fetchKey("project", null, null);
      proj = r.project ?? project;
      setData((d) => ({ ...d, ...r }));
    }
    const parts = await Promise.all(keys.filter((k) => k !== "project").map((k) => fetchKey(k, proj, team)));
    const merged = Object.assign({}, ...parts) as Partial<ProjectData>;
    setData((d) => ({ ...d, ...merged }));
    const authorIds = [
      ...(merged.members ?? []).map((m) => m.user_id),
      ...(merged.events ?? []).map((e) => e.user_id ?? ""),
      ...(merged.messages ?? []).map((m) => m.author_id),
      ...(merged.nodes ?? []).map((n) => n.author_id),
    ];
    loadProfiles(authorIds);
    loadGate();
  }, [fetchKey, loadGate, loadProfiles]);

  const refresh = useCallback((keys?: TableKey[]) => {
    (keys ?? ["project", "team", "members", ...PROJECT_TABLES.map((t) => t[0]), "events"]).forEach((k) => pending.current.add(k));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 150);
  }, [flush]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // After any successful write, refetch so the screen never depends on realtime alone.
  const { onSaved } = useSave();
  useEffect(() => onSaved(() => refresh()), [onSaved, refresh]);

  // Realtime subscriptions. RLS decides which rows each viewer receives.
  const teamId = data.project?.team_id;
  const labId = data.project?.lab_id;
  useEffect(() => {
    if (!teamId || !labId) return;
    const channel: RealtimeChannel = supabase.channel(`project-${projectId}-${teamId}`);
    const on = (table: string, filter: string | null, key: TableKey, also: TableKey[] = []) => {
      channel.on(
        "postgres_changes",
        filter ? { event: "*", schema: "public", table, filter } : { event: "*", schema: "public", table },
        () => refresh([key, ...also]),
      );
    };
    on("projects", `id=eq.${projectId}`, "project");
    on("teams", `id=eq.${teamId}`, "team");
    on("team_members", `team_id=eq.${teamId}`, "members");
    on("labs", `id=eq.${labId}`, "lab");
    on("messages", `lab_id=eq.${labId}`, "messages");
    on("activity_events", `project_id=eq.${projectId}`, "events");
    PROJECT_TABLES.forEach(([key, table]) => on(table, `project_id=eq.${projectId}`, key));
    // Deletes cannot be filtered, so listen broadly and refetch when the row was ours.
    channel.on("postgres_changes", { event: "DELETE", schema: "public", table: "map_nodes" }, () => refresh(["nodes", "edges", "scores"]));
    channel.on("postgres_changes", { event: "DELETE", schema: "public", table: "map_edges" }, () => refresh(["edges"]));

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnection("live");
        refresh();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setConnection("offline");
      }
    });
    // Safety net: a full refresh every 60 seconds in case an event was missed.
    const safety = setInterval(() => refresh(), 60_000);
    return () => {
      clearInterval(safety);
      supabase.removeChannel(channel);
    };
  }, [labId, projectId, refresh, supabase, teamId]);

  const isMember = !!me && data.members.some((m) => m.user_id === me);

  // Presence heartbeat for the instructor's "active members".
  useEffect(() => {
    if (!teamId || !isMember) return;
    const beat = () => supabase.rpc("heartbeat", { p_team: teamId });
    beat();
    const t = setInterval(beat, 60_000);
    return () => clearInterval(t);
  }, [isMember, supabase, teamId]);

  const value = useMemo<Ctx>(() => {
    const isInstructor = !!me && data.lab?.created_by === me;
    const myRole = data.members.find((m) => m.user_id === me)?.team_role ?? null;
    return {
      data, loading, error, supabase, me, isInstructor, myRole, connection, refresh,
      nameOf: (id) => (id ? data.profiles[id]?.display_name ?? "A teammate" : "System"),
      mapOf: (type) => data.maps.find((m) => m.map_type === type),
      nodesOf: (type, includeArchived = false) => {
        const map = data.maps.find((m) => m.map_type === type);
        if (!map) return [];
        return data.nodes.filter((n) => n.map_id === map.id && (includeArchived || n.status !== "archived"));
      },
      patchNodesLocal: (updater) => setData((d) => ({ ...d, nodes: updater(d.nodes) })),
    };
  }, [connection, data, error, loading, me, refresh, supabase]);

  return <ProjectCtx.Provider value={value}>{children}</ProjectCtx.Provider>;
}
