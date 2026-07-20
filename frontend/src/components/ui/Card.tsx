import { ReactNode } from "react";

export const Card = ({ className = "", children }: { className?: string; children: ReactNode }) => (
  <div className={`rounded-2xl border border-slate-200/40 bg-white/40 backdrop-blur-sm p-5 ${className}`}>
    {children}
  </div>
);
