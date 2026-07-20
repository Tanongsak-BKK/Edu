import type { QAPair } from "../../types";

type Props = {
  qaInput: string;
  qaHistory: QAPair[];
  loading: boolean;
  onInputChange: (value: string) => void;
  onAsk: () => void;
  pendingQuestion?: string;
};

export function QASection({ qaInput, qaHistory, loading, onInputChange, onAsk, pendingQuestion }: Props) {
  return (
    <div>
      <div className="group relative flex items-center bg-white/40 border border-slate-200/80 rounded-2xl p-2 pr-2 shadow-xl backdrop-blur-md transition-all duration-300 focus-within:border-indigo-500/50 focus-within:bg-white/80 focus-within:shadow-blue-500/10 hover:border-slate-300/80">
        <div className="pl-4 pr-2 text-slate-500 group-focus-within:text-indigo-400 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <input
          className="flex-1 bg-transparent border-0 py-3 px-2 text-slate-800 placeholder-slate-400 focus:outline-none text-base w-full"
          placeholder="สงสัยตรงไหน? พิมพ์ถาม AI จากเนื้อหาได้เลย..."
          value={qaInput}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onAsk(); }}
        />
        <button
          onClick={onAsk}
          disabled={loading || !qaInput.trim()}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-100 disabled:text-slate-400 text-white px-6 py-3 rounded-xl font-semibold transition-all flex items-center gap-2"
        >
          ส่ง
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="-mr-1"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        </button>
      </div>

      {(pendingQuestion || qaHistory.length > 0) && (
        <div className="space-y-4 mt-6 animate-in fade-in duration-500">
          {/* 🟢 Beautiful Glowing Skeleton Loader Bubble */}
          {pendingQuestion && (
            <div className="relative rounded-2xl border border-indigo-100 bg-indigo-50/20 overflow-hidden shadow-lg animate-pulse">
              <div className="px-5 py-4 bg-white/40 border-b border-indigo-100/30 flex items-start gap-4">
                <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-300 shadow-sm text-slate-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </div>
                <div className="text-slate-700 font-medium leading-relaxed mt-0.5">{pendingQuestion}</div>
              </div>
              <div className="px-5 py-5 flex items-start gap-4">
                <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-sm">
                  <svg className="animate-spin text-indigo-500" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                </div>
                <div className="flex-1 space-y-3 mt-1.5">
                  <div className="h-3 bg-indigo-200/50 rounded w-[85%] animate-pulse"></div>
                  <div className="h-3 bg-indigo-200/35 rounded w-[60%] animate-pulse"></div>
                  <div className="h-3 bg-indigo-200/20 rounded w-[40%] animate-pulse"></div>
                </div>
              </div>
            </div>
          )}

          {qaHistory.map((item, idx) => (
            <div key={idx} className="relative rounded-2xl border border-slate-200/60 bg-slate-50/50 overflow-hidden shadow-lg">
              <div className="px-5 py-4 bg-white/40 border-b border-slate-200/50 flex items-start gap-4">
                <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-300 shadow-sm text-slate-500">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                </div>
                <div className="text-slate-700 font-medium leading-relaxed mt-0.5">{item.question}</div>
              </div>
              <div className="px-5 py-5 flex items-start gap-4">
                <div className="mt-0.5 shrink-0 w-8 h-8 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 0 1 2 2c-.11.66-.4 1.25-.83 1.76A5.5 5.5 0 0 1 17.5 11h1a1.5 1.5 0 0 1 0 3h-1a5.5 5.5 0 0 1-4.33 5.24c.43.51.72 1.1.83 1.76a2 2 0 0 1-4 0c.11-.66.4-1.25.83-1.76A5.5 5.5 0 0 1 5.5 14h-1a1.5 1.5 0 0 1 0-3h1a5.5 5.5 0 0 1 4.33-5.24C9.4 5.25 9.11 4.66 9 4a2 2 0 0 1 3-2z"></path></svg>
                </div>
                <div className="text-slate-600 leading-relaxed whitespace-pre-line font-light mt-0.5">{item.answer}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
