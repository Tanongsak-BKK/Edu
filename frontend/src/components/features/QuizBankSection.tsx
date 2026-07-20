import React, { useState } from 'react';
import { PrimaryBtn } from '../ui/PrimaryBtn';
import { useBank } from '../../hooks/useBank';

type QuizBankProps = {
  bank: ReturnType<typeof useBank>;
  onError?: (msg: string) => void;
};

export function QuizBankSection({ bank, onError }: QuizBankProps) {
  const { sets, deleteSet, exportSetPdf, openLibrary } = bank;
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSets = sets.filter(s => 
    s.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">คลังข้อสอบ</h1>
          <p className="text-slate-500 text-sm mt-1">รวบรวมข้อสอบที่สร้างไว้ทั้งหมด พร้อมจัดหมวดหมู่</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <input 
              type="text" 
              placeholder="ค้นหาข้อสอบ..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500/50 outline-none w-64 text-sm"
            />
            <svg className="absolute left-3 top-2.5 text-slate-400" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </div>
          <PrimaryBtn onClick={openLibrary} className="bg-emerald-600 hover:bg-emerald-700">
            เปิดคลังรวม (จัดการ)
          </PrimaryBtn>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        {filteredSets.length > 0 ? (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-500">
                <th className="p-4 font-medium">ชื่อชุดข้อสอบ</th>
                <th className="p-4 font-medium text-center">จำนวนข้อ</th>
                <th className="p-4 font-medium">สร้างเมื่อ</th>
                <th className="p-4 font-medium">อัปเดตล่าสุด</th>
                <th className="p-4 font-medium text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
              {filteredSets.map((quiz) => (
                <tr key={quiz.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-semibold text-slate-800">{quiz.title}</td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center justify-center bg-blue-100 text-blue-700 font-bold px-2 py-1 rounded-lg text-xs min-w-[2.5rem]">
                      {quiz.question_ids?.length || 0}
                    </span>
                  </td>
                  <td className="p-4">{new Date(quiz.created_at).toLocaleDateString('th-TH')}</td>
                  <td className="p-4">{new Date(quiz.updated_at).toLocaleDateString('th-TH')}</td>
                  <td className="p-4">
                    <div className="flex items-center justify-center gap-1.5">
                      <button 
                        onClick={async () => {
                          await bank.loadBank();
                          bank.setEditOpen({ open: true, set: quiz });
                        }}
                        className="text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors font-medium text-xs"
                      >
                        แก้ไข
                      </button>
                      <button 
                        onClick={() => {
                          bank.setManualSetId(quiz.id);
                          bank.setManualOpen(true);
                        }}
                        className="text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-lg transition-colors font-medium text-xs"
                      >
                        เพิ่มข้อ
                      </button>
                      <button 
                        onClick={() => {
                          exportSetPdf(quiz.id, onError || alert, { shuffleChoices: true, showAnswers: true });
                        }}
                        className="text-emerald-600 hover:bg-emerald-50 px-3 py-1.5 rounded-lg transition-colors font-medium text-xs flex items-center gap-1"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        PDF
                      </button>
                      <button 
                        onClick={() => {
                          if (confirm('คุณต้องการลบชุดข้อสอบนี้หรือไม่?')) {
                            deleteSet(quiz.id);
                          }
                        }}
                        className="text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors font-medium text-xs"
                      >
                        ลบ
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-12 text-center text-slate-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-slate-300 mb-4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path></svg>
            <p className="text-lg font-medium text-slate-600 mb-1">ไม่พบข้อสอบในคลัง</p>
            <p className="text-sm text-slate-400">สร้างข้อสอบใหม่หรือบันทึกข้อสอบจาก Workspace ลงในคลัง</p>
          </div>
        )}
      </div>
    </div>
  );
}
