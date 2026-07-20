import React from 'react';

type SystemSidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
  activeSection: string;
  onSelectSection: (section: string) => void;
};

export function SystemSidebar({ isOpen, onToggle, activeSection, onSelectSection }: SystemSidebarProps) {
  const menuItems = [
    { id: 'dashboard', label: 'หน้าหลัก (Dashboard)', icon: <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>, icon2: <polyline points="9 22 9 12 15 12 15 22"></polyline> },
    { id: 'subjects', label: 'จัดการรายวิชา (Subjects)', icon: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>, icon2: <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path> },
    { id: 'quiz_bank', label: 'คลังข้อสอบ (Quiz Bank)', icon: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>, icon2: <><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></> },
    { id: 'reports', label: 'รายงาน (Reports)', icon: <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>, icon2: <><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></> },
  ];

  return (
    <div 
      className={`bg-white border-r border-slate-200 h-screen sticky top-0 flex flex-col transition-all duration-300 ease-in-out shrink-0 z-40 absolute md:relative
        ${isOpen ? 'w-72 translate-x-0 shadow-2xl md:shadow-none' : 'w-0 -translate-x-full opacity-0 overflow-hidden'}
      `}
    >
      <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 min-w-max">
        <h2 className="text-xl font-bold bg-gradient-to-r from-blue-500 to-teal-400 bg-clip-text text-transparent px-2">
          EduGen System
        </h2>
        <button 
          onClick={onToggle} 
          className="md:hidden p-1.5 text-slate-500 hover:text-slate-700 rounded-lg hover:bg-slate-200/50 transition"
          title="ปิดเมนู"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>
      
      <nav className="flex-1 overflow-y-auto p-4 space-y-2 min-w-[18rem]">
        {menuItems.map((item) => {
          const isActive = activeSection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectSection(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors text-left
                ${isActive 
                  ? 'bg-blue-50/80 text-blue-600 shadow-sm border border-blue-100/50' 
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                }
              `}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {item.icon}
                {item.icon2}
              </svg>
              {item.label}
            </button>
          );
        })}
      </nav>
      
      <div className="p-4 border-t border-slate-100 bg-slate-50 min-w-[18rem]">
        <button 
          onClick={() => onSelectSection('settings')} 
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors text-left
            ${activeSection === 'settings'
              ? 'bg-blue-50/80 text-blue-600 shadow-sm border border-blue-100/50'
              : 'text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm border border-transparent hover:border-slate-200'
            }
          `}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          ตั้งค่าระบบ (Settings)
        </button>
      </div>
    </div>
  );
}
