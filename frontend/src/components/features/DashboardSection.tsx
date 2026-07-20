import React from 'react';
import { HistoryItem } from '../../types';

type DashboardProps = {
  onStart?: () => void;
  historyItems?: HistoryItem[];
  onSelectHistory?: (item: HistoryItem) => void;
};

export function DashboardSection({ onStart, historyItems = [], onSelectHistory }: DashboardProps) {
  const totalQuestions = historyItems.reduce((acc, item) => acc + (item.questions?.length || 0), 0);
  
  const summaryCards = [
    { title: 'เนื้อหาที่สรุปแล้ว', value: historyItems.length.toString(), icon: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>, icon2: <polyline points="14 2 14 8 20 8"></polyline>, color: 'text-blue-600', bg: 'bg-blue-100' },
    { title: 'ข้อสอบที่สร้าง (ข้อ)', value: totalQuestions.toString(), icon: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>, icon2: <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { title: 'คะแนนเฉลี่ย', value: historyItems.length > 0 ? (historyItems.reduce((acc, item) => acc + (item.score >= 0 ? (item.score / (item.totalQuestions || 1)) * 100 : 0), 0) / historyItems.filter(i => i.score >= 0).length || 0).toFixed(1) + '%' : '0%', icon: <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>, color: 'text-amber-600', bg: 'bg-amber-100' },
    { title: 'การเข้าใช้งานวันนี้', value: '1', icon: <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>, color: 'text-purple-600', bg: 'bg-purple-100' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">ภาพรวมระบบ (Dashboard)</h1>
          <p className="text-slate-500 text-sm mt-1">ยินดีต้อนรับสู่แผงควบคุม ยอดรวมสิ่งที่สรุปไว้และข้อสอบที่สร้าง</p>
        </div>
        <button 
          onClick={onStart}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-5 rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          สร้างสรุป/ข้อสอบใหม่
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {summaryCards.map((card, idx) => (
          <div key={idx} className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl ${card.bg} ${card.color} flex items-center justify-center shrink-0`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {card.icon}
                {card.icon2}
              </svg>
            </div>
            <div>
              <p className="text-slate-500 text-sm font-medium">{card.title}</p>
              <h3 className="text-3xl font-bold text-slate-800 mt-1">{card.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <h3 className="text-lg font-bold text-slate-800 mb-6">สิ่งที่สรุปไว้ และข้อสอบที่สกัดล่าสุด</h3>
        
        {historyItems.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {historyItems.slice(0, 6).map((item) => (
              <div 
                key={item.id} 
                onClick={() => onSelectHistory?.(item)}
                className="group border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-md hover:bg-blue-50/30 transition-all cursor-pointer flex flex-col"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 text-slate-800 font-semibold truncate pr-2">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" className="text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    <span className="truncate">{item.fileName || 'ไม่มีชื่อไฟล์'}</span>
                  </div>
                  <span className="text-xs font-medium bg-slate-100 text-slate-500 px-2 py-1 rounded-md shrink-0">
                    {new Date(item.timestamp).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
                
                <p className="text-sm text-slate-500 line-clamp-2 mb-4 flex-1">
                  {item.overview || 'ไม่มีข้อมูลสรุป'}
                </p>
                
                <div className="flex items-center gap-4 mt-auto pt-4 border-t border-slate-100">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-md">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
                    {item.questions?.length || 0} ข้อสอบ
                  </div>
                  {item.score >= 0 && (
                    <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-md">
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                      คะแนน {item.score}/{item.totalQuestions || item.questions?.length || 0}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-slate-300 mb-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            <p className="text-slate-500 font-medium mb-1">ยังไม่มีข้อมูลสรุปและข้อสอบ</p>
            <p className="text-slate-400 text-sm mb-4">อัปโหลดไฟล์ PDF หรือพิมพ์เนื้อหาเพื่อสร้างสรุปและข้อสอบแรกของคุณ</p>
            <button 
              onClick={onStart}
              className="text-blue-600 font-medium hover:underline text-sm"
            >
              เริ่มต้นใช้งานตอนนี้
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
