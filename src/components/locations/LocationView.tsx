import React, { useState } from 'react';
import { MapPin, Plus, Edit, Trash2, X, Cpu, CheckSquare } from 'lucide-react';
import { LocationItem, EquipmentItem, WorkOrder } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { collection, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';

interface LocationViewProps {
  locations: LocationItem[];
  equipmentList: EquipmentItem[];
  workOrders: WorkOrder[];
  onError: (msg: string) => void;
  onSuccessToast: (msg: string) => void;
}

export const LocationView: React.FC<LocationViewProps> = ({
  locations,
  equipmentList,
  workOrders,
  onError,
  onSuccessToast,
}) => {
  const { isAdmin } = useAuth();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<LocationItem | null>(null);
  const [deletingLoc, setDeletingLoc] = useState<LocationItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const openAdd = () => {
    setName('');
    setDescription('');
    setIsAddModalOpen(true);
  };

  const openEdit = (loc: LocationItem) => {
    setEditingLoc(loc);
    setName(loc.name);
    setDescription(loc.description || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      onError('Vui lòng nhập tên vị trí');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingLoc) {
        await updateDoc(doc(db, 'locations', editingLoc.id), {
          name: name.trim(),
          description: description.trim(),
        });
        onSuccessToast(`Đã cập nhật vị trí "${name}"`);
        setEditingLoc(null);
      } else {
        await addDoc(collection(db, 'locations'), {
          name: name.trim(),
          description: description.trim(),
          createdAt: new Date().toISOString(),
        });
        onSuccessToast(`Đã thêm vị trí "${name}"`);
        setIsAddModalOpen(false);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'locations');
      onError('Không thể lưu vị trí');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAttemptDelete = (loc: LocationItem) => {
    const hasEquipment = equipmentList.some((e) => e.locationId === loc.id);
    const hasWorkOrders = workOrders.some((w) => w.locationId === loc.id);
    if (hasEquipment || hasWorkOrders) {
      const eqCount = equipmentList.filter((e) => e.locationId === loc.id).length;
      const woCount = workOrders.filter((w) => w.locationId === loc.id).length;
      onError(`Khu vực "${loc.name}" đang có ${eqCount} thiết bị và ${woCount} công việc liên kết! Không thể xóa để bảo đảm toàn vẹn dữ liệu.`);
      return;
    }
    setDeletingLoc(loc);
  };

  const handleDelete = async () => {
    if (!deletingLoc) return;
    try {
      setIsSubmitting(true);
      await deleteDoc(doc(db, 'locations', deletingLoc.id));
      onSuccessToast(`Đã xóa vị trí "${deletingLoc.name}"`);
      setDeletingLoc(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `locations/${deletingLoc.id}`);
      onError('Không thể xóa vị trí');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Sơ đồ vị trí & Khu vực</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {locations.length} khu vực
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Quản lý các tầng tòa nhà, phòng kỹ thuật, xưởng sản xuất và khu vực chức năng
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openAdd}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all touch-manipulation"
          >
            <Plus className="w-5 h-5" />
            <span>Thêm vị trí mới</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {locations.map((loc) => {
          const locEquipment = equipmentList.filter((e) => e.locationId === loc.id);
          const locWorkOrders = workOrders.filter((w) => w.locationId === loc.id);

          return (
            <div
              key={loc.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-blue-300 shadow-xs transition-all relative flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <MapPin className="w-5 h-5" />
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEdit(loc)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Sửa vị trí"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleAttemptDelete(loc)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Xóa vị trí"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <h3 className="font-bold text-slate-900 text-base mb-1">{loc.name}</h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">
                  {loc.description || 'Chưa có thông tin mô tả chi tiết'}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-100 text-xs text-slate-600">
                <div className="flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl">
                  <Cpu className="w-4 h-4 text-blue-500" />
                  <span>
                    <strong>{locEquipment.length}</strong> thiết bị
                  </span>
                </div>
                <div className="flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl">
                  <CheckSquare className="w-4 h-4 text-indigo-500" />
                  <span>
                    <strong>{locWorkOrders.length}</strong> công việc
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add / Edit modal */}
      {(isAddModalOpen || editingLoc) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingLoc ? 'Sửa thông tin vị trí' : 'Thêm vị trí mới'}
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingLoc(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  Tên vị trí / Khu vực *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="VD: Tầng 3 - Phòng Họp Lớn"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Mô tả</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ghi chú vị trí lối vào, hộp kỹ thuật..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingLoc(null);
                  }}
                  className="px-4 py-2 bg-slate-100 rounded-xl text-xs font-semibold text-slate-700"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang lưu...' : 'Lưu vị trí'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletingLoc)}
        title="Xóa vị trí này?"
        message={`Bạn có chắc muốn xóa vị trí "${deletingLoc?.name}"? Các thiết bị hoặc công việc đang gắn với vị trí này sẽ cần cập nhật lại.`}
        confirmText="Xác nhận xóa"
        isLoading={isSubmitting}
        onConfirm={handleDelete}
        onCancel={() => setDeletingLoc(null)}
      />
    </div>
  );
};
