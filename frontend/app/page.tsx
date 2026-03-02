"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { ReactNode, ButtonHTMLAttributes } from "react";
import { auth } from "../src/lib/firebase";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";

/* ---------- Config ---------- */
const MAX_QUESTIONS = 15;
const BATCH_SIZE = 5;
const MAX_RETRY = 2;
const NEAR_DUP_TH = 0.78;

/* ---------- Types ---------- */
type QuizItem = { type: "mcq" | "tf"; question: string; choices?: string[]; answer: string; explain?: string };
type Section = { title: string; summary: string };
type DataPoint = { label: string; value: string; unit?: string };
type SummarizeResponse = { overview: string; key_points: string[]; sections: Section[]; data_points: DataPoint[] };

// Q&A History Type
type QAPair = { question: string; answer: string };

// Question bank / Quiz sets
type BankQuestion = {
  id: number;
  type: "mcq" | "tf";
  question: string;
  choices?: string[] | null;
  answer: string;
  explain?: string;
  topic?: string;
};
type QuizSet = {
  id: number;
  title: string;
  question_ids: number[];
  created_at: string;
  updated_at: string;
};

/* --- History Type --- */
type HistoryItem = {
  id: string;
  fileName: string;
  score: number;
  totalQuestions: number;
  timestamp: string;
  questions: QuizItem[];
  answers: Record<string, string>;
  overview: string;
  keyPoints?: string[];
  sections?: Section[];
  dataPoints?: DataPoint[];
  content?: string;
  qa_history?: QAPair[];
  lockedCount?: number; 
};

/* ---------- Type guards & Helpers ---------- */
function hasArrayQuestions(x: unknown): x is { questions: unknown[] } {
  if (typeof x !== "object" || x === null) return false;
  const q = (x as { questions?: unknown }).questions;
  return Array.isArray(q);
}
function hasDetail(x: unknown): x is { detail?: string } {
  return typeof x === "object" && x !== null && "detail" in x;
}
function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

const idxToLetter = ["ก", "ข", "ค", "ง"];
const letterToIdx: Record<string, number> = { ก: 0, ข: 1, ค: 2, ง: 3 };
const stripChoiceLabel = (s: string) => String(s).replace(/^\s*[กขคง]\)\s*/i, "").trim();
const toStr = (v: unknown) => (typeof v === "string" ? v : String(v ?? "")).trim();
function shuffle<T>(arr: T[]) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const keyFor = (q: QuizItem) =>
  q.question.normalize("NFKC").replace(/\s+/g, " ").replace(/[^\p{L}\p{N}\s]/gu, "").trim().toLowerCase();

/* -------- Near-duplicate -------- */
const STOP = new Set(["คือ", "ของ", "และ", "หรือ", "ที่", "ใน", "เป็น", "ได้", "มี", "ใด", "ใดๆ", "อะไร", "อย่างไร", "ใคร", "ไหน", "ข้อใด", "ต่อไปนี้", "มาก", "น้อย", "ไม่", "ใช่", "จาก", "เพื่อ", "เช่น", "ซึ่ง", "ดังนั้น", "โดย", "ดังกล่าว"]);
const tokenize = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w && !STOP.has(w));
const jaccard = (a: string, b: string) => {
  const A = new Set(tokenize(a)), B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0; for (const w of A) if (B.has(w)) inter++;
  return inter / (A.size + B.size - inter);
};
const diceBigram = (s: string, t: string) => {
  const bi = (x: string) => {
    const z = x.replace(/\s+/g, " ").trim(); const out: string[] = [];
    for (let i = 0; i < z.length - 1; i++) out.push(z.slice(i, i + 2)); return out;
  };
  const A = bi(s), B = bi(t);
  if (!A.length || !B.length) return 0;
  const m = new Map<string, number>(); for (const x of A) m.set(x, (m.get(x) ?? 0) + 1);
  let inter = 0; for (const y of B) { const c = m.get(y) ?? 0; if (c > 0) { inter++; m.set(y, c - 1); } }
  return (2 * inter) / (A.length + B.length);
};
const similar = (a: string, b: string) => Math.max(jaccard(a, b), diceBigram(a, b));

/* ---------- API base ---------- */
function getAPIBase(): string {
  const env = process.env.NEXT_PUBLIC_API;
  const fallback = "http://localhost:8000";
  const base = env && env.trim() ? env.trim() : fallback;
  return base.replace(/\/+$/, "");
}

function normalizeFromAPI(payload: unknown): QuizItem[] {
  const raw: unknown[] = hasArrayQuestions(payload) ? payload.questions : [];
  const out: QuizItem[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const q = item as Record<string, unknown>;
    const type = toStr(q.type).toLowerCase();
    const question = toStr(q.question);
    let answer = toStr(q.answer).toLowerCase();
    const explain = q.explain !== undefined ? toStr(q.explain) : undefined;
    if (!type || !question) continue;
    if (type === "mcq") {
      const choicesRaw = isStringArray(q.choices) ? q.choices : [];
      const mapped = choicesRaw.map(stripChoiceLabel).filter(Boolean).slice(0, 4);
      const need = Math.max(0, 4 - mapped.length);
      const choices: string[] = need > 0 ? [...mapped, ...Array.from({ length: need }, (_, i) => `ตัวเลือกที่ ${mapped.length + i + 1}`)] : mapped;
      if (!["ก", "ข", "ค", "ง"].includes(answer)) {
        const num = Number(answer);
        if (Number.isFinite(num)) {
          const idx = num >= 1 && num <= 4 ? num - 1 : num;
          if (idx >= 0 && idx < 4) answer = idxToLetter[idx];
        }
        if (!["ก", "ข", "ค", "ง"].includes(answer)) {
          const idx = choices.findIndex((c) => c.replace(/\s+/g, "") === answer.replace(/\s+/g, ""));
          answer = idx >= 0 ? idxToLetter[idx] : "ก";
        }
      }
      out.push({ type: "mcq", question, choices, answer, explain });
      continue;
    }
    if (!["true", "false"].includes(answer)) {
      const trueSet = new Set(["true", "t", "1", "yes", "y", "จริง", "ถูก"]);
      const falseSet = new Set(["false", "f", "0", "no", "n", "เท็จ", "ผิด"]);
      if (trueSet.has(answer)) answer = "true"; else if (falseSet.has(answer)) answer = "false"; else answer = "false";
    }
    out.push({ type: "tf", question, answer, explain });
  }
  return out;
}

function shuffleAndRemapBatch(qs: QuizItem[]): QuizItem[] {
  return shuffle(qs).map((q) => {
    if (q.type !== "mcq" || !q.choices?.length) return q;
    const original = [...q.choices];
    const correctIdx = letterToIdx[q.answer] ?? -1;
    const correctText = correctIdx >= 0 && correctIdx < original.length ? original[correctIdx] : null;
    const newChoices = shuffle(original);
    let newAns = q.answer;
    if (correctText) {
      const newIdx = newChoices.findIndex((t) => t === correctText);
      if (newIdx >= 0) newAns = idxToLetter[newIdx] || newAns;
    }
    return { ...q, choices: newChoices, answer: newAns };
  });
}

/* ---------- UI primitives ---------- */
const Card = ({ className = "", children }: { className?: string; children: ReactNode }) => (
  <div className={`rounded-2xl border border-zinc-800/40 bg-zinc-900/40 backdrop-blur-sm p-5 ${className}`}>{children}</div>
);
const Label = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-2 text-xs rounded-full px-2 py-1 bg-zinc-800/60 border border-zinc-700/60">{children}</span>
);
const PrimaryBtn = ({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) => (
  <button {...props} className={`px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium shadow-sm disabled:opacity-50 ${className}`}>{children}</button>
);

/* ---------- Hook: Typewriter Effect ---------- */
function useTypewriter(text: string, speed = 50, pause = 3000) {
  const [displayedText, setDisplayedText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;

    if (isDeleting) {
      if (displayedText.length > 0) {
        timer = setTimeout(() => {
          setDisplayedText(text.slice(0, displayedText.length - 1));
        }, speed / 2);
      } else {
        setIsDeleting(false);
      }
    } else {
      if (displayedText.length < text.length) {
        timer = setTimeout(() => {
          setDisplayedText(text.slice(0, displayedText.length + 1));
        }, speed);
      } else {
        timer = setTimeout(() => {
          setIsDeleting(true);
        }, pause);
      }
    }

    return () => clearTimeout(timer);
  }, [displayedText, isDeleting, text, speed, pause]);

  return displayedText;
}

/* ---------- Sidebar Component ---------- */
const HistorySidebar = ({
  items,
  onSelect,
  onDelete,
  onRename,
  activeId
}: {
  items: HistoryItem[],
  onSelect: (item: HistoryItem) => void,
  onDelete: (id: string) => void,
  onRename: (id: string, currentName: string) => void,
  activeId: string | null
}) => (
  <div className="flex flex-col h-full">
    <div className="p-4 border-b border-zinc-800 bg-zinc-950/50">
      <h3 className="font-semibold text-zinc-300">ประวัติการใช้งาน</h3>
    </div>
    <div className="flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar">
      {items.length === 0 && <p className="text-xs text-zinc-500 text-center mt-10">ยังไม่มีประวัติ</p>}
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            className={`group rounded-xl border p-3 transition-all duration-200 cursor-pointer flex flex-col gap-2 ${
              isActive 
                ? "bg-zinc-800/60 border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.05)]" 
                : "bg-zinc-900/40 border-zinc-800/60 hover:bg-zinc-800/40 hover:border-zinc-700/80"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="font-medium text-sm text-zinc-200 truncate flex-1 leading-relaxed" title={item.fileName}>
                {item.fileName}
              </div>
              
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -mt-1 -mr-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onRename(item.id, item.fileName); }}
                  className="p-1.5 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors"
                  title="เปลี่ยนชื่อ"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                  className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"
                  title="ลบ"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"></path><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path></svg>
                </button>
              </div>
            </div>

            <div className="flex justify-between items-end text-xs">
              <span className="text-zinc-500 font-light">{new Date(item.timestamp).toLocaleDateString('th-TH')}</span>
              {item.totalQuestions > 0 ? (
                item.score >= 0 ? (
                  <span className={`px-2 py-0.5 rounded font-medium border ${item.score >= item.totalQuestions / 2 ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                    {item.score}/{item.totalQuestions}
                  </span>
                ) : (
                  <span className="text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/50">รอสอบ</span>
                )
              ) : (
                <span className="text-zinc-500 bg-zinc-800/80 px-2 py-0.5 rounded border border-zinc-700/50">รอสอบ</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  </div>
);

/* ---------- Simple Modal ---------- */
function Modal({ open, onClose, title, children, rightInfo }: { open: boolean; onClose: () => void; title: string; children: ReactNode; rightInfo?: ReactNode; }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
      <div className="relative w-full max-w-4xl rounded-3xl border border-zinc-800/80 bg-zinc-950/90 shadow-2xl shadow-black/50 backdrop-blur-xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 shrink-0">
          <div className="font-bold text-xl text-zinc-100">{title}</div>
          <div className="flex items-center gap-4 text-sm text-zinc-400">
            {rightInfo}
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-zinc-800 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">{children}</div>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */
export default function Home() {
  const API = getAPIBase();

  // -------- Auth / Notes --------
  const [userId, setUserId] = useState<string>("demo-user");
  const [authHeader, setAuthHeader] = useState<Record<string, string>>({ "X-User-Id": "demo-user" });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // --- UI States ---
  const [isLanding, setIsLanding] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // State สำหรับ Animation เมาส์
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  const welcomeText = useTypewriter("สวัสดีครับ, มีอะไรให้ช่วยไหม?", 60, 3000);

  // --- History State ---
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);
  const [hiddenContext, setHiddenContext] = useState<string>("");

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isLanding) {
      setMousePosition({ x: e.clientX, y: e.clientY });
    }
  }, [isLanding]);

  const fetchHistoryDirect = async (headers: Record<string, string>) => {
    try {
      const res = await fetch(`${API}/history/list`, { headers });
      const data = await res.json();
      if (Array.isArray(data)) setHistoryItems(data);
    } catch (e) { console.error("Load history failed", e); }
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          const newHeader = { Authorization: `Bearer ${token}` };

          setCurrentUser(user);
          setUserId(user.uid);
          setAuthHeader(newHeader);

          fetchHistoryDirect(newHeader);
        } catch (e) {
          console.error("Auth Error:", e);
        }
      } else {
        setCurrentUser(null);
        setHistoryItems([]);
        try {
          const uid = localStorage.getItem("uid");
          const finalUid = uid && uid.trim() ? uid.trim() : "demo-user";
          setUserId(finalUid);
          setAuthHeader({ "X-User-Id": finalUid });
        } catch {
          setUserId("demo-user");
          setAuthHeader({ "X-User-Id": "demo-user" });
        }
      }
    });
    return () => unsub();
  }, []);

  const refreshHistory = useCallback(() => {
    fetchHistoryDirect(authHeader);
  }, [authHeader]);

  useEffect(() => {
    if (!currentUser) {
      setHistoryItems([]);
      handleNewSession();
    }
  }, [currentUser]);

  const [lockedCount, setLockedCount] = useState<number>(0);

  // 🟢 NEW STATE: สำหรับแสดง UI โหลดข้อความแบบเต็ฒจอ
  const [loadingText, setLoadingText] = useState<string>("");

  // --- NEW: Handle Reset Session ---
  const handleNewSession = () => {
    setIsLanding(true);
    setCurrentHistoryId(null);
    setText("");
    setPdf(null);
    setPdfText("");
    setOverview("");
    setKeyPoints([]);
    setSections([]);
    setDataPoints([]);
    setQuestions([]);
    setAnswers({});
    setScore(null);
    setLockedCount(0); 
    setHiddenContext("");
    setQaInput("");
    setQaAnswer("");
    setQaHistory([]);
    topicsRef.current = [];
    seenKeysRef.current = { mcq: new Set(), tf: new Set() };
    setFileId("manual");
  };

  // --- History Action Handlers ---
  const loadFromHistory = (item: HistoryItem) => {
    setIsLanding(false);
    setCurrentHistoryId(item.id);
    setFileId(item.id);

    setOverview(item.overview || "");
    setKeyPoints(item.keyPoints || []);
    setSections(item.sections || []);
    setDataPoints(item.dataPoints || []);

    if (item.questions && item.questions.length > 0) {
      setQuestions(item.questions);
      setAnswers(item.answers as Record<number, string>);

      if (item.score < 0) {
        setScore(null);
        setLockedCount(item.lockedCount || 0); 
      } else {
        setScore(item.score);
        setLockedCount(item.lockedCount !== undefined ? item.lockedCount : item.questions.length); 
      }
    } else {
      setQuestions([]);
      setScore(null);
      setLockedCount(0);
      setAnswers({});
    }

    setHiddenContext(item.content || "");
    setText("");
    setPdf(null);
    setPdfText("");
    setQaInput("");
    setQaAnswer("");
    setQaHistory(item.qa_history || []);

    topicsRef.current = [];
    seenKeysRef.current = { mcq: new Set(), tf: new Set() };

    if (item.questions) {
      item.questions.forEach(q => {
        const k = keyFor(q);
        if (q.type === 'mcq' || q.type === 'tf') {
          seenKeysRef.current[q.type].add(k);
        }
      });
    }
  };

  const deleteHistory = async (id: string) => {
    if (!confirm("ต้องการลบประวัตินี้ใช่หรือไม่?")) return;
    try {
      await fetch(`${API}/history/${id}`, { method: "DELETE", headers: authHeader });
      if (currentHistoryId === id) handleNewSession();
      refreshHistory();
    } catch (e) { alert("ลบไม่สำเร็จ"); }
  };

  const renameHistory = async (id: string, currentName: string) => {
    const newName = prompt("ตั้งชื่อประวัติใหม่:", currentName);
    if (!newName || newName.trim() === currentName) return;
    try {
      await fetch(`${API}/history/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ new_name: newName.trim() })
      });
      refreshHistory();
    } catch (e) { alert("เปลี่ยนชื่อไม่สำเร็จ"); }
  };

  const handleAuthSubmit = async () => {
    if (!authEmail.trim() || !authPassword.trim()) { setAuthError("กรุณากรอกอีเมลและรหัสผ่าน"); return; }
    setAuthError(null); setAuthLoading(true);
    try {
      if (authMode === "login") await signInWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      else await createUserWithEmailAndPassword(auth, authEmail.trim(), authPassword);
      setAuthOpen(false); setAuthEmail(""); setAuthPassword("");
    } catch (err: unknown) {
      console.error(err);
      setAuthError("เกิดข้อผิดพลาด กรุณาลองอีกครั้ง");
    } finally { setAuthLoading(false); }
  };

  const handleLogout = async () => { try { await signOut(auth); } catch (err) { console.error(err); } };

  const [fileId, setFileId] = useState<string>("manual");
  const [note, setNote] = useState<string>("");
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteStatus, setNoteStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [noteUpdatedAt, setNoteUpdatedAt] = useState<string | null>(null);
  const saveTimer = useRef<number | null>(null);
  const firstLoadRef = useRef<boolean>(true);

  const loadNote = async (fid: string) => {
    if (!fid) return;
    try {
      const res = await fetch(`${API}/notes/${encodeURIComponent(fid)}`, { headers: authHeader });
      const json = await res.json();
      setNote(typeof json?.content === "string" ? json.content : "");
      setNoteUpdatedAt(typeof json?.updated_at === "string" ? json.updated_at : null);
      setNoteStatus("idle");
      firstLoadRef.current = false;
    } catch { setNote(""); setNoteUpdatedAt(null); setNoteStatus("error"); }
  };
  const autosaveNote = async (fid: string, content: string) => {
    if (!fid) return;
    try {
      setNoteStatus("saving");
      const res = await fetch(`${API}/notes/${encodeURIComponent(fid)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ content }),
      });
      const json = await res.json();
      setNoteUpdatedAt(typeof json?.updated_at === "string" ? json.updated_at : null);
      setNoteStatus("saved");
    } catch { setNoteStatus("error"); }
  };
  useEffect(() => {
    if (firstLoadRef.current) return;
    if (!fileId) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { autosaveNote(fileId, note); }, 1200);
    return () => { if (saveTimer.current) window.clearTimeout(saveTimer.current); };
  }, [note, fileId, userId, authHeader]);

  /* -------- App states -------- */
  const [text, setText] = useState("");
  const [pdf, setPdf] = useState<File | null>(null);
  const [pdfText, setPdfText] = useState("");
  const [overview, setOverview] = useState("");
  const [keyPoints, setKeyPoints] = useState<string[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [dataPoints, setDataPoints] = useState<DataPoint[]>([]);
  const [questions, setQuestions] = useState<QuizItem[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [score, setScore] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [qaInput, setQaInput] = useState("");
  const [qaAnswer, setQaAnswer] = useState("");

  const [qaHistory, setQaHistory] = useState<QAPair[]>([]);

  const [setsOpen, setSetsOpen] = useState(false);
  const [sets, setSets] = useState<QuizSet[]>([]);
  const [saveOpen, setSaveOpen] = useState<{ open: boolean; qIndex: number | null }>({ open: false, qIndex: null });
  const [creatingTitle, setCreatingTitle] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSetId, setManualSetId] = useState<number | null>(null);
  const [manualType, setManualType] = useState<"mcq" | "tf">("mcq");
  const [manualQ, setManualQ] = useState("");
  const [manualChoices, setManualChoices] = useState<string[]>(["", "", "", ""]);
  const [manualAns, setManualAns] = useState<string>("ก");
  const [manualExplain, setManualExplain] = useState("");
  const [editOpen, setEditOpen] = useState<{ open: boolean; set: QuizSet | null }>({ open: false, set: null });
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([]);

  const loadSets = async () => { const r = await fetch(`${API}/bank/quizzes`, { headers: authHeader }); const js = await r.json(); setSets(Array.isArray(js) ? js : []); };
  const loadBank = async () => { const r = await fetch(`${API}/bank/questions`, { headers: authHeader }); const js = await r.json(); setBankQuestions(Array.isArray(js) ? js : []); };
  const createSet = async (title: string) => {
    const r = await fetch(`${API}/bank/quizzes`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ title, question_ids: [] }) });
    if (!r.ok) throw new Error("สร้างชุดข้อสอบไม่สำเร็จ"); await loadSets();
  };
  const renameSet = async (id: number, title: string, ids?: number[]) => {
    const r = await fetch(`${API}/bank/quizzes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ title, question_ids: ids }) });
    if (!r.ok) throw new Error("แก้ชื่อชุดไม่สำเร็จ"); await loadSets();
  };
  const deleteSet = async (id: number) => { const r = await fetch(`${API}/bank/quizzes/${id}`, { method: "DELETE", headers: authHeader }); if (!r.ok) throw new Error("ลบชุดไม่สำเร็จ"); await loadSets(); };

  function pickFilenameFromHeader(h: Headers): string | null {
    const disp = h.get("Content-Disposition") || h.get("content-disposition");
    if (!disp) return null;
    const m = /filename\*?=(?:UTF-8''|")?([^\";]+)\"?/i.exec(disp);
    if (m && m[1]) { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }
    return null;
  }
  const exportSetPdf = async (id: number, opts = { shuffleChoices: false, showAnswers: false }) => {
    try {
      const r = await fetch(`${API}/export/quizzes/${id}`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify(opts) });
      if (!r.ok) { const msg = await r.text().catch(() => ""); setError(msg || "ส่งออก PDF ไม่สำเร็จ"); return; }
      const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a");
      const byHeader = pickFilenameFromHeader(r.headers); const byTitle = sets.find((s) => s.id === id)?.title || `quiz-${id}`;
      a.href = url; a.download = byHeader && byHeader.endsWith(".pdf") ? byHeader : `${byTitle}.pdf`;
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { console.error(e); setError("ส่งออกไม่ได้: เช็ก API/CORS"); }
  };
  const isDuplicateInSet = (setId: number, q: QuizItem) => {
    const s = sets.find((x) => x.id === setId); if (!s) return false;
    const texts = s.question_ids.map((id) => bankQuestions.find((b) => b.id === id)?.question).filter((t): t is string => typeof t === "string" && t.trim().length > 0);
    return texts.some((t) => similar(t, q.question) >= NEAR_DUP_TH);
  };
  const saveQuestionToSet = async (setId: number, q: QuizItem) => {
    if (isDuplicateInSet(setId, q)) throw new Error("ข้อนี้มีอยู่ในชุดนี้แล้ว");
    const isMcq = q.type === "mcq";
    const payload = isMcq ? { type: "mcq" as const, question: q.question, choices: (q.choices ?? []).slice(0, 4), answer: q.answer, explain: q.explain || "" }
      : { type: "tf" as const, question: q.question, answer: String(q.answer).toLowerCase() === "true" ? "true" : "false", explain: q.explain || "" };
    const r1 = await fetch(`${API}/bank/questions`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify(payload) });
    if (!r1.ok) { const msg = await r1.text().catch(() => ""); throw new Error(msg || "บันทึกคำถามไม่สำเร็จ"); }
    const created: BankQuestion = await r1.json(); const set = sets.find((s) => s.id === setId); if (!set) throw new Error("ไม่พบชุดข้อสอบ");
    const newIds = Array.from(new Set([...set.question_ids, created.id])); await renameSet(setId, set.title, newIds); await Promise.all([loadBank(), loadSets()]);
  };

  const seenKeysRef = useRef<{ mcq: Set<string>; tf: Set<string> }>({ mcq: new Set(), tf: new Set() });
  const topicsRef = useRef<string[]>([]);

  // --- Context Logic ---
  const context = useMemo(() => {
    const manualInput = [text.trim(), pdfText.trim()].filter(Boolean).join("\n");
    return manualInput || hiddenContext;
  }, [text, pdfText, hiddenContext]);

  const countByType = (t: "mcq" | "tf") => questions.filter((q) => q.type === t).length;
  const resetAllViews = () => { setError(null); setScore(null); setQuestions([]); setAnswers({}); setQaAnswer(""); seenKeysRef.current.mcq.clear(); seenKeysRef.current.tf.clear(); topicsRef.current = []; setLockedCount(0); };
  const resetQuizOnly = () => { setScore(null); setQuestions([]); setAnswers({}); seenKeysRef.current.mcq.clear(); seenKeysRef.current.tf.clear(); topicsRef.current = []; setLockedCount(0); };

  const ensureTopics = async () => {
    if (!context) return; if (topicsRef.current.length >= 10) return;
    try {
      const res = await fetch(`${API}/quiz/topics`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context }) });
      const json = (await res.json()) as { topics?: string[] };
      if (Array.isArray(json.topics) && json.topics.length > 0) {
        const exist = new Set(topicsRef.current.map((t) => t.toLowerCase()));
        for (const t of json.topics) { const k = String(t).trim().toLowerCase(); if (k && !exist.has(k)) { topicsRef.current.push(t); exist.add(k); } }
      }
    } catch { }
  };

  const uploadPdf = async (file: File | null) => {
    setPdf(file); setPdfText("");
    setHiddenContext("");

    const fid = currentHistoryId ? currentHistoryId : (file ? file.name.replace(/\.pdf$/i, "") || "pdf-file" : "manual");
    setFileId(fid);

    firstLoadRef.current = true;
    await loadNote(fid);

    if (file) {
      setIsLanding(false);
      setLoading(true);
      setLoadingText("กำลังอ่านข้อมูลจากไฟล์ PDF..."); // 🟢 เรียกใช้ Loading Overlay
    }

    if (!file) return;

    try {
      const fd = new FormData(); fd.append("pdf", file); const res = await fetch(`${API}/pdf/extract`, { method: "POST", body: fd });
      const json: unknown = await res.json(); if (!res.ok) { const msg = hasDetail(json) && typeof json.detail === "string" ? json.detail : "อ่าน PDF ไม่สำเร็จ"; throw new Error(msg); }
      const txt = (json as { text?: unknown }).text; setPdfText(typeof txt === "string" ? txt : ""); resetQuizOnly(); await ensureTopics();
    } catch (e) { 
      setError(e instanceof Error ? e.message : String(e)); 
    } finally { 
      setLoading(false); 
      setLoadingText(""); // 🟢 ปิด Loading Overlay
    }
  };

  // 🟢 Helper: Update History Item Locally
  const updateLocalHistoryItem = (newItemData: Partial<HistoryItem>) => {
    if (!currentHistoryId) return;
    setHistoryItems((prev) =>
      prev.map((item) =>
        item.id === currentHistoryId ? { ...item, ...newItemData } : item
      )
    );
  };

  const summarize = async () => {
    setIsLanding(false);
    if (!context) return; if (!pdf) { setFileId("manual"); firstLoadRef.current = true; await loadNote("manual"); }

    const isUpdating = !!currentHistoryId;
    const prevQuestions = questions;
    const prevAnswers = answers;
    const prevScore = score;
    const prevLockedCount = lockedCount;

    setLoading(true);
    setLoadingText("กำลังวิเคราะห์และสรุปเนื้อหา..."); // 🟢 เรียกใช้ Loading Overlay
    setError(null);
    setOverview("");
    setKeyPoints([]);
    setSections([]);
    setDataPoints([]);

    if (!isUpdating) {
      setQuestions([]);
      setAnswers({});
      setScore(null);
      setLockedCount(0);
      setQaInput("");
      setQaAnswer("");
    }

    try {
      const res = await fetch(`${API}/summarize`, { method: "POST", headers: { "Content-Type": "application/json", ...authHeader }, body: JSON.stringify({ context }) });
      const json: unknown = await res.json(); if (!res.ok) { const msg = hasDetail(json) && typeof json.detail === "string" ? json.detail : "สรุปไม่สำเร็จ"; throw new Error(msg); }
      const data = json as Partial<SummarizeResponse>;
      setOverview(typeof data.overview === "string" ? data.overview : "");
      setKeyPoints(Array.isArray(data.key_points) ? data.key_points.filter((x): x is string => typeof x === "string") : []);
      setSections(Array.isArray(data.sections) ? (data.sections.filter((x): x is Section => !!x && typeof x === "object") as Section[]) : []);
      setDataPoints(Array.isArray(data.data_points) ? (data.data_points.filter((x): x is DataPoint => !!x && typeof x === "object") as DataPoint[]) : []);
      await ensureTopics();

      if (currentUser) {
        let nameToSend = "";
        if (pdf) nameToSend = pdf.name;
        else if (currentHistoryId) {
          const h = historyItems.find(x => x.id === currentHistoryId);
          nameToSend = h ? h.fileName : fileId;
        } else {
          nameToSend = fileId === "manual" ? `สรุปเนื้อหา ${new Date().toLocaleTimeString('th-TH')}` : fileId;
        }

        const payload = {
          file_name: nameToSend,
          overview: typeof data.overview === "string" ? data.overview : "",
          key_points: data.key_points || [],
          sections: data.sections || [],
          data_points: data.data_points || [],
          questions: isUpdating ? prevQuestions : [],
          answers: isUpdating ? prevAnswers : {},
          score: isUpdating ? (prevScore ?? -1) : -1,
          content: context,
          qa_history: qaHistory
        };

        if (currentHistoryId) {
          await fetch(`${API}/history/update/${currentHistoryId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify(payload)
          });
          updateLocalHistoryItem({ ...payload, lockedCount: prevLockedCount });
        }
        else {
          const res = await fetch(`${API}/history/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify(payload)
          });
          const saved = await res.json();
          if (saved.id) {
            setCurrentHistoryId(saved.id);
            await autosaveNote(saved.id, note);
            setFileId(saved.id);
            refreshHistory();
          }
        }
      }
    } catch (e) { 
      setError(e instanceof Error ? e.message : String(e)); 
    } finally { 
      setLoading(false); 
      setLoadingText(""); // 🟢 ปิด Loading Overlay
    }
  };

  const addMoreQuiz = async (type: "mcq" | "tf") => {
    if (!context) return; setError(null); const already = countByType(type); const remain = MAX_QUESTIONS - already; if (remain <= 0) return;
    const want = Math.min(BATCH_SIZE, remain); 
    
    setLoading(true); 
    setLoadingText(`กำลังสร้างข้อสอบ ${type === "mcq" ? "แบบเลือกตอบ (MCQ)" : "แบบถูกผิด (T/F)"} เพิ่มเติม...`); // 🟢 เรียกใช้ Loading Overlay
    
    await ensureTopics(); 
    const topicSlice = topicsRef.current.splice(0, want);
    try {
      let collected: QuizItem[] = [];
      for (let attempt = 0; attempt < 1 + MAX_RETRY && collected.length < want; attempt++) {
        const excludeTexts = [...questions.filter((q) => q.type === type).map((q) => q.question), ...collected.map((q) => q.question)];
        const res = await fetch(`${API}/quiz/${type}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context, n: want - collected.length, exclude: excludeTexts, topics: topicSlice.length ? topicSlice : undefined }) });
        const json: unknown = await res.json(); if (!res.ok) { const msg = hasDetail(json) && typeof json.detail === "string" ? json.detail : "สร้างข้อสอบไม่สำเร็จ"; throw new Error(msg); }
        const incoming = normalizeFromAPI(json).filter((q) => q.type === type); const existingSameType = questions.filter((x) => x.type === type); const bucket = seenKeysRef.current[type];
        const unique = incoming.filter((q) => { const k = keyFor(q); if (bucket.has(k)) return false; for (const e of existingSameType) if (similar(q.question, e.question) >= NEAR_DUP_TH) return false; for (const e of collected) if (similar(q.question, e.question) >= NEAR_DUP_TH) return false; return true; });
        collected = [...collected, ...unique];
      }
      if (collected.length === 0) { setError(`ไม่พบข้อใหม่ ${type}`); return; }
      const batchReady = shuffleAndRemapBatch(collected.slice(0, want));

      const newQuestions = [...questions, ...batchReady];
      setQuestions(newQuestions);

      const bucket = seenKeysRef.current[type];
      batchReady.forEach((q) => bucket.add(keyFor(q)));
      
      setScore(null);

      if (currentUser) {
        let nameToSend = "";
        if (pdf) nameToSend = pdf.name;
        else if (currentHistoryId) {
          const h = historyItems.find(x => x.id === currentHistoryId);
          nameToSend = h ? h.fileName : fileId;
        } else {
          nameToSend = fileId === "manual" ? `สรุปเนื้อหา ${new Date().toLocaleTimeString('th-TH')}` : fileId;
        }

        const payload = {
          file_name: nameToSend,
          overview: overview,
          key_points: keyPoints,
          sections: sections,
          data_points: dataPoints,
          questions: newQuestions,
          answers: answers,
          score: -1,
          content: context,
          qa_history: qaHistory
        };

        if (currentHistoryId) {
          await fetch(`${API}/history/update/${currentHistoryId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify(payload)
          });
          updateLocalHistoryItem({ 
            ...payload, 
            totalQuestions: newQuestions.length, 
            lockedCount: lockedCount,
            answers: answers 
          });
        } else {
          const res = await fetch(`${API}/history/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify(payload)
          });
          const saved = await res.json();
          if (saved.id) {
            setCurrentHistoryId(saved.id);
            await autosaveNote(saved.id, note);
            setFileId(saved.id);
            refreshHistory();
          }
        }
      }

    } catch (e) { 
      setError(e instanceof Error ? e.message : String(e)); 
    } finally { 
      setLoading(false); 
      setLoadingText(""); // 🟢 ปิด Loading Overlay
    }
  };

  const askQA = async () => {
    if (!qaInput.trim()) return;
    if (!context) {
      alert("⚠️ กรุณาอัปโหลดไฟล์ PDF หรือพิมพ์เนื้อหาในกล่องข้อความก่อนเริ่มถามครับ");
      return;
    }

    const currentQ = qaInput;
    setLoading(true);
    setQaInput("");

    try {
      const res = await fetch(`${API}/qa`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ context, question: currentQ }) });
      const json: unknown = await res.json(); if (!res.ok) { const msg = hasDetail(json) && typeof json.detail === "string" ? json.detail : "ถามไม่สำเร็จ"; throw new Error(msg); }
      const ans = (json as { answer?: unknown }).answer;

      const finalAns = typeof ans === "string" ? ans : "";

      const newHistory = [{ question: currentQ, answer: finalAns }, ...qaHistory];
      setQaHistory(newHistory);

      if (currentUser) {
        let nameToSend = "";
        if (pdf) nameToSend = pdf.name;
        else if (currentHistoryId) {
          const h = historyItems.find(x => x.id === currentHistoryId);
          nameToSend = h ? h.fileName : fileId;
        } else {
          nameToSend = fileId === "manual" ? `สรุปเนื้อหา ${new Date().toLocaleTimeString('th-TH')}` : fileId;
        }

        const payload = {
          file_name: nameToSend,
          overview: overview,
          key_points: keyPoints,
          sections: sections,
          data_points: dataPoints,
          questions: questions,
          answers: answers,
          score: (score !== null) ? score : -1,
          content: context,
          qa_history: newHistory
        };

        if (currentHistoryId) {
          await fetch(`${API}/history/update/${currentHistoryId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify(payload)
          });
          updateLocalHistoryItem({ qa_history: newHistory, answers: answers });
        } else {
          const res = await fetch(`${API}/history/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify(payload)
          });
          const saved = await res.json();
          if (saved.id) {
            setCurrentHistoryId(saved.id);
            setFileId(saved.id);
            refreshHistory();
          }
        }
      }

    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setQaInput(currentQ);
    } finally { setLoading(false); }
  };

  const submit = async () => {
    let correct = 0;
    questions.forEach((q, i) => { const u = (answers[i] || "").toLowerCase(); if (u === String(q.answer).toLowerCase()) correct++; });
    
    setScore(correct);
    setLockedCount(questions.length); 

    if (currentUser) {
      let nameToSend = "";
      if (pdf) nameToSend = pdf.name;
      else if (currentHistoryId) {
        const h = historyItems.find(x => x.id === currentHistoryId);
        nameToSend = h ? h.fileName : fileId;
      } else {
        nameToSend = fileId === "manual" ? "เนื้อหาพิมพ์เอง" : fileId;
      }

      const payload = {
        file_name: nameToSend,
        overview: overview || "สรุปเนื้อหา",
        key_points: keyPoints,
        sections: sections,
        data_points: dataPoints,
        questions: questions,
        answers: answers,
        score: correct,
        content: context,
        qa_history: qaHistory
      };

      try {
        if (currentHistoryId) {
          await fetch(`${API}/history/update/${currentHistoryId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify(payload)
          });
          updateLocalHistoryItem({ 
            score: correct, 
            totalQuestions: questions.length,
            answers: answers,
            lockedCount: questions.length 
          });
        } else {
          const res = await fetch(`${API}/history/save`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeader },
            body: JSON.stringify(payload)
          });
          const saved = await res.json();
          if (saved.id) {
            setCurrentHistoryId(saved.id);
            await autosaveNote(saved.id, note);
            setFileId(saved.id);
            refreshHistory();
          }
        }
      } catch (e) { console.error("History save error:", e); }
    }
  };

  const isOverallSubmitted = score !== null;
  const mcqCount = countByType("mcq");
  const tfCount = countByType("tf");

  const isAllAnswered = questions.length > 0 && Object.keys(answers).length === questions.length;

  useEffect(() => { firstLoadRef.current = true; loadNote(fileId); }, [fileId, userId, authHeader]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans" onMouseMove={handleMouseMove}>
      <style jsx>{`
        @keyframes drift {
          0% { background-position: 0 0; }
          100% { background-position: 40px 40px; }
        }
        .animate-grid {
          animation: drift 3s linear infinite;
        }
      `}</style>

      <header className="border-b border-zinc-800 bg-zinc-950/85 backdrop-blur-md sticky top-0 z-50 shrink-0">
        <div className="mx-auto max-w-full px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">

            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition"
              title="เปิด/ปิดแถบประวัติ"
              style={{ display: currentUser ? 'block' : 'none' }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
            </button>

            <h1
              onClick={handleNewSession}
              className="text-2xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent cursor-pointer hover:opacity-80 transition"
            >
              EduGen
            </h1>
          </div>


          <div className="flex items-center gap-3">
            {/* 🟢 แสดงคะแนน */}
            {!isLanding && isOverallSubmitted && (<Label>คะแนน: <b className="text-emerald-400">{score}</b></Label>)}

            {/* 🟢 ปุ่ม ออก (Logout) และ เข้าสู่ระบบ (Login) ให้สวยงามขึ้น */}
            {currentUser ? (
              <div className="flex items-center gap-3 pr-2 sm:border-r border-zinc-800">
                <span className="hidden sm:inline max-w-[150px] truncate text-xs font-medium text-zinc-400">
                  {currentUser.email}
                </span>
                <button 
                  onClick={handleLogout} 
                  className="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/40 border border-zinc-700/50 text-zinc-300 hover:bg-red-500/10 hover:border-red-500/30 hover:text-red-400 transition-all text-sm font-medium"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:translate-x-0.5 transition-transform"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
                  ออก
                </button>
              </div>
            ) : (
              <button 
                onClick={() => { setAuthMode("login"); setAuthOpen(true); }} 
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 hover:text-indigo-300 transition-all text-sm font-medium"
              >
                เข้าสู่ระบบ
              </button>
            )}

            {/* ปุ่มคลัง และ แชทใหม่ */}
            {currentUser && <PrimaryBtn onClick={() => { setSetsOpen(true); loadSets(); }} className="bg-zinc-800 hover:bg-zinc-700 text-sm">คลัง</PrimaryBtn>}

            {!isLanding && currentUser && (
              <PrimaryBtn onClick={handleNewSession} className="bg-emerald-600 hover:bg-emerald-500 text-sm">
                แชทใหม่
              </PrimaryBtn>
            )}
          </div>


        </div>
      </header>

      <div className="flex flex-1 w-full h-[calc(100vh-73px)] overflow-hidden relative">

        {currentUser && (
          <aside
            className={`
              border-r border-zinc-800 bg-zinc-950/50 flex-shrink-0 transition-all duration-300 ease-in-out relative z-20
              ${isSidebarOpen ? 'w-72 translate-x-0' : 'w-0 -translate-x-full opacity-0 overflow-hidden'}
            `}
          >
            <div className="h-full overflow-hidden w-72">
              <HistorySidebar
                items={historyItems}
                onSelect={loadFromHistory}
                onDelete={deleteHistory}
                onRename={renameHistory}
                activeId={currentHistoryId}
              />
            </div>
          </aside>
        )}

        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto transition-all duration-500 relative z-10">

          {isLanding ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center animate-in fade-in zoom-in duration-500 relative overflow-hidden">

              <div
                className="pointer-events-none fixed inset-0 z-0 animate-grid"
                style={{
                  backgroundImage: `
                    radial-gradient(600px at ${mousePosition.x}px ${mousePosition.y}px, rgba(29, 78, 216, 0.15), transparent 80%),
                    linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px),
                    linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)
                  `,
                  backgroundSize: '40px 40px, 40px 40px, 40px 40px'
                }}
              />

              <div className="relative z-10 mb-8 space-y-4">
                <h1 className="text-5xl md:text-6xl font-extrabold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent pb-2 drop-shadow-2xl h-20 flex items-center justify-center">
                  {welcomeText}<span className="animate-pulse text-white">|</span>
                </h1>
                <p className="text-zinc-400 text-lg">
                  อัปโหลด PDF หรือพิมพ์เนื้อหาเพื่อเริ่มสรุปและสร้างข้อสอบได้ทันที
                </p>
              </div>

              <div className="w-full max-w-2xl bg-zinc-900/80 border border-zinc-700 rounded-3xl p-4 shadow-2xl backdrop-blur-sm relative z-10 group focus-within:border-indigo-500 transition-colors">
                <textarea
                  placeholder="พิมพ์เนื้อหาที่ต้องการสรุป หรือถามคำถาม..."
                  className="w-full h-32 bg-transparent border-0 outline-none text-lg resize-none placeholder-zinc-500 text-zinc-100"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); summarize(); } }}
                />

                <div className="flex justify-between items-center mt-2">
                  <div className="flex gap-2">
                    <div className="relative">
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => uploadPdf(e.target.files?.[0] || null)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                      <button className="p-2 rounded-full hover:bg-zinc-800 text-zinc-400 transition flex items-center justify-center gap-1" title="อัปโหลด PDF">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
                        <span className="text-xs font-medium">PDF</span>
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={summarize}
                    disabled={!text.trim()}
                    className="bg-white text-black p-3 rounded-full hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-6 py-6 space-y-8 w-full max-w-5xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
              
              <div className="relative group rounded-3xl border border-zinc-800/80 bg-zinc-950/60 backdrop-blur-xl shadow-2xl overflow-hidden transition-all duration-500 hover:border-zinc-700/80">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500/40 via-purple-500/40 to-transparent opacity-40 group-hover:opacity-100 transition-opacity duration-500"></div>

                <div className="p-2 sm:p-4">
                  <textarea
                    placeholder="พิมพ์เนื้อหาเพิ่มเติมเพื่อเริ่มสรุป หรืออัปโหลดไฟล์ PDF ด้านล่าง..."
                    className="w-full h-36 bg-transparent border-0 px-4 py-2 text-zinc-100 placeholder-zinc-600 focus:ring-0 outline-none resize-none leading-relaxed text-base md:text-lg custom-scrollbar"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                  />
                </div>

                <div className="bg-zinc-900/80 px-4 sm:px-6 py-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 border-t border-zinc-800/80">
                  
                  <div className="flex-shrink-0 w-full lg:w-auto">
                    {(pdf || (fileId && fileId !== "manual")) ? (
                      <div className="flex items-center justify-center lg:justify-start gap-2 px-4 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm shadow-inner w-full lg:w-fit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                        <span className="font-medium truncate max-w-[200px] sm:max-w-[300px]">
                          {pdf ? pdf.name : (historyItems.find(i => i.id === currentHistoryId)?.fileName || fileId)}
                        </span>
                      </div>
                    ) : (
                      <div className="text-zinc-500 text-sm font-medium px-2 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-zinc-600"></span>
                        โหมดข้อความ (Manual)
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-3 w-full lg:w-auto">
                    
                    <button 
                      onClick={summarize} 
                      disabled={loading} 
                      className="group relative flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-bold text-white transition-all duration-300 disabled:opacity-50 overflow-hidden bg-gradient-to-br from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:-translate-y-0.5"
                    >
                      <div className="absolute inset-0 border-t border-white/20 rounded-xl pointer-events-none"></div>
                      <span>สรุปเนื้อหา</span>
                    </button>
                    
                    {currentUser && (
                      <button 
                        onClick={() => setNoteOpen(true)} 
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all duration-300 disabled:opacity-50 bg-zinc-800/50 border border-zinc-700/50 text-zinc-300 backdrop-blur-md hover:bg-zinc-700/80 hover:text-white hover:border-zinc-500 hover:shadow-lg hover:-translate-y-0.5"
                      >
                         โน้ต
                      </button>
                    )}

                    <div className="hidden sm:block w-px h-8 bg-zinc-800 mx-1"></div>

                    <div className="flex gap-3 w-full sm:w-auto mt-1 sm:mt-0">
                      
                      <button 
                        onClick={() => addMoreQuiz("mcq")} 
                        disabled={loading || mcqCount >= MAX_QUESTIONS} 
                        className="group flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all duration-300 disabled:opacity-50 bg-sky-900/20 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 hover:border-sky-400 hover:text-sky-300 hover:shadow-[0_0_15px_rgba(14,165,233,0.2)] hover:-translate-y-0.5"
                      >
                        <span>+ แบบทดสอบปรนัย</span>
                        <span className="flex items-center justify-center bg-sky-950/60 px-2 py-0.5 rounded-md text-xs border border-sky-500/20 group-hover:border-sky-400/40 transition-colors">
                          {mcqCount}/15
                        </span>
                      </button>

                      <button 
                        onClick={() => addMoreQuiz("tf")} 
                        disabled={loading || tfCount >= MAX_QUESTIONS} 
                        className="group flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all duration-300 disabled:opacity-50 bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-400 hover:text-emerald-300 hover:shadow-[0_0_15px_rgba(16,185,129,0.2)] hover:-translate-y-0.5"
                      >
                        <span>+ แบบทดสอบถูกผิด</span>
                        <span className="flex items-center justify-center bg-emerald-950/60 px-2 py-0.5 rounded-md text-xs border border-emerald-500/20 group-hover:border-emerald-400/40 transition-colors">
                          {tfCount}/15
                        </span>
                      </button>

                    </div>
                  </div>
                </div>
              </div>

              <div>
                <div className="group relative flex items-center bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-2 pr-2 shadow-xl backdrop-blur-md transition-all duration-300 focus-within:border-indigo-500/50 focus-within:bg-zinc-900/80 focus-within:shadow-indigo-500/10 hover:border-zinc-700/80">
                  <div className="pl-4 pr-2 text-zinc-500 group-focus-within:text-indigo-400 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  </div>
                  <input 
                    className="flex-1 bg-transparent border-0 py-3 px-2 text-zinc-100 placeholder-zinc-600 focus:outline-none text-base w-full" 
                    placeholder="สงสัยตรงไหน? พิมพ์ถาม AI จากเนื้อหาได้เลย..." 
                    value={qaInput} 
                    onChange={(e) => setQaInput(e.target.value)} 
                    onKeyDown={(e) => { if(e.key === 'Enter') askQA(); }}
                  />
                  <button 
                    onClick={askQA} 
                    disabled={loading || !qaInput.trim()}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2"
                  >
                    ส่ง
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="-mr-1"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                  </button>
                </div>

                {qaHistory.length > 0 && (
                  <div className="space-y-4 mt-6 animate-in fade-in duration-500">
                    {qaHistory.map((item, idx) => (
                      <div key={idx} className="relative rounded-2xl border border-zinc-800/60 bg-zinc-950/50 overflow-hidden shadow-lg">
                        <div className="px-5 py-4 bg-zinc-900/40 border-b border-zinc-800/50 flex items-start gap-4">
                          <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700 shadow-sm text-zinc-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                          </div>
                          <div className="text-zinc-200 font-medium leading-relaxed mt-0.5">{item.question}</div>
                        </div>
                        <div className="px-5 py-5 flex items-start gap-4">
                          <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 0 1 2 2c-.11.66-.4 1.25-.83 1.76A5.5 5.5 0 0 1 17.5 11h1a1.5 1.5 0 0 1 0 3h-1a5.5 5.5 0 0 1-4.33 5.24c.43.51.72 1.1.83 1.76a2 2 0 0 1-4 0c.11-.66.4-1.25.83-1.76A5.5 5.5 0 0 1 5.5 14h-1a1.5 1.5 0 0 1 0-3h1a5.5 5.5 0 0 1 4.33-5.24C9.4 5.25 9.11 4.66 9 4a2 2 0 0 1 3-2z"></path></svg>
                          </div>
                          <div className="text-zinc-300 leading-relaxed whitespace-pre-line font-light mt-0.5">{item.answer}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {error && <Card className="border-red-700/50 bg-red-900/20 text-red-200">{error}</Card>}

              {(overview || keyPoints.length > 0 || sections.length > 0) && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-8 duration-700 pb-10">
                  
                  {overview && (
                    <div className="relative group">
                      <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 rounded-2xl blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                      <div className="relative rounded-2xl bg-zinc-950 border border-zinc-800 p-8 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4 border-b border-zinc-800 pb-4">
                          <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
                            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>
                          </div>
                          <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-200 to-zinc-100">
                            บทสรุปเนื้อหา
                          </h2>
                        </div>
                        <p className="text-lg leading-relaxed text-zinc-300 font-light tracking-wide whitespace-pre-line">
                          {overview}
                        </p>
                      </div>
                    </div>
                  )}

                  {keyPoints.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                        ประเด็นสำคัญ
                      </h3>
                      <div className="space-y-3">
                        {keyPoints.map((p, i) => (
                          <div key={i} className="flex gap-3 p-4 rounded-xl border border-zinc-800/60 bg-zinc-900/20 hover:border-emerald-500/30 hover:bg-emerald-900/5 transition-all group">
                            <div className="shrink-0 mt-0.5">
                              <div className="w-5 h-5 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 group-hover:border-emerald-500 group-hover:bg-emerald-500 text-emerald-500 group-hover:text-black transition-all">
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                              </div>
                            </div>
                            <span className="text-base text-zinc-300 leading-relaxed group-hover:text-zinc-100 transition-colors">{p}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {sections.length > 0 && (
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        เนื้อหาเจาะลึก
                      </h3>
                      <div className="flex flex-col gap-4">
                        {sections.map((s, i) => (
                          <div key={i} className="group relative rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 md:p-6 hover:border-blue-500/30 hover:bg-zinc-800 transition-all">
                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-600 rounded-l-xl opacity-0 group-hover:opacity-100 transition-all"></div>
                            <h4 className="text-base md:text-lg font-bold text-zinc-200 mb-2 group-hover:text-blue-400 transition-colors flex items-center gap-2">
                              {s.title}
                            </h4>
                            <p className="text-sm md:text-base text-zinc-400 leading-relaxed group-hover:text-zinc-300">
                              {s.summary}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

              {/* Quiz */}
              {questions.length > 0 && (
                <Card>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold flex items-center gap-2">แบบทดสอบ</h2>
                    <span className="text-xs bg-zinc-800 px-3 py-1 rounded-full text-zinc-400">{questions.length} ข้อ</span>
                  </div>
                  <ol className="space-y-4">
                    {questions.map((q, idx) => {
                      
                      const isThisQuestionSubmitted = isOverallSubmitted || idx < lockedCount;

                      const selectedLetter = answers[idx]; 
                      const hasSelected = !!selectedLetter; 
                      const isCorrect = hasSelected && String(selectedLetter).toLowerCase() === String(q.answer).toLowerCase();
                      
                      const headDotColor = hasSelected ? isThisQuestionSubmitted ? isCorrect ? "bg-emerald-400" : "bg-red-400" : "bg-zinc-500" : "bg-zinc-800";
                      
                      return (
                        <li key={idx} className="rounded-2xl border border-zinc-800 bg-zinc-900/30 p-5 hover:border-zinc-700 transition">
                          <div className="mb-4 font-medium flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div className="flex items-start gap-3 flex-1">
                              <span aria-hidden className={`shrink-0 inline-block h-2.5 w-2.5 rounded-full mt-1.5 ${headDotColor}`} />
                              <span className="leading-snug text-zinc-100 text-lg">{idx + 1}. {q.question}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 md:self-start shrink-0">
                              {hasSelected && (<span className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-300">เลือก: <b>{String(selectedLetter).toUpperCase()}</b></span>)}
                              {currentUser && (
                                <button
                                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 transition border border-indigo-500/30"
                                  onClick={() => { setSaveOpen({ open: true, qIndex: idx }); loadSets(); loadBank(); }}
                                >
                                  บันทึก
                                </button>
                              )}
                            </div>
                          </div>

                          {q.type === "mcq" ? (
                            <div className="grid gap-2 pl-5">
                              {q.choices?.map((c, i) => {
                                const letter = idxToLetter[i];
                                const selected = answers[idx] === letter;
                                const correctLetter = q.answer;
                                const isCorrectChoice = letter === correctLetter;
                                
                                const wrongSelected = isThisQuestionSubmitted && selected && !isCorrectChoice;
                                let cls = "flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition ";
                                if (!isThisQuestionSubmitted) cls += selected ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800 hover:bg-zinc-800 hover:border-zinc-600";
                                else cls += isCorrectChoice ? "border-emerald-500 bg-emerald-500/10" : wrongSelected ? "border-red-500 bg-red-500/10" : "border-zinc-800 opacity-60";
                                
                                return (
                                  <label key={i} className={cls}>
                                    <input 
                                      type="radio" 
                                      name={`q-${idx}`} 
                                      value={letter} 
                                      checked={selected} 
                                      disabled={isThisQuestionSubmitted}
                                      className="sr-only"
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setAnswers((p) => {
                                          const newAns = { ...p, [idx]: val };
                                          if (currentHistoryId) {
                                            setHistoryItems((prev) => prev.map((item) =>
                                              item.id === currentHistoryId ? { ...item, answers: newAns } : item
                                            ));
                                          }
                                          return newAns;
                                        });
                                      }}
                                    />
                                    <div className={`w-6 h-6 rounded-full border flex items-center justify-center text-xs mr-2 transition ${selected ? "border-indigo-400 text-indigo-400" : "border-zinc-600 text-zinc-500"}`}>
                                      {letter}
                                    </div>
                                    <span className="text-zinc-300">{c}</span>
                                  </label>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="flex gap-3 pl-5">
                              {["true", "false"].map((v) => {
                                const selected = answers[idx] === v;
                                const isCorrectChoice = q.answer.toLowerCase() === v;
                                
                                const wrongSelected = isThisQuestionSubmitted && selected && !isCorrectChoice;
                                let cls = "flex-1 flex items-center justify-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition ";
                                if (!isThisQuestionSubmitted) cls += selected ? "border-indigo-500 bg-indigo-500/10" : "border-zinc-800 hover:bg-zinc-800";
                                else cls += isCorrectChoice ? "border-emerald-500 bg-emerald-500/10" : wrongSelected ? "border-red-500 bg-red-500/10" : "border-zinc-800 opacity-60";
                                
                                return (
                                  <label key={v} className={cls}>
                                    <input 
                                      type="radio" 
                                      name={`q-${idx}`} 
                                      value={v} 
                                      checked={selected} 
                                      disabled={isThisQuestionSubmitted}
                                      className="sr-only" 
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setAnswers((p) => {
                                          const newAns = { ...p, [idx]: val };
                                          if (currentHistoryId) {
                                            setHistoryItems((prev) => prev.map((item) =>
                                              item.id === currentHistoryId ? { ...item, answers: newAns } : item
                                            ));
                                          }
                                          return newAns;
                                        });
                                      }}
                                    />
                                    <span className={selected ? "font-semibold text-white" : "text-zinc-400"}>{v === 'true' ? 'จริง (True)' : 'เท็จ (False)'}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                          
                          {isThisQuestionSubmitted && (
                            <div className="mt-4 p-4 rounded-xl bg-zinc-950 border border-zinc-800 text-sm ml-5">
                              <div className="text-emerald-400 font-semibold mb-1">เฉลย: {String(q.answer).toUpperCase()}</div>
                              {q.explain && <div className="text-zinc-400">{q.explain}</div>}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                  <div className="mt-8 pt-6 border-t border-zinc-800 flex items-center justify-between">
                    <div className="text-xs text-zinc-500">
                      {isAllAnswered ? "* กดเพื่อตรวจคะแนน" : `* กรุณาตอบให้ครบทุกข้อ (${Object.keys(answers).length} / ${questions.length})`}
                    </div>
                    <PrimaryBtn onClick={submit} disabled={isOverallSubmitted || !isAllAnswered} className={`px-8 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 ${!isAllAnswered && !isOverallSubmitted ? "opacity-50 cursor-not-allowed" : ""}`}>
                      ตรวจคะแนน
                    </PrimaryBtn>
                  </div>
                  
                  {isOverallSubmitted && (
                    <div className="mt-8 text-center p-8 rounded-3xl bg-zinc-900/40 border border-zinc-800/80 shadow-2xl backdrop-blur-sm animate-in zoom-in-95 duration-500">
                      <div className="text-zinc-400 text-sm font-bold tracking-widest mb-2">คะแนนของคุณ</div>
                      <div className="flex items-baseline justify-center gap-2">
                        <span className="text-6xl font-black bg-gradient-to-tr from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                          {score}
                        </span>
                        <span className="text-3xl font-bold text-zinc-600">
                          / {questions.length}
                        </span>
                      </div>
                    </div>
                  )}

                </Card>
              )}
            </div>
          )}
        </main>
      </div>

      {/* 🟢 Premium Loading Overlay */}
      {loadingText && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300"></div>
          <div className="relative bg-zinc-900/90 border border-zinc-700/50 shadow-[0_0_50px_rgba(99,102,241,0.15)] rounded-3xl p-8 flex flex-col items-center gap-6 animate-in zoom-in-95 fade-in duration-300 min-w-[320px] max-w-sm text-center">
            <div className="relative flex items-center justify-center w-20 h-20">
              {/* Outer spinning ring */}
              <div className="absolute inset-0 rounded-full border-[3px] border-zinc-800"></div>
              <div className="absolute inset-0 rounded-full border-[3px] border-indigo-500 border-t-transparent animate-spin"></div>
              {/* Inner glowing element */}
              <div className="w-8 h-8 bg-indigo-500/20 rounded-full blur-md animate-pulse"></div>
              <svg className="absolute text-indigo-400 w-8 h-8 animate-pulse" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="M4.93 4.93l2.83 2.83"></path><path d="M16.24 16.24l2.83 2.83"></path><path d="M2 12h4"></path><path d="M18 12h4"></path><path d="M4.93 19.07l2.83-2.83"></path><path d="M16.24 7.76l2.83-2.83"></path></svg>
            </div>
            <div className="space-y-2">
              <h3 className="text-zinc-100 font-bold text-lg tracking-wide">{loadingText}</h3>
              <p className="text-zinc-500 text-sm">กรุณารอสักครู่ ระบบกำลังประมวลผล...</p>
            </div>
          </div>
        </div>
      )}

      <Modal open={noteOpen} onClose={() => setNoteOpen(false)} title="โน้ตของฉัน" rightInfo={<>{noteStatus === "saving" && "กำลังบันทึก…"}{noteStatus === "saved" && (noteUpdatedAt ? `บันทึกล่าสุด: ${new Date(noteUpdatedAt).toLocaleString()}` : "บันทึกแล้ว")}{noteStatus === "error" && <span className="text-red-300">บันทึกล้มเหลว</span>}</>}>
        <textarea placeholder="จดสรุป/ประเด็นสำคัญ/ข้อสงสัย… (บันทึกอัตโนมัติ)" className="w-full h-60 rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-3 outline-none focus:border-indigo-500" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="mt-2 text-xs text-zinc-500">* ระบบบันทึกอัตโนมัติและผูกโน้ตกับไฟล์ที่คุณใช้งานอยู่</div>
      </Modal>

      {authOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300" 
            onClick={() => setAuthOpen(false)} 
          />
          
          <div className="relative w-full max-w-md rounded-3xl border border-zinc-800/80 bg-zinc-950/80 p-8 shadow-2xl shadow-indigo-900/10 backdrop-blur-xl animate-in zoom-in-95 fade-in duration-300">
            
            <button 
              onClick={() => setAuthOpen(false)}
              className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white hover:bg-zinc-800 rounded-full transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>

            <div className="text-center mb-8">
              <h2 className="text-3xl font-extrabold bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent mb-2">
                {authMode === "login" ? "ยินดีต้อนรับ" : "สร้างบัญชีใหม่"}
              </h2>
              <p className="text-zinc-400 text-sm">
                {authMode === "login" ? "เข้าสู่ระบบเพื่อใช้งาน EduGen " : "เริ่มต้นใช้งาน EduGen เพื่อสรุปและสร้างข้อสอบ"}
              </p>
            </div>

            {authError && (
              <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-center gap-3">
                {authError}
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-400 pl-1">อีเมล</label>
                <input 
                  type="email" 
                  className="w-full rounded-2xl bg-zinc-900/50 border border-zinc-800 px-4 py-3.5 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all" 
                  value={authEmail} 
                  onChange={(e) => setAuthEmail(e.target.value)} 
                  placeholder="you@example.com" 
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-400 pl-1">รหัสผ่าน</label>
                <input 
                  type="password" 
                  className="w-full rounded-2xl bg-zinc-900/50 border border-zinc-800 px-4 py-3.5 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all" 
                  value={authPassword} 
                  onChange={(e) => setAuthPassword(e.target.value)} 
                  placeholder="อย่างน้อย 6 ตัวอักษร" 
                  onKeyDown={(e) => { if(e.key === 'Enter') handleAuthSubmit(); }}
                />
              </div>

              <button 
                onClick={handleAuthSubmit} 
                disabled={authLoading}
                className="w-full mt-4 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3.5 font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-purple-500 hover:shadow-indigo-500/40 transition-all disabled:opacity-50 flex justify-center items-center gap-2"
              >
                {authLoading ? (
                  <span className="animate-pulse">กำลังดำเนินการ...</span>
                ) : (
                  authMode === "login" ? "เข้าสู่ระบบ" : "สมัครสมาชิก"
                )}
              </button>
            </div>

            <div className="mt-8 text-center text-sm text-zinc-500">
              {authMode === "login" ? "ยังไม่มีบัญชีใช่ไหม? " : "มีบัญชีอยู่แล้วใช่ไหม? "}
              <button 
                onClick={() => { setAuthError(null); setAuthMode((m) => (m === "login" ? "register" : "login")); }} 
                className="font-medium text-indigo-400 hover:text-indigo-300 hover:underline transition"
              >
                {authMode === "login" ? "สมัครสมาชิกที่นี่" : "เข้าสู่ระบบเลย"}
              </button>
            </div>

          </div>
        </div>
      )}

      <Modal
        open={saveOpen.open}
        onClose={() => setSaveOpen({ open: false, qIndex: null })}
        title="บันทึกข้อสอบลงชุด"
        rightInfo={<button className="text-indigo-300 hover:underline" onClick={() => loadSets()}>รีเฟรช</button>}
      >
        <div className="space-y-3">
          {saveOpen.qIndex !== null && questions[saveOpen.qIndex] && (
            <div className="p-3 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-sm text-zinc-300 mb-4">
              <span className="font-semibold text-indigo-400">ข้อที่เลือก:</span> {questions[saveOpen.qIndex].question}
            </div>
          )}

          <div className="grid gap-2">
            {sets.length === 0 && <div className="text-center text-zinc-500 py-4">ยังไม่มีชุดข้อสอบ (ไปสร้างที่เมนู "จัดการชุดข้อสอบ" ก่อน)</div>}
            {sets.map((s) => (
              <button
                key={s.id}
                className="flex items-center justify-between p-3 rounded-xl border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 transition text-left group"
                onClick={async () => {
                  if (saveOpen.qIndex === null) return;
                  const q = questions[saveOpen.qIndex];
                  try {
                    await saveQuestionToSet(s.id, q);
                    alert(`บันทึกข้อนี้ลงชุด "${s.title}" เรียบร้อยแล้ว`);
                    setSaveOpen({ open: false, qIndex: null });
                  } catch (e) {
                    alert(e instanceof Error ? e.message : "บันทึกไม่สำเร็จ");
                  }
                }}
              >
                <span className="font-medium">{s.title}</span>
                <span className="text-xs bg-zinc-800 px-2 py-1 rounded text-zinc-400 group-hover:bg-zinc-700">
                  {s.question_ids.length} ข้อ
                </span>
              </button>
            ))}
          </div>
        </div>
      </Modal>

      <Modal 
        open={setsOpen} 
        onClose={() => setSetsOpen(false)} 
        title="จัดการชุดข้อสอบ" 
      >
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <input 
              className="flex-1 rounded-2xl bg-zinc-900/50 border border-zinc-800 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all" 
              placeholder="ตั้งชื่อชุดข้อสอบใหม่…" 
              value={creatingTitle} 
              onChange={(e) => setCreatingTitle(e.target.value)} 
              onKeyDown={(e) => { if(e.key === 'Enter' && creatingTitle.trim()) { createSet(creatingTitle.trim()); setCreatingTitle(""); } }}
            />
            <button 
              onClick={async () => { if (!creatingTitle.trim()) return; await createSet(creatingTitle.trim()); setCreatingTitle(""); }}
              className="rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-500 hover:to-purple-500 transition-all whitespace-nowrap flex items-center justify-center gap-2"
            >
              สร้างชุดใหม่
            </button>
          </div>

          {sets.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 border border-dashed border-zinc-800 rounded-2xl bg-zinc-900/20">
              ยังไม่มีชุดข้อสอบ — ลองสร้างชุดแรกดูสิ
            </div>
          ) : (
            <ul className="space-y-3">
              {sets.map((s) => (
                <li key={s.id} className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-4 hover:border-zinc-700/80 hover:bg-zinc-800/40 transition-all flex flex-col xl:flex-row xl:items-center justify-between gap-4 group">
                  
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-semibold text-lg text-zinc-200 truncate">{s.title}</span>
                    <span className="shrink-0 px-2.5 py-1.5 rounded-lg bg-zinc-800/80 border border-zinc-700 text-xs text-zinc-400 font-medium flex items-center gap-1">
                      <span>{s.question_ids.length}</span> ข้อ
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button 
                      className="text-xs px-3 py-2 rounded-xl bg-zinc-800/50 text-zinc-300 hover:bg-zinc-700 hover:text-white transition border border-zinc-700/50" 
                      onClick={async () => { const name = prompt("แก้ไขชื่อชุดข้อสอบ:", s.title) || s.title; await renameSet(s.id, name); }}
                    >
                      แก้ชื่อ
                    </button>
                    <button 
                      className="text-xs px-3 py-2 rounded-xl bg-sky-600/10 text-sky-400 hover:bg-sky-600/20 hover:text-sky-300 transition border border-sky-500/20" 
                      onClick={async () => { await loadBank(); setEditOpen({ open: true, set: s }); }}
                    >
                      แก้รายการ
                    </button>
                    <button 
                      className="text-xs px-3 py-2 rounded-xl bg-purple-600/10 text-purple-400 hover:bg-purple-600/20 hover:text-purple-300 transition border border-purple-500/20" 
                      onClick={() => { setManualSetId(s.id); setManualOpen(true); }}
                    >
                      เพิ่มข้อเอง
                    </button>
                    <button 
                      className="text-xs px-3 py-2 rounded-xl bg-emerald-600/10 text-emerald-400 hover:bg-emerald-600/20 hover:text-emerald-300 transition border border-emerald-500/20" 
                      onClick={() => exportSetPdf(s.id, { shuffleChoices: false, showAnswers: false })}
                    >
                      ส่งออก PDF
                    </button>
                    <button 
                      className="text-xs px-3 py-2 rounded-xl bg-red-600/10 text-red-400 hover:bg-red-600/20 hover:text-red-300 transition border border-red-500/20" 
                      onClick={async () => { if (confirm("ต้องการลบชุดนี้ใช่หรือไม่?")) await deleteSet(s.id); }}
                    >
                      ลบ
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Modal>

      <Modal open={manualOpen} onClose={() => setManualOpen(false)} title="เพิ่มข้อสอบเองลงชุด" rightInfo={<button className="text-indigo-300 hover:underline" onClick={() => loadSets()}>รีเฟรชเซ็ต</button>}>
        <div className="space-y-3">
          <div className="flex gap-2">
            <select className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2" value={manualSetId ?? ""} onChange={(e) => setManualSetId(e.target.value ? Number(e.target.value) : null)}><option value="">เลือกชุดที่จะเพิ่ม…</option>{sets.map((s) => (<option key={s.id} value={s.id}>{s.title} ({s.question_ids.length} ข้อ)</option>))}</select>
            <select className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2" value={manualType} onChange={(e) => setManualType(e.target.value as "mcq" | "tf")}><option value="mcq">MCQ</option><option value="tf">True/False</option></select>
          </div>
          <textarea className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2" placeholder="พิมพ์คำถาม…" value={manualQ} onChange={(e) => setManualQ(e.target.value)} />
          {manualType === "mcq" ? (<div className="grid grid-cols-1 md:grid-cols-2 gap-2">{manualChoices.map((c, i) => (<input key={i} className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2" placeholder={`ช้อยส์ ${idxToLetter[i]}`} value={c} onChange={(e) => { const clone = manualChoices.slice(); clone[i] = e.target.value; setManualChoices(clone); }} />))}<select className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2" value={manualAns} onChange={(e) => setManualAns(e.target.value)}>{idxToLetter.map((l) => (<option key={l} value={l}>{`เฉลย ${l}`}</option>))}</select></div>) : (<div className="flex gap-2"><label className="flex items-center gap-2 text-sm"><input type="radio" name="tfans" value="true" checked={manualAns === "true"} onChange={() => setManualAns("true")} /> จริง (true)</label><label className="flex items-center gap-2 text-sm"><input type="radio" name="tfans" value="false" checked={manualAns === "false"} onChange={() => setManualAns("false")} /> เท็จ (false)</label></div>)}
          <input className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2" placeholder="เหตุผล/คำอธิบาย (ถ้ามี)…" value={manualExplain} onChange={(e) => setManualExplain(e.target.value)} />
          <div className="flex justify-end">
            <PrimaryBtn onClick={async () => { 
              if (!manualSetId) { alert("กรุณาเลือกชุดที่จะเพิ่มก่อน"); return; } 
              if (!manualQ.trim()) { alert("กรุณาพิมพ์คำถาม"); return; } 
              
              const qi: QuizItem = manualType === "mcq" 
                ? { type: "mcq", question: manualQ.trim(), choices: manualChoices.map((x) => x.trim()).slice(0, 4), answer: manualAns, explain: manualExplain.trim() } 
                : { type: "tf", question: manualQ.trim(), answer: manualAns.toLowerCase() === "true" ? "true" : "false", explain: manualExplain.trim() }; 
              
              try {
                await loadBank(); 
                await saveQuestionToSet(manualSetId, qi); 
                await loadSets(); 
                
                setManualQ(""); 
                setManualChoices(["", "", "", ""]); 
                setManualAns(manualType === "mcq" ? "ก" : "true"); 
                setManualExplain(""); 
                alert("เพิ่มข้อสอบแล้ว"); 
              } catch (e) {
                alert(e instanceof Error ? e.message : "เกิดข้อผิดพลาดในการบันทึก");
              }
            }}>
              เพิ่มลงชุด
            </PrimaryBtn>
          </div>
        </div>
      </Modal>

      <Modal
        open={editOpen.open}
        onClose={() => setEditOpen({ open: false, set: null })}
        title={`แก้รายการในชุด: ${editOpen.set?.title ?? ""}`}
        rightInfo={<button className="text-indigo-300 hover:underline" onClick={() => { loadBank(); loadSets(); }}>รีเฟรช</button>}
      >
        {!editOpen.set ? (
          <div className="text-sm text-zinc-400">ไม่พบชุด</div>
        ) : (
          <div className="space-y-3">
            {(editOpen.set?.question_ids ?? []).length === 0 && (
              <div className="text-sm text-zinc-400">ยังไม่มีข้อสอบในชุดนี้</div>
            )}

            {(editOpen.set?.question_ids ?? []).map((qid, index) => {
              const q = bankQuestions.find((b) => b.id === qid);

              if (!q) return (
                <div key={qid} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-red-300">ไม่พบข้อสอบ ID {qid}</div>
                    <PrimaryBtn
                      className="bg-red-700 hover:bg-red-600"
                      onClick={async () => {
                        if (!editOpen.set) return;
                        const ids = editOpen.set.question_ids.filter((id) => id !== qid);
                        await renameSet(editOpen.set.id, editOpen.set.title, ids);
                        await loadSets();
                        setEditOpen((e) => ({ ...e, set: { ...e.set!, question_ids: ids } }));
                      }}
                    >
                      ลบออกจากชุด
                    </PrimaryBtn>
                  </div>
                </div>
              );

              const isMcq = q.type === "mcq";

              return (
                <div key={qid} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3 text-sm space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <label className="block text-[13px] text-zinc-400 mb-1">ข้อที่ {index + 1}</label>
                      <input
                        className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2 font-medium text-zinc-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
                        defaultValue={q.question}
                        onBlur={(e) => (q.question = e.target.value)}
                        placeholder="พิมพ์คำถาม…"
                      />
                    </div>
                    <PrimaryBtn
                      className="bg-red-700 hover:bg-red-600 shrink-0 self-start"
                      onClick={async () => {
                        if (!editOpen.set) return;
                        const ids = editOpen.set.question_ids.filter((id) => id !== qid);
                        await renameSet(editOpen.set.id, editOpen.set.title, ids);
                        await loadSets();
                        setEditOpen((e) => ({ ...e, set: { ...e.set!, question_ids: ids } }));
                      }}
                    >
                      ลบออกจากชุด
                    </PrimaryBtn>
                  </div>

                  {isMcq ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <input
                          key={i}
                          className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2"
                          defaultValue={(q.choices ?? [])[i] ?? ""}
                          onBlur={(e) => {
                            const arr = (q.choices ?? ["", "", "", ""]).slice(0, 4);
                            while (arr.length < 4) arr.push("");
                            arr[i] = e.target.value;
                            q.choices = arr;
                          }}
                          placeholder={`ช้อยส์ ${idxToLetter[i]}`}
                        />
                      ))}
                      <select
                        className="rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2"
                        defaultValue={q.answer}
                        onChange={(e) => (q.answer = e.target.value)}
                      >
                        {idxToLetter.map((l) => (
                          <option key={l} value={l}>{`เฉลย ${l}`}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <label className="flex items-center gap-2">
                        <input type="radio" name={`tf-${qid}`} defaultChecked={q.answer === "true"} onChange={() => (q.answer = "true")} /> จริง
                      </label>
                      <label className="flex items-center gap-2">
                        <input type="radio" name={`tf-${qid}`} defaultChecked={q.answer === "false"} onChange={() => (q.answer = "false")} /> เท็จ
                      </label>
                    </div>
                  )}

                  <input
                    className="w-full rounded-xl bg-zinc-900 border border-zinc-800 px-3 py-2"
                    defaultValue={q.explain ?? ""}
                    onBlur={(e) => (q.explain = e.target.value)}
                    placeholder="เหตุผล/คำอธิบาย…"
                  />

                  <div className="flex justify-end">
                    <PrimaryBtn
                      className="bg-emerald-700 hover:bg-emerald-600"
                      onClick={async () => {
                        const body = {
                          type: q.type,
                          question: q.question,
                          answer: q.type === "tf" ? (q.answer?.toLowerCase() === "true" ? "true" : "false") : q.answer,
                          explain: q.explain ?? "",
                          ...(q.type === "mcq" ? { choices: (q.choices ?? []).slice(0, 4) } : {})
                        };
                        const r = await fetch(`${API}/bank/questions/${q.id}`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json", ...authHeader },
                          body: JSON.stringify(body)
                        });
                        if (!r.ok) { alert("บันทึกไม่สำเร็จ"); return; }
                        await loadBank();
                        alert("บันทึกแล้ว");
                      }}
                    >
                      บันทึกข้อนี้
                    </PrimaryBtn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}