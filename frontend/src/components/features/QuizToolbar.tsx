 import { MAX_QUESTIONS } from "../../constants/quiz";

type Props = {
  mcqCount: number;
  tfCount: number;
  loading: boolean;
  onAddMcq: () => void;
  onAddTf: () => void;
  difficultyLevel: "easy" | "medium" | "hard" | "mixed";
  onChangeDifficulty: (level: "easy" | "medium" | "hard" | "mixed") => void;
};

export function QuizToolbar({ mcqCount, tfCount, loading, onAddMcq, onAddTf, difficultyLevel, onChangeDifficulty }: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Dropdown เลือกระดับความยาก */}
      <div className="relative group">
        <select
          value={difficultyLevel}
          onChange={(e) => onChangeDifficulty(e.target.value as "easy" | "medium" | "hard" | "mixed")}
          disabled={loading}
          className="appearance-none bg-slate-800/50 border border-slate-600/50 text-slate-300 text-sm font-medium py-2.5 pl-4 pr-10 rounded-xl outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-all cursor-pointer disabled:opacity-50"
        >
          <option value="mixed">ความยาก: อัตโนมัติ (Auto)</option>
          <option value="easy">ความยาก: ง่าย (Easy)</option>
          <option value="medium">ความยาก: ปานกลาง (Medium)</option>
          <option value="hard">ความยาก: ยาก (Hard)</option>
        </select>
        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </div>
      </div>

      <button
        onClick={onAddMcq}
        disabled={loading || mcqCount >= MAX_QUESTIONS}
        className="group flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all duration-300 disabled:opacity-50 bg-sky-900/20 border border-sky-500/30 text-sky-400 hover:bg-sky-500/20 hover:text-sky-300 flex-1 sm:flex-none whitespace-nowrap"
      >
        <span>+ ปรนัย</span>
        <span className="bg-sky-950/60 px-1.5 py-0.5 rounded text-[11px] border border-sky-500/20 group-hover:border-sky-400/40">
          {mcqCount}/{MAX_QUESTIONS}
        </span>
      </button>
      <button
        onClick={onAddTf}
        disabled={loading || tfCount >= MAX_QUESTIONS}
        className="group flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all duration-300 disabled:opacity-50 bg-emerald-900/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 flex-1 sm:flex-none whitespace-nowrap"
      >
        <span>+ ถูกผิด</span>
        <span className="bg-emerald-950/60 px-1.5 py-0.5 rounded text-[11px] border border-emerald-500/20 group-hover:border-emerald-400/40">
          {tfCount}/{MAX_QUESTIONS}
        </span>
      </button>
    </div>
  );
}
