"use client";
import { useMemo, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { useSave } from "@/components/ui/SaveStatus";
import { useProject } from "@/components/project/ProjectProvider";
import { BOARD_WIDTH, CARD_HEIGHT, CARD_WIDTH, zonesFor, type MapConfig, type Zone } from "@/lib/constants";
import { initials } from "@/lib/format";
import type { MapNode } from "@/lib/types";

const VERIFICATION = [
  { key: "not_verified", label: "Not yet verified" },
  { key: "verified", label: "Verified" },
  { key: "contradicted", label: "Contradicted by a source" },
  { key: "could_not_verify", label: "Could not verify" },
];

interface DragState { id: string; startX: number; startY: number; originX: number; originY: number; x: number; y: number; moved: boolean }

export function MapBoard({ config, onlyStatus }: { config: MapConfig; onlyStatus?: "in_matrix" }) {
  const { data, me, supabase, nameOf, mapOf, patchNodesLocal, myRole, isInstructor } = useProject();
  const { track } = useSave();
  const map = mapOf(config.type);
  const canEdit = !!myRole || isInstructor;
  const [view, setView] = useState<"board" | "list">("board");
  const [showArchived, setShowArchived] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [addZone, setAddZone] = useState<Zone | null>(null);
  const [announce, setAnnounce] = useState("");
  const boardRef = useRef<HTMLDivElement>(null);

  const { zones, height } = useMemo(() => zonesFor(config, map?.custom_categories ?? []), [config, map?.custom_categories]);
  const allNodes = useMemo(() => (map ? data.nodes.filter((n) => n.map_id === map.id) : []), [data.nodes, map]);
  const nodes = allNodes.filter((n) => (showArchived || n.status !== "archived") && (!onlyStatus || n.status === onlyStatus));
  const edges = map ? data.edges.filter((e) => e.map_id === map.id) : [];
  const zoneOf = (key: string) => zones.find((z) => z.key === key);

  if (!map) return <p role="status">Loading map...</p>;

  const pos = (n: MapNode) => (drag && drag.id === n.id ? { x: drag.x, y: drag.y } : { x: n.x_position, y: n.y_position });

  const nextSlot = (zone: Zone, excludeId?: string) => {
    const inZone = allNodes.filter((n) => n.category === zone.key && n.id !== excludeId && n.status !== "archived");
    const cols = Math.max(1, Math.floor((zone.w - 16) / (CARD_WIDTH + 10)));
    const i = inZone.length;
    return { x: zone.x + 10 + (i % cols) * (CARD_WIDTH + 10), y: zone.y + 48 + Math.floor(i / cols) * (CARD_HEIGHT + 10) };
  };

  const zoneAt = (x: number, y: number) => {
    const cx = x + CARD_WIDTH / 2;
    const cy = y + CARD_HEIGHT / 2;
    return zones.find((z) => cx >= z.x && cx <= z.x + z.w && cy >= z.y && cy <= z.y + z.h);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>, n: MapNode) => {
    if (!canEdit || e.button !== 0) return;
    if ((e.target as HTMLElement).closest("button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ id: n.id, startX: e.clientX, startY: e.clientY, originX: n.x_position, originY: n.y_position, x: n.x_position, y: n.y_position, moved: false });
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    const moved = drag.moved || Math.abs(dx) > 4 || Math.abs(dy) > 4;
    const x = Math.min(Math.max(0, drag.originX + dx), BOARD_WIDTH - CARD_WIDTH);
    const y = Math.min(Math.max(0, drag.originY + dy), height - CARD_HEIGHT);
    setDrag({ ...drag, x, y, moved });
  };
  const onPointerUp = async (n: MapNode) => {
    if (!drag) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      setOpenId(n.id);
      return;
    }
    const target = zoneAt(d.x, d.y);
    const category = target?.key ?? n.category;
    // Dropping into a different column snaps the card into a free slot there so cards do not pile up.
    const spot = target && category !== n.category ? nextSlot(target, n.id) : { x: d.x, y: d.y };
    patchNodesLocal((all) => all.map((x) => (x.id === n.id ? { ...x, x_position: spot.x, y_position: spot.y, category } : x)));
    await track(supabase.from("map_nodes").update({ x_position: spot.x, y_position: spot.y, category }).eq("id", n.id));
    if (category !== n.category) setAnnounce(`Card moved to ${target?.label}.`);
  };

  const moveToZone = async (n: MapNode, zoneKey: string) => {
    const zone = zoneOf(zoneKey);
    if (!zone) return;
    const slot = nextSlot(zone, n.id);
    patchNodesLocal((all) => all.map((x) => (x.id === n.id ? { ...x, x_position: slot.x, y_position: slot.y, category: zoneKey } : x)));
    await track(supabase.from("map_nodes").update({ x_position: slot.x, y_position: slot.y, category: zoneKey }).eq("id", n.id));
    setAnnounce(`Card moved to ${zone.label}.`);
  };

  const nudge = async (n: MapNode, dx: number, dy: number) => {
    const x = Math.min(Math.max(0, n.x_position + dx), BOARD_WIDTH - CARD_WIDTH);
    const y = Math.min(Math.max(0, n.y_position + dy), height - CARD_HEIGHT);
    const category = zoneAt(x, y)?.key ?? n.category;
    patchNodesLocal((all) => all.map((m) => (m.id === n.id ? { ...m, x_position: x, y_position: y, category } : m)));
    await track(supabase.from("map_nodes").update({ x_position: x, y_position: y, category }).eq("id", n.id));
  };

  const openNode = allNodes.find((n) => n.id === openId) ?? null;
  const byId = new Map(allNodes.map((n) => [n.id, n]));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Map view" className="flex gap-1">
          <button type="button" aria-pressed={view === "board"} onClick={() => setView("board")}
            className={`btn btn-sm ${view === "board" ? "border-navy bg-navy text-white" : "border-line bg-white text-navy"}`}>Board view</button>
          <button type="button" aria-pressed={view === "list"} onClick={() => setView("list")}
            className={`btn btn-sm ${view === "list" ? "border-navy bg-navy text-white" : "border-line bg-white text-navy"}`}>List view</button>
        </div>
        {config.type === "idea_map" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived ideas
          </label>
        )}
        <span className="text-sm text-ink-muted">
          {view === "board" ? "Drag cards to move them, or open a card to move it with buttons." : "Every card and action, without dragging."}
        </span>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{announce}</p>

      {view === "board" ? (
        <div className="overflow-x-auto rounded-card border border-line">
          <div ref={boardRef} className="relative select-none bg-page" style={{ width: BOARD_WIDTH, height }}>
            {zones.map((z) => (
              <div key={z.key} className={`absolute rounded-card border bg-white ${z.key === "problem" ? "border-2 border-navy" : "border-line"}`}
                style={{ left: z.x, top: z.y, width: z.w, height: z.h }}>
                <div className="flex items-start justify-between gap-2 px-3 pt-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-terra">{z.label}</p>
                    {z.help && <p className="text-[11px] leading-tight text-ink-muted">{z.help}</p>}
                  </div>
                  {canEdit && (
                    <button type="button" className="btn-secondary btn-sm px-2" onClick={() => setAddZone(z)} aria-label={`${config.addLabel} to ${z.label}`}>
                      <span aria-hidden="true">+</span>
                    </button>
                  )}
                </div>
              </div>
            ))}

            <svg className="pointer-events-none absolute inset-0" width={BOARD_WIDTH} height={height} aria-hidden="true">
              <defs>
                <marker id={`arrow-${config.type}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#0B1530" />
                </marker>
              </defs>
              {edges.map((e) => {
                const a = byId.get(e.from_node_id);
                const b = byId.get(e.to_node_id);
                if (!a || !b || !nodes.includes(a) || !nodes.includes(b)) return null;
                const pa = pos(a); const pb = pos(b);
                const x1 = pa.x + CARD_WIDTH / 2; const y1 = pa.y + CARD_HEIGHT / 2;
                const x2 = pb.x + CARD_WIDTH / 2; const y2 = pb.y + CARD_HEIGHT / 2;
                // stop the arrow at the card edge
                const dx = x2 - x1; const dy = y2 - y1;
                const t = Math.min(Math.abs((CARD_WIDTH / 2) / (dx || 1)), Math.abs((CARD_HEIGHT / 2) / (dy || 1)), 1);
                return <line key={e.id} x1={x1} y1={y1} x2={x2 - dx * t} y2={y2 - dy * t} stroke="#0B1530" strokeWidth={2} markerEnd={`url(#arrow-${config.type})`} />;
              })}
            </svg>

            {nodes.map((n) => {
              const p = pos(n);
              return (
                <div
                  key={n.id}
                  className={`absolute touch-none rounded-card border bg-white p-2 text-sm ${drag?.id === n.id ? "z-20 cursor-grabbing shadow-[0_8px_16px_rgba(11,21,48,0.16)]" : "z-10 cursor-grab"} ${cardBorder(n)}`}
                  style={{ left: p.x, top: p.y, width: CARD_WIDTH, minHeight: CARD_HEIGHT }}
                  onPointerDown={(e) => onPointerDown(e, n)}
                  onPointerMove={onPointerMove}
                  onPointerUp={() => onPointerUp(n)}
                  onPointerCancel={() => setDrag(null)}
                >
                  <CardFace node={n} config={config} parent={n.parent_node_id ? byId.get(n.parent_node_id) : undefined} authorName={nameOf(n.author_id)} />
                  <button type="button" className="mt-1 text-xs font-semibold text-navy underline" onClick={() => setOpenId(n.id)}>
                    Open card<span className="sr-only">: {n.content.slice(0, 60)}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {zones.map((z) => {
            const inZone = nodes.filter((n) => n.category === z.key);
            return (
              <section key={z.key} className="card p-4" aria-labelledby={`zone-${z.key}`}>
                <h3 id={`zone-${z.key}`} className="text-sm uppercase tracking-[0.15em] text-terra">{z.label} <span className="text-ink-muted">({inZone.length})</span></h3>
                {z.help && <p className="text-sm text-ink-muted">{z.help}</p>}
                <ul className="mt-2 space-y-2">
                  {inZone.map((n) => (
                    <li key={n.id} className={`rounded-btn border p-2 ${cardBorder(n)}`}>
                      <CardFace node={n} config={config} parent={n.parent_node_id ? byId.get(n.parent_node_id) : undefined} authorName={nameOf(n.author_id)} />
                      <button type="button" className="btn-secondary btn-sm mt-2" onClick={() => setOpenId(n.id)}>
                        Open card<span className="sr-only">: {n.content.slice(0, 60)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                {canEdit && <button type="button" className="btn-quiet btn-sm mt-2" onClick={() => setAddZone(z)}>+ {config.addLabel}</button>}
              </section>
            );
          })}
        </div>
      )}

      {addZone && (
        <AddCardDialog
          config={config}
          zone={addZone}
          onClose={() => setAddZone(null)}
          onCreate={async (content, metadata, nodeType) => {
            const slot = nextSlot(addZone);
            const { error } = await track(supabase.from("map_nodes").insert({
              map_id: map.id, project_id: map.project_id, content, author_id: me, category: addZone.key,
              x_position: slot.x, y_position: slot.y, metadata, node_type: nodeType ?? "card",
            }));
            if (!error) {
              setAnnounce(`Card added to ${addZone.label}.`);
              setAddZone(null);
            }
          }}
        />
      )}

      {openNode && (
        <CardDialog
          key={openNode.id}
          node={openNode}
          config={config}
          zones={zones}
          others={allNodes.filter((n) => n.id !== openNode.id && n.status !== "archived")}
          edges={edges}
          canEdit={canEdit}
          onClose={() => setOpenId(null)}
          onMoveZone={(k) => moveToZone(openNode, k)}
          onNudge={(dx, dy) => nudge(openNode, dx, dy)}
        />
      )}
    </div>
  );
}

function cardBorder(n: MapNode) {
  if (n.metadata?.critical === true) return "border-2 border-terra";
  if (n.status === "in_matrix") return "border-2 border-navy";
  if (n.status === "archived") return "border-dashed border-line-strong text-ink-muted";
  return "border-line-strong";
}

function CardFace({ node, config, parent, authorName }: { node: MapNode; config: MapConfig; parent?: MapNode; authorName: string }) {
  const m = node.metadata as Record<string, unknown>;
  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {m.critical === true && <span className="chip-terra">CRITICAL ASSUMPTION</span>}
        {node.status === "in_matrix" && <span className="chip-navy">In matrix</span>}
        {node.status === "archived" && <span className="chip">Archived</span>}
        {config.nodeTypes && <span className="chip">{config.nodeTypes.find((t) => t.key === node.node_type)?.label ?? node.node_type}</span>}
        {config.type === "evidence_map" && <span className="chip">{VERIFICATION.find((v) => v.key === (m.verification_status ?? "not_verified"))?.label}</span>}
      </div>
      <p className="mt-1 break-words font-semibold leading-snug text-navy">{node.content}</p>
      {config.type === "human_ai_map" && typeof m.rationale === "string" && m.rationale && <p className="mt-1 text-xs text-ink-muted">Why: {m.rationale}</p>}
      {parent && <p className="mt-1 text-xs text-ink-muted">Group: {parent.content.slice(0, 28)}</p>}
      <p className="mt-1 text-[11px] text-ink-muted" title={authorName}>
        <span aria-hidden="true">{initials(authorName)}</span><span className="sr-only">Added by {authorName}</span>
      </p>
    </div>
  );
}

function MetadataFields({ config, meta, setMeta, nodeType, setNodeType }: {
  config: MapConfig; meta: Record<string, unknown>; setMeta: (m: Record<string, unknown>) => void;
  nodeType: string; setNodeType: (t: string) => void;
}) {
  const s = (k: string) => (typeof meta[k] === "string" ? (meta[k] as string) : "");
  return (
    <>
      {config.nodeTypes && (
        <div>
          <label htmlFor="node-type" className="label">Step type</label>
          <select id="node-type" className="input" value={nodeType} onChange={(e) => setNodeType(e.target.value)}>
            {config.nodeTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      )}
      {config.type === "evidence_map" && (
        <>
          <div>
            <label htmlFor="ev-source" className="label">Source</label>
            <input id="ev-source" className="input" value={s("source")} onChange={(e) => setMeta({ ...meta, source: e.target.value })}
              placeholder="Examples: journal article, textbook, interview with a classmate" />
          </div>
          <div>
            <label htmlFor="ev-url" className="label">Link (URL)</label>
            <input id="ev-url" type="url" className="input" value={s("url")} onChange={(e) => setMeta({ ...meta, url: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ev-status" className="label">Verification status</label>
            <select id="ev-status" className="input" value={s("verification_status") || "not_verified"} onChange={(e) => setMeta({ ...meta, verification_status: e.target.value })}>
              {VERIFICATION.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="ev-notes" className="label">Notes</label>
            <textarea id="ev-notes" className="input" rows={2} value={s("notes")} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} />
          </div>
        </>
      )}
      {config.type === "assumption_map" && (
        <label className="flex items-center gap-2 font-semibold text-navy">
          <input type="checkbox" checked={meta.critical === true} onChange={(e) => setMeta({ ...meta, critical: e.target.checked })} />
          Flag as CRITICAL ASSUMPTION
        </label>
      )}
      {config.type === "human_ai_map" && (
        <div>
          <label htmlFor="hai-why" className="label">Why this column?</label>
          <textarea id="hai-why" className="input" rows={2} value={s("rationale")} onChange={(e) => setMeta({ ...meta, rationale: e.target.value })} />
        </div>
      )}
    </>
  );
}

function AddCardDialog({ config, zone, onClose, onCreate }: {
  config: MapConfig; zone: Zone; onClose: () => void;
  onCreate: (content: string, metadata: Record<string, unknown>, nodeType?: string) => Promise<void>;
}) {
  const [content, setContent] = useState("");
  const [meta, setMeta] = useState<Record<string, unknown>>(config.type === "evidence_map" ? { verification_status: "not_verified" } : {});
  const [nodeType, setNodeType] = useState(config.nodeTypes?.[0]?.key ?? "card");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    await onCreate(content.trim(), config.type === "evidence_map" ? { ...meta, claim: content.trim() } : meta, config.nodeTypes ? nodeType : undefined);
    setBusy(false);
  };
  return (
    <Dialog open onClose={onClose} title={`${config.addLabel}: ${zone.label}`}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label htmlFor="new-card" className="label">{config.type === "evidence_map" ? "Claim" : "Card text"}</label>
          <textarea id="new-card" className="input" required autoFocus value={content} onChange={(e) => setContent(e.target.value)}
            aria-describedby={zone.help ? "new-card-hint" : undefined} />
          {zone.help && <span id="new-card-hint" className="hint">{zone.help}</span>}
        </div>
        <MetadataFields config={config} meta={meta} setMeta={setMeta} nodeType={nodeType} setNodeType={setNodeType} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn-primary" disabled={busy || !content.trim()}>Add card</button>
        </div>
      </form>
    </Dialog>
  );
}

function CardDialog({ node, config, zones, others, edges, canEdit, onClose, onMoveZone, onNudge }: {
  node: MapNode; config: MapConfig; zones: Zone[]; others: MapNode[]; edges: { id: string; from_node_id: string; to_node_id: string }[];
  canEdit: boolean; onClose: () => void; onMoveZone: (k: string) => void; onNudge: (dx: number, dy: number) => void;
}) {
  const { supabase, me, nameOf, refresh, data } = useProject();
  const { track } = useSave();
  const [content, setContent] = useState(node.content);
  const [meta, setMeta] = useState<Record<string, unknown>>(node.metadata ?? {});
  const [nodeType, setNodeType] = useState(node.node_type);
  const [conflict, setConflict] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState("");
  const latest = data.nodes.find((n) => n.id === node.id) ?? node;
  // What the card looked like when this dialog opened. Moves do not count as conflicts.
  const [snapshot, setSnapshot] = useState({ content: node.content, metadata: JSON.stringify(node.metadata ?? {}), node_type: node.node_type });
  const changedRemotely =
    latest.content !== snapshot.content || JSON.stringify(latest.metadata ?? {}) !== snapshot.metadata || latest.node_type !== snapshot.node_type;

  const saveEdits = async (e: FormEvent) => {
    e.preventDefault();
    setConflict("");
    if (changedRemotely) {
      setConflict(`${nameOf(latest.updated_by)} changed this card while you had it open. Your text is still in the box. Review their version below.`);
      return;
    }
    const patch = {
      content: content.trim(),
      metadata: config.type === "evidence_map" ? { ...meta, claim: content.trim() } : meta,
      node_type: config.nodeTypes ? nodeType : node.node_type,
    };
    const { data: rows, error } = await track(
      supabase.from("map_nodes").update(patch).eq("id", node.id).eq("updated_at", latest.updated_at).select("id"),
    );
    if (error) return;
    if (!rows || rows.length === 0) {
      setConflict("Someone saved this card at the same moment. Your text is still in the box. Review the saved version below.");
      refresh(["nodes"]);
      return;
    }
    setSnapshot({ content: patch.content, metadata: JSON.stringify(patch.metadata), node_type: patch.node_type });
    setStatus("Saved.");
    onClose();
  };

  const saveAnyway = async () => {
    await track(supabase.from("map_nodes").update({ content: content.trim(), metadata: meta, node_type: nodeType }).eq("id", node.id));
    onClose();
  };

  const setNodeStatus = async (s: MapNode["status"]) => {
    await track(supabase.from("map_nodes").update({ status: s }).eq("id", node.id));
    setStatus(s === "in_matrix" ? "Sent to the Decision Matrix." : s === "archived" ? "Archived." : "Restored.");
  };

  const connect = async () => {
    if (!target) return;
    const { error } = await track(supabase.from("map_edges").insert({ map_id: node.map_id, project_id: node.project_id, from_node_id: node.id, to_node_id: target, created_by: me }));
    if (!error) { setStatus("Connected."); setTarget(""); }
  };
  const group = async () => {
    if (!target) return;
    const t = others.find((o) => o.id === target);
    const leader = t?.parent_node_id ?? target;
    if (leader === node.id) return;
    await track(supabase.from("map_nodes").update({ parent_node_id: leader }).eq("id", node.id));
    setStatus("Added to group.");
  };
  const combine = async () => {
    const t = others.find((o) => o.id === target);
    if (!t) return;
    const { error } = await track(supabase.from("map_nodes").insert({
      map_id: node.map_id, project_id: node.project_id, author_id: me, category: node.category,
      content: `${node.content} + ${t.content}`, x_position: node.x_position + 20, y_position: node.y_position + 20,
      metadata: { combined_from: [node.id, t.id] },
    }));
    if (!error) {
      await track(supabase.from("map_nodes").update({ status: "archived" }).in("id", [node.id, t.id]));
      onClose();
    }
  };
  const remove = async () => {
    await track(supabase.from("map_nodes").delete().eq("id", node.id));
    onClose();
  };

  const myEdges = edges.filter((e) => e.from_node_id === node.id || e.to_node_id === node.id);
  const labelOf = (id: string) => others.find((o) => o.id === id)?.content.slice(0, 40) ?? "a card";

  return (
    <Dialog open onClose={onClose} title="Card" wide>
      <p className="mb-3 text-sm text-ink-muted">
        {zones.find((z) => z.key === node.category)?.label ?? node.category} · added by {nameOf(node.author_id)}
      </p>
      <p role="status" aria-live="polite" className="text-sm font-semibold text-navy">{status}</p>

      {canEdit ? (
        <form onSubmit={saveEdits} className="space-y-4">
          <div>
            <label htmlFor="edit-card" className="label">{config.type === "evidence_map" ? "Claim" : "Card text"}</label>
            <textarea id="edit-card" className="input" value={content} onChange={(e) => setContent(e.target.value)} required />
          </div>
          <MetadataFields config={config} meta={meta} setMeta={setMeta} nodeType={nodeType} setNodeType={setNodeType} />
          {(conflict || changedRemotely) && (
            <div role="alert" className="rounded-btn border-2 border-terra p-3 text-sm">
              <p className="font-semibold text-navy">{conflict || `${nameOf(latest.updated_by)} just changed this card.`}</p>
              <p className="mt-1"><span className="font-semibold">Current saved text:</span> {latest.content}</p>
              <button type="button" className="btn-secondary btn-sm mt-2" onClick={saveAnyway}>Replace it with my version</button>
            </div>
          )}
          <div className="flex justify-end">
            <button type="submit" className="btn-primary" disabled={!content.trim()}>Save card</button>
          </div>
        </form>
      ) : (
        <p className="font-semibold text-navy">{node.content}</p>
      )}

      {canEdit && (
        <div className="mt-6 space-y-5 border-t border-line pt-4">
          <div>
            <label htmlFor="move-zone" className="label">Move to</label>
            <div className="flex flex-wrap gap-2">
              <select id="move-zone" className="input max-w-xs" value={node.category} onChange={(e) => onMoveZone(e.target.value)}>
                {zones.map((z) => <option key={z.key} value={z.key}>{z.label}</option>)}
              </select>
              <div role="group" aria-label="Nudge card position" className="flex gap-1">
                <button type="button" className="btn-secondary btn-sm" onClick={() => onNudge(-40, 0)} aria-label="Move left">{"←"}</button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => onNudge(0, -40)} aria-label="Move up">{"↑"}</button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => onNudge(0, 40)} aria-label="Move down">{"↓"}</button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => onNudge(40, 0)} aria-label="Move right">{"→"}</button>
              </div>
            </div>
          </div>

          {others.length > 0 && (
            <div>
              <label htmlFor="other-card" className="label">Another card</label>
              <select id="other-card" className="input" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose a card</option>
                {others.map((o) => <option key={o.id} value={o.id}>{o.content.slice(0, 70)}</option>)}
              </select>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="btn-secondary btn-sm" disabled={!target} onClick={connect}>Connect with an arrow</button>
                <button type="button" className="btn-secondary btn-sm" disabled={!target} onClick={group}>Group with it</button>
                {config.type === "idea_map" && <button type="button" className="btn-secondary btn-sm" disabled={!target} onClick={combine}>Combine into a new idea</button>}
              </div>
            </div>
          )}

          {myEdges.length > 0 && (
            <div>
              <p className="label">Connections</p>
              <ul className="space-y-1 text-sm">
                {myEdges.map((e) => (
                  <li key={e.id} className="flex items-center gap-2">
                    {e.from_node_id === node.id ? `Arrow to: ${labelOf(e.to_node_id)}` : `Arrow from: ${labelOf(e.from_node_id)}`}
                    <button type="button" className="btn-quiet btn-sm underline" onClick={() => track(supabase.from("map_edges").delete().eq("id", e.id))}>Remove</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {node.parent_node_id && (
              <button type="button" className="btn-secondary btn-sm" onClick={() => track(supabase.from("map_nodes").update({ parent_node_id: null }).eq("id", node.id))}>Remove from group</button>
            )}
            {config.type === "idea_map" && (node.status === "in_matrix" ? (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setNodeStatus("active")}>Remove from Decision Matrix</button>
            ) : node.status === "active" ? (
              <button type="button" className="btn-primary btn-sm" onClick={() => setNodeStatus("in_matrix")}>Send to Decision Matrix</button>
            ) : null)}
            {config.type === "idea_map" && (node.status === "archived" ? (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setNodeStatus("active")}>Restore idea</button>
            ) : (
              <button type="button" className="btn-secondary btn-sm" onClick={() => setNodeStatus("archived")}>Archive idea</button>
            ))}
            {!confirmDelete ? (
              <button type="button" className="btn btn-sm border-danger bg-white text-danger" onClick={() => setConfirmDelete(true)}>Delete card</button>
            ) : (
              <span className="flex items-center gap-2 text-sm">
                Delete this card for the whole team?
                <button type="button" className="btn btn-sm border-danger bg-danger text-white" onClick={remove}>Yes, delete</button>
                <button type="button" className="btn-secondary btn-sm" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </span>
            )}
          </div>
        </div>
      )}
    </Dialog>
  );
}
