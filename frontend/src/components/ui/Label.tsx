import { ReactNode } from "react";

export const Label = ({ children }: { children: ReactNode }) => (
  <span className="inline-flex items-center gap-2 text-xs rounded-full px-2 py-1 bg-slate-100/60 border border-slate-300/60">
    {children}
  </span>
);
