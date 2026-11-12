import React from 'react';
import { Sparkles, RefreshCw, X, ArrowUpCircle } from 'lucide-react';
import { useAppUpdate } from '../../hooks/useAppUpdate';

export const AppUpdateBanner: React.FC = () => {
  const { hasNewVersion, remoteVersion, isUpdating, applyUpdate, dismissUpdate } = useAppUpdate();

  if (!hasNewVersion) return null;

  return (
    <aside
      aria-label="Thông báo cập nhật ứng dụng"
      className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white shadow-xl border-b border-white/20 animate-in slide-in-from-top duration-300"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          </div>
          <div className="min-w-0">
            <div className="text-xs sm:text-sm font-black flex items-center gap-2 flex-wrap leading-tight">
              <span>Đã có phiên bản mới!</span>
              {remoteVersion && (
                <span className="text-[10px] font-mono bg-white/20 px-2 py-0.5 rounded-full font-bold">
                  {remoteVersion}
                </span>
              )}
            </div>
            <p className="text-[11px] text-blue-100 truncate hidden sm:block">
              Hệ thống đã phát hiện bản cập nhật mới nhất. Hãy tải lại để cập nhật tính năng.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={applyUpdate}
            disabled={isUpdating}
            className="min-h-[40px] px-3.5 sm:px-4 py-1.5 rounded-xl bg-white text-blue-700 hover:bg-blue-50 active:scale-95 text-xs font-black shadow-md transition-all flex items-center gap-1.5 touch-manipulation cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-blue-700 ${isUpdating ? 'animate-spin' : ''}`} />
            <span>{isUpdating ? 'Đang cập nhật...' : 'Cập nhật ngay'}</span>
          </button>

          <button
            type="button"
            onClick={dismissUpdate}
            className="p-2 text-blue-200 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
            title="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
