import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import {
  Clock,
  Send,
  MessageCircle,
  Copy,
  Check,
  RefreshCw,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Share2,
} from 'lucide-react';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { AccessRequest, AccessRequestStatus } from '../../types';
import { formatDateTime } from '../../utils/formatters';

interface PendingApprovalViewProps {
  currentUser: User;
  onLogout: () => void;
  onRecheck: () => Promise<void>;
}

export const PendingApprovalView: React.FC<PendingApprovalViewProps> = ({
  currentUser,
  onLogout,
  onRecheck,
}) => {
  const email = (currentUser.email || '').toLowerCase().trim();
  const displayName = currentUser.displayName || email.split('@')[0];
  const photoURL = currentUser.photoURL || '';

  const [requestData, setRequestData] = useState<AccessRequest | null>(null);
  const [isLoadingRequest, setIsLoadingRequest] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRechecking, setIsRechecking] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [shareSuccessToast, setShareSuccessToast] = useState<string | null>(null);

  // Real-time listener for user's own access request document
  useEffect(() => {
    if (!email) return;

    const requestRef = doc(db, 'accessRequests', email);
    const unsub = onSnapshot(
      requestRef,
      (snap) => {
        setIsLoadingRequest(false);
        if (snap.exists()) {
          setRequestData(snap.data() as AccessRequest);
        } else {
          setRequestData(null);
        }
      },
      (err) => {
        console.warn('Access request listener note:', err);
        setIsLoadingRequest(false);
      }
    );

    return () => unsub();
  }, [email]);

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleSendRequest = async () => {
    if (!email || isSubmitting) return;

    try {
      setIsSubmitting(true);
      const newRequest: AccessRequest = {
        id: email,
        email,
        name: displayName,
        photoURL: photoURL || null,
        requestedAt: new Date().toISOString(),
        status: 'pending',
      };

      await setDoc(doc(db, 'accessRequests', email), newRequest);
      setRequestData(newRequest);
      setShareSuccessToast('Đã gửi yêu cầu cấp quyền thành công!');
      setTimeout(() => setShareSuccessToast(null), 3000);
    } catch (err) {
      console.error('Error submitting access request:', err);
      setShareSuccessToast('Không thể gửi yêu cầu. Vui lòng thử lại.');
      setTimeout(() => setShareSuccessToast(null), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareZalo = async () => {
    const message = `Xin chào Trưởng nhóm Kỹ thuật, tôi đã đăng nhập hệ thống KT-CSVC bằng tài khoản Google (${email}). Nhờ Trưởng nhóm duyệt cấp quyền giúp tôi. Xin cảm ơn!`;

    // Try Web Share API first (Native Zalo on mobile/desktop)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Yêu cầu cấp quyền KT-CSVC',
          text: message,
        });
        return;
      } catch (err) {
        // User cancelled or share not supported, fall through to clipboard
      }
    }

    // Fallback: Copy to clipboard and open Zalo web / app
    try {
      await navigator.clipboard.writeText(message);
      setShareSuccessToast('Đã sao chép nội dung tin nhắn gửi Zalo!');
      setTimeout(() => setShareSuccessToast(null), 3500);

      // Open Zalo
      if (typeof window !== 'undefined') {
        window.open('https://zalo.me', '_blank');
      }
    } catch {
      setShareSuccessToast('Vui lòng sao chép email gửi cho Trưởng nhóm.');
      setTimeout(() => setShareSuccessToast(null), 3500);
    }
  };

  const handleManualRecheck = async () => {
    setIsRechecking(true);
    try {
      await onRecheck();
    } finally {
      setIsRechecking(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100/70 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Floating toast notification */}
        {shareSuccessToast && (
          <div className="mb-4 p-3 bg-slate-900 text-white text-xs font-semibold rounded-2xl shadow-xl flex items-center justify-center gap-2 animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{shareSuccessToast}</span>
          </div>
        )}

        <div className="bg-white py-8 px-6 sm:px-8 shadow-xl shadow-slate-200/60 rounded-3xl border border-slate-200 space-y-6">
          {/* User Profile Header */}
          <div className="text-center space-y-3">
            <div className="relative inline-block">
              {photoURL ? (
                <img
                  src={photoURL}
                  alt={displayName}
                  className="w-20 h-20 rounded-full mx-auto object-cover ring-4 ring-blue-500/20 shadow-md"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-blue-600 text-white font-black text-2xl flex items-center justify-center mx-auto shadow-md">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
              <span className="absolute bottom-0 right-0 w-5 h-5 bg-amber-500 border-2 border-white rounded-full flex items-center justify-center text-[10px] text-white font-bold">
                !
              </span>
            </div>

            <div>
              <h2 className="text-lg font-black text-slate-900">{displayName}</h2>
              <div className="flex items-center justify-center gap-1.5 mt-1">
                <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-lg border border-slate-200 truncate max-w-[260px]">
                  {email}
                </span>
                <button
                  type="button"
                  onClick={handleCopyEmail}
                  className="p-1 hover:bg-slate-100 rounded-md text-slate-500 hover:text-slate-800 transition-colors"
                  title="Sao chép email"
                >
                  {copiedEmail ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            <span className="inline-block text-[11px] font-bold px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              Tài khoản Google đã xác thực • Chờ phân quyền
            </span>
          </div>

          {/* Status Box */}
          <div className="p-4 rounded-2xl border transition-all">
            {isLoadingRequest ? (
              <div className="py-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                <span>Đang kiểm tra trạng thái phê duyệt...</span>
              </div>
            ) : !requestData ? (
              // Not submitted yet
              <div className="text-center space-y-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Tài khoản của bạn đã xác thực thành công nhưng chưa có trong danh sách phân quyền của hệ thống.
                </p>
                <button
                  type="button"
                  onClick={handleSendRequest}
                  disabled={isSubmitting}
                  className="w-full min-h-[46px] py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-2xl text-xs font-black inline-flex items-center justify-center gap-2 shadow-md shadow-blue-600/20 active:scale-98 transition-all touch-manipulation cursor-pointer"
                >
                  <Send className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
                  <span>{isSubmitting ? 'Đang gửi yêu cầu...' : 'Gửi yêu cầu cấp quyền'}</span>
                </button>
              </div>
            ) : requestData.status === 'pending' ? (
              // Pending
              <div className="space-y-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 animate-pulse" />
                  </div>
                  <div className="text-xs">
                    <p className="font-bold text-amber-900">Yêu cầu đang chờ phê duyệt</p>
                    <p className="text-slate-500 text-[11px] mt-0.5">
                      Gửi lúc: {formatDateTime(requestData.requestedAt)}
                    </p>
                  </div>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed bg-amber-50/60 p-2.5 rounded-xl border border-amber-200/60">
                  Hệ thống sẽ tự động mở giao diện ngay khi Quản trị viên duyệt (không cần đăng nhập lại).
                </p>

                {/* Zalo Notification Button */}
                <button
                  type="button"
                  onClick={handleShareZalo}
                  className="w-full min-h-[46px] py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-2xl text-xs font-black inline-flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-98 transition-all touch-manipulation cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Nhắn trưởng nhóm qua Zalo duyệt nhanh</span>
                </button>
              </div>
            ) : requestData.status === 'rejected' ? (
              // Rejected
              <div className="space-y-3 text-center">
                <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div className="text-xs">
                  <p className="font-bold text-rose-900">Yêu cầu đã bị từ chối</p>
                  <p className="text-slate-500 text-[11px] mt-1">
                    Vui lòng liên hệ trực tiếp Trưởng nhóm kỹ thuật để được hỗ trợ.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSendRequest}
                  disabled={isSubmitting}
                  className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
                  <span>Gửi lại yêu cầu</span>
                </button>
              </div>
            ) : (
              // Approved
              <div className="text-center space-y-2 py-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto animate-bounce" />
                <p className="text-xs font-black text-emerald-800">
                  Yêu cầu đã được phê duyệt! Đang chuyển hướng...
                </p>
              </div>
            )}
          </div>

          {/* Action Footer Buttons */}
          <div className="space-y-2 pt-1 border-t border-slate-100">
            <button
              type="button"
              onClick={handleManualRecheck}
              disabled={isRechecking}
              className="w-full min-h-[44px] py-2.5 px-3 bg-slate-50 hover:bg-slate-100 active:bg-slate-200 border border-slate-200 text-slate-700 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-2 active:scale-98 transition-all touch-manipulation cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isRechecking ? 'animate-spin' : ''}`} />
              <span>{isRechecking ? 'Đang kiểm tra...' : 'Kiểm tra lại quyền truy cập'}</span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="w-full min-h-[44px] py-2.5 px-3 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-rose-700 rounded-2xl text-xs font-bold inline-flex items-center justify-center gap-2 active:scale-98 transition-all touch-manipulation cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Đăng xuất tài khoản Google</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
