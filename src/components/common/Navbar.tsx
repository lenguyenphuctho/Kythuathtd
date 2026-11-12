import React from 'react';
import { Wrench, LogOut, ShieldCheck, UserCheck, Eye, HardHat, RefreshCw, Bell } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { RoleBadge } from './Badge';

interface NavbarProps {
  onSync?: () => void;
  isSyncing?: boolean;
  onOpenNotificationSettings?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  onSync,
  isSyncing = false,
  onOpenNotificationSettings,
}) => {
  const { userProfile, logout } = useAuth();

  const getRoleIcon = () => {
    switch (userProfile?.role) {
      case 'admin':
        return <ShieldCheck className="w-4 h-4 text-purple-600" />;
      case 'technician':
        return <HardHat className="w-4 h-4 text-blue-600" />;
      case 'requester':
        return <UserCheck className="w-4 h-4 text-emerald-600" />;
      default:
        return <Eye className="w-4 h-4 text-slate-600" />;
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 pt-[env(safe-area-inset-top,0px)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo and Brand */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-base sm:text-lg text-slate-900 leading-tight flex items-center gap-2">
              <span>KT & CSVC</span>
              <span className="hidden sm:inline-block text-xs font-normal px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                Doanh nghiệp
              </span>
            </h1>
            <p className="text-xs text-slate-500 hidden sm:block">
              Quản lý Kỹ thuật & Cơ sở vật chất
            </p>
          </div>
        </div>

        {/* User profile & actions */}
        <div className="flex items-center gap-3">
          {onSync && (
            <button
              onClick={onSync}
              title="Đồng bộ dữ liệu"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition-colors active:scale-95 touch-manipulation"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          )}

          {onOpenNotificationSettings && (
            <button
              onClick={onOpenNotificationSettings}
              title="Cài đặt thông báo đẩy màn hình khóa"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-600 hover:text-blue-600 hover:bg-slate-100 transition-colors active:scale-95 touch-manipulation"
            >
              <Bell className="w-4 h-4" />
            </button>
          )}

          {userProfile && (
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="flex items-center gap-2">
                {userProfile.photoURL ? (
                  <img
                    src={userProfile.photoURL}
                    alt={userProfile.displayName}
                    className="w-9 h-9 rounded-full ring-2 ring-slate-100 object-cover"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                    {userProfile.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="hidden md:block text-left">
                  <div className="text-xs font-semibold text-slate-800 flex items-center gap-1">
                    {userProfile.displayName}
                    {getRoleIcon()}
                  </div>
                  <div className="mt-0.5">
                    <RoleBadge role={userProfile.role} />
                  </div>
                </div>
              </div>

              <button
                onClick={logout}
                title="Đăng xuất"
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-500 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors ml-1 active:scale-95 touch-manipulation"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
