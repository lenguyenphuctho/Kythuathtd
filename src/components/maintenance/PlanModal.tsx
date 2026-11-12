import React, { useState } from 'react';
import { X, CalendarCheck, Plus, Trash2, ListChecks } from 'lucide-react';
import {
  MaintenancePlan,
  FrequencyType,
  LocationItem,
  EquipmentItem,
  UserProfile,
  ElectricalAsset,
} from '../../types';
import { calculateNextDueDate } from '../../utils/maintenanceUtils';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';

interface PlanModalProps {
  isOpen: boolean;
  plan: MaintenancePlan | null;
  locations: LocationItem[];
  equipmentList: EquipmentItem[];
  electricalAssets?: ElectricalAsset[];
  technicians: UserProfile[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const PlanModal: React.FC<PlanModalProps> = ({
  isOpen,
  plan,
  locations,
  equipmentList,
  electricalAssets = [],
  technicians,
  onClose,
  onSuccess,
  onError,
}) => {
  if (!isOpen) return null;

  const [title, setTitle] = useState(plan?.title || '');
  const [targetType, setTargetType] = useState<'equipment' | 'electrical' | 'none'>(
    plan?.electricalAssetId ? 'electrical' : plan?.equipmentId ? 'equipment' : 'none'
  );
  const [equipmentId, setEquipmentId] = useState(plan?.equipmentId || '');
  const [electricalAssetId, setElectricalAssetId] = useState(plan?.electricalAssetId || '');
  const [locationId, setLocationId] = useState(plan?.locationId || locations[0]?.id || '');
  const [frequencyType, setFrequencyType] = useState<FrequencyType>(plan?.frequencyType || 'thang');
  const [frequencyValue, setFrequencyValue] = useState<number>(plan?.frequencyValue || 1);

  const todayStr = new Date().toISOString().split('T')[0];
  const [nextDue, setNextDue] = useState(plan?.nextDue || todayStr);
  const [assigneeId, setAssigneeId] = useState(plan?.assigneeId || '');
  const [checklist, setChecklist] = useState<string[]>(
    plan?.checklist && plan.checklist.length > 0
      ? [...plan.checklist]
      : ['Kiểm tra bề ngoài và vệ sinh bụi bẩn', 'Đo thông số vận hành thực tế', 'Kiểm tra tiếng ồn và nhiệt độ bất thường', 'Ghi nhật ký nghiệm thu']
  );
  const [newCheckItem, setNewCheckItem] = useState('');
  const [active, setActive] = useState<boolean>(plan?.active ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddCheckItem = () => {
    if (!newCheckItem.trim()) return;
    setChecklist([...checklist, newCheckItem.trim()]);
    setNewCheckItem('');
  };

  const handleRemoveCheckItem = (idx: number) => {
    setChecklist(checklist.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      onError('Vui lòng nhập tên kế hoạch bảo dưỡng');
      return;
    }
    if (!locationId) {
      onError('Vui lòng chọn vị trí áp dụng');
      return;
    }
    if (checklist.length === 0) {
      onError('Vui lòng thêm ít nhất một mục checklist kiểm tra');
      return;
    }
    if (Number(frequencyValue) <= 0) {
      onError('Chu kỳ lặp phải là số nguyên dương lớn hơn 0');
      return;
    }
    if (!nextDue) {
      onError('Vui lòng chọn ngày đến hạn kế tiếp');
      return;
    }

    try {
      setIsSubmitting(true);
      const assignedTech = technicians.find((t) => t.uid === assigneeId);

      const payload: Record<string, any> = {
        title: title.trim(),
        locationId,
        frequencyType,
        frequencyValue: Number(frequencyValue) || 1,
        nextDue,
        checklist,
        active,
        createdAt: plan?.createdAt || new Date().toISOString(),
      };

      if (targetType === 'equipment' && equipmentId) payload.equipmentId = equipmentId;
      if (targetType === 'electrical' && electricalAssetId) payload.electricalAssetId = electricalAssetId;
      if (assigneeId) {
        payload.assigneeId = assigneeId;
        if (assignedTech?.displayName) payload.assigneeName = assignedTech.displayName;
      }

      if (plan) {
        await updateDoc(doc(db, 'maintenancePlans', plan.id), payload);
        onSuccess(`Đã cập nhật kế hoạch bảo dưỡng "${payload.title}"`);
      } else {
        await addDoc(collection(db, 'maintenancePlans'), payload);
        onSuccess(`Đã tạo kế hoạch bảo dưỡng mới "${payload.title}"`);
      }

      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'maintenancePlans');
      onError('Không thể lưu kế hoạch bảo dưỡng');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {plan ? 'Chỉnh sửa kế hoạch bảo dưỡng' : 'Lập kế hoạch bảo dưỡng định kỳ'}
              </h3>
              <p className="text-xs text-slate-500">Chu kỳ tự động sinh công việc kỹ thuật định kỳ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 active:scale-95 touch-manipulation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Tên kế hoạch bảo dưỡng *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Bảo dưỡng định kỳ Điều hòa VRV Tầng 2"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 font-semibold"
            />
          </div>

          {/* Location & Target */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Khu vực / Vị trí *
              </label>
              <select
                required
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-500"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Đối tượng áp dụng
              </label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="equipment">Thiết bị máy móc (Cơ điện, HVAC, PCCC...)</option>
                <option value="electrical">Hệ thống tủ điện / Thiết bị điện</option>
                <option value="none">Khu vực chung (Không gắn thiết bị cụ thể)</option>
              </select>
            </div>
          </div>

          {/* Select Specific Target */}
          {targetType === 'equipment' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Chọn thiết bị máy móc
              </label>
              <select
                value={equipmentId}
                onChange={(e) => setEquipmentId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Chọn thiết bị --</option>
                {equipmentList.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    [{eq.code}] {eq.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {targetType === 'electrical' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Chọn tủ điện / thiết bị điện
              </label>
              <select
                value={electricalAssetId}
                onChange={(e) => setElectricalAssetId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Chọn thiết bị điện --</option>
                {electricalAssets.map((ea) => (
                  <option key={ea.id} value={ea.id}>
                    [{ea.code}] {ea.name} ({ea.rating || ''})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Frequency & Next Due */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Chu kỳ lặp</label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="1"
                  max="99"
                  value={frequencyValue}
                  onChange={(e) => setFrequencyValue(Number(e.target.value))}
                  className="w-16 min-h-[44px] px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-center bg-white"
                />
                <select
                  value={frequencyType}
                  onChange={(e) => setFrequencyType(e.target.value as FrequencyType)}
                  className="flex-1 min-h-[44px] px-2 py-1.5 rounded-xl border border-slate-300 text-xs bg-white"
                >
                  <option value="ngay">Ngày</option>
                  <option value="tuan">Tuần</option>
                  <option value="thang">Tháng</option>
                  <option value="quy">Quý (3 tháng)</option>
                  <option value="nam">Năm</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Hạn kỳ tới (nextDue) *</label>
              <input
                type="date"
                required
                value={nextDue}
                onChange={(e) => setNextDue(e.target.value)}
                className="w-full min-h-[44px] px-2.5 py-1.5 rounded-xl border border-slate-300 text-xs bg-white font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">KTV mặc định</label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-2 py-1.5 rounded-xl border border-slate-300 text-xs bg-white"
              >
                <option value="">-- Chưa gán --</option>
                {technicians.map((t) => (
                  <option key={t.uid} value={t.uid}>
                    {t.displayName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Checklist Builder */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <ListChecks className="w-4 h-4 text-blue-600" />
                <span>Nội dung checklist bảo dưỡng ({checklist.length}) *</span>
              </label>
            </div>

            <div className="space-y-1.5 mb-2 max-h-48 overflow-y-auto pr-1">
              {checklist.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-2 p-2 bg-slate-50 rounded-xl border border-slate-200 text-xs"
                >
                  <span className="flex-1 font-medium text-slate-800">
                    <strong className="text-blue-600 mr-1.5">{idx + 1}.</strong> {item}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCheckItem(idx)}
                    className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                value={newCheckItem}
                onChange={(e) => setNewCheckItem(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCheckItem();
                  }
                }}
                placeholder="Thêm mục kiểm tra mới (VD: Siết chặt đầu nối ốc vít)..."
                className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={handleAddCheckItem}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Thêm
              </button>
            </div>
          </div>

          {/* Active status */}
          <div className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white">
            <div>
              <span className="text-xs font-bold text-slate-800 block">Kích hoạt kế hoạch</span>
              <span className="text-[11px] text-slate-400">
                Khi kích hoạt, hệ thống sẽ tự động sinh công việc trước hạn 3 ngày
              </span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : plan ? 'Lưu cập nhật' : 'Tạo kế hoạch'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
