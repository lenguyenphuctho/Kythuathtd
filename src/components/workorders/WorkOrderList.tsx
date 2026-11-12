import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Plus,
  Wrench,
  FileText,
  User,
  SlidersHorizontal,
  X,
  RefreshCw,
  FolderOpen,
  Bell,
  Share2,
  FileCheck2,
  XCircle,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderPriority,
  WorkOrderSource,
  LocationItem,
  EquipmentItem,
  UserProfile,
  AllowedUser,
  InventoryItem,
  getWorkOrderOrigin,
  isWorkOrderAssignedTo,
  getWorkOrderAssigneeDisplay,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { WorkOrderCard } from './WorkOrderCard';
import { CreateWorkOrderModal } from './CreateWorkOrderModal';
import { WorkOrderDetailModal } from './WorkOrderDetailModal';
import { ZaloShareModal } from './ZaloShareModal';
import { AdminQuickAssignModal } from './AdminQuickAssignModal';
import { normalizeVietnamese } from '../../utils/formatters';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { triggerPushNotification } from '../../services/pushNotificationService';

interface WorkOrderListProps {
  workOrders: WorkOrder[];
  locations: LocationItem[];
  equipmentList: EquipmentItem[];
  technicians: UserProfile[];
  allowedUsers?: AllowedUser[];
  inventoryItems?: InventoryItem[];
  initialStatusFilter?: string;
  isLoading: boolean;
  onRefresh: () => void;
  onError: (msg: string) => void;
  onSuccessToast: (msg: string) => void;
}

export const WorkOrderList: React.FC<WorkOrderListProps> = ({
  workOrders,
  locations,
  equipmentList,
  technicians,
  allowedUsers = [],
  inventoryItems = [],
  initialStatusFilter,
  isLoading,
  onRefresh,
  onError,
  onSuccessToast,
}) => {
  const { userProfile, isAdmin, isTechnician, isRequester, isViewer, userLocationIds } = useAuth();

  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>(
    initialStatusFilter === 'unacknowledged' ? 'all' : (initialStatusFilter || 'all')
  );
  const [ackFilter, setAckFilter] = useState<string>(
    initialStatusFilter === 'unacknowledged' ? 'unacknowledged' : 'all'
  );
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [storeFilter, setStoreFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [showFiltersMobile, setShowFiltersMobile] = useState(false);

  // Sync status filter if navigated with filter from dashboard
  const [activeChip, setActiveChip] = useState<string>(() => initialStatusFilter || 'all');
  const [targetAssignOrder, setTargetAssignOrder] = useState<WorkOrder | null>(null);
  const [isQuickAssignOpen, setIsQuickAssignOpen] = useState(false);
  const [rejectingOrder, setRejectingOrder] = useState<WorkOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [approvingOrderId, setApprovingOrderId] = useState<string | null>(null);

  React.useEffect(() => {
    if (initialStatusFilter) {
      setActiveChip(initialStatusFilter);
      if (initialStatusFilter === 'unacknowledged') {
        setAckFilter('unacknowledged');
        setStatusFilter('all');
      } else if (initialStatusFilter === 'pending' || initialStatusFilter === 'overdue') {
        setStatusFilter('all');
      } else {
        setStatusFilter(initialStatusFilter);
      }
    }
  }, [initialStatusFilter]);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createSource, setCreateSource] = useState<WorkOrderSource>('request');
  const [selectedWorkOrder, setSelectedWorkOrder] = useState<WorkOrder | null>(null);

  // Zalo Notification Modal state
  const [zaloTargetWorkOrder, setZaloTargetWorkOrder] = useState<WorkOrder | null>(null);
  const [zaloModalType, setZaloModalType] = useState<'assign' | 'remind'>('remind');

  // Location map for fast lookup
  const locationMap = useMemo(() => {
    const map = new Map<string, LocationItem>();
    locations.forEach((loc) => map.set(loc.id, loc));
    return map;
  }, [locations]);

  // Equipment map for fast lookup
  const equipmentMap = useMemo(() => {
    const map = new Map<string, EquipmentItem>();
    equipmentList.forEach((eq) => map.set(eq.id, eq));
    return map;
  }, [equipmentList]);

  // Filtered work orders according to user role and active filters
  const filteredWorkOrders = useMemo(() => {
    return workOrders.filter((wo) => {
      // 1. Role-based view constraint: Requesters see their own requests OR requests for their assigned locations
      if (isRequester) {
        const isAuthor = wo.requesterId === userProfile?.uid;
        const isAssignedLoc = Boolean(
          userLocationIds &&
          ((wo.locationId && userLocationIds.includes(wo.locationId)) ||
           (wo.requestingStoreId && userLocationIds.includes(wo.requestingStoreId)))
        );
        if (!isAuthor && !isAssignedLoc) {
          return false;
        }
      }

      // 1b. Mobile Quick Chip Filter & Status shortcuts
      const nowMs = Date.now();
      if ((activeChip === 'pending' || statusFilter === 'pending') && (wo.status === 'Hoàn thành' || wo.status === 'Đã đóng')) {
        return false;
      }
      if (activeChip === 'Mới' && wo.status !== 'Mới') return false;
      if (activeChip === 'unassigned' && (wo.assigneeId || wo.assigneeType === 'team' || (wo.assigneeIds && wo.assigneeIds.length > 0) || wo.status === 'Hoàn thành' || wo.status === 'Đã đóng')) return false;
      if (activeChip === 'unacknowledged' && (!wo.assigneeId || wo.acknowledged !== false || wo.status === 'Hoàn thành' || wo.status === 'Đã đóng')) return false;
      if (activeChip === 'Đang xử lý' && wo.status !== 'Đang xử lý') return false;
      if (activeChip === 'Chờ duyệt' && wo.status !== 'Chờ duyệt') return false;
      if (activeChip === 'Hoàn thành' && wo.status !== 'Hoàn thành') return false;
      if (activeChip === 'self_created' && getWorkOrderOrigin(wo) !== 'KTV tự tạo') return false;
      if (activeChip === 'overdue' || statusFilter === 'overdue') {
        if (!wo.dueDate || wo.status === 'Hoàn thành' || wo.status === 'Đã đóng') return false;
        const dueTime = new Date(wo.dueDate).getTime();
        if (isNaN(dueTime) || dueTime >= nowMs) return false;
      }

      // 2. Status filter
      if (statusFilter !== 'all' && wo.status !== statusFilter) {
        return false;
      }

      // 3. Priority filter
      if (priorityFilter !== 'all' && wo.priority !== priorityFilter) {
        return false;
      }

      // 4. Source / Request Origin filter
      if (sourceFilter !== 'all') {
        const origin = getWorkOrderOrigin(wo);
        if (sourceFilter === 'KTV tự tạo' && origin !== 'KTV tự tạo') return false;
        if (sourceFilter === 'Cửa hàng yêu cầu' && origin !== 'Cửa hàng yêu cầu') return false;
        if (sourceFilter === 'Chưa phân loại' && origin !== 'Chưa phân loại') return false;
        if (sourceFilter === 'self_created' && !wo.selfCreated) return false;
      }

      // 4b. Store filter
      if (storeFilter !== 'all') {
        if (wo.requestingStoreId !== storeFilter && wo.locationId !== storeFilter) {
          return false;
        }
      }

      // 5. Assignee filter
      if (assigneeFilter === 'unassigned') {
        if (wo.assigneeId || wo.assigneeType === 'team' || (wo.assigneeIds && wo.assigneeIds.length > 0)) return false;
      } else if (assigneeFilter === 'my_tasks') {
        if (!isWorkOrderAssignedTo(wo, userProfile?.uid)) return false;
      } else if (assigneeFilter === 'team') {
        if (wo.assigneeType !== 'team') return false;
      } else if (assigneeFilter === 'multiple') {
        if (wo.assigneeType !== 'multiple') return false;
      } else if (assigneeFilter !== 'all') {
        if (!isWorkOrderAssignedTo(wo, assigneeFilter) && wo.assigneeId !== assigneeFilter) return false;
      }

      // 5b. Acknowledgment filter
      if (ackFilter === 'unacknowledged') {
        if (!wo.assigneeId || wo.acknowledged !== false) return false;
      } else if (ackFilter === 'acknowledged') {
        if (!wo.assigneeId || wo.acknowledged === false) return false;
      }

      // 6. Search term filter with Vietnamese diacritics tolerance
      if (searchTerm.trim()) {
        const queryNorm = normalizeVietnamese(searchTerm);
        const codeMatch = normalizeVietnamese(wo.code).includes(queryNorm);
        const titleMatch = normalizeVietnamese(wo.title).includes(queryNorm);
        const descMatch = normalizeVietnamese(wo.description).includes(queryNorm);
        const loc = locationMap.get(wo.locationId);
        const locMatch = loc ? normalizeVietnamese(loc.name).includes(queryNorm) : false;
        const storeMatch = wo.requestingStoreName ? normalizeVietnamese(wo.requestingStoreName).includes(queryNorm) : false;
        const originMatch = normalizeVietnamese(getWorkOrderOrigin(wo)).includes(queryNorm);
        const eq = wo.equipmentId ? equipmentMap.get(wo.equipmentId) : null;
        const eqMatch = eq
          ? normalizeVietnamese(eq.name).includes(queryNorm) || normalizeVietnamese(eq.code).includes(queryNorm)
          : false;

        return codeMatch || titleMatch || descMatch || locMatch || storeMatch || originMatch || eqMatch;
      }

      return true;
    });
  }, [
    workOrders,
    isRequester,
    userProfile?.uid,
    activeChip,
    statusFilter,
    ackFilter,
    priorityFilter,
    sourceFilter,
    storeFilter,
    assigneeFilter,
    searchTerm,
    locationMap,
    equipmentMap,
  ]);

  // Pagination for high performance with 1,000+ work orders
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 12;

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeChip, statusFilter, ackFilter, priorityFilter, sourceFilter, storeFilter, assigneeFilter]);

  const totalPages = Math.ceil(filteredWorkOrders.length / pageSize) || 1;
  const paginatedWorkOrders = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredWorkOrders.slice(start, start + pageSize);
  }, [filteredWorkOrders, currentPage]);

  const openCreateRequest = () => {
    setCreateSource('request');
    setIsCreateModalOpen(true);
  };

  const openCreateInternal = () => {
    setCreateSource('internal');
    setIsCreateModalOpen(true);
  };

  const resetFilters = () => {
    setActiveChip('all');
    setStatusFilter('all');
    setAckFilter('all');
    setPriorityFilter('all');
    setSourceFilter('all');
    setStoreFilter('all');
    setAssigneeFilter('all');
    setSearchTerm('');
  };

  const handleQuickApproveCompleted = async (e: React.MouseEvent, wo: WorkOrder) => {
    e.stopPropagation();
    if (!userProfile) return;
    try {
      setApprovingOrderId(wo.id);
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'workOrders', wo.id), {
        status: 'Hoàn thành',
        completedAt: now,
      });
      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: wo.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Duyệt hoàn thành công việc',
        details: `Quản trị viên ${userProfile.displayName} đã nghiệm thu và duyệt hoàn thành công việc`,
        timestamp: now,
      });
      triggerPushNotification('status_changed', wo.id, {
        actorName: userProfile.displayName,
        newStatus: 'Hoàn thành',
        changes: 'nghiệm thu và duyệt hoàn thành',
      });
      onSuccessToast(`Đã duyệt hoàn thành công việc ${wo.code}`);
      onRefresh();
    } catch (err) {
      console.error(err);
      onError('Không thể duyệt công việc');
    } finally {
      setApprovingOrderId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingOrder || !userProfile) return;
    if (!rejectReason.trim()) {
      onError('Vui lòng nhập lý do từ chối yêu cầu');
      return;
    }

    try {
      setIsRejecting(true);
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'workOrders', rejectingOrder.id), {
        status: 'Đã đóng',
        closedAt: now,
        costNote: `[TỪ CHỐI]: ${rejectReason.trim()}`,
      });

      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: rejectingOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Từ chối yêu cầu',
        details: `Lý do: ${rejectReason.trim()}`,
        timestamp: now,
      });
      triggerPushNotification('status_changed', rejectingOrder.id, {
        actorName: userProfile.displayName,
        newStatus: 'Đã đóng',
        changes: `từ chối yêu cầu: ${rejectReason.trim()}`,
      });

      onSuccessToast(`Đã từ chối yêu cầu ${rejectingOrder.code}`);
      setRejectingOrder(null);
      setRejectReason('');
      onRefresh();
    } catch (err) {
      console.error(err);
      onError('Lỗi khi từ chối yêu cầu');
    } finally {
      setIsRejecting(false);
    }
  };

  const hasActiveFilters =
    statusFilter !== 'all' ||
    ackFilter !== 'all' ||
    priorityFilter !== 'all' ||
    sourceFilter !== 'all' ||
    storeFilter !== 'all' ||
    assigneeFilter !== 'all' ||
    searchTerm !== '';

  return (
    <div className="space-y-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Top Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Danh sách công việc</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {filteredWorkOrders.length} việc
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            {isRequester
              ? 'Theo dõi và quản lý các yêu cầu sửa chữa cơ sở vật chất của bạn'
              : 'Điều phối, thực hiện bảo trì và cập nhật trạng thái sự cố kỹ thuật'}
          </p>
        </div>

        {/* Action Buttons: Big & Touch Friendly */}
        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setTargetAssignOrder(null);
                setIsQuickAssignOpen(true);
              }}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-95 text-white rounded-xl text-sm font-bold shadow-md shadow-amber-500/20 transition-all touch-manipulation cursor-pointer"
              title="Tạo việc nhanh và giao việc ngay cho kỹ thuật viên"
            >
              <Zap className="w-5 h-5 text-amber-200" />
              <span>Tạo việc nhanh</span>
            </button>
          )}

          {!isViewer && (
            <button
              type="button"
              onClick={openCreateRequest}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all touch-manipulation"
            >
              <Plus className="w-5 h-5" />
              <span>Gửi yêu cầu sửa chữa</span>
            </button>
          )}

          {(isAdmin || isTechnician) && (
            <button
              type="button"
              onClick={openCreateInternal}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white rounded-xl text-sm font-bold shadow-sm active:scale-95 transition-all touch-manipulation"
            >
              <Wrench className="w-4 h-4 text-blue-400" />
              <span>Tạo việc nội bộ</span>
            </button>
          )}

          <button
            onClick={onRefresh}
            title="Tải lại dữ liệu"
            className="p-3 text-slate-600 bg-white hover:bg-slate-100 rounded-xl border border-slate-200 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo mã CV, tên sự cố, thiết bị, vị trí..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <button
            onClick={() => setShowFiltersMobile(!showFiltersMobile)}
            className={`sm:hidden p-2.5 rounded-xl border transition-colors flex items-center gap-1.5 text-xs font-semibold ${
              hasActiveFilters
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Bộ lọc</span>
          </button>
        </div>

        {/* Requirement 4: Mobile / Quick Filter Chips (Mới, Chưa giao, Chưa nhận, Đang xử lý, Chờ duyệt, Quá hạn, Hoàn thành, KTV tự tạo) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 text-xs">
          {[
            { id: 'all', label: 'Tất cả' },
            { id: 'pending', label: 'Chưa xong' },
            { id: 'Mới', label: 'Mới' },
            { id: 'unassigned', label: 'Chưa giao' },
            { id: 'unacknowledged', label: 'Chưa nhận' },
            { id: 'Đang xử lý', label: 'Đang xử lý' },
            { id: 'Chờ duyệt', label: 'Chờ duyệt' },
            { id: 'self_created', label: 'KTV tự tạo' },
            { id: 'overdue', label: 'Quá hạn' },
            { id: 'Hoàn thành', label: 'Hoàn thành' },
          ].map((chip) => {
            const isSelected = activeChip === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setActiveChip(chip.id);
                  setStatusFilter(chip.id === 'pending' || chip.id === 'overdue' ? 'all' : 'all');
                  setAckFilter('all');
                  setAssigneeFilter('all');
                }}
                className={`min-h-[40px] px-3.5 py-1.5 rounded-full font-bold whitespace-nowrap transition-all touch-manipulation text-xs ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100/80 text-slate-600 hover:bg-slate-200/70 border border-slate-200/60'
                }`}
              >
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* Filter Dropdowns (Visible on desktop or when toggled on mobile) */}
        <div
          className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-2 border-t border-slate-100 ${
            showFiltersMobile ? 'block' : 'hidden sm:grid'
          }`}
        >
          {/* Status filter */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Trạng thái
            </label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                if (e.target.value === 'pending' || e.target.value === 'overdue') {
                  setActiveChip(e.target.value);
                }
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="pending">Chưa hoàn thành</option>
              <option value="overdue">Quá hạn</option>
              <option value="Mới">Mới</option>
              <option value="Đã duyệt">Đã duyệt</option>
              <option value="Đang xử lý">Đang xử lý</option>
              <option value="Chờ vật tư">Chờ vật tư</option>
              <option value="Hoàn thành">Hoàn thành</option>
              <option value="Đã đóng">Đã đóng</option>
            </select>
          </div>

          {/* Nguồn yêu cầu */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Nguồn yêu cầu
            </label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tất cả nguồn</option>
              <option value="Cửa hàng yêu cầu">Cửa hàng yêu cầu</option>
              <option value="KTV tự tạo">KTV tự tạo</option>
              <option value="Chưa phân loại">Chưa phân loại</option>
            </select>
          </div>

          {/* Cửa hàng yêu cầu */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Cửa hàng yêu cầu
            </label>
            <select
              value={storeFilter}
              onChange={(e) => setStoreFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tất cả cửa hàng</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Độ ưu tiên */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Độ ưu tiên
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Tất cả ưu tiên</option>
              <option value="khan_cap">Khẩn cấp</option>
              <option value="cao">Cao</option>
              <option value="trung_binh">Trung bình</option>
              <option value="thap">Thấp</option>
            </select>
          </div>

          {/* Người phụ trách (Admin & Tech) */}
          {!isRequester && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Người phụ trách
              </label>
              <select
                value={assigneeFilter}
                onChange={(e) => setAssigneeFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tất cả phụ trách</option>
                <option value="my_tasks">Việc của tôi</option>
                <option value="unassigned">Chưa phân công</option>
                <option value="multiple">Nhiều người</option>
                <option value="team">Phòng kỹ thuật</option>
                {technicians.map((t) => (
                  <option key={t.uid} value={t.uid}>
                    {t.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tiếp nhận việc */}
          {!isRequester && (
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                Tiếp nhận việc
              </label>
              <select
                value={ackFilter}
                onChange={(e) => setAckFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tất cả</option>
                <option value="unacknowledged">Chưa nhận việc</option>
                <option value="acknowledged">Đã nhận việc</option>
              </select>
            </div>
          )}
        </div>

        {/* Clear filters pill */}
        {hasActiveFilters && (
          <div className="flex items-center justify-between text-xs pt-1 text-slate-500">
            <span>Đang lọc theo các điều kiện</span>
            <button
              onClick={resetFilters}
              className="text-blue-600 font-semibold hover:underline flex items-center gap-1"
            >
              <X className="w-3.5 h-3.5" />
              Đặt lại bộ lọc
            </button>
          </div>
        )}
      </div>

      {/* Work Orders List Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 animate-pulse">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 bg-white rounded-2xl border border-slate-200 p-4" />
          ))}
        </div>
      ) : filteredWorkOrders.length === 0 ? (
        <div className="p-8 sm:p-12 text-center bg-white rounded-3xl border border-slate-200">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4">
            <FolderOpen className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">Không tìm thấy công việc nào</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {hasActiveFilters
              ? 'Thử thay đổi hoặc xóa các tiêu chí tìm kiếm và bộ lọc của bạn.'
              : 'Chưa có công việc nào trong hệ thống. Hãy gửi yêu cầu đầu tiên ngay.'}
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            {hasActiveFilters ? (
              <button
                onClick={resetFilters}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-semibold text-slate-700"
              >
                Xóa bộ lọc
              </button>
            ) : (
              <button
                onClick={openCreateRequest}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm"
              >
                Tạo yêu cầu ngay
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {paginatedWorkOrders.map((wo) => {
              const isOverdue =
                wo.dueDate &&
                wo.status !== 'Hoàn thành' &&
                wo.status !== 'Đã đóng' &&
                new Date(wo.dueDate).getTime() < Date.now();
              const isUnacknowledged = wo.acknowledged === false;

              return (
                <div key={wo.id} className="relative group">
                  <WorkOrderCard
                    workOrder={wo}
                    location={locationMap.get(wo.locationId)}
                    equipment={wo.equipmentId ? equipmentMap.get(wo.equipmentId) : undefined}
                    technicians={technicians}
                    onClick={() => setSelectedWorkOrder(wo)}
                  />

                  {/* Admin Quick Action Button: Gửi thông báo / Nhắc việc (Admin Only) */}
                  {isAdmin && wo.assigneeId && (
                    <div
                      className="absolute top-3.5 right-3.5 flex items-center gap-1 z-10"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setZaloTargetWorkOrder(wo);
                          setZaloModalType(isUnacknowledged || isOverdue ? 'remind' : 'assign');
                        }}
                        className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs transition-all active:scale-95 ${
                          isUnacknowledged
                            ? 'bg-amber-500 hover:bg-amber-600 text-white'
                            : isOverdue
                            ? 'bg-rose-600 hover:bg-rose-700 text-white animate-pulse'
                            : 'bg-white hover:bg-blue-50 text-blue-700 border border-slate-200'
                        }`}
                        title={
                          isUnacknowledged
                            ? 'Nhắc kỹ thuật viên xác nhận nhận việc qua Zalo'
                            : isOverdue
                            ? 'Nhắc việc quá hạn qua Zalo'
                            : 'Gửi thông báo công việc qua Zalo'
                        }
                      >
                        <Bell className="w-3 h-3" />
                        <span className="hidden sm:inline">
                          {isUnacknowledged ? 'Nhắc nhận việc' : isOverdue ? 'Đôn đốc gấp' : 'Gửi Zalo'}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Requirement 6: Quick Admin Actions for New Requests (Duyệt & Giao / Từ chối) */}
                  {isAdmin && (wo.source === 'request' && (wo.status === 'Mới' || !wo.assigneeId)) && (
                    <div
                      className="mt-2.5 pt-2.5 border-t border-slate-100 flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setTargetAssignOrder(wo)}
                        className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 touch-manipulation"
                      >
                        <FileCheck2 className="w-4 h-4" />
                        <span>Duyệt & Giao</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRejectingOrder(wo)}
                        className="min-h-[44px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1 active:scale-95 touch-manipulation"
                      >
                        <XCircle className="w-4 h-4" />
                        <span>Từ chối</span>
                      </button>
                    </div>
                  )}

                  {/* Quick Approve for Orders pending approval (Chờ duyệt) */}
                  {isAdmin && wo.status === 'Chờ duyệt' && (
                    <div
                      className="mt-2.5 pt-2.5 border-t border-slate-100"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        disabled={approvingOrderId === wo.id}
                        onClick={(e) => handleQuickApproveCompleted(e, wo)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 touch-manipulation"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{approvingOrderId === wo.id ? 'Đang duyệt...' : 'DUYỆT HOÀN THÀNH NGAY'}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pagination Controls for Large Lists (1.000+ items) */}
          {filteredWorkOrders.length > pageSize && (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 sm:px-5 rounded-2xl border border-slate-200 text-xs shadow-2xs">
              <span className="text-slate-500">
                Hiển thị <strong className="text-slate-800">{(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, filteredWorkOrders.length)}</strong> trong tổng số <strong className="text-slate-800">{filteredWorkOrders.length}</strong> công việc
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

      {/* Create Work Order Modal */}
      <CreateWorkOrderModal
        isOpen={isCreateModalOpen}
        defaultSource={createSource}
        locations={locations}
        equipmentList={equipmentList}
        technicians={technicians}
        allowedUsers={allowedUsers}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={(newWo) => {
          onSuccessToast(`Đã tạo thành công công việc ${newWo.code}`);
          setSelectedWorkOrder(newWo);
        }}
        onError={onError}
      />

      {/* Work Order Detail Modal */}
      <WorkOrderDetailModal
        workOrder={selectedWorkOrder}
        locations={locations}
        equipmentList={equipmentList}
        technicians={technicians}
        allowedUsers={allowedUsers}
        inventoryItems={inventoryItems}
        onClose={() => setSelectedWorkOrder(null)}
        onWorkOrderUpdated={() => {
          // Trigger local refresh or updated state
          if (selectedWorkOrder) {
            const updated = workOrders.find((w) => w.id === selectedWorkOrder.id);
            if (updated) setSelectedWorkOrder(updated);
          }
        }}
        onWorkOrderDeleted={() => setSelectedWorkOrder(null)}
        onError={onError}
        onSuccessToast={onSuccessToast}
      />

      {/* Admin Zalo Share / Reminder Modal */}
      {zaloTargetWorkOrder && (
        <ZaloShareModal
          isOpen={Boolean(zaloTargetWorkOrder)}
          onClose={() => setZaloTargetWorkOrder(null)}
          workOrder={zaloTargetWorkOrder}
          technician={technicians.find((t) => t.uid === zaloTargetWorkOrder.assigneeId) || null}
          location={locationMap.get(zaloTargetWorkOrder.locationId) || null}
          equipment={zaloTargetWorkOrder.equipmentId ? equipmentMap.get(zaloTargetWorkOrder.equipmentId) || null : null}
          type={zaloModalType}
          onSuccessToast={onSuccessToast}
          onErrorToast={onError}
          onWorkOrderUpdated={onRefresh}
        />
      )}

      {/* Admin Quick Assign Modal ("Tạo việc nhanh" hoặc "Duyệt & giao việc") */}
      {(targetAssignOrder || isQuickAssignOpen) && (
        <AdminQuickAssignModal
          isOpen={Boolean(targetAssignOrder) || isQuickAssignOpen}
          onClose={() => {
            setTargetAssignOrder(null);
            setIsQuickAssignOpen(false);
          }}
          locations={locations}
          equipmentList={equipmentList}
          technicians={technicians}
          allowedUsers={allowedUsers}
          workOrders={workOrders}
          targetWorkOrder={targetAssignOrder}
          onSuccess={(updatedOrder, tech) => {
            const techName = tech ? tech.displayName : (updatedOrder.assigneeType === 'team' ? 'Phòng kỹ thuật' : 'kỹ thuật viên');
            onSuccessToast(`Đã ${targetAssignOrder ? 'duyệt và giao' : 'tạo'} việc ${updatedOrder.code} cho ${techName}`);
            setZaloTargetWorkOrder(updatedOrder);
            setZaloModalType('assign');
            onRefresh();
          }}
          onError={onError}
        />
      )}

      {/* Reject Modal with Mandatory Reason (Requirement 6) */}
      {rejectingOrder && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-5 shadow-2xl border border-rose-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <XCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Từ chối yêu cầu</h3>
                <p className="text-[11px] text-slate-500">Mã {rejectingOrder.code}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn đang từ chối yêu cầu <strong>"{rejectingOrder.title}"</strong>. Vui lòng nhập lý do để người gửi được biết:
            </p>

            <textarea
              rows={3}
              required
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="VD: Không thuộc phạm vi bảo trì / Thiết bị đã có lịch thay mới..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-rose-500"
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setRejectingOrder(null);
                  setRejectReason('');
                }}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isRejecting || !rejectReason.trim()}
                onClick={handleConfirmReject}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs disabled:opacity-50 shadow-md shadow-rose-600/20"
              >
                {isRejecting ? 'Đang lưu...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
