import React, { useState, useMemo } from 'react';
import {
  Wrench,
  AlertTriangle,
  Clock,
  CalendarCheck,
  CheckCircle2,
  Package,
  Plus,
  Send,
  ChevronRight,
  UserX,
  FileCheck2,
  XCircle,
  Bell,
  Sparkles,
  Zap,
  Search,
  Filter,
  Eye,
  MessageSquare,
} from 'lucide-react';
import {
  WorkOrder,
  MaintenancePlan,
  InventoryItem,
  LocationItem,
  EquipmentItem,
  UserProfile,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { PriorityBadge, StatusBadge, AcknowledgmentBadge } from '../common/Badge';
import { formatDateOnly, formatRelativeTime } from '../../utils/formatters';
import { PWAInstallBanner } from '../common/PWAInstallBanner';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { triggerPushNotification } from '../../services/pushNotificationService';

interface AdminMobileHomeProps {
  workOrders: WorkOrder[];
  maintenancePlans: MaintenancePlan[];
  inventoryItems: InventoryItem[];
  equipmentList: EquipmentItem[];
  locations: LocationItem[];
  technicians: UserProfile[];
  onOpenCreateQuickAssign: () => void;
  onOpenApproveModal: (wo: WorkOrder) => void;
  onSelectWorkOrder: (wo: WorkOrder) => void;
  onNavigateToWorkOrdersWithFilter: (filterKey: string) => void;
  onNavigateToTab: (tab: any) => void;
  onSuccessToast: (msg: string) => void;
  onErrorToast: (msg: string) => void;
}

export const AdminMobileHome: React.FC<AdminMobileHomeProps> = ({
  workOrders,
  maintenancePlans,
  inventoryItems,
  equipmentList,
  locations,
  technicians,
  onOpenCreateQuickAssign,
  onOpenApproveModal,
  onSelectWorkOrder,
  onNavigateToWorkOrdersWithFilter,
  onNavigateToTab,
  onSuccessToast,
  onErrorToast,
}) => {
  const { userProfile } = useAuth();
  const todayStr = new Date().toISOString().split('T')[0];

  const next7DaysStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  }, []);

  // 1. Thống kê 6 số liệu theo yêu cầu
  // a. Việc chưa giao
  const unassignedOrders = useMemo(() => {
    return workOrders.filter(
      (w) => !w.assigneeId && w.status !== 'Hoàn thành' && w.status !== 'Đã đóng'
    );
  }, [workOrders]);

  // b. Việc chưa nhận (đã phân công nhưng acknowledged === false)
  const unacknowledgedOrders = useMemo(() => {
    return workOrders.filter(
      (w) => w.assigneeId && w.acknowledged === false && w.status !== 'Hoàn thành' && w.status !== 'Đã đóng'
    );
  }, [workOrders]);

  // c. Chờ duyệt hoàn thành
  const pendingApprovalOrders = useMemo(() => {
    return workOrders.filter((w) => w.status === 'Chờ duyệt');
  }, [workOrders]);

  // d. Quá hạn
  const overdueOrders = useMemo(() => {
    return workOrders.filter((w) => {
      if (!w.dueDate || w.status === 'Hoàn thành' || w.status === 'Đã đóng') return false;
      return w.dueDate.split('T')[0] < todayStr;
    });
  }, [workOrders, todayStr]);

  // e. Vật tư sắp hết (lowStockCount)
  const lowStockCount = useMemo(() => {
    return inventoryItems.filter((i) => i.active && i.qty <= i.minQty).length;
  }, [inventoryItems]);

  // f. Bảo dưỡng sắp đến hạn (trong vòng 7 ngày)
  const maintenanceDueCount = useMemo(() => {
    return maintenancePlans.filter(
      (p) => p.active && p.nextDue <= next7DaysStr
    ).length;
  }, [maintenancePlans, next7DaysStr]);

  // g. Việc KTV tự tạo trong tháng
  const currentMonthPrefix = useMemo(() => {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${d.getFullYear()}-${mm}`;
  }, []);

  const selfCreatedThisMonth = useMemo(() => {
    return workOrders.filter((w) => {
      if (!w.selfCreated) return false;
      return (w.createdAt || '').startsWith(currentMonthPrefix);
    });
  }, [workOrders, currentMonthPrefix]);

  // 2. Danh sách "Cần xử lý ngay" (Yêu cầu mới, Chờ duyệt, Quá hạn)
  // New requests from users (status === 'Mới' & source === 'request')
  const newRequests = useMemo(() => {
    return workOrders.filter((w) => w.source === 'request' && (w.status === 'Mới' || !w.assigneeId));
  }, [workOrders]);

  // Combined urgent list
  const urgentItems = useMemo(() => {
    const map = new Map<string, WorkOrder>();
    // Priority: 1. Chờ duyệt, 2. Yêu cầu mới, 3. Quá hạn
    pendingApprovalOrders.forEach((w) => map.set(w.id, w));
    newRequests.forEach((w) => map.set(w.id, w));
    overdueOrders.forEach((w) => map.set(w.id, w));
    return Array.from(map.values());
  }, [pendingApprovalOrders, newRequests, overdueOrders]);

  // Quick reject modal state (Requirement 6)
  const [rejectingOrder, setRejectingOrder] = useState<WorkOrder | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);

  // Quick approve action (Chuyển sang Hoàn thành)
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const handleQuickApproveCompleted = async (e: React.MouseEvent, wo: WorkOrder) => {
    e.stopPropagation();
    if (!userProfile) return;
    try {
      setApprovingId(wo.id);
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
    } catch (err) {
      console.error('Failed to approve order:', err);
      onErrorToast('Không thể duyệt công việc. Vui lòng thử lại.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingOrder || !userProfile) return;
    if (!rejectReason.trim()) {
      onErrorToast('Vui lòng nhập lý do từ chối yêu cầu');
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
    } catch (err) {
      console.error('Failed to reject request:', err);
      onErrorToast('Lỗi khi từ chối yêu cầu');
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="space-y-4 px-3 sm:px-4 py-3 max-w-xl mx-auto pb-24">
      {/* 1. Admin Mobile Header */}
      <div className="flex items-center justify-between bg-white p-3.5 rounded-3xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          {userProfile?.photoURL ? (
            <img
              src={userProfile.photoURL}
              alt={userProfile.displayName}
              className="w-11 h-11 rounded-2xl ring-2 ring-blue-500/20 object-cover"
            />
          ) : (
            <div className="w-11 h-11 rounded-2xl bg-slate-900 text-white font-black text-base flex items-center justify-center shadow-xs">
              {userProfile?.displayName?.charAt(0).toUpperCase() || 'A'}
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-600" />
              <span className="text-[11px] font-bold text-blue-700 uppercase tracking-wider">
                Quản trị viên (Mobile Admin)
              </span>
            </div>
            <h2 className="text-base font-black text-slate-900 leading-tight">
              {userProfile?.displayName || 'Trưởng bộ phận'}
            </h2>
          </div>
        </div>

        <div className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
          Tổng quan
        </div>
      </div>

      {/* 2. PWA Install Prompt Banner */}
      <PWAInstallBanner compact />

      {/* 3. NÚT LỚN NỔI BẬT: Tạo & Giao việc + Duyệt yêu cầu mới (Requirement 1 & 3) */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onOpenCreateQuickAssign}
          className="min-h-[54px] p-3.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-98 text-white font-black text-xs flex items-center gap-2.5 shadow-md shadow-blue-500/25 transition-all touch-manipulation"
        >
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <Plus className="w-5 h-5 text-white" />
          </div>
          <div className="text-left leading-tight">
            <span className="block text-sm font-black tracking-tight">Tạo & Giao việc</span>
            <span className="text-[10px] text-blue-100 font-normal">Giao nhanh qua Zalo</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (newRequests.length > 0) {
              onOpenApproveModal(newRequests[0]);
            } else {
              onNavigateToWorkOrdersWithFilter('Mới');
            }
          }}
          className="min-h-[54px] p-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 active:scale-98 text-white font-black text-xs flex items-center gap-2.5 shadow-md shadow-slate-900/20 transition-all touch-manipulation relative"
        >
          <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
            <FileCheck2 className="w-5 h-5 text-white" />
          </div>
          <div className="text-left leading-tight min-w-0">
            <span className="block text-sm font-black tracking-tight truncate">Duyệt yêu cầu</span>
            <span className="text-[10px] text-slate-300 font-normal">
              {newRequests.length > 0 ? `${newRequests.length} yêu cầu mới` : 'Xem danh sách'}
            </span>
          </div>
          {newRequests.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-xs">
              {newRequests.length}
            </span>
          )}
        </button>
      </div>

      {/* 4. 6 THẺ SỐ LIỆU CHẠM MỞ DANH SÁCH TƯƠNG ỨNG (Requirement 1) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-black uppercase tracking-wider text-slate-700">
            Chỉ số vận hành cơ sở vật chất
          </span>
          <span className="text-[10px] text-slate-400">Chạm thẻ để mở lọc</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* 1. Việc chưa giao */}
          <button
            type="button"
            onClick={() => onNavigateToWorkOrdersWithFilter('unassigned')}
            className={`p-3.5 rounded-2xl border text-left transition-all active:scale-98 touch-manipulation shadow-2xs ${
              unassignedOrders.length > 0
                ? 'bg-amber-50/70 border-amber-300'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Việc chưa giao
              </span>
              <UserX className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 leading-none">
              {unassignedOrders.length}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 font-medium">
              Chờ phân công KTV →
            </div>
          </button>

          {/* 2. Việc chưa nhận */}
          <button
            type="button"
            onClick={() => onNavigateToWorkOrdersWithFilter('unacknowledged')}
            className={`p-3.5 rounded-2xl border text-left transition-all active:scale-98 touch-manipulation shadow-2xs ${
              unacknowledgedOrders.length > 0
                ? 'bg-orange-50/70 border-orange-300'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Việc chưa nhận
              </span>
              <Clock className="w-4 h-4 text-orange-600" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 leading-none">
              {unacknowledgedOrders.length}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 font-medium">
              KTV chưa bấm nhận →
            </div>
          </button>

          {/* 3. Chờ duyệt hoàn thành */}
          <button
            type="button"
            onClick={() => onNavigateToWorkOrdersWithFilter('Chờ duyệt')}
            className={`p-3.5 rounded-2xl border text-left transition-all active:scale-98 touch-manipulation shadow-2xs ${
              pendingApprovalOrders.length > 0
                ? 'bg-purple-50/70 border-purple-300'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Chờ duyệt HT
              </span>
              <CheckCircle2 className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 leading-none">
              {pendingApprovalOrders.length}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 font-medium">
              Chờ nghiệm thu →
            </div>
          </button>

          {/* 4. Quá hạn */}
          <button
            type="button"
            onClick={() => onNavigateToWorkOrdersWithFilter('overdue')}
            className={`p-3.5 rounded-2xl border text-left transition-all active:scale-98 touch-manipulation shadow-2xs ${
              overdueOrders.length > 0
                ? 'bg-rose-50/80 border-rose-300 ring-1 ring-rose-200'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Quá hạn xử lý
              </span>
              <AlertTriangle className="w-4 h-4 text-rose-600 animate-pulse" />
            </div>
            <div className="text-2xl font-black font-mono text-rose-600 leading-none">
              {overdueOrders.length}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 font-medium">
              Cần đôn đốc ngay →
            </div>
          </button>

          {/* 5. Vật tư sắp hết */}
          <button
            type="button"
            onClick={() => onNavigateToTab('inventory')}
            className={`p-3.5 rounded-2xl border text-left transition-all active:scale-98 touch-manipulation shadow-2xs ${
              lowStockCount > 0
                ? 'bg-amber-50/70 border-amber-300'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Vật tư sắp hết
              </span>
              <Package className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 leading-none">
              {lowStockCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 font-medium">
              Mở kho vật tư →
            </div>
          </button>

          {/* 6. Bảo dưỡng sắp đến hạn */}
          <button
            type="button"
            onClick={() => onNavigateToTab('maintenance')}
            className={`p-3.5 rounded-2xl border text-left transition-all active:scale-98 touch-manipulation shadow-2xs ${
              maintenanceDueCount > 0
                ? 'bg-indigo-50/70 border-indigo-300'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
                Bảo dưỡng đến hạn
              </span>
              <CalendarCheck className="w-4 h-4 text-indigo-600" />
            </div>
            <div className="text-2xl font-black font-mono text-slate-900 leading-none">
              {maintenanceDueCount}
            </div>
            <div className="text-[10px] text-slate-500 mt-1 font-medium">
              Trong 7 ngày tới →
            </div>
          </button>

          {/* 7. Việc KTV tự tạo trong tháng */}
          <button
            type="button"
            onClick={() => onNavigateToWorkOrdersWithFilter('self_created')}
            className={`p-3.5 rounded-2xl border text-left transition-all active:scale-98 touch-manipulation shadow-2xs col-span-2 ${
              selfCreatedThisMonth.length > 0
                ? 'bg-purple-50/70 border-purple-300'
                : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-purple-600" />
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-900">
                  Việc KTV tự tạo trong tháng
                </span>
              </div>
              <span className="text-[10px] font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
                Hiện trường
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black font-mono text-purple-800 leading-none">
                {selfCreatedThisMonth.length}
              </span>
              <span className="text-[11px] text-slate-500 font-medium">
                công việc KTV phát hiện & tự xử lý ngay
              </span>
            </div>
          </button>
        </div>
      </div>

      {/* 5. DANH SÁCH "CẦN XỬ LÝ NGAY" (Requirement 1 & 6) */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-600 animate-ping" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-900">
              Cần xử lý ngay ({urgentItems.length})
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigateToTab('workorders')}
            className="text-[11px] font-bold text-blue-600 hover:underline"
          >
            Xem tất cả việc →
          </button>
        </div>

        {urgentItems.length === 0 ? (
          <div className="p-8 text-center bg-white rounded-3xl border border-slate-200 space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
            <div className="text-xs font-bold text-slate-800">
              Hiện không có công việc nào khẩn cấp cần xử lý.
            </div>
            <p className="text-[11px] text-slate-400">
              Tất cả các việc đều đang trong tiến độ kiểm soát.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {urgentItems.slice(0, 10).map((wo) => {
              const isPendingApproval = wo.status === 'Chờ duyệt';
              const isNewReq = wo.source === 'request' && (wo.status === 'Mới' || !wo.assigneeId);
              const isOverdue = wo.dueDate && wo.dueDate.split('T')[0] < todayStr && wo.status !== 'Hoàn thành' && wo.status !== 'Đã đóng';

              return (
                <div
                  key={wo.id}
                  onClick={() => onSelectWorkOrder(wo)}
                  className={`p-4 rounded-3xl border transition-all active:scale-99 cursor-pointer touch-manipulation shadow-2xs space-y-3 ${
                    isPendingApproval
                      ? 'bg-purple-50/40 border-purple-300'
                      : isNewReq
                      ? 'bg-blue-50/40 border-blue-300'
                      : isOverdue
                      ? 'bg-rose-50/40 border-rose-300'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  {/* Top Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                        {wo.code}
                      </span>
                      <PriorityBadge priority={wo.priority} />
                      {isPendingApproval && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-600 text-white">
                          Chờ duyệt nghiệm thu
                        </span>
                      )}
                      {isNewReq && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                          Yêu cầu mới của nhân viên
                        </span>
                      )}
                      {isOverdue && !isPendingApproval && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                          Quá hạn!
                        </span>
                      )}
                      <AcknowledgmentBadge workOrder={wo} />
                    </div>

                    <StatusBadge status={wo.status} />
                  </div>

                  {/* Title & Description */}
                  <div>
                    <h4 className="font-black text-slate-900 text-sm leading-snug">
                      {wo.title}
                    </h4>
                    {wo.description && (
                      <p className="text-xs text-slate-500 line-clamp-2 mt-1 leading-relaxed">
                        {wo.description}
                      </p>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 flex-wrap gap-2">
                    <div>
                      {wo.assigneeName ? (
                        <span>Phụ trách: <strong className="text-slate-800">{wo.assigneeName}</strong></span>
                      ) : (
                        <span className="text-amber-700 font-bold">Chưa giao cho ai</span>
                      )}
                    </div>
                    {wo.dueDate && (
                      <span className={isOverdue ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                        Hạn: {formatDateOnly(wo.dueDate)}
                      </span>
                    )}
                  </div>

                  {/* TRỰC TIẾP DUYỆT / XỬ LÝ (Requirement 6) */}
                  <div className="pt-1 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    {/* If new request: Duyệt & giao / Từ chối */}
                    {isNewReq && (
                      <>
                        <button
                          type="button"
                          onClick={() => onOpenApproveModal(wo)}
                          className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-sm active:scale-95 touch-manipulation"
                        >
                          <FileCheck2 className="w-4 h-4" />
                          <span>Duyệt & Giao việc</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setRejectingOrder(wo)}
                          className="min-h-[44px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs flex items-center justify-center gap-1 active:scale-95 touch-manipulation"
                        >
                          <XCircle className="w-4 h-4" />
                          <span>Từ chối</span>
                        </button>
                      </>
                    )}

                    {/* If pending approval: Duyệt hoàn thành ngay */}
                    {isPendingApproval && (
                      <button
                        type="button"
                        disabled={approvingId === wo.id}
                        onClick={(e) => handleQuickApproveCompleted(e, wo)}
                        className="w-full min-h-[46px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-600/20 active:scale-98 touch-manipulation"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{approvingId === wo.id ? 'Đang duyệt...' : 'DUYỆT HOÀN THÀNH NGAY'}</span>
                      </button>
                    )}

                    {/* If overdue: Mở chi tiết */}
                    {!isNewReq && !isPendingApproval && (
                      <button
                        type="button"
                        onClick={() => onSelectWorkOrder(wo)}
                        className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 active:scale-98 touch-manipulation"
                      >
                        <Eye className="w-4 h-4 text-slate-500" />
                        <span>Xem chi tiết & Đôn đốc</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
              placeholder="VD: Không thuộc phạm vi sửa chữa cơ sở vật chất / Thiết bị đã được lên lịch thay mới..."
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
