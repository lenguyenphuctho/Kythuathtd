import React, { useState } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Package,
  Cpu,
  MapPin,
  MoreHorizontal,
  CalendarCheck,
  Zap,
  BarChart3,
  FileText,
  Users,
  Settings,
  X,
  User,
  Plus,
  Eye,
  ArrowRightLeft,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export type NavTab =
  | 'dashboard'
  | 'workorders'
  | 'inventory'
  | 'equipment'
  | 'maintenance'
  | 'costs'
  | 'electrical'
  | 'reports'
  | 'locations'
  | 'users'
  | 'settings'
  | 'profile';

interface BottomNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  openNewRequest?: () => void;
  lowStockCount?: number;
  pendingRequestsCount?: number;
  onOpenCreateQuickAssign?: () => void;
  onOpenTechSelfCreate?: () => void;
  adminViewAsTech?: boolean;
  onToggleAdminViewAsTech?: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  lowStockCount = 0,
  pendingRequestsCount = 0,
  onOpenCreateQuickAssign,
  onOpenTechSelfCreate,
  adminViewAsTech = false,
  onToggleAdminViewAsTech,
}) => {
  const { userProfile, isRequester, isViewer, isAdmin } = useAuth();
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Pure technician or admin previewing as technician
  const isViewingAsTech = (userProfile?.role === 'technician') || (isAdmin && adminViewAsTech);

  // 2. Requester / Viewer Navigation
  const simpleNavItems = [
    {
      id: 'dashboard' as NavTab,
      label: 'Tổng quan',
      icon: LayoutDashboard,
    },
    {
      id: 'workorders' as NavTab,
      label: 'Công việc',
      icon: CheckSquare,
    },
    {
      id: 'profile' as NavTab,
      label: 'Hồ sơ',
      icon: User,
    },
  ];

  // More menu items for Admin
  const moreMenuItems = [
    {
      id: 'equipment' as NavTab,
      label: 'Danh mục thiết bị',
      icon: Cpu,
      color: 'text-blue-600 bg-blue-50',
    },
    {
      id: 'maintenance' as NavTab,
      label: 'Bảo dưỡng định kỳ',
      icon: CalendarCheck,
      color: 'text-indigo-600 bg-indigo-50',
    },
    {
      id: 'electrical' as NavTab,
      label: 'Hệ thống điện & Công tơ',
      icon: Zap,
      color: 'text-amber-600 bg-amber-50',
    },
    {
      id: 'costs' as NavTab,
      label: 'Chi phí & Ngân sách',
      icon: BarChart3,
      color: 'text-emerald-600 bg-emerald-50',
    },
    {
      id: 'reports' as NavTab,
      label: 'Báo cáo & Xuất Excel/PDF',
      icon: FileText,
      color: 'text-purple-600 bg-purple-50',
    },
    {
      id: 'locations' as NavTab,
      label: 'Vị trí & Khu vực',
      icon: MapPin,
      color: 'text-teal-600 bg-teal-50',
    },
    {
      id: 'users' as NavTab,
      label: 'Quản lý người dùng',
      icon: Users,
      color: 'text-rose-600 bg-rose-50',
    },
    {
      id: 'settings' as NavTab,
      label: 'Cài đặt hệ thống',
      icon: Settings,
      color: 'text-slate-600 bg-slate-100',
    },
    {
      id: 'profile' as NavTab,
      label: 'Hồ sơ cá nhân',
      icon: User,
      color: 'text-cyan-600 bg-cyan-50',
    },
  ];

  const isMoreActive =
    activeTab === 'equipment' ||
    activeTab === 'maintenance' ||
    activeTab === 'costs' ||
    activeTab === 'electrical' ||
    activeTab === 'reports' ||
    activeTab === 'locations' ||
    activeTab === 'users' ||
    activeTab === 'settings' ||
    activeTab === 'profile';

  return (
    <>
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-slate-200 shadow-lg pb-[env(safe-area-inset-bottom,0px)]">
        {/* Case A: Technician (or Admin previewing technician view) */}
        {isViewingAsTech ? (
          <div className="flex items-center justify-around h-16 px-1 relative">
            {/* 1. Việc của tôi */}
            <button
              onClick={() => onTabChange('dashboard')}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 touch-manipulation ${
                activeTab === 'dashboard' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className={`p-1 rounded-xl ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600' : ''}`}>
                <CheckSquare className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight font-medium">Việc của tôi</span>
            </button>

            {/* 2. Bảo dưỡng */}
            <button
              onClick={() => onTabChange('maintenance')}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 touch-manipulation ${
                activeTab === 'maintenance' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className={`p-1 rounded-xl ${activeTab === 'maintenance' ? 'bg-blue-50 text-blue-600' : ''}`}>
                <CalendarCheck className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight font-medium">Bảo dưỡng</span>
            </button>

            {/* 3. Nút tròn "+" ở giữa (Tự tạo việc) */}
            <div className="flex-1 flex justify-center items-center">
              <button
                type="button"
                onClick={() => {
                  if (onOpenTechSelfCreate) {
                    onOpenTechSelfCreate();
                  }
                }}
                className="w-12 h-12 -mt-5 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white flex items-center justify-center shadow-lg shadow-blue-600/35 active:scale-90 transition-all touch-manipulation ring-4 ring-white"
                title="Tự tạo việc mới"
                aria-label="Tự tạo việc mới"
              >
                <Plus className="w-6 h-6 stroke-[3]" />
              </button>
            </div>

            {/* 4. Kho */}
            <button
              onClick={() => onTabChange('inventory')}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 touch-manipulation relative ${
                activeTab === 'inventory' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className={`p-1 rounded-xl relative ${activeTab === 'inventory' ? 'bg-blue-50 text-blue-600' : ''}`}>
                <Package className="w-5 h-5" />
                {lowStockCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center">
                    {lowStockCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight font-medium">Kho</span>
            </button>

            {/* 5. Hồ sơ */}
            <button
              onClick={() => onTabChange('profile')}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 touch-manipulation ${
                activeTab === 'profile' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className={`p-1 rounded-xl ${activeTab === 'profile' ? 'bg-blue-50 text-blue-600' : ''}`}>
                <User className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight font-medium">Hồ sơ</span>
            </button>
          </div>
        ) : isAdmin ? (
          /* Case B: Admin Mobile Bottom Navigation (Requirement 2: Tổng quan | Công việc | nút tròn "+" ở giữa | Kho | Thêm) */
          <div className="flex items-center justify-around h-16 px-1 relative">
            {/* 1. Tổng quan */}
            <button
              onClick={() => onTabChange('dashboard')}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 touch-manipulation ${
                activeTab === 'dashboard' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className={`p-1 rounded-xl ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-600' : ''}`}>
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Tổng quan</span>
            </button>

            {/* 2. Công việc */}
            <button
              onClick={() => onTabChange('workorders')}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 touch-manipulation ${
                activeTab === 'workorders' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className={`p-1 rounded-xl ${activeTab === 'workorders' ? 'bg-blue-50 text-blue-600' : ''}`}>
                <CheckSquare className="w-5 h-5" />
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Công việc</span>
            </button>

            {/* 3. NÚT TRÒN "+" Ở GIỮA (Tạo & Giao việc) */}
            <div className="flex-1 flex justify-center items-center">
              <button
                type="button"
                onClick={() => {
                  if (onOpenCreateQuickAssign) {
                    onOpenCreateQuickAssign();
                  }
                }}
                className="w-12 h-12 -mt-5 rounded-full bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white flex items-center justify-center shadow-lg shadow-blue-600/35 active:scale-90 transition-all touch-manipulation ring-4 ring-white"
                title="Tạo & giao việc nhanh"
                aria-label="Tạo & giao việc nhanh"
              >
                <Plus className="w-6 h-6 stroke-[3]" />
              </button>
            </div>

            {/* 4. Kho */}
            <button
              onClick={() => onTabChange('inventory')}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 touch-manipulation relative ${
                activeTab === 'inventory' ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className={`p-1 rounded-xl relative ${activeTab === 'inventory' ? 'bg-blue-50 text-blue-600' : ''}`}>
                <Package className="w-5 h-5" />
                {lowStockCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center">
                    {lowStockCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Kho</span>
            </button>

            {/* 5. Thêm */}
            <button
              onClick={() => setShowMoreMenu(true)}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 touch-manipulation relative ${
                isMoreActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className={`p-1 rounded-xl relative ${isMoreActive ? 'bg-blue-50 text-blue-600' : ''}`}>
                <MoreHorizontal className="w-5 h-5" />
                {pendingRequestsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-white rounded-full text-[9px] font-black flex items-center justify-center animate-pulse">
                    {pendingRequestsCount}
                  </span>
                )}
              </div>
              <span className="text-[11px] mt-0.5 tracking-tight">Thêm</span>
            </button>
          </div>
        ) : (
          /* Case C: Requester / Viewer */
          <div className="flex items-center justify-around h-16 px-1">
            {simpleNavItems.map((item) => {
              const Icon = item.icon;
              const isItemActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex-1 flex flex-col items-center justify-center py-1 transition-all active:scale-95 touch-manipulation ${
                    isItemActive ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <div className={`p-1 rounded-xl ${isItemActive ? 'bg-blue-50 text-blue-600' : ''}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-[11px] mt-0.5 tracking-tight">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Slide-up Menu for "Thêm" on mobile (Requirement 2) */}
      {showMoreMenu && (
        <div className="md:hidden fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex flex-col justify-end">
          <div className="bg-white rounded-t-3xl shadow-2xl p-5 border-t border-slate-200 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">Danh mục quản trị</h3>
                <p className="text-[11px] text-slate-500">Toàn bộ tính năng quản lý cơ sở vật chất</p>
              </div>
              <button
                onClick={() => setShowMoreMenu(false)}
                className="w-10 h-10 flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 active:scale-95 touch-manipulation"
                aria-label="Đóng menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Requirement 2: Nút chuyển "Xem như kỹ thuật viên" */}
            {isAdmin && onToggleAdminViewAsTech && (
              <div className="mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowMoreMenu(false);
                    onToggleAdminViewAsTech();
                  }}
                  className="w-full min-h-[50px] p-3 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-xs flex items-center justify-between shadow-md shadow-amber-500/20 active:scale-98 transition-all touch-manipulation"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                      <ArrowRightLeft className="w-4 h-4 text-white" />
                    </div>
                    <div className="text-left">
                      <div className="font-black text-sm">Xem như kỹ thuật viên</div>
                      <div className="text-[10px] text-amber-100 font-normal">Trải nghiệm giao diện di động của thợ kỹ thuật</div>
                    </div>
                  </div>
                  <Eye className="w-4 h-4 text-white/80 mr-1" />
                </button>
              </div>
            )}

            {/* Grid of all admin modules */}
            <div className="grid grid-cols-2 gap-2.5 pb-6">
              {moreMenuItems.map((item) => {
                const Icon = item.icon;
                const isSelected = activeTab === item.id;
                const showUserBadge = item.id === 'users' && pendingRequestsCount > 0;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onTabChange(item.id);
                      setShowMoreMenu(false);
                    }}
                    className={`flex items-center gap-3 p-3 min-h-[52px] rounded-2xl border text-left transition-all active:scale-98 touch-manipulation relative ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/50 shadow-xs ring-1 ring-blue-500'
                        : 'border-slate-100 hover:border-slate-200 bg-slate-50/50 active:bg-slate-100'
                    }`}
                  >
                    <div className={`p-2.5 rounded-xl shrink-0 ${item.color} relative`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-800 leading-tight">
                        {item.label}
                      </div>
                      {showUserBadge && (
                        <div className="mt-1">
                          <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-black bg-rose-500 text-white animate-pulse">
                            {pendingRequestsCount} chờ duyệt
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
