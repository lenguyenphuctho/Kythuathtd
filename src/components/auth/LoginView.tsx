import React, { useState, useEffect } from 'react';
import {
  Wrench,
  AlertCircle,
  Copy,
  Check,
  ExternalLink,
  Smartphone,
  ShieldAlert,
  Info,
  RefreshCw,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { detectBrowserEnvironment, InAppBrowserInfo } from '../../utils/browserUtils';
import { loginWithGoogleDirect, formatAuthError } from '../../services/firebase';

export const LoginView: React.FC = () => {
  const { error, clearError } = useAuth();
  const [browserInfo, setBrowserInfo] = useState<InAppBrowserInfo>({
    isInApp: false,
    appName: '',
    isIOS: false,
    isAndroid: false,
    isSafari: false,
    isStandalone: false,
  });
  const [copiedLink, setCopiedLink] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [customError, setCustomError] = useState<string | null>(null);
  const [isPopupBlocked, setIsPopupBlocked] = useState(false);

  useEffect(() => {
    setBrowserInfo(detectBrowserEnvironment());
  }, []);

  const handleCopyCurrentLink = async () => {
    try {
      const currentUrl = typeof window !== 'undefined' ? window.location.href : '';
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentUrl);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = currentUrl;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 3000);
    } catch (err) {
      console.warn('Copy link failed:', err);
    }
  };

  /**
   * ĐĂNG NHẬP TIN CẬY TRÊN iOS:
   * Kích hoạt signInWithPopup TRỰC TIẾP ngay trong cú chạm của người dùng,
   * TUYỆT ĐỐI không gọi await hay async delay trước đó để tránh bị Safari chặn popup.
   */
  const handleDirectGoogleLogin = () => {
    clearError();
    setCustomError(null);
    setIsPopupBlocked(false);
    setIsLoggingIn(true);

    // Kích hoạt trực tiếp ngay tại luồng đồng bộ
    loginWithGoogleDirect()
      .then(() => {
        // Auth state listener trong AuthContext sẽ tự động cập nhật
        setIsLoggingIn(false);
      })
      .catch((err) => {
        console.error('Google Sign-in failed on iOS/Mobile:', err);
        const { message, isPopupBlocked: blocked } = formatAuthError(err);
        setCustomError(message);
        setIsPopupBlocked(blocked);
        setIsLoggingIn(false);
      });
  };

  const activeError = customError || error;

  return (
    <div className="min-h-[100dvh] bg-slate-100/70 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        {/* App Logo */}
        <div className="w-16 h-16 rounded-3xl bg-blue-600 flex items-center justify-center text-white shadow-xl shadow-blue-500/25 mx-auto mb-4">
          <Wrench className="w-8 h-8" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Quản lý Kỹ thuật & Cơ sở vật chất
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
          Hệ thống kỹ thuật nội bộ Goath Game
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 sm:px-10 shadow-xl shadow-slate-200/60 rounded-3xl border border-slate-200 space-y-5">
          {/* TRƯỜNG HỢP 1: PHÁT HIỆN TRÌNH DUYỆT NHÚNG (Zalo, Facebook, Messenger, TikTok, Instagram...) */}
          {browserInfo.isInApp ? (
            <div className="space-y-4 animate-in fade-in">
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-2">
                <div className="flex items-center gap-2 font-black text-amber-950 text-sm">
                  <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" />
                  <span>Trình duyệt trong {browserInfo.appName || 'ứng dụng'}</span>
                </div>
                <p className="leading-relaxed">
                  Google chặn đăng nhập tài khoản trực tiếp trong trình duyệt nhúng của {browserInfo.appName || 'ứng dụng này'} để bảo vệ bảo mật tài khoản.
                </p>
              </div>

              <div className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl text-xs text-slate-700 space-y-2.5">
                <div className="font-bold text-blue-900 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-blue-600" />
                  <span>
                    Hãy mở trang này bằng {browserInfo.isIOS ? 'Safari' : 'Chrome'}
                  </span>
                </div>
                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-600 leading-relaxed font-medium">
                  <li>
                    Bấm vào biểu tượng <strong>dấu ba chấm (...)</strong> hoặc <strong>Chia sẻ</strong> ở góc trên/dưới màn hình.
                  </li>
                  <li>
                    Chọn <strong>"Mở bằng trình duyệt"</strong> (hoặc <em>Open in {browserInfo.isIOS ? 'Safari' : 'Chrome'}</em>).
                  </li>
                </ol>
              </div>

              {/* Nút Sao chép liên kết */}
              <div>
                <button
                  type="button"
                  onClick={handleCopyCurrentLink}
                  className="w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs shadow-md shadow-blue-500/20 active:scale-98 transition-all touch-manipulation cursor-pointer"
                >
                  {copiedLink ? (
                    <>
                      <Check className="w-4 h-4 text-white" />
                      <span>Đã sao chép link! Dán vào Safari / Chrome</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4 text-white" />
                      <span>Sao chép liên kết ứng dụng</span>
                    </>
                  )}
                </button>
              </div>

              <div className="text-center text-[10px] text-slate-400">
                Sau khi mở bằng trình duyệt chính, bạn có thể đăng nhập Google bình thường.
              </div>
            </div>
          ) : (
            /* TRƯỜNG HỢP 2: TRÌNH DUYỆT CHÍNH (Safari, Chrome...) */
            <>
              {activeError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 leading-relaxed flex items-start gap-2.5 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <span className="font-medium">{activeError}</span>
                    {isPopupBlocked && (
                      <div className="text-[11px] text-rose-700 bg-rose-100/70 p-2 rounded-xl mt-1.5 font-sans">
                        👉 <strong>Cách mở chặn trên iPhone:</strong> Mở ứng dụng <strong>Cài đặt</strong> &gt; cuộn xuống chọn <strong>Safari</strong> &gt; Tắt mục <strong>"Chặn cửa sổ bật lên" (Block Pop-ups)</strong>, sau đó quay lại đây bấm đăng nhập lại.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Big Google Sign In Button */}
              <div>
                <button
                  type="button"
                  onClick={handleDirectGoogleLogin}
                  disabled={isLoggingIn}
                  className="w-full min-h-[50px] flex items-center justify-center gap-3 px-5 py-3.5 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 active:bg-slate-100 text-slate-800 font-bold text-sm shadow-md hover:shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 touch-manipulation cursor-pointer"
                >
                  {isLoggingIn ? (
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
                      <span>Đang kết nối Google...</span>
                    </div>
                  ) : (
                    <>
                      <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                        />
                      </svg>
                      <span>Đăng nhập bằng Google</span>
                    </>
                  )}
                </button>
              </div>

              {/* iOS Safari Tip */}
              {browserInfo.isIOS && !browserInfo.isStandalone && (
                <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-2xl text-[11px] text-slate-600 flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <strong>Gợi ý iOS:</strong> Để lưu phiên đăng nhập bền vững và sử dụng như app thật, bạn nên thêm ứng dụng vào Màn hình chính (bấm nút Chia sẻ của Safari &gt; <em>Thêm vào MH chính</em>).
                  </div>
                </div>
              )}

              <div className="pt-1 text-center text-[11px] text-slate-500 leading-relaxed">
                Hệ thống hỗ trợ đăng nhập bằng tài khoản Google. Tài khoản mới sẽ gửi yêu cầu cấp quyền và chờ Quản trị viên duyệt một chạm.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
