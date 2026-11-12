import React, { useState, useEffect } from 'react';
import {
  Bell,
  BellRing,
  BellOff,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Share2,
  PlusSquare,
  X,
  XCircle,
  Send,
  Loader2,
  ShieldCheck,
  Info,
  Activity,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { auth } from '../../services/firebase';
import {
  getPushSubscriptionStatus,
  subscribeDeviceToPush,
  unsubscribeDeviceFromPush,
  sendTestPushNotification,
  PushStatus,
} from '../../services/pushNotificationService';

interface NotificationSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onToast?: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  isOpen,
  onClose,
  onToast,
}) => {
  const { userProfile } = useAuth();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  // Admin Push Dispatch Log State (Requirement 3)
  const [lastDispatch, setLastDispatch] = useState<any | null>(null);
  const [isLoadingDispatch, setIsLoadingDispatch] = useState<boolean>(false);
  const [showDispatchDetails, setShowDispatchDetails] = useState<boolean>(false);

  const fetchLastDispatch = async () => {
    if (!userProfile || userProfile.role !== 'admin') return;
    setIsLoadingDispatch(true);
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();
      const res = await fetch('/api/push/last-dispatch', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        setLastDispatch(data.latest);
      }
    } catch (e) {
      console.warn('[Push] Error fetching last dispatch log:', e);
    } finally {
      setIsLoadingDispatch(false);
    }
  };

  const [isCleaningExpired, setIsCleaningExpired] = useState<boolean>(false);

  const handleCleanExpired = async () => {
    if (!userProfile || userProfile.role !== 'admin') return;
    setIsCleaningExpired(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        onToast?.('error', 'Chưa xác thực người dùng. Vui lòng đăng nhập lại.');
        return;
      }
      const token = await user.getIdToken();
      const res = await fetch('/api/push/clean-expired', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        onToast?.('success', data.message || `Đã dọn dẹp ${data.cleanedCount} đăng ký hết hạn.`);
        await fetchLastDispatch();
      } else {
        onToast?.('error', data.error || 'Lỗi dọn dẹp đăng ký hết hạn');
      }
    } catch (err: any) {
      onToast?.('error', err?.message || 'Không thể kết nối máy chủ để dọn dẹp.');
    } finally {
      setIsCleaningExpired(false);
    }
  };

  const refreshStatus = async () => {
    const s = await getPushSubscriptionStatus(userProfile ? { uid: userProfile.uid } : undefined);
    setStatus(s);
  };

  useEffect(() => {
    if (isOpen) {
      refreshStatus();
      if (userProfile?.role === 'admin') {
        fetchLastDispatch();
      }
    }
  }, [isOpen, userProfile?.uid, userProfile?.role]);

  if (!isOpen) return null;

  const handleEnable = async () => {
    if (!userProfile) return;
    setIsLoading(true);
    const res = await subscribeDeviceToPush({
      uid: userProfile.uid,
      email: userProfile.email,
      role: userProfile.role,
    });
    setIsLoading(false);

    if (res.success) {
      await refreshStatus();
      onToast?.('success', 'Đã lưu và đồng bộ thông báo đẩy thành công trên thiết bị này!');
    } else {
      await refreshStatus();
      onToast?.('error', res.error || 'Không thể bật thông báo đẩy.');
    }
  };

  const handleDisable = async () => {
    if (!userProfile) return;
    setIsLoading(true);
    const res = await unsubscribeDeviceFromPush({ uid: userProfile.uid });
    setIsLoading(false);

    if (res.success) {
      await refreshStatus();
      onToast?.('info', 'Đã tắt thông báo đẩy trên thiết bị này.');
    } else {
      onToast?.('error', res.error || 'Không thể tắt thông báo đẩy.');
    }
  };

  const handleTest = async () => {
    setIsTesting(true);
    const res = await sendTestPushNotification(status?.endpoint);
    setIsTesting(false);

    if (res.success) {
      onToast?.('success', res.message || 'Đã gửi thông báo thử nghiệm!');
    } else {
      onToast?.('error', res.message || 'Gửi thông báo thử nghiệm thất bại.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Cài đặt Thông báo Đẩy</h3>
              <p className="text-xs text-slate-500">Nhận thông báo màn hình khóa (0đ chi phí)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 overflow-y-auto">
          {/* Status Card */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex items-start justify-between gap-3">
            <div className="space-y-1.5 flex-1">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Trạng thái thiết bị hiện tại
              </span>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                {status?.isSubscribed ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    Đang hoạt động (Đã lưu & đồng bộ máy chủ)
                  </span>
                ) : status?.hasBrowserSubWithoutFirestore ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    Chưa đăng ký (Chưa lưu trên máy chủ)
                  </span>
                ) : status?.permission === 'denied' ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                    Bị chặn bởi trình duyệt
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-800 border border-slate-300">
                    <BellOff className="w-3.5 h-3.5 text-slate-600" />
                    Chưa đăng ký
                  </span>
                )}
              </div>

              {status?.hasBrowserSubWithoutFirestore && (
                <div className="text-xs text-amber-800 mt-2 bg-amber-50 p-2.5 rounded-xl border border-amber-200 space-y-1">
                  <p className="font-semibold">⚠️ Trình duyệt đã cho phép thông báo, nhưng thiết bị chưa được ghi nhận trên cơ sở dữ liệu Firestore.</p>
                  <p className="text-amber-700">Vui lòng bấm <strong>"Thử lại / Đồng bộ ngay"</strong> bên dưới để hoàn tất kích hoạt.</p>
                </div>
              )}

              {status?.firestoreError && (
                <p className="text-xs text-rose-700 mt-1 bg-rose-50 p-2 rounded-lg border border-rose-200">
                  Lỗi kết nối Firestore: {status.firestoreError}
                </p>
              )}
            </div>
            <div className="text-right text-xs text-slate-400 shrink-0">
              {status?.isStandalone ? 'PWA Màn hình chính' : 'Trình duyệt Web'}
            </div>
          </div>

          {/* iOS Specific Instructions if not installed */}
          {status?.needsIOSInstall && (
            <div className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 space-y-3">
              <div className="flex items-center gap-2 text-indigo-900 font-bold text-sm">
                <Smartphone className="w-4 h-4 text-indigo-600" />
                Hướng dẫn cho iPhone & iPad (iOS 16.4+)
              </div>
              <p className="text-xs text-indigo-800 leading-relaxed">
                Apple yêu cầu ứng dụng phải được đưa ra <strong>Màn hình chính</strong> để có thể nhận thông báo đẩy khi khóa màn hình:
              </p>
              <ol className="text-xs text-indigo-900 space-y-2 list-decimal list-inside bg-white/70 p-3 rounded-xl border border-indigo-100">
                <li className="flex items-center gap-2">
                  <Share2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Bấm nút <strong>Chia sẻ (Share)</strong> ở thanh dưới của Safari.</span>
                </li>
                <li className="flex items-center gap-2">
                  <PlusSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Cuộn xuống chọn <strong>Thêm vào Màn hình chính</strong>.</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>Mở ứng dụng từ icon ngoài màn hình chính và bật thông báo tại đây.</span>
                </li>
              </ol>
            </div>
          )}

          {/* Permission Denied Guide */}
          {status?.permission === 'denied' && (
            <div className="p-4 rounded-2xl border border-rose-200 bg-rose-50/70 text-xs text-rose-800 space-y-2">
              <div className="font-bold flex items-center gap-2 text-rose-900">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                Quyền thông báo đang bị chặn
              </div>
              <p>
                Trình duyệt đã ghi nhớ lựa chọn từ chối thông báo. Để bật lại:
              </p>
              <ul className="list-disc list-inside space-y-1 text-rose-900">
                <li>Trên Chrome/Edge: Nhấp vào biểu tượng <strong>ổ khóa 🔒 hoặc cài đặt trang</strong> ở thanh địa chỉ &gt; Bật <strong>Thông báo</strong>.</li>
                <li>Trên Safari iPhone: Vào <strong>Cài đặt iPhone &gt; Safari &gt; Nâng cao</strong> hoặc cài đặt thông báo của ứng dụng PWA.</li>
              </ul>
            </div>
          )}

          {/* Admin-only: Kết quả lần gửi push gần nhất của sự kiện (Requirement 3) */}
          {userProfile?.role === 'admin' && (
            <div className="p-4 rounded-2xl border border-indigo-200 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/40 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wider">
                      Lần gửi thông báo gần nhất (Admin)
                    </h4>
                    <p className="text-[11px] text-indigo-700">Giám sát phát Web Push toàn hệ thống</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCleanExpired}
                    disabled={isCleaningExpired}
                    title="Dọn dẹp các đăng ký đã hết hạn (HTTP 410/404) khỏi cơ sở dữ liệu bằng quyền Admin"
                    className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
                  >
                    {isCleaningExpired ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5 text-amber-700" />
                    )}
                    <span>Dọn đăng ký hết hạn</span>
                    {(lastDispatch?.pendingExpiredCount || 0) > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-700 text-white font-extrabold">
                        {lastDispatch.pendingExpiredCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={fetchLastDispatch}
                    disabled={isLoadingDispatch}
                    title="Làm mới trạng thái phát push"
                    className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-100 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDispatch ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {lastDispatch ? (
                <div className="space-y-2.5 text-xs">
                  <div className="p-2.5 rounded-xl bg-white border border-indigo-100 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-bold text-slate-800 flex items-center gap-1.5 flex-wrap">
                        <span className="text-indigo-900 font-extrabold">{lastDispatch.eventLabel}</span>
                        {lastDispatch.workOrderCode && (
                          <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded text-[11px] border border-blue-200">
                            {lastDispatch.workOrderCode}
                          </span>
                        )}
                      </div>
                      <div>
                        {lastDispatch.sentCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Đã gửi: {lastDispatch.sentCount} thiết bị
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                            lastDispatch.error && (lastDispatch.error.startsWith('Lỗi') || lastDispatch.error.includes('HTTP'))
                              ? 'bg-rose-100 text-rose-800 border-rose-200'
                              : 'bg-amber-100 text-amber-900 border-amber-200'
                          }`}>
                            <AlertTriangle className="w-3.5 h-3.5" />
                            {lastDispatch.error || '0 thiết bị nhận'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Prominent error banner if subscription query had an error */}
                    {lastDispatch.error && (lastDispatch.error.startsWith('Lỗi') || lastDispatch.error.includes('HTTP')) && (
                      <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                          <strong>Lỗi truy vấn:</strong> {lastDispatch.error}
                        </div>
                      </div>
                    )}

                    {/* Banner for pending expired subscriptions needing Admin clean */}
                    {lastDispatch.pendingExpiredCount && lastDispatch.pendingExpiredCount > 0 ? (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="truncate">
                            Phát hiện <strong>{lastDispatch.pendingExpiredCount}</strong> thiết bị hết hạn (HTTP 410/404) cần dọn.
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={handleCleanExpired}
                          disabled={isCleaningExpired}
                          className="shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold text-amber-900 bg-amber-200 hover:bg-amber-300 border border-amber-300 transition-colors"
                        >
                          Dọn ngay
                        </button>
                      </div>
                    ) : null}

                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 pt-0.5 border-t border-slate-100">
                      <span>Người thao tác: <strong className="text-slate-700">{lastDispatch.callerName || lastDispatch.callerEmail}</strong></span>
                      <span>•</span>
                      <span>Thời gian: <strong className="text-slate-700">{lastDispatch.timeFormatted}</strong></span>
                      {lastDispatch.failedCount > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-rose-600 font-bold">Thất bại: {lastDispatch.failedCount}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Device breakdown & skip details */}
                  <div className="flex items-center justify-between text-[11px] px-1">
                    <span className="text-slate-500">
                      Subscriptions rà soát: <strong>{lastDispatch.totalSubscriptionsEvaluated}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDispatchDetails(!showDispatchDetails)}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
                    >
                      <span>{showDispatchDetails ? 'Thu gọn chi tiết' : 'Xem danh sách thiết bị'}</span>
                      {showDispatchDetails ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {showDispatchDetails && (
                    <div className="space-y-2 pt-1 animate-in fade-in">
                      {lastDispatch.deviceResults && lastDispatch.deviceResults.length > 0 ? (
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-2">
                          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                            <span className="text-[10px] font-bold text-slate-700 block uppercase tracking-wider">
                              Tất cả thiết bị rà soát ({lastDispatch.deviceResults.length}):
                            </span>
                            <span className="text-[10px] text-slate-500">
                              Gửi: <strong className="text-emerald-700">{lastDispatch.sentCount}</strong> | Bỏ qua: <strong>{lastDispatch.skippedList?.length || 0}</strong>
                            </span>
                          </div>
                          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto pr-1">
                            {lastDispatch.deviceResults.map((dev: any, idx: number) => (
                              <div key={idx} className="py-2 flex items-center justify-between gap-2 text-[11px]">
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="font-semibold text-slate-800 truncate">{dev.email}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                                      {dev.role}
                                    </span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-medium border border-blue-100 flex items-center gap-1">
                                      <Smartphone className="w-2.5 h-2.5" />
                                      {dev.platform || 'Thiết bị Web'}
                                    </span>
                                  </div>
                                  {(dev.reason || dev.resultMessage) && (
                                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">
                                      {dev.reason || dev.resultMessage}
                                    </p>
                                  )}
                                </div>
                                <div className="shrink-0 text-right">
                                  {dev.status === 'sent' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      Thành công
                                    </span>
                                  ) : dev.isCleaned || dev.resultMessage === 'đã dọn đăng ký hết hạn' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                      <Trash2 className="w-3 h-3 text-amber-700" />
                                      đã dọn đăng ký hết hạn
                                    </span>
                                  ) : dev.isExpired ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900 border border-purple-300" title="Đăng ký hết hạn - cần Admin bấm Dọn">
                                      <AlertTriangle className="w-3 h-3 text-purple-700" />
                                      Hết hạn (Chờ Admin dọn)
                                    </span>
                                  ) : dev.status === 'failed' ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200" title={dev.error}>
                                      <XCircle className="w-3 h-3 text-rose-600" />
                                      {dev.resultMessage || dev.error || 'Lỗi gửi'}
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200" title={dev.reason}>
                                      {dev.resultMessage || 'Bỏ qua'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-center text-xs text-slate-500">
                          Chưa có thiết bị nào trong danh sách rà soát.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-indigo-700/80 bg-white/70 p-3 rounded-xl border border-indigo-100 italic">
                  Chưa có sự kiện nào được phát kể từ khi khởi động lại máy chủ. Khi người dùng tạo việc mới hoặc đổi trạng thái, kết quả gửi sẽ xuất hiện tức thì tại đây.
                </p>
              )}
            </div>
          )}

          {/* Feature explanations */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-slate-500" />
              Khi nào bạn sẽ nhận được thông báo?
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <strong className="text-slate-800 block">Yêu cầu mới:</strong>
                Gửi tới Kỹ thuật viên & Admin khi có cơ sở gửi yêu cầu sửa chữa.
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <strong className="text-slate-800 block">Phân công việc:</strong>
                Gửi tới kỹ thuật viên được giao việc (hoặc cả phòng).
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <strong className="text-slate-800 block">Tiến độ & Nghiệm thu:</strong>
                Báo cho người yêu cầu khi công việc đổi trạng thái hoặc xong.
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                <strong className="text-slate-800 block">Bình luận trao đổi:</strong>
                Thông báo tức thì khi có thảo luận mới trong công việc.
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
          {status?.isSubscribed ? (
            <>
              <button
                type="button"
                onClick={handleDisable}
                disabled={isLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors disabled:opacity-50"
              >
                {isLoading ? 'Đang xử lý...' : 'Tắt trên máy này'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTest}
                  disabled={isTesting}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isTesting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  Gửi thông báo thử
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-xs"
                >
                  Đóng
                </button>
              </div>
            </>
          ) : status?.hasBrowserSubWithoutFirestore ? (
            <>
              <button
                type="button"
                onClick={handleDisable}
                disabled={isLoading}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors disabled:opacity-50"
              >
                Hủy làm lại
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Để sau
                </button>
                <button
                  type="button"
                  onClick={handleEnable}
                  disabled={isLoading}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-colors shadow-md shadow-amber-500/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <BellRing className="w-4 h-4" />
                  )}
                  Thử lại / Đồng bộ ngay
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Bảo mật chuẩn VAPID RFC 8292
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
                >
                  Để sau
                </button>
                <button
                  type="button"
                  onClick={handleEnable}
                  disabled={isLoading || status?.needsIOSInstall}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20 flex items-center gap-2 disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Bell className="w-4 h-4" />
                  )}
                  Bật thông báo đẩy
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
