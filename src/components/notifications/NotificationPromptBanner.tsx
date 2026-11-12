import React, { useState, useEffect } from 'react';
import { BellRing, X, Smartphone, ArrowRight } from 'lucide-react';
import { getPushSubscriptionStatus, PushStatus } from '../../services/pushNotificationService';
import { useAuth } from '../../context/AuthContext';

interface NotificationPromptBannerProps {
  onOpenSettings: () => void;
}

export const NotificationPromptBanner: React.FC<NotificationPromptBannerProps> = ({ onOpenSettings }) => {
  const { userProfile } = useAuth();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(() => {
    return sessionStorage.getItem('push_banner_dismissed') === 'true';
  });

  useEffect(() => {
    getPushSubscriptionStatus(userProfile ? { uid: userProfile.uid } : undefined).then((s) => setStatus(s));
  }, [userProfile?.uid]);

  if (dismissed || !status || status.isSubscribed || status.permission === 'denied') {
    return null;
  }

  const handleDismiss = () => {
    sessionStorage.setItem('push_banner_dismissed', 'true');
    setDismissed(true);
  };

  return (
    <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 text-white px-4 py-2.5 sm:px-6 shadow-sm relative z-20">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          {status.needsIOSInstall ? (
            <Smartphone className="w-4 h-4 shrink-0 text-amber-300" />
          ) : (
            <BellRing className="w-4 h-4 shrink-0 text-blue-200 animate-pulse" />
          )}
          <span className="truncate font-medium">
            {status.needsIOSInstall
              ? 'Thêm ứng dụng vào Màn hình chính trên iPhone để nhận thông báo màn hình khóa.'
              : 'Bật thông báo đẩy để không bỏ lỡ yêu cầu sửa chữa và cập nhật công việc mới nhất.'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onOpenSettings}
            className="px-3 py-1 rounded-lg bg-white/20 hover:bg-white/30 backdrop-blur-xs text-white font-semibold text-xs flex items-center gap-1 transition-colors"
          >
            <span>{status.needsIOSInstall ? 'Xem hướng dẫn' : 'Bật ngay'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleDismiss}
            title="Đóng thông báo"
            className="p-1 rounded-md text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
