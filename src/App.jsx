import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const CLIENT_ID = Math.random().toString(36).slice(2);
const uid = () => Math.random().toString(36).slice(2, 10);
const newTab = (name, content = "") => ({ id: uid(), name, content });
const TAB_RE = /^=== \[Tab: (.*?)\] ===[ \t]*$/gm;

// ---- workspace id lives in the URL (?w=...) — share the URL to cross-sync devices
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

// ---- format helpers
const serialize = (tabs) => tabs.map(t => `=== [Tab: ${t.name}] ===\n${t.content}`).join("\n\n");
function parseTabs(text) {
  const matches = [...text.matchAll(TAB_RE)];
  if (!matches.length) return null;
  return matches.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    return newTab(m[1].trim() || `Tab ${i + 1}`, text.slice(start, end).replace(/^\n/, "").replace(/\s+$/, ""));
  });
}
function download(filename, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
  a.download = filename; a.click(); URL.revokeObjectURL(a.href);
}
const safeName = (s) => (s || "tab").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") || "tab";

export default function App() {
  const [wsId, setWsId] = useState(getWorkspaceId);
  const [tabs, setTabs] = useState([newTab("Tab 1")]);
  const [activeId, setActiveId] = useState(null);
  const [status, setStatus] = useState("loading");
  const [toast, setToast] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const timer = useRef(null);
  const toastTimer = useRef(null);
  const loaded = useRef(false);

  const active = tabs.find(t => t.id === activeId) || tabs[0];
  const say = (m) => { setToast(m); clearTimeout(toastTimer.current); toastTimer.current = setTimeout(() => setToast(""), 2200); };

  // ---- load + realtime
  useEffect(() => {
    loaded.current = false; setStatus("loading");
    let cancelled = false;
    (async () => {
      const { data, error } = await sb.from("workspaces").select("tabs").eq("id", wsId).maybeSingle();
      if (cancelled) return;
      if (error) { setStatus("error"); say(`Load failed: ${error.message}`); }
      else if (data?.tabs?.length) { setTabs(data.tabs); setActiveId(data.tabs[0].id); setStatus("saved"); }
      else { const t = [newTab("Tab 1")]; setTabs(t); setActiveId(t[0].id); setStatus("saved"); }
      loaded.current = true;
    })();
    const ch = sb.channel(`ws-${wsId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "workspaces", filter: `id=eq.${wsId}` }, (p) => {
        const row = p.new;
        if (!row || row.writer === CLIENT_ID || !row.tabs?.length) return;
        setTabs(row.tabs);
        setActiveId(cur => row.tabs.some(t => t.id === cur) ? cur : row.tabs[0].id);
        setStatus("saved");
      }).subscribe();
    return () => { cancelled = true; sb.removeChannel(ch); };
  }, [wsId]);

  // ---- debounced save
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
    timer.current = setTimeout(() => save(next), 800);
  };

  // ---- tab actions
  const updateActive = (patch) => commit(tabs.map(t => t.id === active.id ? { ...t, ...patch } : t));
  const addTab = () => { const t = newTab(`Tab ${tabs.length + 1}`); commit([...tabs, t]); setActiveId(t.id); };
  const removeTab = (id) => {
    const t = tabs.find(x => x.id === id);
    if (t.content.trim() && !confirm(`Delete "${t.name}"?`)) return;
    const next = tabs.filter(x => x.id !== id);
    const final = next.length ? next : [newTab("Tab 1")];
    commit(final); if (id === active.id) setActiveId(final[0].id);
  };
  const addImported = (parsed) => {
    commit([...tabs, ...parsed]); setActiveId(parsed[0].id);
    say(`Created ${parsed.length} tab${parsed.length > 1 ? "s" : ""}`);
  };

  // ---- copy / download
  const copy = (text, msg) => navigator.clipboard.writeText(text).then(() => say(msg));
  const copyTab = () => copy(active.content, "Tab copied");
  const copyAll = () => copy(serialize(tabs), "All tabs copied");
  const dlTab = () => download(`${safeName(active.name)}.txt`, active.content);
  const dlAll = () => download(`${safeName(wsId)}-all-tabs.txt`, serialize(tabs));

  const onPaste = (e) => {
    const text = e.clipboardData.getData("text");
    const parsed = parseTabs(text);
    if (parsed) { e.preventDefault(); addImported(parsed); }
  };
  const runImport = () => {
    const parsed = parseTabs(importText);
    addImported(parsed || [newTab(`Tab ${tabs.length + 1}`, importText.trim())]);
    setImportText(""); setImportOpen(false);
  };

  const switchWorkspace = () => {
    const w = prompt("Workspace ID (leave blank for a new one):", wsId);
    if (w === null) return;
    const url = new URL(location.href);
    url.searchParams.set("w", w.trim() || crypto.randomUUID().replace(/-/g, "").slice(0, 16));
    history.replaceState(null, "", url); setWsId(url.searchParams.get("w"));
  };
  const copyLink = () => copy(location.href, "Workspace link copied — open it anywhere to sync");

  const chars = useMemo(() => active?.content.length ?? 0, [active]);
  const statusText = { loading: "Loading…", saving: "Saving…", saved: "Synced", error: "Sync error" }[status];

  return (
    <div className="wrap">
      <header className="card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div><h1>ClipMaster <span>Pro</span></h1><p className="sub">Tabbed clipboard scratchpad, synced by workspace link.</p></div>
          <div className="row">
            <input className="ws" readOnly value={wsId} title="Workspace ID" onClick={e => e.target.select()} />
            <button className="pill" onClick={copyLink}>Copy link</button>
            <button className="pill" onClick={switchWorkspace}>Switch</button>
          </div>
        </div>
        <div className="row" style={{ marginTop: ".75rem" }}>
          <button className="pill" onClick={copyTab}>Copy tab</button>
          <button className="pill main" onClick={copyAll}>Copy all tabs</button>
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

      <textarea value={active.content} onChange={e => updateActive({ content: e.target.value })} onPaste={onPaste}
        placeholder={`Paste into "${active.name}"… Pasting text with "=== [Tab: Name] ===" markers creates tabs automatically.`} />

      <div className="meta">
        <span><i className={`dot ${status}`} />{statusText}</span>
        <span>{chars} characters · {tabs.length} tab{tabs.length > 1 ? "s" : ""}</span>
      </div>

      {importOpen && (
        <div className="modal" onClick={() => setImportOpen(false)}>
          <div className="card" onClick={e => e.stopPropagation()}>
            <strong>Paste tabs</strong>
            <p className="sub">Paste text from “Copy all tabs” or a downloaded file. Each “=== [Tab: Name] ===” section becomes a tab. Plain text becomes one tab.</p>
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
