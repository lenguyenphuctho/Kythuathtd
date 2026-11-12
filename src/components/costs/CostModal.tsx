import React, { useState } from 'react';
import { X, DollarSign, Calendar, Cpu, Tag, FileText } from 'lucide-react';
import { CostEntry, CostCategory, EquipmentItem } from '../../types';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';

interface CostModalProps {
  isOpen: boolean;
  costEntry: CostEntry | null;
  equipmentList: EquipmentItem[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const CostModal: React.FC<CostModalProps> = ({
  isOpen,
  costEntry,
  equipmentList,
  onClose,
  onSuccess,
  onError,
}) => {
  if (!isOpen) return null;

  const { userProfile } = useAuth();
  const today = new Date().toISOString().split('T')[0];

  const [date, setDate] = useState(costEntry?.date || today);
  const [category, setCategory] = useState<CostCategory>(costEntry?.category || 'vat_tu');
  const [amount, setAmount] = useState<number>(costEntry?.amount || 0);
  const [equipmentId, setEquipmentId] = useState<string>(costEntry?.equipmentId || '');
  const [description, setDescription] = useState<string>(costEntry?.description || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userProfile) return;

    if (amount <= 0) {
      onError('Số tiền chi phí phải lớn hơn 0');
      return;
    }

    if (!description.trim()) {
      onError('Vui lòng nhập mô tả / nội dung chi phí');
      return;
    }

    try {
      setIsSubmitting(true);
      const now = new Date().toISOString();

      if (costEntry) {
        // Update
        const costRef = doc(db, 'costEntries', costEntry.id);
        const updatePayload: Record<string, any> = {
          date,
          category,
          amount: Number(amount),
          description: description.trim(),
        };
        if (equipmentId) updatePayload.equipmentId = equipmentId;
        await updateDoc(costRef, updatePayload);
        onSuccess('Đã cập nhật mục chi phí thành công');
      } else {
        // Create new
        const newCost: Record<string, any> = {
          date,
          category,
          amount: Number(amount),
          description: description.trim(),
          createdBy: userProfile.uid,
          createdByName: userProfile.displayName,
          createdAt: now,
        };
        if (equipmentId) newCost.equipmentId = equipmentId;
        await addDoc(collection(db, 'costEntries'), newCost);
        onSuccess('Đã thêm mục chi phí phát sinh thành công');
      }

      onClose();
    } catch (err) {
      console.error(err);
      handleFirestoreError(
        err,
        costEntry ? OperationType.UPDATE : OperationType.CREATE,
        costEntry ? `costEntries/${costEntry.id}` : 'costEntries'
      );
      onError('Không thể lưu thông tin chi phí');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {costEntry ? 'Sửa chi phí phát sinh' : 'Ghi nhận chi phí phát sinh'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Lưu vào hệ thống theo dõi ngân sách & chi phí bảo trì
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-200/50 active:scale-95 touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span>Ngày phát sinh *</span>
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-emerald-500 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
                <Tag className="w-3.5 h-3.5 text-emerald-500" />
                <span>Khoản mục chi phí *</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CostCategory)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-emerald-500 bg-white"
              >
                <option value="vat_tu">Vật tư & Phụ tùng</option>
                <option value="nhan_cong">Nhân công sửa chữa</option>
                <option value="thue_ngoai">Thuê ngoài / Dịch vụ</option>
                <option value="dien_nuoc">Điện nước & Năng lượng</option>
                <option value="khac">Chi phí khác</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span>Số tiền (VNĐ) *</span>
            </label>
            <input
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              min={1000}
              step={1000}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              placeholder="VD: 500000"
              className="w-full min-h-[48px] px-3 py-2.5 rounded-xl border border-slate-200 text-base font-bold font-mono focus:ring-2 focus:ring-emerald-500 text-emerald-800"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Cpu className="w-3.5 h-3.5 text-indigo-500" />
              <span>Gắn với thiết bị (tùy chọn)</span>
            </label>
            <select
              value={equipmentId}
              onChange={(e) => setEquipmentId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">-- Không gắn thiết bị cụ thể --</option>
              {equipmentList.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  [{eq.code}] {eq.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-400" />
              <span>Nội dung diễn giải chi phí *</span>
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi rõ lý do chi, nhà cung cấp, hóa đơn, hoặc nội dung công việc..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
            >
              {isSubmitting ? 'Đang lưu...' : costEntry ? 'Lưu thay đổi' : 'Tạo mục chi phí'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
