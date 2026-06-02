import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Globe, DollarSign, ListTodo } from 'lucide-react';




const navLinks = [
    { name: "Review Queue", path: "/admin", icon: <ListTodo size={16} /> },
    { name: "Dashboard", path: "/admin/dashboard", icon: <LayoutDashboard size={16} /> },
    { name: "Websites", path: "/admin/websites/pending", icon: <Globe size={16} /> },
    { name: "Payouts", path: "/admin/payouts/pending", icon: <DollarSign size={16} /> },
];



export default function AdminNav() {

    const location = useLocation();

    return (
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-[24px] bg-white/[0.03] border border-white/10 backdrop-blur-md">
            {navLinks.map((link) => {
                const isActive = location.pathname === link.path;
                return (
                    <Link
                        key={link.name}
                        to={link.path}
                        className={`flex items-center gap-2 px-5 py-3 rounded-[16px] text-xs font-bold uppercase tracking-[0.1em] transition-all ${isActive
                                ? 'bg-[#8b7355] text-white shadow-[0_0_20px_rgba(139,115,85,0.2)]'
                                : 'text-white/40 hover:text-white hover:bg-white/5'
                            }`}
                    >
                        {link.icon}
                        {link.name}
                    </Link>
                );
            })}
        </div>
    );
}

