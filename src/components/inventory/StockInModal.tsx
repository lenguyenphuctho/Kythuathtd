import React, { useState } from 'react';
import { X, ArrowDownLeft, AlertCircle } from 'lucide-react';
import { InventoryItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { runTransaction, doc, collection } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { formatCurrency, getFriendlyErrorMessage } from '../../utils/formatters';

interface StockInModalProps {
  isOpen: boolean;
  items: InventoryItem[];
  preselectedItemId?: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const StockInModal: React.FC<StockInModalProps> = ({
  isOpen,
  items,
  preselectedItemId,
  onClose,
  onSuccess,
  onError,
}) => {
  if (!isOpen) return null;

  const { userProfile } = useAuth();
  const activeItems = items.filter((i) => i.active);

  const [selectedItemId, setSelectedItemId] = useState(
    preselectedItemId || activeItems[0]?.id || ''
  );
  const [qty, setQty] = useState<number>(1);
  const selectedItem = items.find((i) => i.id === selectedItemId);
  const [unitCost, setUnitCost] = useState<number>(selectedItem?.unitCost || 0);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleItemSelect = (id: string) => {
    setSelectedItemId(id);
    const it = items.find((i) => i.id === id);
    if (it) {
      setUnitCost(it.unitCost || 0);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) {
      onError('Vui lòng chọn vật tư cần nhập kho');
      return;
    }

    const numericQty = Number(qty);
    if (isNaN(numericQty) || !isFinite(numericQty) || numericQty <= 0) {
      onError('Số lượng nhập kho phải là số hợp lệ lớn hơn 0 (không được nhập số âm, bằng 0 hoặc ký tự chữ)');
      return;
    }

    const numericCost = Number(unitCost);
    if (isNaN(numericCost) || !isFinite(numericCost) || numericCost < 0) {
      onError('Đơn giá nhập kho phải là số hợp lệ không âm');
      return;
    }

    if (!userProfile) {
      onError('Vui lòng đăng nhập lại');
      return;
    }

    try {
      setIsSubmitting(true);

      // Perform atomic Firestore transaction to prevent race conditions
      await runTransaction(db, async (transaction) => {
        const itemDocRef = doc(db, 'inventoryItems', selectedItemId);
        const itemDoc = await transaction.get(itemDocRef);

        if (!itemDoc.exists()) {
          throw new Error('Vật tư không tồn tại trong cơ sở dữ liệu');
        }

        const data = itemDoc.data() as InventoryItem;
        const currentQty = Number(data.qty) || 0;
        const newQty = currentQty + numericQty;

        // Update item stock
        transaction.update(itemDocRef, {
          qty: newQty,
          unitCost: numericCost > 0 ? numericCost : data.unitCost,
        });

        // Insert transaction record
        const transRef = doc(collection(db, 'inventoryTransactions'));
        transaction.set(transRef, {
          itemId: selectedItemId,
          itemName: data.name,
          type: 'in',
          qty: numericQty,
          unitCost: numericCost || 0,
          note: note.trim() || 'Nhập kho bổ sung',
          createdBy: userProfile.uid,
          createdByName: userProfile.displayName,
          createdAt: new Date().toISOString(),
        });
      });

      onSuccess(`Đã nhập thành công ${numericQty} ${selectedItem?.unit || ''} vào kho`);
      onClose();
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.WRITE, 'inventoryTransactions');
      const msg = getFriendlyErrorMessage(err, 'Lỗi khi thực hiện nhập kho. Vui lòng thử lại.');
      onError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 my-8 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-emerald-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <ArrowDownLeft className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Nhập kho vật tư</h3>
              <p className="text-xs text-slate-500">Cộng dồn số lượng và cập nhật nhật ký tồn kho</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Chọn vật tư nhập *
            </label>
            <select
              required
              value={selectedItemId}
              onChange={(e) => handleItemSelect(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white focus:ring-2 focus:ring-blue-500"
            >
              {activeItems.map((item) => (
                <option key={item.id} value={item.id}>
                  [{item.sku}] {item.name} (Hiện có: {item.qty} {item.unit})
                </option>
              ))}
            </select>
          </div>

          {selectedItem && (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs flex justify-between">
              <div>
                <span className="text-slate-400 block">Tồn kho hiện tại:</span>
                <span className="font-bold text-slate-800 text-sm">
                  {selectedItem.qty} {selectedItem.unit}
                </span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block">Vị trí lưu:</span>
                <span className="font-semibold text-slate-700">{selectedItem.location || 'Chưa gán'}</span>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Số lượng nhập *
              </label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                min="1"
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono font-bold focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Đơn giá nhập (VNĐ)
              </label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                min="0"
                step="1000"
                value={unitCost}
                onChange={(e) => setUnitCost(Number(e.target.value))}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="text-right text-xs text-slate-500">
            Tổng tiền nhập dự tính:{' '}
            <strong className="text-emerald-700 font-mono text-sm">
              {formatCurrency(Number(qty) * Number(unitCost))}
            </strong>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Ghi chú nhập kho
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Nhà cung cấp, số phiếu nhập hoặc chứng từ..."
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500"
            />
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
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-500/20 disabled:opacity-50"
            >
              {isSubmitting ? 'Đang cập nhật kho...' : 'Xác nhận nhập kho'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
