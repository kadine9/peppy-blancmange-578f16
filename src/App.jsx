import { useEffect, useLayoutEffect, useMemo, useRef, useState, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const CLIENT_ID = Math.random().toString(36).slice(2);
const uid = () => Math.random().toString(36).slice(2, 10);
const FIRST = "--- [Paste #1] ---\n\n";
// Accepts "===== Name =====" (your original format) and "=== [Tab: Name] ==="
const TAB_RE = /^(?:=== \[Tab: (.*?)\] ===|={3,}[ \t]*([^=\s].*?)[ \t]*={3,})[ \t]*$/gm;
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

const serialize = (tabs) => tabs.map(t => `===== ${t.name} =====\n\n${t.content}`).join("\n\n");
function parseTabs(text) {
  const m = [...text.matchAll(TAB_RE)];
  if (!m.length) return null;
  return m.map((x, i) => {
    const start = x.index + x[0].length;
    const end = i + 1 < m.length ? m[i + 1].index : text.length;
    return newTab((x[1] ?? x[2] ?? "").trim() || `Tab ${i + 1}`, text.slice(start, end).replace(/^\n+/, ""));
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

const FLOATERS = [
  { top: "6%", left: "8%", size: 46, opacity: 0.55, duration: 15, delay: 0, kind: "cloud", color: "#8FC9EA" },
  { top: "14%", left: "78%", size: 60, opacity: 0.5, duration: 18, delay: 2, kind: "cloud", color: "#8FC9EA", hideOnMobile: true },
  { top: "68%", left: "4%", size: 38, opacity: 0.45, duration: 14, delay: 1, kind: "cloud", color: "#8FC9EA" },
  { top: "82%", left: "85%", size: 50, opacity: 0.5, duration: 17, delay: 3, kind: "cloud", color: "#8FC9EA", hideOnMobile: true },
  { top: "24%", left: "18%", size: 18, opacity: 0.8, duration: 4, delay: 0.4, kind: "star", color: "#FFC24B" },
  { top: "40%", left: "92%", size: 14, opacity: 0.7, duration: 5, delay: 1.2, kind: "star", color: "#FF7FB4" },
  { top: "88%", left: "40%", size: 16, opacity: 0.75, duration: 4.5, delay: 0.8, kind: "star", color: "#B85FCC" },
  { top: "10%", left: "48%", size: 20, opacity: 0.6, duration: 6, delay: 0.6, kind: "sparkle", color: "#B85FCC" },
  { top: "55%", left: "10%", size: 16, opacity: 0.55, duration: 5.5, delay: 1.6, kind: "sparkle", color: "#4FB6E0", hideOnMobile: true },
  { top: "30%", left: "4%", size: 40, opacity: 0.5, duration: 16, delay: 0.5, kind: "rainbow", color: "" },
];

function FloaterIcon({ f }) {
  const box = { width: f.size, height: f.size, color: f.color };
  const twinkle = { ...box, animationDelay: `${f.delay}s` };
  if (f.kind === "cloud") return (
    <svg style={box} viewBox="0 0 24 24" fill={f.color} fillOpacity={0.25} stroke={f.color} strokeWidth="1.75">
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h.79a4.5 4.5 0 1 1 0 9Z" />
    </svg>
  );
  if (f.kind === "star") return (
    <svg className="floater-twinkle" style={twinkle} viewBox="0 0 24 24" fill={f.color} stroke={f.color} strokeWidth="1.75">
      <path d="M12 2l2.9 6.6L22 9.3l-5 4.9 1.2 7.1L12 17.8l-6.2 3.5L7 14.2 2 9.3l7.1-.7z" />
    </svg>
  );
  if (f.kind === "sparkle") return (
    <svg className="floater-twinkle" style={twinkle} viewBox="0 0 24 24" fill="none" stroke={f.color} strokeWidth="1.75">
      <path d="M12 3l1.5 5L19 9.5l-5 1.5L12 16l-1.5-5L5 9.5l5-1.5z" />
    </svg>
  );
  return (
    <svg viewBox="0 0 64 40" style={{ width: f.size, height: f.size * 0.6 }} fill="none">
      <path d="M4 38a28 28 0 0 1 56 0" stroke="#FF7FB4" strokeWidth="6" strokeLinecap="round" />
      <path d="M12 38a20 20 0 0 1 40 0" stroke="#FFC24B" strokeWidth="6" strokeLinecap="round" />
      <path d="M20 38a12 12 0 0 1 24 0" stroke="#4FB6E0" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

function Floaters() {
  return (
    <div className="floaters" aria-hidden="true">
      {FLOATERS.map((f, i) => (
        <div key={i}
          className={`floater${f.duration > 10 ? " slow" : ""}${f.hideOnMobile ? " desk" : ""}`}
          style={{ top: f.top, left: f.left, opacity: f.opacity, animationDuration: `${f.duration}s`, animationDelay: `${f.delay}s` }}>
          <FloaterIcon f={f} />
        </div>
      ))}
    </div>
  );
}

// ClipMaster pastel theme: purple / pink / sky / mint, frosted cards, gradient pills, big radii.
const CSS = `
:root{
  --primary:#B85FCC; --rose:#FF7FB4; --secondary:#4FB6E0; --accent:#FFB020; --mint:#3FCF9E;
  --border:#E4D6F7; --fg:#402C55; --muted:#7C6892; --destructive:#E8577A;
  --bg1:#FBF4FF; --bg2:#EAF6FF; --bg3:#FFF0F7;
}
*{box-sizing:border-box}
html,body{margin:0;overflow-x:hidden}
body{
  color:var(--fg); font-family:"Nunito","Quicksand",ui-rounded,system-ui,-apple-system,"Segoe UI",sans-serif;
  background:
    radial-gradient(60rem 40rem at 0% 0%,var(--bg3),transparent 60%),
    radial-gradient(50rem 40rem at 100% 10%,var(--bg2),transparent 60%),
    linear-gradient(180deg,var(--bg1),#fff);
  background-attachment:fixed; min-height:100vh;
}
button{font:inherit;cursor:pointer;border:0;background:none;color:inherit}
button:disabled{opacity:.5;cursor:not-allowed}

.wrap{position:relative;z-index:1;width:100%;max-width:80rem;overflow-x:clip;margin:0 auto;padding:1.5rem 1rem 7rem;display:flex;flex-direction:column;gap:1.25rem}
@media(min-width:640px){.wrap{padding:2rem 1.5rem 7rem;gap:1.5rem}}
@media(min-width:768px){.wrap{padding:2.5rem 2.5rem 7rem}}
.row{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem}

/* header card */
.card{position:relative;background:rgba(255,255,255,.7);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  border:1px solid rgba(228,214,247,.7);border-radius:2rem;padding:1.25rem;box-shadow:0 20px 40px -20px rgba(184,95,204,.35)}
@media(min-width:640px){.card{padding:2rem}}
.card h1{margin:0;font-size:1.6rem;font-weight:800;letter-spacing:-.02em;display:flex;align-items:center;gap:.75rem}
@media(min-width:640px){.card h1{font-size:1.9rem}}
.card h1 span{color:var(--primary)}
.sub{margin:.25rem 0 0;color:var(--muted);font-weight:600;font-size:.85rem}
.logo{flex-shrink:0;display:grid;place-items:center;width:3rem;height:3rem;border-radius:1rem;color:#fff;
  background:linear-gradient(135deg,var(--primary),var(--rose));box-shadow:0 6px 14px -4px rgba(184,95,204,.5)}
.title{display:flex;align-items:center;gap:.75rem}

/* stickers */
.sticker{position:absolute;display:grid;place-items:center;border-radius:50%;box-shadow:0 6px 14px -4px rgba(0,0,0,.25);
  border:3px solid #fff;animation:pop .5s cubic-bezier(.3,1.6,.5,1) both}
.sticker.a{width:44px;height:44px;background:linear-gradient(145deg,#FFDA82,#FFB020);transform:rotate(-14deg);top:-1rem;left:-.75rem}
.sticker.b{width:56px;height:56px;background:linear-gradient(145deg,#fff,#F1E6FF);transform:rotate(8deg);top:-1.25rem;right:-1rem;display:none}
@media(min-width:640px){.sticker.b{display:grid}}
@keyframes pop{from{opacity:0;scale:.4}to{opacity:1;scale:1}}
@media(prefers-reduced-motion:reduce){.sticker{animation:none}}

/* pills */
.pill{display:inline-flex;align-items:center;gap:.5rem;padding:.6rem 1rem;border-radius:999px;font-weight:700;font-size:.8rem;
  background:#fff;border:1px solid var(--border);color:rgba(64,44,85,.7);box-shadow:0 1px 3px rgba(64,44,85,.08);transition:transform .15s,box-shadow .15s}
@media(min-width:640px){.pill{font-size:.875rem}}
.pill:hover:not(:disabled){transform:scale(1.04);box-shadow:0 6px 14px -6px rgba(184,95,204,.45)}
.pill.main{color:#fff;border-color:transparent;background:linear-gradient(90deg,var(--primary),var(--rose))}
.pill.danger{color:var(--destructive);background:rgba(232,87,122,.1);border-color:transparent}
.pill.sm{padding:.4rem .8rem;font-size:.75rem}
.pill.p{background:rgba(184,95,204,.1);color:var(--primary);border-color:transparent}
.pill.s{background:rgba(79,182,224,.15);color:#0f3140;border-color:transparent}
.pill.m{background:rgba(63,207,158,.15);color:#06301f;border-color:transparent}
.pill:focus-visible,.tab:focus-visible,.ib:focus-visible,.nb:focus-visible{outline:3px solid rgba(184,95,204,.4);outline-offset:2px}

.ws{width:9.5rem;padding:.55rem .9rem;border-radius:999px;border:1px solid var(--border);background:#fff;
  font:.75rem "JetBrains Mono",ui-monospace,monospace;color:var(--muted)}

/* tabs */
.tabs{display:flex;align-items:center;gap:.4rem;overflow-x:auto;padding:.25rem .1rem .5rem;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab{display:flex;align-items:center;gap:.5rem;flex-shrink:0;white-space:nowrap;padding:.6rem .5rem .6rem .8rem;border-radius:1rem;
  cursor:pointer;border:1px solid transparent;background:rgba(255,255,255,.4);color:var(--muted);font-weight:700;font-size:.875rem;transition:all .15s}
.tab:hover{background:rgba(255,255,255,.75)}
.tab::before{content:"";width:.5rem;height:.5rem;border-radius:50%;background:var(--border)}
.tab.active{background:#fff;color:var(--fg);border-color:rgba(184,95,204,.3);box-shadow:0 8px 18px -8px rgba(184,95,204,.45)}
.tab.active::before{background:var(--primary)}
.tab span{max-width:160px;overflow:hidden;text-overflow:ellipsis}
.tab input{width:7rem;padding:.25rem .5rem;font:inherit;font-size:.875rem;border:1px solid rgba(184,95,204,.5);border-radius:.5rem;outline:0;background:#fff;color:var(--fg)}
.tab .x{padding:.1rem .35rem;border-radius:.4rem;color:var(--muted);font-size:.85rem;line-height:1.2}
.tab .x:hover{color:var(--destructive);background:rgba(232,87,122,.1)}
.tab.add{color:#fff;border-color:transparent;padding:.6rem .9rem;background:linear-gradient(135deg,var(--primary),var(--rose));box-shadow:0 6px 14px -6px rgba(184,95,204,.6)}
.tab.add::before{display:none}
.tab.add:hover{transform:scale(1.05)}

/* editor + library */
.grid2{display:grid;grid-template-columns:minmax(0,1fr);gap:1.5rem}
.grid2>section{min-width:0}
@media(min-width:1024px){.grid2{grid-template-columns:minmax(0,2fr) minmax(0,1fr);gap:2rem}}
.lbl{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:var(--muted)}
textarea{width:100%;max-width:100%;white-space:pre-wrap;overflow-wrap:anywhere;height:50vh;padding:1.25rem;background:rgba(255,255,255,.9);border:2px solid var(--border);border-radius:1.75rem;outline:0;
  font:.85rem/1.5 "JetBrains Mono",ui-monospace,monospace;color:rgba(64,44,85,.9);resize:none;box-shadow:0 1px 3px rgba(64,44,85,.06);transition:box-shadow .2s,border-color .2s}
@media(min-width:640px){textarea{height:55vh;padding:2rem}}
textarea:focus{border-color:rgba(184,95,204,.5);box-shadow:0 0 0 4px rgba(184,95,204,.18)}
textarea::placeholder{color:rgba(124,104,146,.6)}
.modal textarea{height:40vh;padding:1rem;border-radius:1.25rem}
.seglist{display:flex;flex-direction:column;gap:1.25rem;height:50vh;overflow-y:auto;padding:.5rem .25rem .25rem 0}
@media(min-width:640px){.seglist{height:55vh}}
.seg{position:relative;min-width:0;max-width:100%;background:#fff;border:1px solid var(--border);border-radius:1.4rem;padding:1.4rem 1.1rem 1rem;box-shadow:0 10px 30px -14px rgba(184,95,204,.3)}
.seg .tape{position:absolute;top:-.7rem;left:50%;width:5rem;height:1.4rem;transform:translateX(-50%) rotate(-3deg);border-radius:.15rem;opacity:.9;box-shadow:0 1px 3px rgba(0,0,0,.1)}
.seg pre{margin:0;max-width:100%;overflow-x:auto;font:.75rem "JetBrains Mono",ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-all;color:rgba(64,44,85,.85)}
.nav{display:flex;gap:.4rem;overflow-x:auto;padding-bottom:.6rem;margin-bottom:.6rem;border-bottom:1px solid var(--border)}
.nb{padding:.2rem .7rem;background:#fff;border:1px solid var(--border);border-radius:.5rem;font-size:.75rem;font-weight:700;color:var(--muted);flex-shrink:0}
.nb.on,.nb:hover{border-color:rgba(184,95,204,.5);color:var(--primary)}
.sh{display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem}
.ib{padding:.25rem .5rem;border-radius:.5rem;color:var(--muted);font-size:.8rem;font-weight:700}
.ib:hover{background:#efe6fb;color:var(--primary)}
.sf{margin-top:.8rem;padding-top:.6rem;border-top:1px solid rgba(228,214,247,.6);display:flex;justify-content:space-between;align-items:center}
.empty{margin:auto;text-align:center;padding:2rem;border:2px dashed var(--border);border-radius:1.75rem;color:var(--muted);font-size:.85rem}

/* footer / status */
.meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.5rem;border-top:1px solid rgba(228,214,247,.7);padding-top:1.25rem;color:var(--muted);font-size:.8rem;font-weight:600}
.dot{display:inline-block;width:.55rem;height:.55rem;border-radius:50%;margin-right:.5rem;background:var(--border)}
.dot.saved{background:var(--mint)} .dot.saving,.dot.loading{background:var(--accent)} .dot.error{background:var(--destructive)}

/* floaters */
.floaters{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none}
.floater{position:absolute;animation:bob 6s ease-in-out infinite}
.floater.slow{animation-name:drift}
.floater.desk{display:none}
@media(min-width:640px){.floater.desk{display:block}}
.floater svg{display:block}
.floater-twinkle{animation:twinkle 3s ease-in-out infinite}
@keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes drift{0%,100%{transform:translate(0,0)}50%{transform:translate(14px,-8px)}}
@keyframes twinkle{0%,100%{opacity:1;transform:scale(1) rotate(0)}50%{opacity:.4;transform:scale(.75) rotate(12deg)}}
@media(prefers-reduced-motion:reduce){.floater,.floater-twinkle{animation:none}}

/* modal + toast */
.modal{position:fixed;inset:0;z-index:50;display:grid;place-items:center;padding:1rem;background:rgba(64,44,85,.35);backdrop-filter:blur(4px)}
.modal .card{width:100%;max-width:40rem;display:flex;flex-direction:column;gap:.75rem;background:rgba(255,255,255,.95)}
.toast{position:fixed;left:50%;bottom:1.5rem;transform:translateX(-50%);z-index:60;padding:.65rem 1.1rem;border-radius:999px;color:#fff;font-weight:700;font-size:.85rem;
  background:linear-gradient(90deg,var(--primary),var(--rose));box-shadow:0 12px 28px -10px rgba(184,95,204,.7);animation:pop .3s both}
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
      <Floaters />

      <header className="card">
        <div className="sticker a" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#5B3B00" stroke="#5B3B00" strokeWidth="2.25">
            <path d="M12 2l2.9 6.6L22 9.3l-5 4.9 1.2 7.1L12 17.8l-6.2 3.5L7 14.2 2 9.3l7.1-.7z" />
          </svg>
        </div>
        <div className="sticker b" aria-hidden="true">
          <svg viewBox="0 0 64 40" style={{ width: "70%", height: "70%" }} fill="none">
            <path d="M4 38a28 28 0 0 1 56 0" stroke="#FF7FB4" strokeWidth="6" strokeLinecap="round" />
            <path d="M12 38a20 20 0 0 1 40 0" stroke="#FFC24B" strokeWidth="6" strokeLinecap="round" />
            <path d="M20 38a12 12 0 0 1 24 0" stroke="#4FB6E0" strokeWidth="6" strokeLinecap="round" />
          </svg>
        </div>

        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="title">
            <div className="logo">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
            </div>
            <div>
              <h1>ClipMaster <span>Pro</span></h1>
              <p className="sub">Tabbed, auto-segmenting clipboard scratchpad synced by workspace link.</p>
            </div>
          </div>
          <div className="row">
            <input className="ws" readOnly value={wsId} title="Workspace ID" onClick={e => e.target.select()} />
            <button className="pill" onClick={() => copy(location.href, "Workspace link copied — open it anywhere to sync")}>Copy link</button>
            <button className="pill" onClick={switchWorkspace}>Switch</button>
          </div>
        </div>
        <div className="row" style={{ marginTop: "1rem" }}>
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
            <span className="meta" style={{ fontSize: 10, border: 0, padding: 0 }}>{active.content.length} characters</span>
          </div>
          <textarea ref={taRef} value={active.content} onChange={onEditorChange} onPaste={onPaste}
            spellCheck={false} autoCorrect="off" autoCapitalize="off" placeholder="Paste items here to auto-index them…" />
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
            <p className="sub">Paste text from “Copy all tabs” or a downloaded file. Each “===== Name =====” (or “=== [Tab: Name] ===”) section becomes a tab, keeping its own “--- [Paste #n] ---” segments. Plain text becomes one tab.</p>
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
