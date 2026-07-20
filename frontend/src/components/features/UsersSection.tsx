import React from 'react';
import { PrimaryBtn } from '../ui/PrimaryBtn';

export function UsersSection() {
  const users = [
    { id: 1, name: 'สมชาย เรียนดี', email: 'somchai@student.edu.th', role: 'Student', status: 'Active' },
    { id: 2, name: 'อ.ใจดี สอนเก่ง', email: 'teacher1@edu.th', role: 'Teacher', status: 'Active' },
    { id: 3, name: 'มานะ พยายาม', email: 'mana@student.edu.th', role: 'Student', status: 'Inactive' },
    { id: 4, name: 'Admin System', email: 'admin@edu.th', role: 'Admin', status: 'Active' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">จัดการผู้ใช้งาน</h1>
          <p className="text-slate-500 text-sm mt-1">บริหารจัดการสิทธิ์และบัญชีผู้ใช้ในระบบ</p>
        </div>
        <PrimaryBtn className="bg-blue-600 hover:bg-blue-700">
          + เพิ่มผู้ใช้งาน
        </PrimaryBtn>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-500">
              <th className="p-4 font-medium">ชื่อ-นามสกุล</th>
              <th className="p-4 font-medium">อีเมล</th>
              <th className="p-4 font-medium">บทบาท (Role)</th>
              <th className="p-4 font-medium">สถานะ</th>
              <th className="p-4 font-medium text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                <td className="p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-xs">
                    {user.name.substring(0, 1)}
                  </div>
                  <span className="font-semibold text-slate-800">{user.name}</span>
                </td>
                <td className="p-4 text-slate-500">{user.email}</td>
                <td className="p-4">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-medium 
                    ${user.role === 'Admin' ? 'bg-purple-100 text-purple-700' : 
                      user.role === 'Teacher' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>
                    {user.role}
                  </span>
                </td>
                <td className="p-4">
                  <span className={`flex items-center gap-1.5 text-xs font-medium ${user.status === 'Active' ? 'text-emerald-600' : 'text-slate-400'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'Active' ? 'bg-emerald-500' : 'bg-slate-300'}`}></span>
                    {user.status}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <button className="text-slate-400 hover:text-blue-600 px-2 py-1 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
