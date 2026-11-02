import React, { useState, useEffect } from "react";
import {
  Sparkles,
  Copy,
  Download,
  Plus,
  Trash2,
  FileText,
  Check,
  Layers,
  Cloud,
  Scissors,
  RefreshCw
} from "lucide-react";
import { supabase, isSupabaseConfigured } from "./supabase";

interface ClipTab {
  id: string;
  name: string;
  content: string;
}

const DEFAULT_TABS: ClipTab[] = [
  {
    id: "tab-1",
    name: "General Notes",
    content: "--- [Paste #1] ---\nWelcome to ClipMaster Pro!\n\n--- [Paste #2] ---\nPaste multiple snippets here. You can manage tabs and export content seamlessly."
  },
  {
    id: "tab-2",
    name: "Code Snippets",
    content: "--- [Paste #1] ---\nconst workspaceUrl = window.location.hash || '#main-workspace';"
  }
];

export default function App() {
  const [workspaceId, setWorkspaceId] = useState<string>("main-workspace");
  const [tabs, setTabs] = useState<ClipTab[]>(DEFAULT_TABS);
  const [activeTabId, setActiveTabId] = useState<string>("tab-1");
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);

  // Sync workspace URL on hash change
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace("#", "").trim() || "main-workspace";
      setWorkspaceId(hash);
    };
    handleHashChange();
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  // Fetch from Supabase (if configured) or localStorage
  useEffect(() => {
    const loadWorkspace = async () => {
      if (isSupabaseConfigured && supabase) {
        setIsSyncing(true);
        try {
          const { data } = await supabase
            .from("workspaces")
            .select("tabs")
            .eq("id", workspaceId)
            .single();

          if (data && data.tabs) {
            setTabs(data.tabs);
            if (data.tabs.length > 0) setActiveTabId(data.tabs[0].id);
            showToast("Synced with Supabase Cloud!", "success");
            setIsSyncing(false);
            return;
          }
        } catch (e) {
          console.warn("Supabase fetch fallback to local:", e);
        }
        setIsSyncing(false);
      }

      // Fallback to localStorage
      const saved = localStorage.getItem(`clipmaster_${workspaceId}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setTabs(parsed);
            setActiveTabId(parsed[0].id);
          }
        } catch (e) {
          console.error("Failed to load local state", e);
        }
      } else {
        setTabs(DEFAULT_TABS);
        setActiveTabId("tab-1");
      }
    };

    loadWorkspace();
  }, [workspaceId]);

  // Save state to Supabase / LocalStorage
  const saveState = async (newTabs: ClipTab[]) => {
    setTabs(newTabs);
    localStorage.setItem(`clipmaster_${workspaceId}`, JSON.stringify(newTabs));

    if (isSupabaseConfigured && supabase) {
      setIsSyncing(true);
      try {
        await supabase.from("workspaces").upsert({
          id: workspaceId,
          tabs: newTabs,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error("Cloud save failed:", err);
      } finally {
        setIsSyncing(false);
      }
    }
  };

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  const showToast = (text: string, type: "success" | "error" | "info" = "success") => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleContentChange = (val: string) => {
    const updated = tabs.map((t) => (t.id === activeTabId ? { ...t, content: val } : t));
    saveState(updated);
  };

  const addTab = () => {
    const newId = `tab-${Date.now()}`;
    const newTab: ClipTab = {
      id: newId,
      name: `Tab ${tabs.length + 1}`,
      content: "--- [Paste #1] ---\n\n"
    };
    const updated = [...tabs, newTab];
    saveState(updated);
    setActiveTabId(newId);
    showToast("New tab added!");
  };

  const deleteTab = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tabs.length <= 1) {
      showToast("Cannot delete the last tab", "error");
      return;
    }
    const updated = tabs.filter((t) => t.id !== id);
    saveState(updated);
    if (activeTabId === id) {
      setActiveTabId(updated[0].id);
    }
    showToast("Tab removed", "info");
  };

  const startRenaming = (tab: ClipTab, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(tab.id);
    setEditingName(tab.name);
  };

  const saveRename = (id: string) => {
    if (!editingName.trim()) return;
    const updated = tabs.map((t) => (t.id === id ? { ...t, name: editingName.trim() } : t));
    saveState(updated);
    setEditingTabId(null);
    showToast("Tab renamed!");
  };

  const getSegments = (text: string) => {
    return text
      .split(/--- \[Paste #\d+\] ---/g)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const copyAllContent = () => {
    if (!activeTab) return;
    navigator.clipboard.writeText(activeTab.content).then(() => {
      showToast("Full tab content copied!");
    });
  };

  const copyClean = () => {
    if (!activeTab) return;
    const cleanText = getSegments(activeTab.content).join("\n");
    navigator.clipboard.writeText(cleanText).then(() => {
      showToast("Clean copy (newlines preserved)!");
    });
  };

  const copyCleanSpaced = () => {
    if (!activeTab) return;
    const cleanText = getSegments(activeTab.content).join("\n\n");
    navigator.clipboard.writeText(cleanText).then(() => {
      showToast("Clean copy (double space)!");
    });
  };

  const copyCleanNoNewlines = () => {
    if (!activeTab) return;
    const cleanText = getSegments(activeTab.content)
      .map((f) => f.replace(/\s+/g, " ").trim())
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    navigator.clipboard.writeText(cleanText).then(() => {
      showToast("Clean copy (single line)!");
    });
  };

  const downloadActiveTab = () => {
    if (!activeTab) return;
    const blob = new Blob([activeTab.content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeTab.name.toLowerCase().replace(/\s+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${activeTab.name}`);
  };

  const downloadAllTabs = () => {
    const combinedText = tabs
      .map((tab, idx) => `========== ${tab.name} (Tab ${idx + 1}) ==========\n\n${tab.content}`)
      .join("\n\n\n");

    const blob = new Blob([combinedText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `clipmaster_${workspaceId}_all_tabs.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Downloaded all tabs into one file!");
  };

  const segments = activeTab ? getSegments(activeTab.content) : [];

  return (
    <div className="min-h-screen text-[#402c55] p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">

        {/* App Header */}
        <header className="bg-white/80 backdrop-blur-md border border-[#e4d6f7] rounded-3xl p-6 shadow-xl flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-[#b85fcc] to-[#ff7fb4] rounded-2xl flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">
                ClipMaster <span className="text-[#b85fcc]">Pro</span>
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-[#7c6892] font-medium">
                  Workspace: <span className="font-mono bg-[#efe6fb] px-2 py-0.5 rounded text-[#b85fcc] font-semibold">#{workspaceId}</span>
                </span>
                {isSupabaseConfigured ? (
                  <span className="flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">
                    <Cloud className="w-3 h-3" /> Supabase Active
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">
                    Local Mode (.env optional)
                  </span>
                )}
                {isSyncing && <RefreshCw className="w-3 h-3 text-[#b85fcc] animate-spin" />}
              </div>
            </div>
          </div>

          {/* Quick Copy & Export Bar */}
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={copyClean}
              className="px-3 py-1.5 bg-[#b85fcc]/10 hover:bg-[#b85fcc]/20 text-[#b85fcc] text-xs font-bold rounded-full transition"
            >
              Copy Clean
            </button>
            <button
              onClick={copyCleanSpaced}
              className="px-3 py-1.5 bg-[#4fb6e0]/15 hover:bg-[#4fb6e0]/25 text-[#0f3140] text-xs font-bold rounded-full transition"
            >
              Copy (Double Spaced)
            </button>
            <button
              onClick={copyCleanNoNewlines}
              className="px-3 py-1.5 bg-[#3fcf9e]/15 hover:bg-[#3fcf9e]/25 text-[#06301f] text-xs font-bold rounded-full transition"
            >
              Copy (Single Line)
            </button>
            <button
              onClick={downloadActiveTab}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white border border-[#e4d6f7] hover:bg-[#efe6fb] text-[#402c55] text-xs font-bold rounded-full transition shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-[#4fb6e0]" />
              Download Tab
            </button>
            <button
              onClick={downloadAllTabs}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-[#b85fcc] to-[#ff7fb4] text-white text-xs font-bold rounded-full transition shadow-md hover:opacity-95"
            >
              <Layers className="w-3.5 h-3.5" />
              Download All Tabs
            </button>
          </div>
        </header>

        {/* Tab Switcher */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-[#e4d6f7]">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl cursor-pointer text-sm font-bold transition-all border ${
                activeTabId === tab.id
                  ? "bg-white text-[#b85fcc] shadow-md border-[#e4d6f7]"
                  : "bg-white/40 text-[#7c6892] border-transparent hover:bg-white/70"
              }`}
            >
              <FileText className="w-4 h-4" />
              {editingTabId === tab.id ? (
                <input
                  type="text"
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onBlur={() => saveRename(tab.id)}
                  onKeyDown={(e) => e.key === "Enter" && saveRename(tab.id)}
                  autoFocus
                  className="bg-transparent border-b border-[#b85fcc] focus:outline-none text-xs font-bold text-[#402c55] w-24"
                />
              ) : (
                <span onDoubleClick={(e) => startRenaming(tab, e)}>{tab.name}</span>
              )}
              {tabs.length > 1 && (
                <button
                  onClick={(e) => deleteTab(tab.id, e)}
                  className="hover:text-red-500 rounded-full p-1 transition opacity-70 hover:opacity-100"
                  title="Delete tab"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addTab}
            className="flex items-center gap-1 px-3 py-2 bg-[#b85fcc]/10 hover:bg-[#b85fcc]/20 text-[#b85fcc] rounded-2xl text-xs font-bold transition"
          >
            <Plus className="w-4 h-4" /> Add Tab
          </button>
        </div>

        {/* Main Grid: Master Input & Segment Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Master Editor */}
          <section className="lg:col-span-2 bg-white border border-[#e4d6f7] rounded-3xl p-6 shadow-xl flex flex-col space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold uppercase tracking-wider text-[#7c6892]">
                Master Clipboard Input ({activeTab?.name})
              </label>
              <span className="text-xs font-mono text-[#7c6892]">
                {activeTab?.content.length || 0} characters
              </span>
            </div>
            <textarea
              value={activeTab?.content || ""}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Paste content here to segment automatically..."
              className="w-full h-[55vh] p-4 bg-[#f3eeff]/30 border border-[#e4d6f7] rounded-2xl focus:outline-none focus:ring-2 focus:ring-[#b85fcc] font-mono text-sm text-[#402c55] resize-none"
            />
          </section>

          {/* Segmented Snippets View */}
          <section className="bg-white border border-[#e4d6f7] rounded-3xl p-6 shadow-xl flex flex-col space-y-3">
            <label className="text-xs font-bold uppercase tracking-wider text-[#7c6892]">
              Parsed Segments ({segments.length})
            </label>
            <div className="h-[55vh] overflow-y-auto space-y-3 pr-1">
              {segments.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-[#7c6892] text-center p-4 border-2 border-dashed border-[#e4d6f7] rounded-2xl">
                  <Scissors className="w-8 h-8 opacity-40 mb-2 text-[#b85fcc]" />
                  <p className="text-xs font-semibold">No segments detected yet.</p>
                  <p className="text-[11px] opacity-75 mt-1">
                    Paste text with headers like `--- [Paste #1] ---` to split segments automatically.
                  </p>
                </div>
              ) : (
                segments.map((seg, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-[#f3eeff]/40 border border-[#e4d6f7] rounded-2xl space-y-2 relative group"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-[10px] font-bold text-[#b85fcc] uppercase tracking-wider">
                        Segment #{idx + 1}
                      </span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(seg);
                          showToast(`Segment #${idx + 1} copied!`);
                        }}
                        className="p-1 hover:bg-[#b85fcc]/10 rounded text-[#7c6892] hover:text-[#b85fcc] transition"
                        title="Copy segment"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <pre className="font-mono text-xs text-[#402c55] whitespace-pre-wrap break-words">
                      {seg}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </section>

        </div>

        {/* Footer */}
        <footer className="flex justify-between items-center pt-4 border-t border-[#e4d6f7] text-xs text-[#7c6892]">
          <span>ClipMaster Pro — Cloud & Local Workspace Sync</span>
          <button
            onClick={copyAllContent}
            className="flex items-center gap-1 font-bold hover:text-[#b85fcc] transition"
          >
            <Copy className="w-3.5 h-3.5" /> Copy Entire Tab Buffer
          </button>
        </footer>

        {/* Toast Popup */}
        {statusMsg && (
          <div className="fixed bottom-6 right-6 bg-[#402c55] text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2 text-xs font-bold animate-bounce z-50">
            <Check className="w-4 h-4 text-[#3fcf9e]" />
            {statusMsg.text}
          </div>
        )}

      </div>
    </div>
  );
}
