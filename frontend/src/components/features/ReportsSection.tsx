import React, { useMemo } from 'react';
import { HistoryItem } from '../../types';

type ReportsProps = {
  historyItems?: HistoryItem[];
};

export function ReportsSection({ historyItems = [] }: ReportsProps) {
  
  // คำนวณสถิติจากประวัติการใช้งานจริง
  const stats = useMemo(() => {
    const totalDocs = historyItems.length;
    let totalQ = 0;
    let totalScore = 0;
    let totalCompleted = 0;
    
    // Trend data for last 7 entries
    const trendData: number[] = [];
    
    historyItems.forEach(item => {
      const qLen = item.questions?.length || 0;
      totalQ += qLen;
      if (item.score >= 0) {
        totalScore += item.score;
        totalCompleted += qLen;
        trendData.push(Math.round((item.score / (qLen || 1)) * 100));
      }
    });

    const accuracy = totalCompleted > 0 ? Math.round((totalScore / totalCompleted) * 100) : 0;
    const accuracyTrend = trendData.length >= 2 ? trendData[0] - trendData[1] : 0; // Compare latest with previous
    
    // Get last 7 days for the chart (reversed to show chronological left-to-right)
    const recentTrend = trendData.slice(0, 7).reverse();
    while (recentTrend.length < 7) recentTrend.unshift(0); // Pad with 0s if not enough data
    
    return {
      totalDocs,
      totalQuestions: totalQ,
      accuracy,
      accuracyTrend,
      recentTrend
    };
  }, [historyItems]);

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (stats.accuracy / 100) * circumference;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500 font-sans">
      
      {/* Header Area */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">รายงานผลการเรียน (Analytics)</h1>
          <p className="text-slate-500 text-sm mt-2 font-medium">ภาพรวมความก้าวหน้าและการวิเคราะห์จุดแข็งของคุณโดย EduGen AI</p>
        </div>
        <button className="flex items-center gap-2 bg-white border border-slate-200 text-slate-700 px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          ดาวน์โหลดรายงาน (PDF)
        </button>
      </div>

      {/* Top Section: AI Insight & Circular Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        
        {/* AI Insight Card (Glassmorphism) */}
        <div className="lg:col-span-2 relative overflow-hidden rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-500 to-purple-600 p-8 shadow-xl shadow-indigo-500/20 text-white flex flex-col justify-center">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 left-0 -mb-10 -ml-10 w-32 h-32 bg-purple-400 opacity-20 rounded-full blur-2xl"></div>
          
          <div className="relative z-10 flex items-start gap-4">
            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md shrink-0 border border-white/20 shadow-inner">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="M4.93 4.93l2.83 2.83"></path><path d="M16.24 16.24l2.83 2.83"></path><path d="M2 12h4"></path><path d="M18 12h4"></path><path d="M4.93 19.07l2.83-2.83"></path><path d="M16.24 7.76l2.83-2.83"></path></svg>
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/20 text-white text-xs font-bold tracking-wide mb-3 border border-white/10 backdrop-blur-sm shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse"></span>
                AI INSIGHTS
              </div>
              <h2 className="text-2xl font-bold mb-2 tracking-tight">การเรียนรู้ของคุณมีพัฒนาการที่ดี! 🚀</h2>
              <p className="text-indigo-100 text-sm leading-relaxed max-w-xl font-medium">
                จากประวัติการทำข้อสอบ {stats.totalQuestions} ข้อที่ผ่านมา คุณมีความแม่นยำเฉลี่ยอยู่ที่ {stats.accuracy}% 
                {stats.accuracyTrend > 0 ? " ซึ่งสูงขึ้นจากการทดสอบครั้งก่อน ระบบแนะนำให้คุณรักษาระดับนี้ไว้และทบทวนเนื้อหาใหม่เพิ่มเติม" : " ระบบตรวจพบว่าคุณอาจต้องการทบทวนเนื้อหาเพิ่มเติมในไฟล์ล่าสุด แนะนำให้อ่านสรุปที่ AI สกัดให้อีกครั้ง"}
              </p>
            </div>
          </div>
        </div>

        {/* Circular Accuracy Metric */}
        <div className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm flex flex-col items-center justify-center relative overflow-hidden group hover:border-emerald-200 hover:shadow-emerald-500/10 transition-all duration-500">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-emerald-50/50 opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <h3 className="text-slate-500 text-sm font-bold tracking-wide uppercase mb-6 relative z-10">ความแม่นยำเฉลี่ย (Accuracy)</h3>
          
          <div className="relative flex items-center justify-center w-36 h-36 z-10">
            <svg className="w-full h-full transform -rotate-90 drop-shadow-sm" viewBox="0 0 80 80">
              {/* Background circle */}
              <circle cx="40" cy="40" r={radius} stroke="currentColor" strokeWidth="8" fill="transparent" className="text-slate-100" />
              {/* Progress circle */}
              <circle 
                cx="40" 
                cy="40" 
                r={radius} 
                stroke="currentColor" 
                strokeWidth="8" 
                fill="transparent" 
                strokeLinecap="round"
                className="text-emerald-500 transition-all duration-1000 ease-out"
                style={{ strokeDasharray: circumference, strokeDashoffset: offset }}
              />
            </svg>
            <div className="absolute flex flex-col items-center justify-center">
              <span className="text-4xl font-extrabold text-slate-800">{stats.accuracy}</span>
              <span className="text-sm font-semibold text-slate-400">%</span>
            </div>
          </div>
          
          <div className="mt-6 flex items-center gap-2 text-sm font-medium z-10">
            {stats.accuracyTrend >= 0 ? (
              <span className="flex items-center text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                +{stats.accuracyTrend}%
              </span>
            ) : (
              <span className="flex items-center text-red-600 bg-red-50 px-2 py-0.5 rounded-md">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline><polyline points="17 18 23 18 23 12"></polyline></svg>
                {stats.accuracyTrend}%
              </span>
            )}
            <span className="text-slate-400">จากครั้งก่อน</span>
          </div>
        </div>

      </div>

      {/* Middle Section: Stats Grid & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        
        {/* Basic Stats */}
        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group">
            <div>
              <h4 className="text-slate-500 text-sm font-semibold mb-1">เอกสารที่อ่านแล้ว</h4>
              <p className="text-3xl font-extrabold text-slate-800">{stats.totalDocs} <span className="text-base font-medium text-slate-400">ไฟล์</span></p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-500 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
            </div>
          </div>
          
          <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm hover:shadow-md transition-shadow flex items-center justify-between group">
            <div>
              <h4 className="text-slate-500 text-sm font-semibold mb-1">คำถามที่ผ่านการฝึกฝน</h4>
              <p className="text-3xl font-extrabold text-slate-800">{stats.totalQuestions} <span className="text-base font-medium text-slate-400">ข้อ</span></p>
            </div>
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center group-hover:scale-110 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
            </div>
          </div>
        </div>

        {/* Beautiful Bar Chart for Performance Trend */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm flex flex-col relative overflow-hidden">
          <div className="absolute -right-20 -top-20 w-64 h-64 bg-slate-50 rounded-full blur-3xl pointer-events-none"></div>
          
          <div className="flex justify-between items-center mb-8 relative z-10">
            <div>
              <h3 className="text-slate-800 font-extrabold text-lg">แนวโน้มคะแนน (7 ครั้งล่าสุด)</h3>
              <p className="text-slate-400 text-sm font-medium">เปอร์เซ็นต์ความถูกต้องของข้อสอบที่ทำ</p>
            </div>
            <div className="px-3 py-1 bg-slate-100 rounded-lg text-xs font-bold text-slate-500">
              ล่าสุดอยู่ขวาสุด
            </div>
          </div>
          
          <div className="flex-1 flex items-end justify-between gap-2 sm:gap-4 px-2 relative z-10 min-h-[160px]">
            {/* Horizontal Grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
              <div className="w-full h-px bg-slate-100"></div>
              <div className="w-full h-px bg-slate-100"></div>
              <div className="w-full h-px bg-slate-100"></div>
              <div className="w-full h-px bg-slate-100"></div>
              <div className="w-full h-px bg-slate-100"></div>
            </div>
            
            {stats.recentTrend.map((score, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-3 group z-10 h-full">
                <span className="text-xs font-bold text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:-translate-y-1">{score}%</span>
                <div 
                  className={`w-full max-w-[48px] rounded-t-xl transition-all duration-500 relative cursor-pointer
                    ${i === stats.recentTrend.length - 1 ? 'bg-indigo-500 hover:bg-indigo-400 shadow-[0_0_15px_rgba(99,102,241,0.5)]' : 'bg-slate-200 hover:bg-slate-300'}
                  `}
                  style={{ height: `${Math.max(score, 5)}%` }} // Minimum height 5% for visibility
                >
                  {/* Subtle top highlight */}
                  <div className="absolute top-0 left-0 w-full h-2 bg-white/20 rounded-t-xl"></div>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-4 text-xs font-bold text-slate-400 px-2 z-10">
            <span>T-6</span>
            <span>T-5</span>
            <span>T-4</span>
            <span>T-3</span>
            <span>T-2</span>
            <span>T-1</span>
            <span className="text-indigo-500">ปัจจุบัน</span>
          </div>
        </div>

      </div>

    </div>
  );
}
