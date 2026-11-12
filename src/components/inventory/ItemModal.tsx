import React, { useState } from 'react';
import { X, Package } from 'lucide-react';
import { InventoryItem } from '../../types';
import { collection, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';

interface ItemModalProps {
  isOpen: boolean;
  item: InventoryItem | null;
  categories: string[];
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const ItemModal: React.FC<ItemModalProps> = ({
  isOpen,
  item,
  categories,
  onClose,
  onSuccess,
  onError,
}) => {
  if (!isOpen) return null;

  const [sku, setSku] = useState(item?.sku || `VT-${Math.floor(1000 + Math.random() * 9000)}`);
  const [name, setName] = useState(item?.name || '');
  const [category, setCategory] = useState(item?.category || categories[0] || 'Vật tư điện');
  const [customCategory, setCustomCategory] = useState('');
  const [unit, setUnit] = useState(item?.unit || 'cái');
  const [qty, setQty] = useState<number>(item?.qty || 0);
  const [minQty, setMinQty] = useState<number>(item?.minQty || 5);
  const [unitCost, setUnitCost] = useState<number>(item?.unitCost || 0);
  const [location, setLocation] = useState(item?.location || 'Kệ A1');
  const [active, setActive] = useState<boolean>(item?.active ?? true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !sku.trim()) {
      onError('Vui lòng nhập tên và mã SKU của vật tư');
      return;
    }

    if (Number(qty) < 0 || Number(minQty) < 0 || Number(unitCost) < 0) {
      onError('Số lượng tồn và đơn giá không được là số âm');
      return;
    }

    const finalCategory = customCategory.trim() || category;

    try {
      setIsSubmitting(true);
      const payload: Omit<InventoryItem, 'id'> = {
        sku: sku.trim().toUpperCase(),
        name: name.trim(),
        category: finalCategory,
        unit: unit.trim(),
        qty: Number(qty) || 0,
        minQty: Number(minQty) || 0,
        unitCost: Number(unitCost) || 0,
        location: location.trim(),
        active,
        createdAt: item?.createdAt || new Date().toISOString(),
      };

      if (item) {
        await updateDoc(doc(db, 'inventoryItems', item.id), payload);
        onSuccess(`Đã cập nhật thông tin vật tư ${payload.sku}`);
      } else {
        await addDoc(collection(db, 'inventoryItems'), payload);
        onSuccess(`Đã thêm mới vật tư ${payload.sku}`);
      }
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'inventoryItems');
      onError('Không thể lưu vật tư. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {item ? 'Sửa thông tin vật tư' : 'Thêm vật tư phụ tùng mới'}
              </h3>
              <p className="text-xs text-slate-500">Quản lý mã định danh, đơn vị và định mức tồn kho</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Mã SKU / Mã vật tư *
              </label>
              <input
                type="text"
                required
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                placeholder="VD: LED-18W"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Đơn vị tính *
              </label>
              <input
                type="text"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="cái, mét, bộ, lít, cuộn..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Tên vật tư / Phụ tùng *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Bóng đèn tuýp LED Philips 18W T8"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Nhóm phân loại
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-500"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="Khác">-- Nhóm khác --</option>
              </select>
            </div>

            {category === 'Khác' && (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Tên nhóm mới
                </label>
                <input
                  type="text"
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Nhập tên nhóm mới"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Vị trí để trong kho
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="VD: Kệ E1-03, Ngăn 2"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
            {!item && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Tồn đầu kỳ
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  min="0"
                  value={qty}
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Tồn tối thiểu (Báo động)
              </label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="0"
                value={minQty}
                onChange={(e) => setMinQty(Number(e.target.value))}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold bg-white"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Đơn giá chuẩn (VNĐ)
              </label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="0"
                step="1000"
                value={unitCost}
                onChange={(e) => setUnitCost(Number(e.target.value))}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-300 text-xs font-mono bg-white"
              />
            </div>
          </div>

          {/* Active status */}
          <div className="flex items-center justify-between p-3 rounded-2xl border border-slate-200 bg-white">
            <div>
              <span className="text-xs font-bold text-slate-800 block">Trạng thái sử dụng</span>
              <span className="text-[11px] text-slate-400">
                Khi ngừng sử dụng, vật tư sẽ không xuất hiện trong danh sách chọn của công việc
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
              {isSubmitting ? 'Đang lưu...' : item ? 'Lưu cập nhật' : 'Thêm vật tư'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
