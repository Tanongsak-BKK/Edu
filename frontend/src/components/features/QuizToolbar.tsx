import { MAX_QUESTIONS } from "../../constants/quiz";

type Props = {
  mcqCount: number;
  tfCount: number;
  loading: boolean;
  onAddMcq: () => void;
  onAddTf: () => void;
};

export function QuizToolbar({ mcqCount, tfCount, loading, onAddMcq, onAddTf }: Props) {
  return (
    <>
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
    </>
  );
}
