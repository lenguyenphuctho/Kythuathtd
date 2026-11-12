import React from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Cpu,
  MapPin,
  Users,
  Settings,
  Package,
  CalendarCheck,
  Zap,
  BarChart3,
  FileText,
  Lock,
} from 'lucide-react';
import { NavTab } from './BottomNav';
import { useAuth } from '../../context/AuthContext';

interface SidebarProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  workOrderCount?: number;
  lowStockCount?: number;
  pendingRequestsCount?: number;
  onOpenQuickAssign?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  workOrderCount,
  lowStockCount,
  pendingRequestsCount,
  onOpenQuickAssign,
}) => {
  const { isAdmin, isRequester, isViewer } = useAuth();

  const mainNav = [
    {
      id: 'dashboard' as NavTab,
      label: 'Tổng quan',
      icon: LayoutDashboard,
      hide: false,
    },
    {
      id: 'workorders' as NavTab,
      label: 'Quản lý công việc',
      icon: CheckSquare,
      badge: workOrderCount,
      hide: false,
    },
    {
      id: 'maintenance' as NavTab,
      label: 'Bảo dưỡng định kỳ',
      icon: CalendarCheck,
      hide: isRequester || isViewer,
    },
    {
      id: 'inventory' as NavTab,
      label: 'Kho vật tư & Phụ tùng',
      icon: Package,
      badge: lowStockCount,
      badgeColor: 'bg-rose-500 text-white',
      hide: isRequester || isViewer,
    },
    {
      id: 'equipment' as NavTab,
      label: 'Danh mục thiết bị',
      icon: Cpu,
      hide: isRequester,
    },
    {
      id: 'electrical' as NavTab,
      label: 'Hệ thống điện & Công tơ',
      icon: Zap,
      hide: isRequester || isViewer,
    },
    {
      id: 'costs' as NavTab,
      label: 'Chi phí & Ngân sách',
      icon: BarChart3,
      hide: !isAdmin,
    },
    {
      id: 'reports' as NavTab,
      label: 'Báo cáo & Xuất file',
      icon: FileText,
      hide: isRequester || isViewer,
    },
    {
      id: 'locations' as NavTab,
      label: 'Vị trí & Khu vực',
      icon: MapPin,
      hide: isRequester,
    },
    {
      id: 'users' as NavTab,
      label: 'Quản lý người dùng',
      icon: Users,
      badge: pendingRequestsCount,
      badgeColor: 'bg-rose-500 text-white',
      hide: !isAdmin,
    },
    {
      id: 'settings' as NavTab,
      label: 'Cài đặt hệ thống',
      icon: Settings,
      hide: !isAdmin,
    },
  ].filter((item) => !item.hide);

  return (
    <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 shrink-0 min-h-[calc(100vh-4rem)] p-4 justify-between">
      <div className="space-y-4">
        {isAdmin && onOpenQuickAssign && (
          <button
            type="button"
            onClick={onOpenQuickAssign}
            className="w-full py-2.5 px-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-xs shadow-xs flex items-center justify-center gap-2 active:scale-95 transition-all cursor-pointer"
            title="Tạo nhanh và giao việc ngay cho kỹ thuật viên"
          >
            <Zap className="w-4 h-4 text-amber-200" />
            <span>Tạo việc nhanh</span>
          </button>
        )}

        <div>
          <div className="px-3 mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            Hệ thống chính (Phase 1)
          </div>
          <nav className="space-y-1">
            {mainNav.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${isActive ? 'text-white' : 'text-slate-500'}`} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                        item.badgeColor
                          ? item.badgeColor
                          : isActive
                          ? 'bg-blue-800 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Footer Info in Sidebar */}
      <div className="pt-4 border-t border-slate-100 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Firestore Realtime Sync</span>
        </div>
        <p className="mt-1 text-[11px] text-slate-400">
          Phiên bản 1.0 (Mobile First)
        </p>
      </div>
    </aside>
  );
};
