import React, { useState, useEffect } from 'react';
import { Smartphone, Download, Share, PlusSquare, X, Check } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';

interface PWAInstallBannerProps {
  compact?: boolean;
}

const DISMISS_STORAGE_KEY = 'ios_pwa_banner_dismissed_at';
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export const PWAInstallBanner: React.FC<PWAInstallBannerProps> = ({ compact = false }) => {
  const { isInstalled, canInstall, isIOS, install } = usePWAInstall();
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      const dismissedAt = localStorage.getItem(DISMISS_STORAGE_KEY);
      if (dismissedAt) {
        const timePassed = Date.now() - Number(dismissedAt);
        if (timePassed < THREE_DAYS_MS) {
          setDismissed(true);
        }
      }
    } catch {
      // Ignore localStorage read errors in private browsing
    }
  }, []);

  // If already running standalone (installed PWA), cannot install, or dismissed within 3 days
  if (isInstalled || !canInstall || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    setShowIOSModal(false);
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
    } catch {
      // Ignore
    }
  };

  const handleAction = () => {
    if (isIOS) {
      setShowIOSModal(true);
    } else {
      install();
    }
  };

  if (compact) {
    return (
      <>
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-3 rounded-2xl shadow-sm flex items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-xs font-black">Cài ứng dụng lên điện thoại</div>
              <div className="text-[10px] text-blue-100">Toàn màn hình, không thanh địa chỉ</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleAction}
              className="min-h-[44px] px-3 py-1.5 bg-white text-blue-700 hover:bg-blue-50 active:scale-95 text-xs font-black rounded-xl shadow-xs shrink-0 touch-manipulation cursor-pointer"
            >
              Cài đặt
            </button>
            <button
              type="button"
              onClick={handleDismiss}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center text-white/70 hover:text-white rounded-xl touch-manipulation"
              title="Để sau"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* iOS Guided Modal */}
        {showIOSModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-5 sm:p-6 max-w-sm w-full space-y-4 shadow-2xl animate-in slide-in-from-bottom">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 text-sm">Cài lên Màn hình chính iPhone</h3>
                    <p className="text-[10px] text-slate-400">Trải nghiệm mượt mà như app gốc</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowIOSModal(false)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5 text-xs text-slate-700 leading-relaxed">
                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">1</div>
                  <div>
                    Ở thanh công cụ dưới đáy Safari, bấm vào biểu tượng <strong>Chia sẻ (Share)</strong> <Share className="inline w-3.5 h-3.5 text-blue-600 ml-0.5" />.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">2</div>
                  <div>
                    Cuộn xuống và chọn <strong>"Thêm vào MH chính" (Add to Home Screen)</strong> <PlusSquare className="inline w-3.5 h-3.5 text-blue-600 ml-0.5" />.
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-6 h-6 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs shrink-0">3</div>
                  <div>
                    Bấm <strong>"Thêm" (Add)</strong> ở góc trên bên phải. Ứng dụng "KT & CSVC" sẽ xuất hiện trên màn hình chính!
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="flex-1 min-h-[44px] py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs active:scale-95 touch-manipulation cursor-pointer"
                >
                  Để sau
                </button>
                <button
                  type="button"
                  onClick={() => setShowIOSModal(false)}
                  className="flex-1 min-h-[44px] py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs active:scale-95 touch-manipulation cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Tôi đã hiểu</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 flex items-center justify-between gap-3 text-xs shadow-xs animate-in fade-in">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5" />
        </div>
        <div>
          <div className="font-bold text-slate-900">Cài đặt ứng dụng Quản lý Kỹ thuật</div>
          <div className="text-slate-500 text-[11px]">Chạy độc lập toàn màn hình, tải nhanh và giữ phiên lâu dài</div>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleAction}
          className="min-h-[44px] px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl active:scale-95 transition-all inline-flex items-center gap-1.5 touch-manipulation cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Cài ngay</span>
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-xl touch-manipulation cursor-pointer"
          title="Để sau (ẩn 3 ngày)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
