import React, { useState, useEffect } from 'react';
import {
  X,
  Share2,
  Copy,
  Check,
  Send,
  MessageCircle,
  Bell,
  ExternalLink,
  Info,
  AlertTriangle,
  Globe,
} from 'lucide-react';
import {
  WorkOrder,
  UserProfile,
  LocationItem,
  EquipmentItem,
  WorkOrderNotificationRecord,
  CompanySettings,
  DEFAULT_PUBLIC_BASE_URL,
  getWorkOrderOrigin,
  getWorkOrderAssigneeDisplay,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  doc,
  updateDoc,
  arrayUnion,
  addDoc,
  collection,
  onSnapshot,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { formatDate } from '../../utils/formatters';

interface ZaloShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrder: WorkOrder;
  technician?: UserProfile | null;
  location?: LocationItem | null;
  equipment?: EquipmentItem | null;
  type?: 'assign' | 'remind';
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
  onWorkOrderUpdated?: () => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  thap: 'Thấp',
  trung_binh: 'Trung bình',
  cao: 'Cao',
  khan_cap: 'Khẩn cấp 🚨',
};

export const ZaloShareModal: React.FC<ZaloShareModalProps> = ({
  isOpen,
  onClose,
  workOrder,
  technician,
  location,
  equipment,
  type = 'assign',
  onSuccessToast,
  onErrorToast,
  onWorkOrderUpdated,
}) => {
  const { userProfile, isAdmin } = useAuth();
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load publicBaseUrl from systemSettings/companyProfile (Requirement 2)
  const [publicBaseUrl, setPublicBaseUrl] = useState<string>(DEFAULT_PUBLIC_BASE_URL);
  const [hasConfiguredUrl, setHasConfiguredUrl] = useState<boolean>(true);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'systemSettings', 'companyProfile'),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as CompanySettings;
          if (data.publicBaseUrl && data.publicBaseUrl.trim()) {
            setPublicBaseUrl(data.publicBaseUrl.trim());
            setHasConfiguredUrl(true);
          } else {
            setPublicBaseUrl(DEFAULT_PUBLIC_BASE_URL);
            setHasConfiguredUrl(false);
          }
        } else {
          setPublicBaseUrl(DEFAULT_PUBLIC_BASE_URL);
          setHasConfiguredUrl(false);
        }
      },
      (err) => {
        console.warn('Company settings note in ZaloModal:', err);
      }
    );
    return () => unsub();
  }, []);

  // Requirement 3: Link dạng gốc kèm tham số <publicBaseUrl>/?cv=<mã công việc>
  const cleanBase = (publicBaseUrl || DEFAULT_PUBLIC_BASE_URL).trim().replace(/\/+$/, '');
  const directUrl = `${cleanBase}/?cv=${encodeURIComponent(workOrder.code)}`;

  const originText = getWorkOrderOrigin(workOrder);
  const recipientName = technician?.displayName || getWorkOrderAssigneeDisplay(workOrder) || 'Phòng kỹ thuật';

  // Build default message with full information and fallback notice (Requirement 5)
  const buildDefaultMessage = () => {
    const priorityText = PRIORITY_LABELS[workOrder.priority] || workOrder.priority;
    const dueText = workOrder.dueDate ? formatDate(workOrder.dueDate) : 'Chưa đặt hạn';
    const locText = location?.name || (workOrder.locationId ? 'Vị trí công trình' : 'Chưa chỉ định');
    const eqText = equipment ? `[${equipment.code}] ${equipment.name}` : (workOrder.equipmentId ? 'Thiết bị kỹ thuật' : 'Không gắn thiết bị');
    const assignerName = userProfile?.displayName || 'Trưởng nhóm / Quản trị viên';
    const storeExtra = workOrder.requestingStoreName ? ` (${workOrder.requestingStoreName})` : '';
    const fallbackInstruction = `(Nếu link không mở được: mở app từ biểu tượng trên Màn hình chính, vào Việc của tôi, tìm mã ${workOrder.code})`;

    if (type === 'remind') {
      const isOverdue = workOrder.dueDate && new Date(workOrder.dueDate).getTime() < Date.now();
      const statusReason = workOrder.acknowledged === false
        ? 'Chưa nhận việc'
        : isOverdue
        ? 'Đã quá hạn xử lý'
        : 'Cần đôn đốc tiến độ';

      return `[KT & CSVC - NHẮC NHỞ CÔNG VIỆC]
Chào ${recipientName},
Công việc sau đang cần bạn chú ý xử lý ngay:
- Mã công việc: ${workOrder.code}
- Tiêu đề: ${workOrder.title}
- Nguồn công việc: ${originText}${storeExtra}
- Tình trạng: ${statusReason}
- Mức ưu tiên: ${priorityText}
- Vị trí: ${locText}
- Thiết bị: ${eqText}
- Hạn hoàn thành: ${dueText}
- Người nhắc: ${assignerName}

👉 Bấm vào liên kết để xem chi tiết và xử lý:
${directUrl}

${fallbackInstruction}`;
    }

    return `[KT & CSVC - THÔNG BÁO GIAO VIỆC]
Chào ${recipientName},
Bạn/Nhóm được phân công phụ trách công việc sau:
- Mã công việc: ${workOrder.code}
- Tiêu đề: ${workOrder.title}
- Nguồn công việc: ${originText}${storeExtra}
- Mức ưu tiên: ${priorityText}
- Vị trí: ${locText}
- Thiết bị: ${eqText}
- Hạn hoàn thành: ${dueText}
- Người giao: ${assignerName}

👉 Bấm vào liên kết để xác nhận nhận việc và xử lý:
${directUrl}

${fallbackInstruction}`;
  };

  const [message, setMessage] = useState(buildDefaultMessage);

  useEffect(() => {
    setMessage(buildDefaultMessage());
    setCopied(false);
  }, [workOrder.id, workOrder.code, workOrder.assigneeId, workOrder.assigneeType, type, directUrl]);

  if (!isOpen) return null;

  const recordNotificationHistory = async () => {
    if (!userProfile) return;
    const now = new Date().toISOString();
    const historyRecord: WorkOrderNotificationRecord = {
      id: Math.random().toString(36).substring(2, 9),
      sentAt: now,
      sentBy: userProfile.uid,
      sentByName: userProfile.displayName,
      type,
      recipientName,
    };

    try {
      // 1. Update workOrder document notificationHistory array
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        notificationHistory: arrayUnion(historyRecord),
      });

      // 2. Add to workOrderHistory collection for audit trail
      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: type === 'assign' ? 'Đã bấm gửi thông báo giao việc' : 'Đã bấm gửi thông báo nhắc việc',
        details: `Đã gửi thông báo cho ${recipientName} qua Zalo / Chia sẻ thiết bị`,
        timestamp: now,
      });

      if (onWorkOrderUpdated) {
        onWorkOrderUpdated();
      }
    } catch (err) {
      console.error('Failed to log notification history:', err);
    }
  };

  const copyToClipboard = async (customToastMsg?: string) => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      await recordNotificationHistory();
      onSuccessToast(customToastMsg || 'Đã sao chép nội dung, hãy dán vào Zalo');
      setTimeout(() => setCopied(false), 3000);
      return true;
    } catch (err) {
      // Fallback for older browsers
      try {
        const textarea = document.createElement('textarea');
        textarea.value = message;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        setCopied(true);
        await recordNotificationHistory();
        onSuccessToast(customToastMsg || 'Đã sao chép nội dung, hãy dán vào Zalo');
        setTimeout(() => setCopied(false), 3000);
        return true;
      } catch (e) {
        onErrorToast('Không thể tự động sao chép. Vui lòng bôi đen và sao chép thủ công.');
        return false;
      }
    }
  };

  const handleSendViaZaloShare = async () => {
    setIsSubmitting(true);
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: `${workOrder.code}: ${workOrder.title}`,
            text: message,
          });
          await recordNotificationHistory();
          onSuccessToast('Đã mở chia sẻ thành công');
          onClose();
          return;
        } catch (shareErr: any) {
          if (shareErr.name === 'AbortError') {
            // User cancelled share sheet, do not toast error
            return;
          }
          // If share failed (e.g. permission or not allowed type), fallback to clipboard
          await copyToClipboard('Đã sao chép, hãy dán vào Zalo');
          onClose();
        }
      } else {
        // Desktop or unsupported browser -> copy to clipboard
        await copyToClipboard('Đã sao chép, hãy dán vào Zalo');
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyOnly = async () => {
    setIsSubmitting(true);
    try {
      await copyToClipboard('Đã sao chép nội dung vào bộ nhớ tạm');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              {type === 'remind' ? (
                <Bell className="w-5 h-5 text-white animate-bounce" />
              ) : (
                <MessageCircle className="w-5 h-5 text-white" />
              )}
            </div>
            <div>
              <h3 className="text-base font-black text-slate-900 leading-tight">
                {type === 'remind'
                  ? `Nhắc việc cho ${recipientName}`
                  : `Gửi thông báo cho ${recipientName}`}
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Mã {workOrder.code} • Chia sẻ qua Zalo hoặc ứng dụng tin nhắn
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {!hasConfiguredUrl && isAdmin && (
            <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs shadow-xs animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold">Chưa cấu hình Địa chỉ chính thức:</span> Hệ thống đang tạm dùng địa chỉ mặc định (<code className="font-mono text-[10px] bg-amber-100/70 px-1 py-0.5 rounded">{DEFAULT_PUBLIC_BASE_URL}</code>). Bạn vui lòng vào mục <strong>Cài đặt hệ thống</strong> để lưu link chính thức giúp mọi nhân viên luôn mở được link từ xa.
              </div>
            </div>
          )}

          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-sky-50 border border-sky-100 text-sky-800 text-xs">
            <Info className="w-4 h-4 text-sky-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              Bạn có thể chỉnh sửa nội dung bên dưới trước khi gửi. Khi bấm <strong>"Gửi qua Zalo"</strong>, hệ thống sẽ mở menu chia sẻ trên điện thoại để bạn chọn ứng dụng Zalo.
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
              Nội dung thông báo gửi cho nhân viên
            </label>
            <textarea
              rows={9}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full p-3.5 rounded-2xl border border-slate-300 bg-slate-50/60 text-xs text-slate-800 font-sans focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all leading-relaxed"
              placeholder="Nhập nội dung thông báo..."
            />
          </div>

          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1.5">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Liên kết mở trực tiếp công việc:
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={directUrl}
                className="w-full text-[11px] font-mono bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 text-slate-700 select-all"
              />
              <a
                href={directUrl}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 shrink-0 transition-colors"
                title="Mở thử liên kết"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex flex-col sm:flex-row gap-2.5 justify-end">
          <button
            type="button"
            onClick={handleCopyOnly}
            disabled={isSubmitting}
            className="min-h-[48px] px-4 py-2.5 rounded-2xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-98 touch-manipulation"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-700">Đã sao chép!</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4 text-slate-500" />
                <span>Sao chép nội dung</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleSendViaZaloShare}
            disabled={isSubmitting}
            className="min-h-[48px] px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-blue-500/20 active:scale-98 touch-manipulation"
          >
            <Share2 className="w-4 h-4 text-white" />
            <span>Gửi qua Zalo</span>
          </button>
        </div>
      </div>
    </div>
  );
};
