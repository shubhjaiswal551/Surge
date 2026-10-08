import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
}

const NavIcon = {
  Dashboard: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9" rx="2" />
      <rect x="14" y="3" width="7" height="5" rx="2" />
      <rect x="14" y="12" width="7" height="9" rx="2" />
      <rect x="3" y="16" width="7" height="5" rx="2" />
    </svg>
  ),
  Cameras: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7h13a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" />
      <path d="m22 8-5 4 5 4V8z" />
    </svg>
  ),
  Alerts: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  ),
  Incidents: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6M9 9h2" />
    </svg>
  ),
  Settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9c.16.37.25.77.25 1.18 0 .41-.09.81-.25 1.18" />
    </svg>
  ),
};

const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', icon: NavIcon.Dashboard },
  { to: '/cameras', label: 'Camera Feeds', icon: NavIcon.Cameras },
  { to: '/alerts', label: 'Alerts', icon: NavIcon.Alerts },
  { to: '/incidents', label: 'Incident Log', icon: NavIcon.Incidents },
  { to: '/settings', label: 'Settings', icon: NavIcon.Settings },
];

import { useCrowdContext } from '../../context/CrowdContext';

interface SidebarProps {
  alertCount?: number;
}

const Sidebar: React.FC<SidebarProps> = ({ alertCount }) => {
  const { profile, logout } = useAuth();
  const { unacknowledgedAlertsCount } = useCrowdContext();
  const effectiveAlertCount = typeof alertCount === 'number' ? alertCount : unacknowledgedAlertsCount;
  const location = useLocation();
  const isActive = (to: string) => {
    if (to === '/dashboard') return location.pathname === '/dashboard';
    return location.pathname.startsWith(to);
  };

  return (
    <aside className="w-64 shrink-0 h-full flex flex-col bg-white/75 backdrop-blur-xl border-r border-slate-200/70 shadow-[1px_0_4px_rgba(0,0,0,0.01)]">
      {/* Brand Header */}
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="SafeCrowd Logo"
            className="h-10 w-auto max-w-[48px] object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.08)] shrink-0"
          />
          <div className="flex flex-col leading-tight">
            <span className="text-slate-900 font-bold tracking-tight text-base font-sans">
              SafeCrowd
            </span>
            <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider font-mono">
              Control Station
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.to);
          const showBadge = item.to === '/alerts' && effectiveAlertCount > 0;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all ${
                active
                  ? 'bg-slate-200/70 text-[#0071e3] font-semibold shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <span className={`shrink-0 ${active ? 'text-[#0071e3]' : 'text-slate-400'}`}>
                {item.icon}
              </span>
              <span className="flex-1 truncate">{item.label}</span>
              {showBadge && (
                <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-[#ff3b30] text-[10px] font-bold text-white flex items-center justify-center shadow-sm">
                  {effectiveAlertCount > 99 ? '99+' : effectiveAlertCount}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* User Info & Actions Footer */}
      <div className="p-3.5 border-t border-slate-100 space-y-2 bg-slate-50/50 backdrop-blur-sm">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-slate-200/60 shadow-sm">
          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
            {profile?.photoURL ? (
              <img
                src={profile.photoURL}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs font-bold text-[#0071e3]">
                {profile?.displayName?.[0]?.toUpperCase() ?? 'O'}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-slate-800 truncate font-semibold">
              {profile?.displayName ?? 'Operator'}
            </div>
            <div className="text-[10px] text-slate-400 truncate capitalize font-medium">
              {profile?.role ?? 'operator'} Role
            </div>
          </div>
        </div>

        <button
          onClick={() => logout()}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl
                     text-xs text-slate-500 hover:text-[#ff3b30] hover:bg-red-50
                     border border-transparent hover:border-red-200 transition-all font-medium active:scale-[0.98]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Sign Out
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
