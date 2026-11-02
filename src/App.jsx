import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const CLIENT_ID = Math.random().toString(36).slice(2);
const uid = () => Math.random().toString(36).slice(2, 10);
const FIRST = "--- [Paste #1] ---\n\n";
const TAB_RE = /^=== \[Tab: (.*?)\] ===[ \t]*$/gm;
const WASHI = ["#FFD9EC", "#D9EEFF", "#FFF0C7", "#E1D6FF", "#D3F6E7"];

// Every tab is its own segmented buffer: "--- [Paste #n] ---" markers split it into segments.
const normalize = (c) => {
  if (/--- \[Paste #\d+\] ---/.test(c)) return c;
  const t = (c || "").trim();
  return t ? `--- [Paste #1] ---\n\n${t}\n\n--- [Paste #2] ---\n\n` : FIRST;
};
const newTab = (name, content = FIRST) => ({ id: uid(), name, content: normalize(content) });
const getFragments = (text) =>
  text.split(/--- \[Paste #\d+\] ---/g).map(s => s.trim()).filter(Boolean);

const serialize = (tabs) => tabs.map(t => `=== [Tab: ${t.name}] ===\n${t.content}`).join("\n\n");
function parseTabs(text) {
  const m = [...text.matchAll(TAB_RE)];
  if (!m.length) return null;
  return m.map((x, i) => {
    const start = x.index + x[0].length;
    const end = i + 1 < m.length ? m[i + 1].index : text.length;
    return newTab(x[1].trim() || `Tab ${i + 1}`, text.slice(start, end).replace(/^\n/, ""));
  });
}
function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}
const safeName = (s) => (s || "tab").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "tab";
const go = (id) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

function getWorkspaceId() {
  const url = new URL(location.href);
  let w = url.searchParams.get("w");
  if (!w) {
    w = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    url.searchParams.set("w", w);
    history.replaceState(null, "", url);
  }
  return w;
}

const CSS = `
.grid2{display:grid;grid-template-columns:1fr;gap:1rem}
@media(min-width:1024px){.grid2{grid-template-columns:2fr 1fr}}
.lbl{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
.seglist{display:flex;flex-direction:column;gap:1.25rem;height:55vh;overflow-y:auto;padding:.5rem .25rem .25rem 0}
.seg{position:relative;background:#fff;border:1px solid var(--border);border-radius:1.4rem;padding:1.4rem 1.1rem 1rem;box-shadow:0 10px 30px -14px rgba(184,95,204,.3)}
.seg .tape{position:absolute;top:-.7rem;left:50%;width:5rem;height:1.4rem;transform:translateX(-50%) rotate(-3deg);border-radius:.15rem;opacity:.9;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.seg pre{margin:0;font:.75rem "JetBrains Mono",monospace;white-space:pre-wrap;word-break:break-word;color:rgba(64,44,85,.85)}
.nav{display:flex;gap:.4rem;overflow-x:auto;padding-bottom:.6rem;margin-bottom:.6rem;border-bottom:1px solid var(--border)}
.nb{padding:.2rem .7rem;background:#fff;border:1px solid var(--border);border-radius:.5rem;font-size:.75rem;font-weight:700;color:var(--muted);flex-shrink:0}
.nb.on,.nb:hover{border-color:rgba(184,95,204,.5);color:var(--primary)}
.sh{display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem}
.ib{padding:.25rem .5rem;border-radius:.5rem;color:var(--muted);font-size:.8rem;font-weight:700}
.ib:hover{background:#efe6fb;color:var(--primary)}
.sf{margin-top:.8rem;padding-top:.6rem;border-top:1px solid rgba(228,214,247,.6);display:flex;justify-content:space-between;align-items:center}
.empty{margin:auto;text-align:center;padding:2rem;border:2px dashed var(--border);border-radius:1.5rem;color:var(--muted);font-size:.85rem}
.pill.sm{padding:.4rem .8rem;font-size:.75rem}
.pill.p{background:rgba(184,95,204,.1);color:var(--primary);border-color:transparent}
.pill.s{background:rgba(79,182,224,.15);color:#0f3140;border-color:transparent}
.pill.m{background:rgba(63,207,158,.15);color:#06301f;border-color:transparent}
`;

export default function App() {
  const [wsId, setWsId] = useState(getWorkspaceId);
  const [tabs, setTabs] = useState([newTab("Tab 1")]);
  const [activeId, setActiveId] = useState(null);
  const [status, setStatus] = useState("loading");
  const [toast, setToast] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const timer = useRef(null), toastTimer = useRef(null), loaded = useRef(false);
  const taRef = useRef(null), pendingCursor = useRef(null);

  const active = tabs.find(t => t.id === activeId) || tabs[0];
  const frags = useMemo(() => getFragments(active.content), [active.content]);
  const say = (m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2200); };

  useLayoutEffect(() => {
    if (pendingCursor.current != null && taRef.current) {
      taRef.current.setSelectionRange(pendingCursor.current, pendingCursor.current);
      pendingCursor.current = null;
    }
  });

  // ---- load + realtime cross-sync
  useEffect(() => {
    loaded.current = false; setStatus("loading");
    let cancelled = false;
    const fix = (arr) => arr.map(t => ({ ...t, content: normalize(t.content) }));
    (async () => {
      const { data, error } = await sb.from("workspaces").select("tabs").eq("id", wsId).maybeSingle();
      if (cancelled) return;
      if (error) { setStatus("error"); say(`Load failed: ${error.message}`); }
      if (data?.tabs?.length) { const t = fix(data.tabs); setTabs(t); setActiveId(t[0].id); }
      else { const t = [newTab("Tab 1")]; setTabs(t); setActiveId(t[0].id); }
      if (!error) setStatus("saved");
      loaded.current = true;
    })();
    const ch = sb.channel(`ws-${wsId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "workspaces", filter: `id=eq.${wsId}` }, (p) => {
        const row = p.new;
        if (!row || row.writer === CLIENT_ID || !row.tabs?.length) return;
        const t = fix(row.tabs);
        setTabs(t);
        setActiveId(cur => t.some(x => x.id === cur) ? cur : t[0].id);
        setStatus("saved");
      }).subscribe();
    return () => { cancelled = true; sb.removeChannel(ch); };
  }, [wsId]);

  const save = useCallback(async (next) => {
    setStatus("saving");
    const { error } = await sb.from("workspaces").upsert({ id: wsId, tabs: next, writer: CLIENT_ID, updated_at: new Date().toISOString() });
    if (error) { setStatus("error"); say(`Sync failed: ${error.message}`); } else setStatus("saved");
  }, [wsId]);

  const commit = (next) => {
    setTabs(next);
    if (!loaded.current) return;
    setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), 1200);
  };
  const setActiveContent = (content) => commit(tabs.map(t => t.id === active.id ? { ...t, content } : t));

  // ---- AUTO-SEGMENT: a paste (jump of >5 chars) drops a new marker after the pasted text
  const onEditorChange = (e) => {
    const ta = e.target;
    let next = ta.value;
    const prev = active.content;
    if (next.length > prev.length + 5) {
      const total = (next.match(/\[Paste #\d+\]/g) || []).length;
      const marker = `\n\n--- [Paste #${total + 1}] ---\n\n`;
      const cursor = ta.selectionStart;
      next = next.slice(0, cursor) + marker + next.slice(cursor);
      pendingCursor.current = cursor + marker.length;
      say("Auto-marked segment!");
    }
    setActiveContent(next);
  };

  // ---- tab actions
  const addTab = () => { const t = newTab(`Tab ${tabs.length + 1}`); commit([...tabs, t]); setActiveId(t.id); };
  const removeTab = (id) => {
    const t = tabs.find(x => x.id === id);
    if (getFragments(t.content).length && !confirm(`Delete "${t.name}" and its segments?`)) return;
    const next = tabs.filter(x => x.id !== id);
    const final = next.length ? next : [newTab("Tab 1")];
    commit(final); if (id === active.id) setActiveId(final[0].id);
  };
  const clearTab = () => {
    if (frags.length && !confirm(`Clear all segments in "${active.name}"?`)) return;
    setActiveContent(FIRST); say("Tab cleared");
  };
  const addImported = (parsed) => {
    commit([...tabs, ...parsed]); setActiveId(parsed[0].id);
    say(`Created ${parsed.length} tab${parsed.length > 1 ? "s" : ""}`);
  };

  // ---- copy / download
  const copy = (text, msg) => navigator.clipboard.writeText(text).then(() => say(msg));
  const copyAllContent = () => copy(active.content, "Full buffer copied!");
  const copyClean = () => copy(frags.join("\n"), "Clean copy done!");
  const copyCleanSpaced = () => copy(frags.join("\n\n"), "Clean copy (blank line) done!");
  const copyCleanOneLine = () => copy(frags.map(f => f.replace(/\s+/g, " ").trim()).join(" ").replace(/\s+/g, " ").trim(), "Single-line copy done!");
  const copyAllTabs = () => copy(serialize(tabs), "All tabs copied!");
  const dlTab = () => download(`${safeName(active.name)}.txt`, active.content);
  const dlAll = () => download(`${safeName(wsId)}-all-tabs.txt`, serialize(tabs));

  const onPaste = (e) => {
    const parsed = parseTabs(e.clipboardData.getData("text"));
    if (parsed) { e.preventDefault(); addImported(parsed); }
  };
  const runImport = () => {
    addImported(parseTabs(importText) || [newTab(`Tab ${tabs.length + 1}`, importText)]);
    setImportText(""); setImportOpen(false);
  };

  const switchWorkspace = () => {
    const w = prompt("Workspace ID (leave blank for a new one):", wsId);
    if (w === null) return;
    const url = new URL(location.href);
    url.searchParams.set("w", w.trim() || crypto.randomUUID().replace(/-/g, "").slice(0, 16));
    history.replaceState(null, "", url); setWsId(url.searchParams.get("w"));
  };

  const statusText = { loading: "Loading…", saving: "Saving…", saved: "Synced", error: "Sync error" }[status];

  return (
    <div className="wrap" id="top">
      <style>{CSS}</style>

      <header className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div><h1>ClipMaster <span>Pro</span></h1><p className="sub">Tabbed, auto-segmenting clipboard scratchpad synced by workspace link.</p></div>
          <div className="row">
            <input className="ws" readOnly value={wsId} title="Workspace ID" onClick={e => e.target.select()} />
            <button className="pill" onClick={() => copy(location.href, "Workspace link copied — open it anywhere to sync")}>Copy link</button>
            <button className="pill" onClick={switchWorkspace}>Switch</button>
          </div>
        </div>
        <div className="row" style={{ marginTop: ".75rem" }}>
          <button className="pill main" onClick={copyAllTabs}>Copy all tabs</button>
          <button className="pill" onClick={dlTab}>Download tab</button>
          <button className="pill" onClick={dlAll}>Download all tabs</button>
          <button className="pill" onClick={() => setImportOpen(true)}>Paste tabs…</button>
        </div>
      </header>

      <div className="tabs">
        {tabs.map(t => (
          <div key={t.id} className={`tab ${t.id === active.id ? "active" : ""}`} onClick={() => setActiveId(t.id)}>
            {renamingId === t.id ? (
              <input autoFocus defaultValue={t.name} onClick={e => e.stopPropagation()}
                onBlur={e => { commit(tabs.map(x => x.id === t.id ? { ...x, name: e.target.value.trim() || x.name } : x)); setRenamingId(null); }}
                onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Escape") setRenamingId(null); }} />
            ) : (
              <span onDoubleClick={() => setRenamingId(t.id)} title="Double-click to rename">{t.name}</span>
            )}
            <button className="x" title="Rename" onClick={e => { e.stopPropagation(); setRenamingId(t.id); }}>✎</button>
            <button className="x" title="Delete tab" onClick={e => { e.stopPropagation(); removeTab(t.id); }}>×</button>
          </div>
        ))}
        <button className="tab add" onClick={addTab}>+ New tab</button>
      </div>

      <div className="row">
        <span className="lbl">{active.name}</span>
        <button className="pill sm p" onClick={copyClean}>Copy Clean</button>
        <button className="pill sm s" onClick={copyCleanSpaced}>Copy Clean (blank line)</button>
        <button className="pill sm m" onClick={copyCleanOneLine}>Copy Clean (no newlines)</button>
        <button className="pill sm main" onClick={copyAllContent}>Copy All Content</button>
        <button className="pill sm danger" onClick={clearTab}>Clear tab</button>
      </div>

      <div className="grid2">
        <section style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="lbl">Master Input</span>
            <span className="meta" style={{ fontSize: 10 }}>{active.content.length} characters</span>
          </div>
          <textarea ref={taRef} value={active.content} onChange={onEditorChange} onPaste={onPaste}
            placeholder="Paste items here to auto-index them…" />
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
          <span className="lbl">Segmented Library · {active.name}</span>
          <div className="seglist">
            {frags.length === 0 ? (
              <div className="empty">No segments detected yet.<br />Paste something into the master input.</div>
            ) : frags.map((f, i) => (
              <div key={i} id={`seg-${i}`} className="seg">
                <div className="tape" style={{ background: WASHI[i % WASHI.length] }} />
                <div className="nav">
                  {frags.map((_, j) => <button key={j} className={`nb ${j === i ? "on" : ""}`} onClick={() => go(`seg-${j}`)}>{j + 1}</button>)}
                </div>
                <div className="sh" id={`copy-head-${i}`}>
                  <span className="lbl">Segment {i + 1}</span>
                  <div className="row" style={{ gap: ".1rem" }}>
                    <button className="ib" title="Jump to end" onClick={() => go(`seg-foot-${i}`)}>↓</button>
                    <button className="ib" title="Copy segment" onClick={() => copy(f, "Segment copied!")}>Copy</button>
                    {i > 0 && <button className="ib" title="Previous" onClick={() => go(`seg-${i - 1}`)}>⌃</button>}
                    {i < frags.length - 1 && <button className="ib" title="Next" onClick={() => go(`seg-${i + 1}`)}>⌄</button>}
                  </div>
                </div>
                <pre>{f}</pre>
                <div className="sf" id={`seg-foot-${i}`}>
                  <span className="lbl" style={{ fontSize: 9 }}>End of Seg {i + 1}</span>
                  <button className="ib" onClick={() => go(`copy-head-${i}`)}>Jump to Copy</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="meta">
        <span><i className={`dot ${status}`} />{statusText}</span>
        <span>{frags.length} segment{frags.length !== 1 ? "s" : ""} in this tab · {tabs.length} tab{tabs.length !== 1 ? "s" : ""}</span>
      </div>

      {importOpen && (
        <div className="modal" onClick={() => setImportOpen(false)}>
          <div className="card" onClick={e => e.stopPropagation()}>
            <strong>Paste tabs</strong>
            <p className="sub">Paste text from “Copy all tabs” or a downloaded file. Each “=== [Tab: Name] ===” section becomes a tab with its own segments. Plain text becomes one tab.</p>
            <textarea autoFocus value={importText} onChange={e => setImportText(e.target.value)} />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="pill" onClick={() => setImportOpen(false)}>Cancel</button>
              <button className="pill main" disabled={!importText.trim()} onClick={runImport}>Create tabs</button>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
