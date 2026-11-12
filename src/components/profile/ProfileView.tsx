import React from 'react';
import { UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { RoleBadge } from '../common/Badge';
import { Smartphone, LogOut, ShieldCheck, Mail, Calendar, Info, RefreshCw, Zap, Database, Server, Copy, Check } from 'lucide-react';
import { formatDateOnly } from '../../utils/formatters';
import { PWAInstallBanner } from '../common/PWAInstallBanner';
import { APP_VERSION, BUILD_TIME } from '../../config/version';
import { FIREBASE_PROJECT_ID, FIRESTORE_DATABASE_ID } from '../../services/firebase';

interface ProfileViewProps {
  onLogout: () => void;
  onRefreshAll: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onLogout, onRefreshAll }) => {
  const { userProfile } = useAuth();
  const [isRefreshingApp, setIsRefreshingApp] = React.useState(false);
  const [copiedDb, setCopiedDb] = React.useState(false);
  const [copiedProject, setCopiedProject] = React.useState(false);

  const copyToClipboard = (text: string, type: 'db' | 'project') => {
    navigator.clipboard?.writeText(text);
    if (type === 'db') {
      setCopiedDb(true);
      setTimeout(() => setCopiedDb(false), 2000);
    } else {
      setCopiedProject(true);
      setTimeout(() => setCopiedProject(false), 2000);
    }
  };

  // Requirement 4: Button "Làm mới ứng dụng"
  // Deletes CacheStorage caches, unregisters old service worker, then reloads page
  // WITHOUT logging out (preserves IndexedDB auth token) and without deleting Firestore data
  const handleResetAppCache = async () => {
    setIsRefreshingApp(true);
    try {
      // 1. Unregister all existing service workers
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.log('[AppReset] Đã hủy đăng ký SW:', registration.scope);
        }
      }

      // 2. Clear all CacheStorage UI caches
      if (typeof window !== 'undefined' && 'caches' in window) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          await caches.delete(name);
          console.log('[AppReset] Đã xóa cache:', name);
        }
      }

      // 3. Force clean reload with bypass query param
      const cleanUrl = window.location.pathname + '?reload=' + Date.now();
      window.location.href = cleanUrl;
    } catch (err) {
      console.error('[AppReset] Lỗi khi làm mới ứng dụng:', err);
      window.location.reload();
    }
  };

  return (
    <div className="space-y-4 px-4 py-4 max-w-lg mx-auto pb-28 animate-in fade-in">
      {/* Header Profile Card */}
      <div className="bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs text-center space-y-3">
        <div className="relative inline-block">
          {userProfile?.photoURL ? (
            <img
              src={userProfile.photoURL}
              alt={userProfile.displayName}
              className="w-20 h-20 rounded-full mx-auto object-cover ring-4 ring-blue-500/20 shadow-md"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-blue-600 text-white font-black text-2xl flex items-center justify-center mx-auto shadow-md">
              {userProfile?.displayName?.charAt(0).toUpperCase() || 'K'}
            </div>
          )}
          <span className="absolute bottom-0 right-0 w-5 h-5 bg-emerald-500 border-2 border-white rounded-full" />
        </div>

        <div>
          <h2 className="text-lg font-black text-slate-900">{userProfile?.displayName || 'Kỹ thuật viên'}</h2>
          <p className="text-xs text-slate-500 mt-0.5">{userProfile?.email}</p>
        </div>

        <div className="flex items-center justify-center gap-2">
          {userProfile?.role && <RoleBadge role={userProfile.role} />}
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Đang hoạt động
          </span>
        </div>
      </div>

      {/* PWA Install Card */}
      <PWAInstallBanner />

      {/* App & System Details */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs space-y-3 text-xs">
        <h3 className="font-bold uppercase tracking-wider text-slate-400 text-[11px]">
          Thông tin hệ thống & Ứng dụng
        </h3>

        <div className="divide-y divide-slate-100">
          <div className="py-2.5 flex items-center justify-between">
            <span className="text-slate-500 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-blue-600" />
              <span>Chế độ hiển thị</span>
            </span>
            <span className="font-bold text-slate-800">PWA Di động (Standalone)</span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <span className="text-slate-500 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Phiên đăng nhập</span>
            </span>
            <span className="font-bold text-emerald-700">Duy trì tự động (Không mất phiên)</span>
          </div>

          <div className="py-2.5 flex items-center justify-between">
            <span className="text-slate-500 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <span>Ngày tham gia</span>
            </span>
            <span className="font-mono text-slate-700 font-semibold">
              {userProfile?.createdAt ? formatDateOnly(userProfile.createdAt) : '2026'}
            </span>
          </div>

          {/* Project ID */}
          <div className="py-2.5 flex items-center justify-between gap-2">
            <span className="text-slate-500 flex items-center gap-2 flex-shrink-0">
              <Server className="w-4 h-4 text-purple-600" />
              <span>Project ID</span>
            </span>
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="font-mono text-slate-800 font-bold truncate text-[11px] bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                {FIREBASE_PROJECT_ID}
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(FIREBASE_PROJECT_ID, 'project')}
                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-slate-800"
                title="Sao chép Project ID"
              >
                {copiedProject ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Firestore Database ID */}
          <div className="py-2.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-slate-500 flex items-center gap-2 flex-shrink-0">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>Database ID</span>
            </span>
            <div className="flex items-center gap-1.5 overflow-hidden">
              <span className="font-mono text-emerald-800 font-bold truncate text-[10px] bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200" title={FIRESTORE_DATABASE_ID}>
                {FIRESTORE_DATABASE_ID}
              </span>
              <button
                type="button"
                onClick={() => copyToClipboard(FIRESTORE_DATABASE_ID, 'db')}
                className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-emerald-700 flex-shrink-0"
                title="Sao chép Database ID"
              >
                {copiedDb ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-2 pt-1">
          {/* Requirement 4: Button "Làm mới ứng dụng" */}
          <button
            type="button"
            onClick={handleResetAppCache}
            disabled={isRefreshingApp}
            className="w-full min-h-[48px] py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-2xl text-xs font-black inline-flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 active:scale-98 transition-all touch-manipulation cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 text-white ${isRefreshingApp ? 'animate-spin' : ''}`} />
            <span>{isRefreshingApp ? 'Đang làm mới...' : 'Làm mới ứng dụng (Tải bản mới nhất)'}</span>
          </button>

          <button
            type="button"
            onClick={onRefreshAll}
            className="w-full min-h-[46px] py-2.5 px-3 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-700 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-2 active:scale-98 transition-all touch-manipulation cursor-pointer"
          >
            <Zap className="w-4 h-4 text-amber-500" />
            <span>Đồng bộ dữ liệu Firestore</span>
          </button>
        </div>
      </div>

      {/* Requirement 3: App Version info at the bottom for all roles */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-xs text-center space-y-1.5">
        <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center justify-center gap-1.5">
          <Info className="w-3.5 h-3.5 text-blue-600" />
          <span>Phiên bản ứng dụng đang chạy</span>
        </div>
        <div className="font-mono text-sm font-black text-blue-700">
          Phiên bản: {APP_VERSION}
        </div>
        <div className="text-xs text-slate-600 font-mono">
          Ngày giờ build: {BUILD_TIME}
        </div>
        <p className="text-[10px] text-slate-400 pt-0.5">
          Chiến lược Network-First • Tự động nhận bản mới khi có kết nối
        </p>
      </div>

      {/* Logout button */}
      <button
        type="button"
        onClick={onLogout}
        className="w-full min-h-[48px] p-3 rounded-2xl bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-rose-700 font-bold text-xs flex items-center justify-center gap-2 active:scale-98 transition-all touch-manipulation shadow-xs cursor-pointer"
      >
        <LogOut className="w-4 h-4" />
        <span>Đăng xuất tài khoản</span>
      </button>
    </div>
  );
};
