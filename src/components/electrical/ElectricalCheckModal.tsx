import React, { useState } from 'react';
import {
  X,
  ShieldAlert,
  Zap,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Calendar,
  Wrench,
  HelpCircle,
} from 'lucide-react';
import { ElectricalAsset, ElectricalCheck, ElectricalCheckItem, WorkOrder } from '../../types';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { triggerPushNotification } from '../../services/pushNotificationService';

interface ElectricalCheckModalProps {
  isOpen: boolean;
  electricalAssets: ElectricalAsset[];
  defaultAssetId?: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
  onWorkOrderCreated?: (wo: WorkOrder) => void;
}

const DEFAULT_ELECTRICAL_CHECKLIST = [
  'Vỏ tủ, khóa và gioăng kín cách điện nguyên vẹn, không móp méo',
  'Không phát hiện mùi khét, tiếng phóng điện hoặc hiện tượng quá nhiệt tiếp điểm',
  'Độ siết bu lông đầu cos, thanh cái đồng và ốc kẹp cáp đạt tiêu chuẩn lực',
  'Hệ thống tiếp địa an toàn (dây PE) kết nối chắc chắn, điện trở < 4 Ohm',
  'Aptomat chống dòng rò (ELCB/RCCB) tác động chuẩn xác khi bấm nút Test',
  'Điện áp nguồn và tải các pha cân bằng, không vượt quá định mức dòng cho phép',
  'Vệ sinh sạch sẽ bên trong tủ, không có bụi bẩn công nghiệp, ẩm ướt hoặc côn trùng',
];

export const ElectricalCheckModal: React.FC<ElectricalCheckModalProps> = ({
  isOpen,
  electricalAssets,
  defaultAssetId,
  onClose,
  onSuccess,
  onError,
  onWorkOrderCreated,
}) => {
  if (!isOpen) return null;

  const { userProfile } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  // Default next check in 30 days
  const defaultNextDue = () => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  };

  const [selectedAssetId, setSelectedAssetId] = useState<string>(
    defaultAssetId || electricalAssets[0]?.id || ''
  );
  const [date, setDate] = useState(today);
  const [nextCheckDue, setNextCheckDue] = useState(defaultNextDue());
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState<ElectricalCheckItem[]>(
    DEFAULT_ELECTRICAL_CHECKLIST.map((item) => ({
      item,
      passed: true,
      note: '',
    }))
  );
  const [autoCreateWorkOrder, setAutoCreateWorkOrder] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedAsset = electricalAssets.find((a) => a.id === selectedAssetId);

  // Overall result: if all passed -> 'dat', else -> 'khong_dat'
  const allPassed = checklist.every((c) => c.passed);
  const result: 'dat' | 'khong_dat' = allPassed ? 'dat' : 'khong_dat';

  const handleTogglePassed = (index: number) => {
    setChecklist((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, passed: !item.passed } : item))
    );
  };

  const handleItemNoteChange = (index: number, text: string) => {
    setChecklist((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, note: text } : item))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedAssetId) {
      onError('Vui lòng chọn thiết bị điện cần kiểm tra');
      return;
    }

    if (!userProfile) return;

    try {
      setIsSubmitting(true);
      const now = new Date().toISOString();

      let createdWoId: string | undefined = undefined;

      // If not passed and user checked autoCreateWorkOrder: create workOrder immediately
      if (result === 'khong_dat' && autoCreateWorkOrder) {
        const year = new Date().getFullYear();
        const rand = Math.floor(1000 + Math.random() * 9000);
        const woCode = `SC-DIEN-${year}-${rand}`;

        const failedItems = checklist
          .filter((c) => !c.passed)
          .map((c) => `- ${c.item}${c.note ? ` (Ghi chú: ${c.note})` : ''}`)
          .join('\n');

        const newWo: Omit<WorkOrder, 'id'> = {
          code: woCode,
          source: 'internal',
          orderType: 'electrical',
          title: `[SỰ CỐ ĐIỆN] ${selectedAsset?.name || 'Thiết bị điện'} không đạt an toàn`,
          description: `Phiếu kiểm tra an toàn điện ngày ${date} phát hiện hạng mục không đạt tiêu chuẩn:\n${failedItems}\n\nGhi chú chung: ${notes || 'Cần kiểm tra và khắc phục gấp.'}`,
          priority: 'cao',
          status: 'Mới',
          locationId: selectedAsset?.locationId || '',
          electricalAssetId: selectedAsset?.id,
          requesterId: userProfile.uid,
          requesterName: userProfile.displayName,
          requesterEmail: userProfile.email,
          createdAt: now,
          dueDate: `${date}T17:00:00.000Z`,
        };

        const woDocRef = await addDoc(collection(db, 'workOrders'), newWo);
        createdWoId = woDocRef.id;

        await addDoc(collection(db, 'workOrderHistory'), {
          workOrderId: createdWoId,
          actorId: userProfile.uid,
          actorName: userProfile.displayName,
          action: 'Tự động tạo từ phiếu kiểm tra an toàn điện',
          details: `Tạo công việc sửa chữa do thiết bị ${selectedAsset?.code} không đạt kiểm tra an toàn`,
          timestamp: now,
        });

        if (onWorkOrderCreated) {
          onWorkOrderCreated({ id: createdWoId, ...newWo });
        }

        // Trigger push notification for new emergency repair request
        triggerPushNotification('new_request', createdWoId, {
          actorName: userProfile.displayName,
          workOrderCode: newWo.code,
          workOrderTitle: newWo.title,
          locationName: selectedAsset?.name || 'Hệ thống điện',
          priority: 'cao',
          changes: 'tạo phiếu sửa chữa từ kiểm tra an toàn điện',
        });
      }

      // Save electricalCheck
      const newCheck: Omit<ElectricalCheck, 'id'> = {
        assetId: selectedAssetId,
        assetCode: selectedAsset?.code,
        assetName: selectedAsset?.name,
        date,
        checklist,
        result,
        nextCheckDue,
        checkedBy: userProfile.uid,
        checkedByName: userProfile.displayName,
        notes: notes.trim(),
        workOrderId: createdWoId,
        createdAt: now,
      };

      await addDoc(collection(db, 'electricalChecks'), newCheck);

      // Update electricalAsset lastCheckAt and status
      const assetRef = doc(db, 'electricalAssets', selectedAssetId);
      await updateDoc(assetRef, {
        lastCheckAt: date,
        status: result === 'dat' ? 'hoat_dong' : 'can_kiem_tra',
      });

      if (result === 'dat') {
        onSuccess(`Đã lưu phiếu kiểm tra an toàn cho ${selectedAsset?.name}: ĐẠT TIÊU CHUẨN`);
      } else {
        onSuccess(
          `Đã lưu phiếu kiểm tra: KHÔNG ĐẠT.${createdWoId ? ' Đã tự động tạo phiếu sửa chữa khẩn cấp!' : ''}`
        );
      }

      onClose();
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.CREATE, 'electricalChecks');
      onError('Không thể lưu phiếu kiểm tra an toàn điện');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/70">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Phiếu kiểm tra an toàn điện định kỳ
              </h3>
              <p className="text-[11px] text-slate-500">
                Kiểm tra checklist kỹ thuật, tiếp địa, quá nhiệt và ngắt bảo vệ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* REQUIREMENT 6: Mandatory Electrical Safety Notice */}
          <div className="p-4 bg-amber-100/70 rounded-2xl border-2 border-amber-300 text-amber-950 flex items-start gap-3 shadow-2xs">
            <div className="p-1.5 bg-amber-500 text-white rounded-lg shrink-0 mt-0.5">
              <Zap className="w-4 h-4 fill-white animate-pulse" />
            </div>
            <div className="text-xs leading-relaxed">
              <strong className="block text-amber-900 font-black uppercase tracking-wider mb-0.5">
                QUY TẮC AN TOÀN ĐIỆN BẮT BUỘC
              </strong>
              Ngắt nguồn điện và đảm bảo an toàn tuyệt đối trước khi thao tác, kiểm tra đầu nối hoặc bảo trì thiết bị! Sử dụng găng tay và dụng cụ cách điện đạt chuẩn.
            </div>
          </div>

          {/* Select Asset & Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Thiết bị kiểm tra *
              </label>
              <select
                required
                value={selectedAssetId}
                onChange={(e) => setSelectedAssetId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold focus:ring-2 focus:ring-amber-500 bg-white"
              >
                {electricalAssets.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.code}] {a.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ngày kiểm tra *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Hạn kiểm tra tiếp theo
              </label>
              <input
                type="date"
                value={nextCheckDue}
                onChange={(e) => setNextCheckDue(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-amber-500"
              />
            </div>
          </div>

          {/* Checklist Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Hạng mục kiểm tra an toàn ({checklist.filter((c) => c.passed).length}/{checklist.length} Đạt)
              </h4>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                  result === 'dat'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-rose-100 text-rose-800 border border-rose-200 animate-pulse'
                }`}
              >
                {result === 'dat' ? 'KẾT QUẢ: ĐẠT' : 'KẾT QUẢ: KHÔNG ĐẠT'}
              </span>
            </div>

            <div className="space-y-2.5">
              {checklist.map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3 rounded-2xl border transition-all text-xs ${
                    item.passed
                      ? 'bg-white border-slate-200'
                      : 'bg-rose-50/60 border-rose-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <span className={`font-semibold ${item.passed ? 'text-slate-800' : 'text-rose-900 font-bold'}`}>
                        {idx + 1}. {item.item}
                      </span>
                      <div className="mt-1.5">
                        <input
                          type="text"
                          value={item.note || ''}
                          onChange={(e) => handleItemNoteChange(idx, e.target.value)}
                          placeholder="Ghi chú cụ thể (nhiệt độ đo, điện trở tiếp địa, lỗi phát hiện...)"
                          className="w-full px-3 py-1 rounded-xl border border-slate-200 bg-white text-[11px] focus:ring-2 focus:ring-amber-500 text-slate-700"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleTogglePassed(idx)}
                      className={`px-3 py-1.5 rounded-xl font-bold text-xs shrink-0 flex items-center gap-1 transition-all ${
                        item.passed
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-rose-600 text-white hover:bg-rose-700 shadow-xs'
                      }`}
                    >
                      {item.passed ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Đạt</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Không đạt</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* If NOT PASSED: Trigger Work Order */}
          {result === 'khong_dat' && (
            <div className="p-4 bg-rose-50 rounded-2xl border border-rose-300 text-rose-950 space-y-2 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <h5 className="text-xs font-bold uppercase tracking-wider text-rose-900">
                  Phát hiện sự cố không an toàn
                </h5>
              </div>
              <p className="text-xs text-rose-800 leading-relaxed">
                Thiết bị không đạt yêu cầu an toàn điện. Hệ thống sẽ đổi trạng thái thiết bị sang <strong>&quot;Cần kiểm tra&quot;</strong>.
              </p>
              <label className="flex items-center gap-2.5 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCreateWorkOrder}
                  onChange={(e) => setAutoCreateWorkOrder(e.target.checked)}
                  className="w-4 h-4 rounded text-rose-600 border-rose-300 focus:ring-rose-500"
                />
                <span className="text-xs font-bold text-rose-900 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-rose-700" />
                  <span>Tạo ngay phiếu công việc sửa chữa khẩn cấp cho thiết bị này</span>
                </span>
              </label>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Kết luận chung & Kiến nghị kỹ thuật
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="VD: Cần siết lại bu lông pha L2 trước thứ 6..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Đang lưu...' : 'Lưu kết quả kiểm tra'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
