import React, { useState, useMemo, useEffect } from 'react';
import {
  Cpu,
  Plus,
  Search,
  Filter,
  Edit,
  Trash2,
  Calendar,
  MapPin,
  Clock,
  Wrench,
  X,
  FileText,
  AlertCircle,
  CalendarCheck,
  CheckCircle2,
  Image as ImageIcon,
  CheckSquare,
} from 'lucide-react';
import {
  EquipmentItem,
  EquipmentStatus,
  LocationItem,
  WorkOrder,
  MaintenanceLog,
  WorkOrderPhoto,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { EquipmentStatusBadge, PriorityBadge, StatusBadge } from '../common/Badge';
import { formatDateOnly, formatDate, normalizeVietnamese } from '../../utils/formatters';
import { ConfirmDialog } from '../common/ConfirmDialog';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  onSnapshot,
  getDocs,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../../services/firebase';

interface EquipmentViewProps {
  equipmentList: EquipmentItem[];
  locations: LocationItem[];
  workOrders: WorkOrder[];
  onSelectWorkOrder: (wo: WorkOrder) => void;
  onError: (msg: string) => void;
  onSuccessToast: (msg: string) => void;
}

export const EquipmentView: React.FC<EquipmentViewProps> = ({
  equipmentList,
  locations,
  workOrders,
  onSelectWorkOrder,
  onError,
  onSuccessToast,
}) => {
  const { isAdmin } = useAuth();

  // Search & filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EquipmentItem | null>(null);
  const [detailItem, setDetailItem] = useState<EquipmentItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<EquipmentItem | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Maintenance tab in detail modal
  const [detailTab, setDetailTab] = useState<'workorders' | 'maintenance'>('workorders');
  const [maintenanceHistoryLogs, setMaintenanceHistoryLogs] = useState<MaintenanceLog[]>([]);
  const [maintenancePhotos, setMaintenancePhotos] = useState<Record<string, WorkOrderPhoto[]>>({});
  const [selectedEnlargedPhoto, setSelectedEnlargedPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!detailItem) {
      setMaintenanceHistoryLogs([]);
      setMaintenancePhotos({});
      setDetailTab('workorders');
      return;
    }

    const q = query(
      collection(db, 'maintenanceLogs'),
      where('equipmentId', '==', detailItem.id)
    );
    const unsub = onSnapshot(
      q,
      async (snap) => {
        const logs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MaintenanceLog));
        logs.sort((a, b) => new Date(b.doneAt).getTime() - new Date(a.doneAt).getTime());
        setMaintenanceHistoryLogs(logs);

        const orderIds = Array.from(new Set(logs.map((l) => l.workOrderId).filter(Boolean)));
        if (orderIds.length > 0) {
          const pMap: Record<string, WorkOrderPhoto[]> = {};
          for (const woId of orderIds.slice(0, 10)) {
            try {
              const pSnap = await getDocs(
                query(collection(db, 'workOrderPhotos'), where('workOrderId', '==', woId))
              );
              pMap[woId] = pSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrderPhoto));
            } catch (err) {
              console.error(err);
            }
          }
          setMaintenancePhotos(pMap);
        }
      },
      (err) => {
        if (auth.currentUser) {
          handleFirestoreError(err, OperationType.GET, 'maintenanceLogs');
        }
      }
    );

    return () => unsub();
  }, [detailItem?.id]);

  // Form states
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: 'Hệ thống Điện',
    locationId: locations[0]?.id || '',
    status: 'active' as EquipmentStatus,
    purchaseDate: '',
    notes: '',
  });

  const categories = useMemo(() => {
    const set = new Set<string>();
    equipmentList.forEach((e) => {
      if (e.category) set.add(e.category);
    });
    return Array.from(set);
  }, [equipmentList]);

  const locationMap = useMemo(() => {
    const map = new Map<string, LocationItem>();
    locations.forEach((l) => map.set(l.id, l));
    return map;
  }, [locations]);

  const filteredEquipment = useMemo(() => {
    return equipmentList.filter((eq) => {
      if (statusFilter !== 'all' && eq.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && eq.category !== categoryFilter) return false;
      if (locationFilter !== 'all' && eq.locationId !== locationFilter) return false;

      if (searchTerm.trim()) {
        const qNorm = normalizeVietnamese(searchTerm);
        const codeMatch = normalizeVietnamese(eq.code).includes(qNorm);
        const nameMatch = normalizeVietnamese(eq.name).includes(qNorm);
        const notesMatch = eq.notes ? normalizeVietnamese(eq.notes).includes(qNorm) : false;
        return codeMatch || nameMatch || notesMatch;
      }
      return true;
    });
  }, [equipmentList, statusFilter, categoryFilter, locationFilter, searchTerm]);

  // Pagination for equipment
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, categoryFilter, locationFilter]);

  const totalPages = Math.ceil(filteredEquipment.length / pageSize) || 1;
  const paginatedEquipment = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredEquipment.slice(start, start + pageSize);
  }, [filteredEquipment, currentPage]);

  const openAddModal = () => {
    setFormData({
      code: `TB-${Math.floor(100 + Math.random() * 900)}`,
      name: '',
      category: categories[0] || 'Hệ thống Điện',
      locationId: locations[0]?.id || '',
      status: 'active',
      purchaseDate: '',
      notes: '',
    });
    setIsAddModalOpen(true);
  };

  const openEditModal = (eq: EquipmentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingItem(eq);
    setFormData({
      code: eq.code,
      name: eq.name,
      category: eq.category,
      locationId: eq.locationId,
      status: eq.status,
      purchaseDate: eq.purchaseDate || '',
      notes: eq.notes || '',
    });
  };

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) {
      onError('Vui lòng nhập tên và mã thiết bị');
      return;
    }

    try {
      setIsSubmitting(true);
      const payload: Record<string, any> = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        category: formData.category,
        locationId: formData.locationId,
        status: formData.status,
        createdAt: new Date().toISOString(),
      };
      if (formData.purchaseDate) payload.purchaseDate = formData.purchaseDate;
      if (formData.notes.trim()) payload.notes = formData.notes.trim();

      if (editingItem) {
        await updateDoc(doc(db, 'equipment', editingItem.id), payload);
        onSuccessToast(`Đã cập nhật thiết bị ${payload.code}`);
        setEditingItem(null);
      } else {
        await addDoc(collection(db, 'equipment'), payload);
        onSuccessToast(`Đã thêm thiết bị ${payload.code}`);
        setIsAddModalOpen(false);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'equipment');
      onError('Không thể lưu thiết bị');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAttemptDelete = (eq: EquipmentItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const hasOrders = workOrders.some((w) => w.equipmentId === eq.id);
    if (hasOrders) {
      const count = workOrders.filter((w) => w.equipmentId === eq.id).length;
      onError(`Thiết bị ${eq.code} (${eq.name}) đang có ${count} phiếu công việc kỹ thuật liên kết! Không thể xóa để giữ toàn vẹn lịch sử bảo trì. Bạn có thể đổi trạng thái sang "Hỏng" hoặc "Ngừng sử dụng".`);
      return;
    }
    setDeletingItem(eq);
  };

  const handleDeleteEquipment = async () => {
    if (!deletingItem) return;
    try {
      setIsSubmitting(true);
      await deleteDoc(doc(db, 'equipment', deletingItem.id));
      onSuccessToast(`Đã xóa thiết bị ${deletingItem.code}`);
      setDeletingItem(null);
      if (detailItem?.id === deletingItem.id) setDetailItem(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `equipment/${deletingItem.id}`);
      onError('Không thể xóa thiết bị');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Find work orders for detail modal
  const equipmentWorkOrders = useMemo(() => {
    if (!detailItem) return [];
    return workOrders.filter((wo) => wo.equipmentId === detailItem.id);
  }, [detailItem, workOrders]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Danh mục thiết bị & Tài sản</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {filteredEquipment.length} thiết bị
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Quản lý thông số máy móc, điều hòa, PCCC, điện và theo dõi lịch sử bảo trì
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={openAddModal}
            className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all touch-manipulation"
          >
            <Plus className="w-5 h-5" />
            <span>Thêm thiết bị mới</span>
          </button>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên thiết bị, mã hiệu, ghi chú..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-100">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Trạng thái thiết bị
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="active">Hoạt động tốt</option>
              <option value="maintenance">Đang bảo dưỡng</option>
              <option value="broken">Hỏng hóc</option>
              <option value="retired">Ngừng sử dụng</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Phân loại hệ thống
            </label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tất cả phân loại</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Vị trí lắp đặt
            </label>
            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tất cả vị trí</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Equipment Cards Grid & Empty State */}
      {filteredEquipment.length === 0 ? (
        <div className="p-8 sm:p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-xs">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <Cpu className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Không tìm thấy thiết bị nào</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {searchTerm || statusFilter !== 'all' || categoryFilter !== 'all' || locationFilter !== 'all'
              ? 'Thử thay đổi từ khóa tìm kiếm hoặc đặt lại các bộ lọc danh mục và vị trí.'
              : 'Chưa có thiết bị nào trong danh mục. Hãy thêm thiết bị đầu tiên để bắt đầu theo dõi.'}
          </p>
          {isAdmin && (
            <div className="mt-5">
              <button
                onClick={openAddModal}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm inline-flex items-center gap-1.5 active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm thiết bị mới</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {paginatedEquipment.map((eq) => {
              const loc = locationMap.get(eq.locationId);
              const relatedOrders = workOrders.filter((w) => w.equipmentId === eq.id);

              return (
                <div
                  key={eq.id}
                  onClick={() => setDetailItem(eq)}
                  className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer relative"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                      {eq.code}
                    </span>
                    <EquipmentStatusBadge status={eq.status} />
                  </div>

                  <h3 className="font-bold text-slate-900 text-base leading-snug mb-1 break-words">
                    {eq.name}
                  </h3>

                  <div className="text-xs text-blue-600 font-medium mb-3">
                    {eq.category}
                  </div>

                  <div className="space-y-1.5 text-xs text-slate-600 mb-3 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{loc?.name || 'Chưa gán vị trí'}</span>
                    </div>
                    {eq.purchaseDate && (
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>Lắp đặt: {formatDateOnly(eq.purchaseDate)}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <span className="text-slate-500 flex items-center gap-1">
                      <Wrench className="w-3.5 h-3.5 text-slate-400" />
                      <span>{relatedOrders.length} sự cố / bảo trì</span>
                    </span>

                    {isAdmin && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => openEditModal(eq, e)}
                          className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                          title="Sửa thiết bị"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleAttemptDelete(eq, e)}
                          className="p-1.5 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                          title="Xóa thiết bị"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination Controls for Large Equipment Lists (1.000+ items) */}
          {filteredEquipment.length > pageSize && (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 sm:px-5 rounded-2xl border border-slate-200 text-xs shadow-2xs">
              <span className="text-slate-500">
                Hiển thị <strong className="text-slate-800">{(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredEquipment.length)}</strong> trong tổng số <strong className="text-slate-800">{filteredEquipment.length}</strong> thiết bị
              </span>

              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                >
                  ← Trước
                </button>
                <span className="px-3 py-1.5 font-bold text-slate-700">
                  Trang {currentPage} / {totalPages}
                </span>
                <button
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors"
                >
                  Sau →
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Equipment Detail Modal with Work Order History */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 my-8 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                  {detailItem.code}
                </span>
                <h2 className="text-lg font-bold text-slate-900 mt-1">{detailItem.name}</h2>
              </div>
              <button
                onClick={() => setDetailItem(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              {/* Specs */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block mb-1">Trạng thái</span>
                  <EquipmentStatusBadge status={detailItem.status} />
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Phân loại</span>
                  <span className="font-semibold text-slate-800">{detailItem.category}</span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Vị trí</span>
                  <span className="font-semibold text-slate-800">
                    {locationMap.get(detailItem.locationId)?.name || 'Chưa gán'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block mb-1">Ngày lắp đặt</span>
                  <span className="font-semibold text-slate-800">
                    {formatDateOnly(detailItem.purchaseDate)}
                  </span>
                </div>
              </div>

              {detailItem.notes && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Ghi chú kỹ thuật & Bảo trì
                  </h4>
                  <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    {detailItem.notes}
                  </p>
                </div>
              )}

              {/* Tab navigation */}
              <div className="flex border-b border-slate-200 text-xs font-bold">
                <button
                  onClick={() => setDetailTab('workorders')}
                  className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                    detailTab === 'workorders'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                  <span>Sự cố & Công việc ({equipmentWorkOrders.length})</span>
                </button>
                <button
                  onClick={() => setDetailTab('maintenance')}
                  className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                    detailTab === 'maintenance'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  <CalendarCheck className="w-4 h-4" />
                  <span>Lịch sử bảo dưỡng ({maintenanceHistoryLogs.length})</span>
                </button>
              </div>

              {detailTab === 'workorders' && (
                <div>
                  {equipmentWorkOrders.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                      Chưa có lịch sử công việc nào cho thiết bị này
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {equipmentWorkOrders.map((wo) => (
                        <div
                          key={wo.id}
                          onClick={() => {
                            setDetailItem(null);
                            onSelectWorkOrder(wo);
                          }}
                          className="p-3 rounded-xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-bold text-blue-700">{wo.code}</span>
                              <StatusBadge status={wo.status} />
                              <PriorityBadge priority={wo.priority} />
                            </div>
                            <div className="font-medium text-slate-800">{wo.title}</div>
                          </div>
                          <span className="text-[11px] text-slate-400">{formatDateOnly(wo.createdAt)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {detailTab === 'maintenance' && (
                <div className="space-y-4">
                  {maintenanceHistoryLogs.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                      Chưa có nhật ký bảo dưỡng định kỳ nào cho thiết bị này.
                    </div>
                  ) : (
                    maintenanceHistoryLogs.map((log) => {
                      const logPhotos = maintenancePhotos[log.workOrderId] || [];
                      const beforePhotos = logPhotos.filter((p) => p.kind === 'before');
                      const afterPhotos = logPhotos.filter((p) => p.kind === 'after');

                      return (
                        <div
                          key={log.id}
                          className="p-4 rounded-2xl border border-slate-200 bg-white shadow-2xs space-y-3 text-xs"
                        >
                          {/* Log Header */}
                          <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                            <div>
                              <div className="font-bold text-slate-900 text-sm">
                                {log.planTitle || 'Bảo dưỡng định kỳ'}
                              </div>
                              <div className="text-slate-400 text-[11px] mt-0.5 flex items-center gap-2">
                                <span>Phiếu: {log.workOrderCode || log.workOrderId}</span>
                                <span>•</span>
                                <span>Thực hiện: {formatDate(log.doneAt)}</span>
                                {log.doneByName && (
                                  <>
                                    <span>•</span>
                                    <span>KTV: {log.doneByName}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <span
                              className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                                log.result === 'dat'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-amber-100 text-amber-800 border border-amber-200'
                              }`}
                            >
                              {log.result === 'dat' ? 'Đạt tiêu chuẩn' : 'Cần theo dõi'}
                            </span>
                          </div>

                          {/* Checklist Summary */}
                          {log.checklistResult && log.checklistResult.length > 0 && (
                            <div>
                              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                                <span>Hạng mục kiểm tra ({log.checklistResult.filter((c) => c.done).length}/{log.checklistResult.length})</span>
                              </div>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                                {log.checklistResult.map((chk, cIdx) => (
                                  <div key={cIdx} className="flex items-start gap-1.5 text-[11px]">
                                    <CheckCircle2
                                      className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                                        chk.done ? 'text-emerald-600' : 'text-slate-300'
                                      }`}
                                    />
                                    <div>
                                      <span className={chk.done ? 'text-slate-700' : 'text-slate-400'}>
                                        {chk.text}
                                      </span>
                                      {chk.note && (
                                        <span className="block text-[10px] text-amber-700 italic">
                                          Ghi chú: {chk.note}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Before & After Photos */}
                          <div>
                            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1">
                              <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                              <span>Hình ảnh ghi nhận hiện trường</span>
                            </div>

                            {logPhotos.length === 0 ? (
                              <div className="text-[11px] text-slate-400 italic">
                                Chưa tải ảnh hoặc không có ảnh đính kèm
                              </div>
                            ) : (
                              <div className="grid grid-cols-2 gap-3">
                                {/* Before Photos */}
                                <div className="space-y-1">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">
                                    Ảnh trước bảo dưỡng ({beforePhotos.length})
                                  </span>
                                  {beforePhotos.length === 0 ? (
                                    <div className="h-16 bg-slate-50 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-400">
                                      Không có ảnh
                                    </div>
                                  ) : (
                                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                                      {beforePhotos.map((p) => (
                                        <img
                                          key={p.id}
                                          src={p.dataUrl}
                                          alt="Ảnh trước"
                                          onClick={() => setSelectedEnlargedPhoto(p.dataUrl)}
                                          className="w-20 h-16 object-cover rounded-xl border border-slate-200 cursor-pointer hover:opacity-85 transition-opacity"
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* After Photos */}
                                <div className="space-y-1">
                                  <span className="text-[10px] font-bold text-emerald-600 uppercase">
                                    Ảnh sau hoàn thành ({afterPhotos.length})
                                  </span>
                                  {afterPhotos.length === 0 ? (
                                    <div className="h-16 bg-slate-50 rounded-xl border border-dashed border-slate-200 flex items-center justify-center text-[10px] text-slate-400">
                                      Không có ảnh
                                    </div>
                                  ) : (
                                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                                      {afterPhotos.map((p) => (
                                        <img
                                          key={p.id}
                                          src={p.dataUrl}
                                          alt="Ảnh sau"
                                          onClick={() => setSelectedEnlargedPhoto(p.dataUrl)}
                                          className="w-20 h-16 object-cover rounded-xl border border-emerald-300 ring-1 ring-emerald-400 cursor-pointer hover:opacity-85 transition-opacity"
                                        />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setDetailItem(null)}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      {(isAddModalOpen || editingItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editingItem ? 'Sửa thông tin thiết bị' : 'Thêm thiết bị mới'}
              </h3>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingItem(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEquipment} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Mã hiệu thiết bị *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Trạng thái *
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) =>
                      setFormData({ ...formData, status: e.target.value as EquipmentStatus })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  >
                    <option value="active">Hoạt động tốt</option>
                    <option value="maintenance">Đang bảo dưỡng</option>
                    <option value="broken">Hỏng hóc</option>
                    <option value="retired">Ngừng sử dụng</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  Tên thiết bị *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="VD: Máy biến áp Schneider 400kVA"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Phân loại hệ thống *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder="VD: Hệ thống HVAC, Điện..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    Vị trí lắp đặt *
                  </label>
                  <select
                    required
                    value={formData.locationId}
                    onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  >
                    {locations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  Ngày đưa vào sử dụng
                </label>
                <input
                  type="date"
                  value={formData.purchaseDate}
                  onChange={(e) => setFormData({ ...formData, purchaseDate: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  Ghi chú thông số & hướng dẫn
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Công suất, chu kỳ thay thế lọc, đại lý bảo trì..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>

              <div className="pt-3 border-t flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingItem(null);
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
                  {isSubmitting ? 'Đang lưu...' : 'Lưu thiết bị'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Enlarged Photo Modal */}
      {selectedEnlargedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setSelectedEnlargedPhoto(null)}
        >
          <div className="relative max-w-2xl w-full bg-slate-900 rounded-2xl overflow-hidden p-2">
            <button
              onClick={() => setSelectedEnlargedPhoto(null)}
              className="absolute top-4 right-4 p-2 bg-black/60 hover:bg-black/80 text-white rounded-full z-10"
            >
              <X className="w-5 h-5" />
            </button>
            <img
              src={selectedEnlargedPhoto}
              alt="Ảnh phóng to"
              className="w-full max-h-[80vh] object-contain rounded-xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
