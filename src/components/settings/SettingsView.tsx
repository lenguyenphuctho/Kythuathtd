import React, { useState, useEffect, useRef } from 'react';
import {
  Database,
  Shield,
  Copy,
  Check,
  Sparkles,
  Server,
  Key,
  Info,
  CheckCircle2,
  RefreshCw,
  Building2,
  Upload,
  X,
  Phone,
  Mail,
  MapPin,
  FileText,
  Globe,
  Link2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { seedSampleData } from '../../services/sampleData';
import firebaseConfig from '../../../firebase-applet-config.json';
import { CompanySettings, DEFAULT_PUBLIC_BASE_URL } from '../../types';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, reportDatabaseError } from '../../services/firebase';
import { compressImage } from '../../utils/imageCompressor';

interface SettingsViewProps {
  onSuccessToast: (msg: string) => void;
  onError: (msg: string) => void;
  onRefreshAll: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onSuccessToast,
  onError,
  onRefreshAll,
}) => {
  const { userProfile, isAdmin } = useAuth();
  const [isSeeding, setIsSeeding] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Company Information State
  const [companyName, setCompanyName] = useState('BAN QUẢN LÝ KỸ THUẬT TÒA NHÀ');
  const [address, setAddress] = useState('Tầng B1, Tòa nhà Trung tâm Điều hành');
  const [phone, setPhone] = useState('024 3888 9999');
  const [email, setEmail] = useState('kythuat@toanha.vn');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>(DEFAULT_PUBLIC_BASE_URL);
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [isCompressingLogo, setIsCompressingLogo] = useState(false);

  // Load existing company profile with realtime listener and connection error reporting
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'systemSettings', 'companyProfile'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as CompanySettings;
          if (data.companyName) setCompanyName(data.companyName);
          if (data.address) setAddress(data.address);
          if (data.phone) setPhone(data.phone);
          if (data.email) setEmail(data.email);
          if (data.logoUrl !== undefined) setLogoUrl(data.logoUrl);
          if (data.publicBaseUrl) setPublicBaseUrl(data.publicBaseUrl);
        }
      },
      (err) => {
        reportDatabaseError(err, 'Tải hồ sơ doanh nghiệp (Settings)');
      }
    );

    return () => unsub();
  }, []);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressingLogo(true);
      const res = await compressImage(file);
      setLogoUrl(res.dataUrl);
      onSuccessToast('Đã tải ảnh logo công ty');
    } catch (err) {
      console.error(err);
      onError('Không thể nén ảnh logo');
    } finally {
      setIsCompressingLogo(false);
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) {
      onError('Chỉ Quản trị viên mới có quyền cập nhật thông tin doanh nghiệp');
      return;
    }

    try {
      setIsSavingCompany(true);

      // Normalize publicBaseUrl
      let normalizedBaseUrl = publicBaseUrl.trim();
      if (normalizedBaseUrl) {
        if (!normalizedBaseUrl.startsWith('http://') && !normalizedBaseUrl.startsWith('https://')) {
          normalizedBaseUrl = `https://${normalizedBaseUrl}`;
        }
        normalizedBaseUrl = normalizedBaseUrl.replace(/\/+$/, '');
      } else {
        normalizedBaseUrl = DEFAULT_PUBLIC_BASE_URL;
      }

      const companyData: CompanySettings = {
        companyName: companyName.trim() || 'HỆ THỐNG QUẢN LÝ BẢO TRÌ & KỸ THUẬT',
        address: address.trim(),
        phone: phone.trim(),
        email: email.trim(),
        logoUrl: logoUrl || null,
        publicBaseUrl: normalizedBaseUrl,
      };

      await setDoc(doc(db, 'systemSettings', 'companyProfile'), companyData);
      setPublicBaseUrl(normalizedBaseUrl);
      onSuccessToast('Đã lưu thông tin doanh nghiệp và địa chỉ chính thức thành công!');
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'systemSettings/companyProfile');
      onError('Không thể lưu thông tin doanh nghiệp');
    } finally {
      setIsSavingCompany(false);
    }
  };

  const handleCopyRules = () => {
    navigator.clipboard.writeText(securityRulesCode);
    setCopiedRules(true);
    setTimeout(() => setCopiedRules(false), 2500);
    onSuccessToast('Đã sao chép Firestore Security Rules vào clipboard!');
  };

  const handleSeedData = async () => {
    if (!isAdmin) {
      onError('Chỉ Quản trị viên mới có quyền khởi tạo dữ liệu mẫu');
      return;
    }

    try {
      setIsSeeding(true);
      await seedSampleData(userProfile?.uid || 'admin', userProfile?.displayName || 'Quản trị viên');
      onSuccessToast('Khởi tạo bộ dữ liệu mẫu thành công!');
      onRefreshAll();
    } catch (err) {
      console.error(err);
      onError('Lỗi khi nạp dữ liệu mẫu');
    } finally {
      setIsSeeding(false);
    }
  };

  const securityRulesCode = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isSignedIn() { return request.auth != null; }
    function isAdmin() { return isSignedIn() && (request.auth.token.email == "${userProfile?.email || 'admin@gmail.com'}" || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin'); }
    function isTechnician() { return isSignedIn() && (isAdmin() || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'technician'); }

    match /{document=**} { allow read, write: if false; }
    match /users/{userId} { allow read: if isSignedIn(); allow write: if isAdmin() || (isSignedIn() && request.auth.uid == userId); }
    match /locations/{id} { allow read: if isSignedIn(); allow write: if isAdmin(); }
    match /equipment/{id} { allow read: if isSignedIn(); allow write: if isAdmin(); }
    match /workOrders/{id} { allow read: if isSignedIn(); allow write: if isSignedIn(); }
    match /workOrderPhotos/{id} { allow read: if isTechnician() || isAdmin() || isViewer() || ('workOrderId' in resource.data && requesterCanSeeWorkOrder(resource.data.workOrderId)); }
    match /workOrderComments/{id} { allow read: if isTechnician() || isAdmin() || isViewer() || ('workOrderId' in resource.data && requesterCanSeeWorkOrder(resource.data.workOrderId)); allow write: if isAdmin() || (isSignedIn() && !isOrderFinished(resource.data.workOrderId)); }
    match /workOrderHistory/{id} { allow read: if isTechnician() || isAdmin() || isViewer() || ('workOrderId' in resource.data && requesterCanSeeWorkOrder(resource.data.workOrderId)); }
    match /inventoryItems/{id} { allow read, write: if isTechnician() || isAdmin(); }
    match /inventoryTransactions/{id} { allow read, write: if isTechnician() || isAdmin(); }
    match /workOrderMaterials/{id} { allow read, write: if isTechnician() || isAdmin(); }
    match /maintenancePlans/{id} { allow read: if isTechnician() || isAdmin(); allow write: if isAdmin(); }
    match /maintenanceLogs/{id} { allow read: if isSignedIn(); allow write: if isTechnician() || isAdmin(); }
    match /costEntries/{id} { allow read, write: if isAdmin(); }
    match /electricalAssets/{id} { allow read: if isSignedIn(); allow write: if isAdmin(); }
    match /meterReadings/{id} { allow read: if isSignedIn(); allow write: if isTechnician() || isAdmin(); }
    match /electricalChecks/{id} { allow read: if isSignedIn(); allow write: if isTechnician() || isAdmin(); }
    match /systemSettings/{id} { allow read: if isSignedIn(); allow write: if isAdmin(); }
  }
}`;

  return (
    <div className="space-y-6 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          Cài đặt Hệ thống & Doanh nghiệp
        </h1>
        <p className="text-xs sm:text-sm text-slate-500">
          Cấu hình thông tin doanh nghiệp in báo cáo PDF, kết nối đám mây và quy tắc an toàn
        </p>
      </div>

      {/* MODULE D: THÔNG TIN DOANH NGHIỆP IN HEADER PDF */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-xs">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Thông tin doanh nghiệp (Tự động đưa vào tiêu đề PDF)
              </h3>
              <p className="text-xs text-slate-500">
                Hiển thị trên phần đầu của mọi báo cáo xuất file PDF và bảng kê Excel
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
            Module Báo cáo
          </span>
        </div>

        <form onSubmit={handleSaveCompany} className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center gap-5 p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="relative group shrink-0">
              {logoUrl ? (
                <div className="w-20 h-20 rounded-2xl border-2 border-white shadow-md overflow-hidden bg-white flex items-center justify-center p-1">
                  <img src={logoUrl} alt="Logo công ty" className="max-w-full max-h-full object-contain" />
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setLogoUrl(null)}
                      className="absolute -top-1.5 -right-1.5 p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-full shadow-md"
                      title="Xóa logo"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ) : (
                <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-slate-300 bg-white flex flex-col items-center justify-center text-slate-400">
                  <Building2 className="w-7 h-7 mb-1" />
                  <span className="text-[10px] font-bold">Chưa có logo</span>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 text-center sm:text-left">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Logo nhận diện thương hiệu
              </h4>
              <p className="text-xs text-slate-500 mb-2.5">
                Định dạng PNG, JPG. Ảnh được tự động chèn vào góc trái của trang bìa và đầu mỗi trang file PDF.
              </p>
              {isAdmin && (
                <>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressingLogo}
                    className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold shadow-2xs inline-flex items-center gap-1.5 transition-all"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>{isCompressingLogo ? 'Đang nén ảnh...' : 'Tải lên logo công ty'}</span>
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tên công ty / Ban quản lý tòa nhà *
              </label>
              <input
                type="text"
                required
                disabled={!isAdmin}
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="VD: CÔNG TY CP QUẢN LÝ TÒA NHÀ ABC"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-blue-500" />
                <span>Địa chỉ trụ sở / Tòa nhà</span>
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="VD: Số 123 Đường Trần Phú, Quận Ba Đình, Hà Nội"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-blue-500" />
                <span>Số điện thoại liên hệ / Hotline kỹ thuật</span>
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="VD: 024 3888 9999 / 0988 123 456"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-blue-500" />
                <span>Email tiếp nhận thông tin</span>
              </label>
              <input
                type="email"
                disabled={!isAdmin}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="VD: kythuat@toanha.vn"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-slate-100"
              />
            </div>
          </div>

          {/* Requirement 2: Địa chỉ chính thức của ứng dụng (publicBaseUrl) */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-indigo-600" />
                <span>Địa chỉ chính thức của ứng dụng (URL công khai) *</span>
              </label>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setPublicBaseUrl(DEFAULT_PUBLIC_BASE_URL)}
                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Dùng địa chỉ đã xuất bản mặc định</span>
                </button>
              )}
            </div>
            <div className="relative">
              <Link2 className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="url"
                required
                disabled={!isAdmin}
                value={publicBaseUrl}
                onChange={(e) => setPublicBaseUrl(e.target.value)}
                placeholder="https://..."
                className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono font-medium focus:ring-2 focus:ring-indigo-500 bg-white disabled:bg-slate-100"
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              MỌI liên kết chia sẻ công việc (qua Zalo, Google Calendar, PDF, Drive) sẽ luôn gắn với địa chỉ này để nhân viên và kỹ thuật viên mở trực tiếp trên điện thoại mà không gặp lỗi 404. Hệ thống không sử dụng địa chỉ tạm thời của tab trình duyệt đang mở.
            </p>
          </div>

          {isAdmin && (
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={isSavingCompany}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isSavingCompany ? 'Đang lưu...' : 'Lưu thông tin doanh nghiệp'}</span>
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Database Seeding Card */}
      {isAdmin && (
        <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-100 text-amber-700 rounded-2xl">
                <Database className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Dữ liệu mẫu khởi tạo (Sample Data)
                </h3>
                <p className="text-xs text-slate-500">
                  Nạp nhanh danh mục vị trí, thiết bị và vật tư chuẩn để thử nghiệm hệ thống
                </p>
              </div>
            </div>

            <button
              onClick={handleSeedData}
              disabled={isSeeding}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isSeeding ? 'Đang nạp...' : 'Nạp dữ liệu mẫu'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Firestore Security Rules Card */}
      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-5 h-5 text-indigo-600" />
              <span>Firestore Security Rules (Quy tắc bảo mật & Phân quyền)</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Quy tắc kiểm soát truy cập theo vai trò (RBAC) cho người dùng, thiết bị, vị trí và công việc
            </p>
          </div>

          <button
            onClick={handleCopyRules}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors shrink-0"
          >
            {copiedRules ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Đã sao chép!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>Sao chép quy tắc</span>
              </>
            )}
          </button>
        </div>

        <div className="relative">
          <pre className="p-4 bg-slate-950 text-slate-200 rounded-2xl text-xs font-mono overflow-x-auto max-h-96 leading-relaxed border border-slate-800">
            <code>{securityRulesCode}</code>
          </pre>
        </div>
      </div>
    </div>
  );
};
