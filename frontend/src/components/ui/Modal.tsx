import { useEffect, ReactNode } from "react";

export function Modal({ 
  open, 
  onClose, 
  title, 
  children, 
  rightInfo 
}: { 
  open: boolean; 
  onClose: () => void; 
  title: string; 
  children: ReactNode; 
  rightInfo?: ReactNode; 
}) {
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
      <div className="relative w-full max-w-4xl rounded-3xl border border-slate-200/80 bg-slate-50/90 shadow-2xl shadow-black/50 backdrop-blur-xl flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/80 shrink-0">
          <div className="font-bold text-xl text-slate-800">{title}</div>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            {rightInfo}
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 hover:text-white transition-colors">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">{children}</div>
      </div>
    </div>
  );
}
