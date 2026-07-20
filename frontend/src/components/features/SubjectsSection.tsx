import React from 'react';
import { PrimaryBtn } from '../ui/PrimaryBtn';

export function SubjectsSection() {
  const subjects = [
    { id: 1, title: 'วิทยาศาสตร์ ม.ต้น', code: 'SCI101', chapters: 12, students: 45, color: 'bg-emerald-500' },
    { id: 2, title: 'คณิตศาสตร์ ม.ปลาย', code: 'MATH201', chapters: 8, students: 120, color: 'bg-blue-500' },
    { id: 3, title: 'ภาษาอังกฤษพื้นฐาน', code: 'ENG01', chapters: 15, students: 89, color: 'bg-teal-500' },
    { id: 4, title: 'ประวัติศาสตร์ไทย', code: 'HIS101', chapters: 5, students: 30, color: 'bg-amber-500' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">จัดการรายวิชา</h1>
          <p className="text-slate-500 text-sm mt-1">สร้างและจัดการเนื้อหารายวิชาทั้งหมดในระบบ</p>
        </div>
        <PrimaryBtn onClick={() => alert('ฟีเจอร์สร้างรายวิชายังอยู่ในระหว่างการพัฒนา')} className="bg-blue-600 hover:bg-blue-700">
          + สร้างรายวิชาใหม่
        </PrimaryBtn>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {subjects.map(subject => (
          <div key={subject.id} onClick={() => alert(`คุณเลือกรายวิชา: ${subject.title}\n\nระบบจัดการรายวิชารายบุคคลยังอยู่ในระหว่างการพัฒนา`)} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-shadow cursor-pointer group">
            <div className="flex items-start justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg ${subject.color}`}>
                {subject.title.substring(0, 1)}
              </div>
              <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-xs font-semibold">
                {subject.code}
              </span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">
              {subject.title}
            </h3>
            <div className="mt-4 flex items-center gap-4 text-sm text-slate-500">
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
                {subject.chapters} บทเรียน
              </div>
              <div className="flex items-center gap-1.5">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
                {subject.students} ผู้เรียน
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
