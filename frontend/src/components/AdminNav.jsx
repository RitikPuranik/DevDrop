import React from 'react';
import { LayoutDashboard, Globe, DollarSign, ListTodo } from 'lucide-react';

const navTabs = [
    { id: "review", name: "Review Queue", icon: <ListTodo size={16} /> },
    { id: "dashboard", name: "Dashboard", icon: <LayoutDashboard size={16} /> },
    { id: "websites", name: "Websites", icon: <Globe size={16} /> },
    { id: "payouts", name: "Payouts", icon: <DollarSign size={16} /> },
];

export default function AdminNav({ activeTab, onTabChange }) {
    return (
        <div className="flex overflow-x-auto custom-scrollbar items-center gap-2 p-2 rounded-[24px] bg-white/[0.03] border border-white/10 backdrop-blur-md whitespace-nowrap">
            {navTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                    <button
                        key={tab.id}
                        onClick={() => onTabChange && onTabChange(tab.id)}
                        className={`flex items-center shrink-0 gap-2 px-5 py-3 rounded-[16px] text-xs font-bold uppercase tracking-[0.1em] transition-all ${isActive
                                ? 'bg-[#8b7355] text-white shadow-[0_0_20px_rgba(139,115,85,0.2)]'
                                : 'text-white/40 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        {tab.icon}
                        {tab.name}
                    </button>
                );
            })}
        </div>
    );
}
