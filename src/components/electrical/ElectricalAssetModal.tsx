import React, { useState } from 'react';
import { X, Zap, Cpu, MapPin, Tag, FileText, CheckCircle2 } from 'lucide-react';
import { ElectricalAsset, ElectricalAssetType, ElectricalAssetStatus, LocationItem } from '../../types';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';

interface ElectricalAssetModalProps {
  isOpen: boolean;
  asset: ElectricalAsset | null;
  locations: LocationItem[];
  allElectricalAssets: ElectricalAsset[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const ElectricalAssetModal: React.FC<ElectricalAssetModalProps> = ({
  isOpen,
  asset,
  locations,
  allElectricalAssets,
  onClose,
  onSuccess,
  onError,
}) => {
  if (!isOpen) return null;

  const [code, setCode] = useState(asset?.code || '');
  const [name, setName] = useState(asset?.name || '');
  const [type, setType] = useState<ElectricalAssetType>(asset?.type || 'tu_dien');
  const [parentId, setParentId] = useState<string>(asset?.parentId || '');
  const [locationId, setLocationId] = useState(asset?.locationId || locations[0]?.id || '');
  const [rating, setRating] = useState(asset?.rating || '');
  const [phase, setPhase] = useState(asset?.phase || '3 pha');
  const [status, setStatus] = useState<ElectricalAssetStatus>(asset?.status || 'hoat_dong');
  const [notes, setNotes] = useState(asset?.notes || '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Available parent assets (can only be tu_dien or non-self)
  const availableParents = allElectricalAssets.filter(
    (a) => a.id !== asset?.id && (a.type === 'tu_dien' || a.type === 'aptomat')
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      onError('Vui lòng nhập tên thiết bị điện');
      return;
    }

    if (!locationId) {
      onError('Vui lòng chọn vị trí lắp đặt');
      return;
    }

    try {
      setIsSubmitting(true);
      const now = new Date().toISOString();
      const assetCode = code.trim() || `EB-${Math.floor(1000 + Math.random() * 9000)}`;

      if (asset) {
        // Update
        const ref = doc(db, 'electricalAssets', asset.id);
        await updateDoc(ref, {
          code: assetCode,
          name: name.trim(),
          type,
          parentId: parentId || null,
          locationId,
          rating: rating.trim(),
          phase,
          status,
          notes: notes.trim(),
        });
        onSuccess(`Đã cập nhật thiết bị điện "${name}"`);
      } else {
        // Create
        const newAsset: Omit<ElectricalAsset, 'id'> = {
          code: assetCode,
          name: name.trim(),
          type,
          parentId: parentId || null,
          locationId,
          rating: rating.trim(),
          phase,
          status,
          notes: notes.trim(),
          createdAt: now,
        };
        await addDoc(collection(db, 'electricalAssets'), newAsset);
        onSuccess(`Đã thêm mới thiết bị điện "${name}" (${assetCode})`);
      }

      onClose();
    } catch (err) {
      console.error(err);
      handleFirestoreError(
        err,
        asset ? OperationType.UPDATE : OperationType.CREATE,
        asset ? `electricalAssets/${asset.id}` : 'electricalAssets'
      );
      onError('Không thể lưu thông tin thiết bị điện');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {asset ? 'Chỉnh sửa thiết bị điện' : 'Thêm thiết bị điện mới'}
              </h3>
              <p className="text-[11px] text-slate-500">
                Quản lý sơ đồ cây phân cấp tủ điện, mạch phân phối và thiết bị
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Mã thiết bị / Ký hiệu tủ
              </label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="VD: MSB-01, DB-FL02, CT-01"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-mono font-bold focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Loại thiết bị điện *
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as ElectricalAssetType)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="tu_dien">Tủ điện (MSB / DB / Tủ điều khiển)</option>
                <option value="aptomat">Aptomat / Cầu dao (MCCB / MCB / ELCB)</option>
                <option value="cong_to">Công tơ điện / Đồng hồ đo kWh</option>
                <option value="den">Hệ thống chiếu sáng / Đèn</option>
                <option value="o_cam">Ổ cắm / Hộp nguồn công nghiệp</option>
                <option value="khac">Thiết bị điện khác</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Tên thiết bị điện / Tủ điện *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Tủ phân phối tổng tầng 2 (DB-FL02)"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500 font-medium"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Vị trí lắp đặt *
              </label>
              <select
                required
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-amber-500 bg-white"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Trực thuộc tủ cha (Cây phân cấp)
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="">(Tủ nguồn chính / Không có cấp trên)</option>
                {availableParents.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.code}] {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Công suất / Định mức (Rating)
              </label>
              <input
                type="text"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
                placeholder="VD: 100A, 250A, 15kW"
                className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Số pha
              </label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="3 pha">3 Pha (380V)</option>
                <option value="1 pha">1 Pha (220V)</option>
                <option value="DC">Điện 1 chiều (DC)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Tình trạng hiện tại *
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as ElectricalAssetStatus)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold focus:ring-2 focus:ring-amber-500 bg-white"
              >
                <option value="hoat_dong">Bình thường (Hoạt động)</option>
                <option value="can_kiem_tra">Cần kiểm tra an toàn</option>
                <option value="hong">Hỏng / Cần sửa chữa</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Ghi chú kỹ thuật / Đặc tính an toàn
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="VD: Cáp cấp nguồn XLPE 4x50mm2, chống sét van lan truyền OBO..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-amber-500"
            />
          </div>

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
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Đang lưu...' : asset ? 'Cập nhật thiết bị' : 'Thêm thiết bị điện'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
