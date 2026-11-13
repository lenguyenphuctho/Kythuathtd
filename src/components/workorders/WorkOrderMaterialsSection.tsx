import React, { useState, useEffect } from 'react';
import {
  Package,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  TrendingDown,
  RotateCcw,
} from 'lucide-react';
import { InventoryItem, WorkOrderMaterial, WorkOrder, isWorkOrderCompleted } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  collection,
  query,
  where,
  onSnapshot,
  runTransaction,
  doc,
  addDoc,
} from 'firebase/firestore';
import { triggerPushNotification } from '../../services/pushNotificationService';
import { auth, db, handleFirestoreError, OperationType } from '../../services/firebase';

interface WorkOrderMaterialsSectionProps {
  workOrder: WorkOrder;
  inventoryItems: InventoryItem[];
  canEdit: boolean;
  onMaterialsChanged?: () => void;
  onError: (msg: string) => void;
  onSuccess: (msg: string) => void;
}

export const WorkOrderMaterialsSection: React.FC<WorkOrderMaterialsSectionProps> = ({
  workOrder,
  inventoryItems,
  canEdit,
  onMaterialsChanged,
  onError,
  onSuccess,
}) => {
  const { userProfile, isAdmin, isTechnician } = useAuth();
  const [materials, setMaterials] = useState<WorkOrderMaterial[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Add material modal / form
  const [isAdding, setIsAdding] = useState(false);
  const activeItems = inventoryItems.filter((i) => i.active);
  const [selectedItemId, setSelectedItemId] = useState(activeItems[0]?.id || '');
  const [qty, setQty] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Refund confirm
  const [refundingMaterial, setRefundingMaterial] = useState<WorkOrderMaterial | null>(null);
  const [isRefunding, setIsRefunding] = useState(false);

  // Subscribe to workOrderMaterials for this work order
  useEffect(() => {
    setIsLoading(true);
    const q = query(
      collection(db, 'workOrderMaterials'),
      where('workOrderId', '==', workOrder.id)
    );

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrderMaterial));
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setMaterials(items);
        setIsLoading(false);
      },
      (err) => {
        if (auth.currentUser) {
          handleFirestoreError(err, OperationType.GET, 'workOrderMaterials');
        }
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, [workOrder.id]);

  const selectedItem = inventoryItems.find((i) => i.id === selectedItemId);

  const totalCost = materials.reduce(
    (acc, m) => acc + (m.qty * (m.unitCost || 0)),
    0
  );

  const canRefund = canEdit && (isAdmin || isTechnician) && (!isWorkOrderCompleted(workOrder) || isAdmin);

  // Add Material with Atomic runTransaction
  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedItemId) {
      onError('Vui lòng chọn vật tư cần xuất');
      return;
    }

    const numericQty = Number(qty);
    if (isNaN(numericQty) || !isFinite(numericQty) || numericQty <= 0) {
      onError('Số lượng xuất phải là số dương hợp lệ lớn hơn 0 (không được nhập số âm, bằng 0 hoặc chữ cái)');
      return;
    }

    if (!selectedItem) {
      onError('Không tìm thấy thông tin vật tư đã chọn');
      return;
    }

    // Client-side quick check
    if (numericQty > (selectedItem.qty || 0)) {
      onError(
        `Số lượng xuất (${numericQty} ${selectedItem.unit}) vượt quá tồn kho hiện tại (${selectedItem.qty} ${selectedItem.unit})! Vui lòng nhập số lượng nhỏ hơn hoặc bổ sung nhập kho.`
      );
      return;
    }

    if (!userProfile) return;

    try {
      setIsSubmitting(true);

      await runTransaction(db, async (transaction) => {
        const itemDocRef = doc(db, 'inventoryItems', selectedItemId);
        const itemSnap = await transaction.get(itemDocRef);

        if (!itemSnap.exists()) {
          throw new Error('Vật tư này không còn tồn tại trong kho');
        }

        const currentItemData = itemSnap.data() as InventoryItem;
        const currentQty = Number(currentItemData.qty) || 0;

        if (currentQty < numericQty) {
          throw new Error(
            `Tồn kho hiện tại (${currentQty} ${currentItemData.unit}) không đủ để xuất ${numericQty} ${currentItemData.unit}`
          );
        }

        const newQty = currentQty - Number(qty);
        const unitCost = currentItemData.unitCost || 0;

        // 1. Subtract from inventory
        transaction.update(itemDocRef, {
          qty: newQty,
        });

        // 2. Add to workOrderMaterials
        const matRef = doc(collection(db, 'workOrderMaterials'));
        transaction.set(matRef, {
          workOrderId: workOrder.id,
          itemId: selectedItemId,
          itemName: currentItemData.name,
          unit: currentItemData.unit,
          qty: Number(qty),
          unitCost,
          createdBy: userProfile.uid,
          createdByName: userProfile.displayName,
          createdAt: new Date().toISOString(),
        });

        // 3. Add to inventoryTransactions (type: out)
        const transRef = doc(collection(db, 'inventoryTransactions'));
        transaction.set(transRef, {
          itemId: selectedItemId,
          itemName: currentItemData.name,
          type: 'out',
          qty: Number(qty),
          unitCost,
          workOrderId: workOrder.id,
          workOrderCode: workOrder.code,
          note: `Xuất cho công việc ${workOrder.code} - ${workOrder.title}`,
          createdBy: userProfile.uid,
          createdByName: userProfile.displayName,
          createdAt: new Date().toISOString(),
        });
      });

      // Record to history
      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Xuất dùng vật tư',
        details: `Đã xuất ${qty} ${selectedItem.unit} "${selectedItem.name}"`,
        timestamp: new Date().toISOString(),
      });

      onSuccess(`Đã xuất ${qty} ${selectedItem.unit} "${selectedItem.name}" vào công việc`);
      setIsAdding(false);
      setQty(1);
      onMaterialsChanged?.();
      triggerPushNotification('material_added', workOrder.id, {
        actorName: userProfile.displayName,
        materialName: selectedItem.name,
        changes: `đã xuất ${qty} ${selectedItem.unit} vật tư "${selectedItem.name}"`,
      });
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Lỗi khi xuất vật tư';
      onError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Refund Material with Atomic runTransaction (Admin Only)
  const handleRefundMaterial = async () => {
    if (!refundingMaterial || !userProfile) return;

    try {
      setIsRefunding(true);

      await runTransaction(db, async (transaction) => {
        const itemDocRef = doc(db, 'inventoryItems', refundingMaterial.itemId);
        const itemSnap = await transaction.get(itemDocRef);

        if (itemSnap.exists()) {
          const currentItemData = itemSnap.data() as InventoryItem;
          const currentQty = Number(currentItemData.qty) || 0;
          const newQty = currentQty + Number(refundingMaterial.qty);

          // 1. Return quantity back to inventory
          transaction.update(itemDocRef, {
            qty: newQty,
          });

          // 2. Add refund transaction (type: in)
          const transRef = doc(collection(db, 'inventoryTransactions'));
          transaction.set(transRef, {
            itemId: refundingMaterial.itemId,
            itemName: refundingMaterial.itemName || currentItemData.name,
            type: 'in',
            qty: Number(refundingMaterial.qty),
            unitCost: refundingMaterial.unitCost || 0,
            workOrderId: workOrder.id,
            workOrderCode: workOrder.code,
            note: `Hoàn trả kho từ công việc ${workOrder.code}`,
            createdBy: userProfile.uid,
            createdByName: userProfile.displayName,
            createdAt: new Date().toISOString(),
          });
        }

        // 3. Delete workOrderMaterials doc
        const matDocRef = doc(db, 'workOrderMaterials', refundingMaterial.id);
        transaction.delete(matDocRef);
      });

      // Record history
      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Hoàn trả vật tư',
        details: `Đã hoàn lại kho ${refundingMaterial.qty} ${refundingMaterial.unit || ''} "${refundingMaterial.itemName}"`,
        timestamp: new Date().toISOString(),
      });

      onSuccess(`Đã hoàn trả ${refundingMaterial.qty} ${refundingMaterial.unit || ''} vào kho`);
      setRefundingMaterial(null);
      onMaterialsChanged?.();
    } catch (err: unknown) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Lỗi khi hoàn trả vật tư';
      onError(msg);
    } finally {
      setIsRefunding(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header & Add Button */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
            <Package className="w-4 h-4 text-blue-600" />
            <span>Vật tư & Linh kiện đã xuất dùng ({materials.length})</span>
          </h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Hệ thống tự động trừ kho và lưu vết đơn giá tại thời điểm xuất
          </p>
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={() => setIsAdding(!isAdding)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Xuất thêm vật tư</span>
          </button>
        )}
      </div>

      {/* Add Material Inline Form */}
      {canEdit && isAdding && (
        <form
          onSubmit={handleAddMaterial}
          className="p-4 bg-blue-50/70 border border-blue-200 rounded-2xl space-y-3 animate-in fade-in"
        >
          <div className="font-bold text-xs text-blue-900 flex items-center gap-1.5">
            <TrendingDown className="w-4 h-4 text-blue-600" />
            <span>Chọn vật tư từ kho xuất cho công việc này</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Vật tư trong kho *
              </label>
              <select
                required
                value={selectedItemId}
                onChange={(e) => setSelectedItemId(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-blue-200 text-xs font-semibold bg-white focus:ring-2 focus:ring-blue-500"
              >
                {activeItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    [{item.sku}] {item.name} (Tồn: {item.qty} {item.unit})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Số lượng cần dùng *
              </label>
              <input
                type="number"
                inputMode="numeric"
                pattern="[0-9]*"
                required
                min="1"
                max={selectedItem?.qty || 9999}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-blue-200 text-xs font-mono font-bold bg-white focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {selectedItem && (
            <div className="flex items-center justify-between text-xs text-slate-600 bg-white/70 p-2.5 rounded-xl border border-blue-100">
              <span>
                Đơn giá: <strong className="font-mono">{formatCurrency(selectedItem.unitCost)}</strong> / {selectedItem.unit}
              </span>
              <span>
                Thành tiền: <strong className="text-blue-700 font-mono font-bold">{formatCurrency((Number(qty) || 0) * (selectedItem.unitCost || 0))}</strong>
              </span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="min-h-[44px] px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold active:scale-95 touch-manipulation"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedItem || selectedItem.qty <= 0}
              className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 active:scale-95 touch-manipulation"
            >
              {isSubmitting ? 'Đang trừ kho...' : 'Xác nhận xuất vật tư'}
            </button>
          </div>
        </form>
      )}

      {/* Materials List */}
      <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-xs">
        {/* Desktop Table View */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-4">Tên vật tư</th>
                <th className="py-2.5 px-3 text-center">Số lượng</th>
                <th className="py-2.5 px-3 text-right">Đơn giá</th>
                <th className="py-2.5 px-4 text-right">Thành tiền</th>
                {canRefund && <th className="py-2.5 px-3 text-center">Hoàn kho</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {materials.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/50">
                  <td className="py-3 px-4 font-semibold text-slate-900">
                    {m.itemName}
                    <div className="text-[10px] text-slate-400 font-normal">
                      Xuất bởi: {m.createdByName || 'Kỹ thuật viên'} • {formatDate(m.createdAt)}
                    </div>
                  </td>

                  <td className="py-3 px-3 text-center font-mono font-bold text-slate-800">
                    {m.qty} {m.unit || ''}
                  </td>

                  <td className="py-3 px-3 text-right font-mono text-slate-600">
                    {formatCurrency(m.unitCost)}
                  </td>

                  <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                    {formatCurrency(m.qty * (m.unitCost || 0))}
                  </td>

                  {canRefund && (
                    <td className="py-3 px-3 text-center">
                      <button
                        onClick={() => setRefundingMaterial(m)}
                        title="Hoàn trả vật tư này về lại kho"
                        className="min-w-[36px] min-h-[36px] inline-flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors active:scale-95"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards View */}
        <div className="sm:hidden divide-y divide-slate-100">
          {materials.map((m) => (
            <div key={m.id} className="p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h5 className="font-bold text-slate-900 text-xs">{m.itemName}</h5>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {m.createdByName || 'KTV'} • {formatDate(m.createdAt)}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-xs font-mono font-bold text-slate-900">
                    {m.qty} {m.unit || ''}
                  </div>
                  <div className="text-[10px] font-mono text-slate-500">
                    x {formatCurrency(m.unitCost)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-slate-600">
                  Thành tiền: <strong className="font-mono text-slate-900 font-bold">{formatCurrency(m.qty * (m.unitCost || 0))}</strong>
                </span>

                {canRefund && (
                  <button
                    onClick={() => setRefundingMaterial(m)}
                    className="min-h-[44px] px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl inline-flex items-center gap-1 active:scale-95 touch-manipulation"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Hoàn kho</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {materials.length === 0 && !isLoading && (
          <div className="p-6 text-center text-xs text-slate-400">
            Chưa có vật tư nào được xuất dùng cho công việc này.
          </div>
        )}

        {materials.length > 0 && (
          <div className="bg-slate-50 px-4 py-2.5 border-t border-slate-200 flex items-center justify-between text-xs font-bold text-slate-800">
            <span>Tổng chi phí vật tư:</span>
            <span className="font-mono text-blue-700 text-sm">{formatCurrency(totalCost)}</span>
          </div>
        )}
      </div>

      {/* Confirm Refund Modal (Admin only) */}
      <ConfirmDialog
        isOpen={Boolean(refundingMaterial)}
        title="Hoàn trả vật tư về kho?"
        message={`Bạn có chắc muốn hoàn trả ${refundingMaterial?.qty} ${refundingMaterial?.unit || ''} "${refundingMaterial?.itemName}" về lại kho? Số lượng sẽ được cộng hoàn vào kho và ghi nhận lịch sử.`}
        confirmText="Xác nhận hoàn kho"
        isDestructive={false}
        isLoading={isRefunding}
        onConfirm={handleRefundMaterial}
        onCancel={() => setRefundingMaterial(null)}
      />
    </div>
  );
};
