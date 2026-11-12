import React, { useMemo } from 'react';
import {
  CheckSquare,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Users,
  Wrench,
  Plus,
  ArrowRight,
  TrendingUp,
  Cpu,
  MapPin,
  Calendar,
  DollarSign,
  CalendarCheck,
  ShieldAlert,
  BarChart3,
  Package,
  Timer,
  UserCheck,
  Inbox,
  Zap,
  Sparkles,
} from 'lucide-react';
import {
  WorkOrder,
  EquipmentItem,
  UserProfile,
  InventoryItem,
  CostEntry,
  MaintenancePlan,
  WorkOrderMaterial,
  ElectricalAsset,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { PriorityBadge, StatusBadge } from '../common/Badge';
import { formatDateOnly, formatCurrency } from '../../utils/formatters';
import { getMaintenanceDueStatus } from '../../utils/maintenanceUtils';

interface DashboardViewProps {
  workOrders: WorkOrder[];
  equipmentList: EquipmentItem[];
  technicians: UserProfile[];
  inventoryItems?: InventoryItem[];
  costEntries?: CostEntry[];
  maintenancePlans?: MaintenancePlan[];
  workOrderMaterials?: WorkOrderMaterial[];
  electricalAssets?: ElectricalAsset[];
  isLoading?: boolean;
  onOpenCreate: (source: 'request' | 'internal', mode?: 'quick' | 'standard') => void;
  onOpenQuickAssign?: () => void;
  onSelectWorkOrder: (wo: WorkOrder) => void;
  onNavigateToWorkOrders: (statusFilter?: string) => void;
  onNavigateToInventory?: (filter?: string) => void;
  onNavigateToCosts?: () => void;
  onNavigateToMaintenance?: () => void;
  onNavigateToEquipment?: () => void;
  onNavigateToElectrical?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  workOrders,
  equipmentList,
  technicians,
  inventoryItems = [],
  costEntries = [],
  maintenancePlans = [],
  workOrderMaterials = [],
  electricalAssets = [],
  isLoading = false,
  onOpenCreate,
  onOpenQuickAssign,
  onSelectWorkOrder,
  onNavigateToWorkOrders,
  onNavigateToInventory,
  onNavigateToCosts,
  onNavigateToMaintenance,
  onNavigateToEquipment,
  onNavigateToElectrical,
}) => {
  const { userProfile, isAdmin, isTechnician, isRequester, userLocationIds } = useAuth();

  // Basic Metrics calculation
  const total = workOrders.length;
  const newOrders = workOrders.filter((w) => w.status === 'Mới');
  const inProgress = workOrders.filter((w) => w.status === 'Đang xử lý');
  const waitingMaterial = workOrders.filter((w) => w.status === 'Chờ vật tư');
  const completed = workOrders.filter((w) => w.status === 'Hoàn thành' || w.status === 'Đã đóng');
  const lowStockItems = inventoryItems.filter((i) => i.active && i.qty <= i.minQty);

  // Overdue calculation
  const now = Date.now();
  const overdueOrders = workOrders.filter(
    (w) =>
      w.dueDate &&
      w.status !== 'Hoàn thành' &&
      w.status !== 'Đã đóng' &&
      new Date(w.dueDate).getTime() < now
  );

  // Urgent tasks
  const urgentOrders = workOrders.filter(
    (w) =>
      w.priority === 'khan_cap' &&
      w.status !== 'Hoàn thành' &&
      w.status !== 'Đã đóng'
  );

  // Requester specific metrics
  const requesterIncomplete = useMemo(() => {
    return workOrders.filter((w) => w.status !== 'Hoàn thành' && w.status !== 'Đã đóng');
  }, [workOrders]);

  const requesterOverdue = useMemo(() => {
    const nowMs = Date.now();
    return requesterIncomplete.filter((w) => {
      if (!w.dueDate) return false;
      const d = new Date(w.dueDate).getTime();
      return !isNaN(d) && d < nowMs;
    });
  }, [requesterIncomplete]);

  const requesterRecentOrders = useMemo(() => {
    return [...workOrders]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [workOrders]);

  // Unassigned new tasks (Việc mới chưa giao)
  const unassignedNewOrders = useMemo(() => {
    return workOrders.filter(
      (w) =>
        !w.assigneeId &&
        w.assigneeType !== 'team' &&
        (!w.assigneeIds || w.assigneeIds.length === 0) &&
        w.status === 'Mới'
    );
  }, [workOrders]);

  // Unacknowledged assigned tasks (Việc giao chưa được nhận - Requirement 4)
  const unacknowledgedOrders = useMemo(() => {
    return workOrders.filter(
      (w) =>
        (w.assigneeId || w.assigneeType === 'team' || (w.assigneeIds && w.assigneeIds.length > 0)) &&
        w.acknowledged === false &&
        w.status !== 'Hoàn thành' &&
        w.status !== 'Đã đóng'
    );
  }, [workOrders]);

  // Overdue acknowledgment (> 4 hours)
  const overdueUnacknowledgedCount = useMemo(() => {
    return unacknowledgedOrders.filter((w) => {
      if (!w.assignedAt) return false;
      return now - new Date(w.assignedAt).getTime() > 4 * 60 * 60 * 1000;
    }).length;
  }, [unacknowledgedOrders, now]);

  // Combined High-Priority list (Urgent & Overdue) - to show at TOP
  const highPriorityOrders = useMemo(() => {
    const list: WorkOrder[] = [];
    const seen = new Set<string>();

    urgentOrders.forEach((wo) => {
      seen.add(wo.id);
      list.push(wo);
    });

    overdueOrders.forEach((wo) => {
      if (!seen.has(wo.id)) {
        seen.add(wo.id);
        list.push(wo);
      }
    });

    return list;
  }, [urgentOrders, overdueOrders]);

  // Materials cost mapping
  const materialsByOrder = useMemo(() => {
    const map = new Map<string, number>();
    workOrderMaterials.forEach((m) => {
      const cur = map.get(m.workOrderId) || 0;
      map.set(m.workOrderId, cur + m.qty * m.unitCost);
    });
    return map;
  }, [workOrderMaterials]);

  // === DATES & COSTS ===
  const thisMonthKey = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  const lastMonthKey = useMemo(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, []);

  // Hoàn thành trong tháng
  const completedThisMonth = useMemo(() => {
    return workOrders.filter(
      (w) =>
        (w.status === 'Hoàn thành' || w.status === 'Đã đóng') &&
        (w.completedAt || w.createdAt).startsWith(thisMonthKey)
    );
  }, [workOrders, thisMonthKey]);

  // Việc KTV tự tạo trong tháng
  const selfCreatedThisMonth = useMemo(() => {
    return workOrders.filter((w) => w.selfCreated && (w.createdAt || '').startsWith(thisMonthKey));
  }, [workOrders, thisMonthKey]);

  // Thời gian xử lý trung bình
  const avgResolutionTime = useMemo(() => {
    const resolved = workOrders.filter(
      (w) => (w.status === 'Hoàn thành' || w.status === 'Đã đóng') && w.completedAt && w.createdAt
    );
    if (resolved.length === 0) return 'Chưa có';

    const totalHours = resolved.reduce((acc, w) => {
      const start = new Date(w.createdAt).getTime();
      const end = new Date(w.completedAt!).getTime();
      const diffHrs = Math.max(0.1, (end - start) / (1000 * 60 * 60));
      return acc + diffHrs;
    }, 0);

    const avgHours = totalHours / resolved.length;
    if (avgHours < 24) {
      return `${avgHours.toFixed(1)} giờ`;
    }
    return `${(avgHours / 24).toFixed(1)} ngày`;
  }, [workOrders]);

  // Tổng chi phí tháng này
  const thisMonthCost = useMemo(() => {
    let cost = 0;
    costEntries.forEach((c) => {
      if (c.date.startsWith(thisMonthKey)) cost += c.amount;
    });
    workOrders.forEach((wo) => {
      const dateKey = (wo.completedAt || wo.createdAt).substring(0, 7);
      if (dateKey === thisMonthKey) {
        const mat = materialsByOrder.get(wo.id) || 0;
        cost += mat + (wo.laborCost || 0) + (wo.externalCost || 0);
      }
    });
    return cost;
  }, [costEntries, workOrders, thisMonthKey, materialsByOrder]);

  // Tổng chi phí tháng trước
  const lastMonthCost = useMemo(() => {
    let cost = 0;
    costEntries.forEach((c) => {
      if (c.date.startsWith(lastMonthKey)) cost += c.amount;
    });
    workOrders.forEach((wo) => {
      const dateKey = (wo.completedAt || wo.createdAt).substring(0, 7);
      if (dateKey === lastMonthKey) {
        const mat = materialsByOrder.get(wo.id) || 0;
        cost += mat + (wo.laborCost || 0) + (wo.externalCost || 0);
      }
    });
    return cost;
  }, [costEntries, workOrders, lastMonthKey, materialsByOrder]);

  const costDiffPercent = useMemo(() => {
    if (lastMonthCost === 0) return thisMonthCost > 0 ? 100 : 0;
    return Math.round(((thisMonthCost - lastMonthCost) / lastMonthCost) * 100);
  }, [thisMonthCost, lastMonthCost]);

  // Số việc bảo dưỡng quá hạn / sắp đến hạn
  const maintenanceOverdueCount = useMemo(() => {
    return maintenancePlans.filter(
      (p) => p.active && getMaintenanceDueStatus(p.nextDue).status === 'overdue'
    ).length;
  }, [maintenancePlans]);

  const maintenanceDueSoonCount = useMemo(() => {
    return maintenancePlans.filter(
      (p) => p.active && getMaintenanceDueStatus(p.nextDue).status === 'due_soon'
    ).length;
  }, [maintenancePlans]);

  // Số thiết bị đang hỏng hoặc bảo dưỡng
  const brokenOrMaintenanceEqCount = useMemo(() => {
    return equipmentList.filter((e) => e.status === 'broken' || e.status === 'maintenance').length;
  }, [equipmentList]);

  // Thiết bị điện cần kiểm tra hoặc quá hạn kiểm tra
  const electricalNeedCheckCount = useMemo(() => {
    return electricalAssets.filter((a) => a.status === 'can_kiem_tra' || a.status === 'hong').length;
  }, [electricalAssets]);

  // 6-Month Cost Trend for SVG Chart
  const monthlyTrends = useMemo(() => {
    const months: { label: string; key: string; total: number }[] = [];
    const dateObj = new Date();

    for (let i = 5; i >= 0; i--) {
      const d = new Date(dateObj.getFullYear(), dateObj.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = `T${d.getMonth() + 1}`;
      months.push({ label, key, total: 0 });
    }

    costEntries.forEach((c) => {
      const mKey = c.date.substring(0, 7);
      const m = months.find((item) => item.key === mKey);
      if (m) m.total += c.amount;
    });

    workOrders.forEach((wo) => {
      const mKey = (wo.completedAt || wo.createdAt).substring(0, 7);
      const m = months.find((item) => item.key === mKey);
      if (m) {
        const mat = materialsByOrder.get(wo.id) || 0;
        m.total += mat + (wo.laborCost || 0) + (wo.externalCost || 0);
      }
    });

    return months;
  }, [costEntries, workOrders, materialsByOrder]);

  const maxTrendValue = Math.max(...monthlyTrends.map((m) => m.total), 1000000);

  // Workload by technician (for Admin)
  const techWorkload = technicians.map((tech) => {
    const assigned = workOrders.filter((w) => w.assigneeId === tech.uid);
    const active = assigned.filter(
      (w) => w.status !== 'Hoàn thành' && w.status !== 'Đã đóng'
    );
    const done = assigned.filter(
      (w) => w.status === 'Hoàn thành' || w.status === 'Đã đóng'
    );
    return {
      tech,
      totalCount: assigned.length,
      activeCount: active.length,
      doneCount: done.length,
    };
  });

  // Technician personal work orders
  const myWorkOrders = useMemo(() => {
    if (!userProfile) return [];
    return workOrders.filter((w) => w.assigneeId === userProfile.uid);
  }, [workOrders, userProfile]);

  const myInProgress = myWorkOrders.filter((w) => w.status === 'Đang xử lý');
  const myDone = myWorkOrders.filter((w) => w.status === 'Hoàn thành' || w.status === 'Đã đóng');
  const myOverdue = myWorkOrders.filter(
    (w) =>
      w.dueDate &&
      w.status !== 'Hoàn thành' &&
      w.status !== 'Đã đóng' &&
      new Date(w.dueDate).getTime() < now
  );
  const unassignedAll = workOrders.filter(
    (w) => !w.assigneeId && w.status !== 'Hoàn thành' && w.status !== 'Đã đóng'
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Welcome Banner */}
      <div className="relative overflow-hidden bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 rounded-3xl p-5 sm:p-7 text-white shadow-xl">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-blue-100 text-xs font-semibold backdrop-blur-md mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Hệ thống Kỹ thuật & Cơ sở vật chất sẵn sàng
            </div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-black tracking-tight">
              Xin chào, {userProfile?.displayName}!
            </h1>
            <p className="text-blue-100 text-xs sm:text-sm mt-1 max-w-xl leading-relaxed">
              {isAdmin
                ? 'Trung tâm giám sát vận hành: quản lý sự cố, kế hoạch bảo dưỡng định kỳ và chi phí toàn hệ thống.'
                : isTechnician
                ? 'Khu vực làm việc kỹ thuật viên: kiểm tra các công việc được giao và tiếp nhận yêu cầu mới.'
                : 'Bạn có thể gửi yêu cầu kiểm tra hoặc sửa chữa thiết bị, cơ sở vật chất tòa nhà tại đây.'}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && onOpenQuickAssign && (
              <button
                onClick={onOpenQuickAssign}
                className="px-4 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
                title="Tạo nhanh và giao việc ngay cho kỹ thuật viên"
              >
                <Zap className="w-4 h-4 text-amber-200" />
                <span>Tạo việc nhanh</span>
              </button>
            )}
            <button
              onClick={() => onOpenCreate('request', 'standard')}
              className="px-5 py-3 rounded-xl bg-white text-blue-700 hover:bg-blue-50 active:scale-95 font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-blue-700" />
              <span>Gửi yêu cầu sửa chữa</span>
            </button>
            {(isAdmin || isTechnician) && (
              <button
                onClick={() => onOpenCreate('internal')}
                className="px-4 py-3 rounded-xl bg-blue-900/60 hover:bg-blue-900 text-white active:scale-95 font-bold text-xs sm:text-sm border border-blue-400/30 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Wrench className="w-4 h-4 text-blue-300" />
                <span>Việc nội bộ</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* === TOP SECTION: HIGH-PRIORITY URGENT & OVERDUE WORK ORDERS WITH RED BORDER === */}
      {highPriorityOrders.length > 0 && !isRequester && (
        <div className="rounded-3xl border-2 border-rose-500 bg-rose-50/40 p-4 sm:p-5 shadow-sm space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-rose-600 text-white rounded-xl shadow-xs">
                <ShieldAlert className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm sm:text-base font-black text-rose-950 flex items-center gap-2">
                  <span>CÔNG VIỆC KHẨN CẤP & QUÁ HẠN ({highPriorityOrders.length})</span>
                  <span className="text-[10px] font-bold bg-rose-200 text-rose-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                    Ưu tiên xử lý ngay
                  </span>
                </h3>
                <p className="text-xs text-rose-700">
                  Cần kỹ thuật viên vào giải quyết ngay để không làm gián đoạn vận hành tòa nhà.
                </p>
              </div>
            </div>
            <button
              onClick={() => onNavigateToWorkOrders('overdue')}
              className="hidden sm:inline-flex items-center gap-1 text-xs font-bold text-rose-700 hover:text-rose-900 bg-white border border-rose-200 px-3 py-1.5 rounded-xl shadow-2xs hover:bg-rose-50 transition-all"
            >
              <span>Xem danh sách</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {highPriorityOrders.slice(0, 6).map((wo) => {
              const isOverdue =
                wo.dueDate &&
                wo.status !== 'Hoàn thành' &&
                wo.status !== 'Đã đóng' &&
                new Date(wo.dueDate).getTime() < now;

              return (
                <div
                  key={wo.id}
                  onClick={() => onSelectWorkOrder(wo)}
                  className="bg-white p-3.5 rounded-2xl border border-rose-200 hover:border-rose-400 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className="font-mono text-xs font-bold text-rose-700 bg-rose-100/70 px-2 py-0.5 rounded-lg">
                        {wo.code}
                      </span>
                      <div className="flex items-center gap-1">
                        <PriorityBadge priority={wo.priority} />
                        {isOverdue && (
                          <span className="text-[10px] bg-rose-600 text-white font-bold px-1.5 py-0.5 rounded-md animate-pulse">
                            Quá hạn
                          </span>
                        )}
                      </div>
                    </div>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 line-clamp-1 mb-1">
                      {wo.title}
                    </h4>
                    <p className="text-[11px] text-slate-500 line-clamp-1">
                      KTV: <strong>{wo.assigneeName || 'Chưa giao'}</strong> • Hạn:{' '}
                      {wo.dueDate ? formatDateOnly(wo.dueDate) : 'Chưa đặt'}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-2 mt-2 border-t border-slate-100 text-[11px]">
                    <StatusBadge status={wo.status} />
                    <span className="text-blue-600 font-semibold flex items-center gap-0.5">
                      Chi tiết <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === DASHBOARD TECHNICIAN: CHỈ HIỂN THỊ VIỆC CỦA CHÍNH HỌ === */}
      {isTechnician && !isAdmin && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-blue-600" />
              <span>Bảng công việc của tôi ({userProfile?.displayName})</span>
            </h2>
            <span className="text-xs text-slate-500">
              Tổng số việc được giao: <strong>{myWorkOrders.length}</strong>
            </span>
          </div>

          {/* Technician personal stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div
              onClick={() => onNavigateToWorkOrders('Đang xử lý')}
              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-300 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-semibold">Đang xử lý</span>
                <Wrench className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-2xl font-black text-amber-600">{myInProgress.length}</div>
              <div className="text-[11px] text-slate-400 mt-1">Việc của tôi đang làm</div>
            </div>

            <div
              onClick={() => onNavigateToWorkOrders('Mới')}
              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-semibold">Chưa ai nhận</span>
                <Inbox className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-2xl font-black text-blue-600">{unassignedAll.length}</div>
              <div className="text-[11px] text-slate-400 mt-1">Bấm để nhận việc ngay</div>
            </div>

            <div
              onClick={() => onNavigateToWorkOrders('overdue')}
              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-rose-300 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-semibold">Quá hạn của tôi</span>
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-2xl font-black text-rose-600">{myOverdue.length}</div>
              <div className="text-[11px] text-slate-400 mt-1">Cần hoàn thành gấp</div>
            </div>

            <div
              onClick={() => onNavigateToWorkOrders('Hoàn thành')}
              className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-300 transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-semibold">Đã hoàn thành</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-2xl font-black text-emerald-600">{myDone.length}</div>
              <div className="text-[11px] text-slate-400 mt-1">Tổng việc tôi đã xong</div>
            </div>
          </div>

          {/* Technician Task List */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              Danh sách công việc đang giao cho tôi ({myWorkOrders.filter(w => w.status !== 'Hoàn thành' && w.status !== 'Đã đóng').length})
            </h3>
            {myWorkOrders.filter(w => w.status !== 'Hoàn thành' && w.status !== 'Đã đóng').length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                Bạn hiện không có công việc nào đang dang dở. Hãy xem mục "Chưa ai nhận" để nhận thêm việc.
              </div>
            ) : (
              <div className="space-y-2">
                {myWorkOrders
                  .filter((w) => w.status !== 'Hoàn thành' && w.status !== 'Đã đóng')
                  .map((wo) => (
                    <div
                      key={wo.id}
                      onClick={() => onSelectWorkOrder(wo)}
                      className="p-3.5 rounded-2xl border border-slate-200 hover:border-blue-300 hover:bg-blue-50/20 transition-all cursor-pointer flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                            {wo.code}
                          </span>
                          <PriorityBadge priority={wo.priority} />
                          <StatusBadge status={wo.status} />
                        </div>
                        <div className="font-bold text-slate-900">{wo.title}</div>
                        <div className="text-slate-400 text-[11px] mt-0.5">
                          Hạn: {wo.dueDate ? formatDateOnly(wo.dueDate) : 'Không đặt'}
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* === DASHBOARD REQUESTER: THEO DÕI CÁC CÔNG VIỆC THUỘC VỊ TRÍ ĐƯỢC GÁN === */}
      {isRequester && (
        <div className="space-y-6 animate-in fade-in">
          {isLoading ? (
            /* Skeleton Loading State */
            <div className="space-y-5 animate-pulse">
              <div className="h-20 bg-slate-100 rounded-3xl" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="h-28 bg-slate-100 rounded-2xl" />
                <div className="h-28 bg-slate-100 rounded-2xl" />
                <div className="h-28 bg-slate-100 rounded-2xl" />
                <div className="h-28 bg-slate-100 rounded-2xl" />
              </div>
              <div className="h-64 bg-slate-100 rounded-3xl" />
            </div>
          ) : (!userLocationIds || userLocationIds.length === 0) ? (
            <div className="p-5 bg-amber-50 border-2 border-amber-300 rounded-3xl flex items-start gap-3.5 shadow-sm">
              <div className="p-2.5 bg-amber-100 text-amber-700 rounded-2xl shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-amber-950">Tài khoản chưa được gán vị trí</h3>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Tài khoản của bạn chưa được quản trị viên gán bất kỳ vị trí/cơ sở nào. Bạn sẽ không thể gửi yêu cầu sự cố hoặc xem danh sách công việc. Vui lòng liên hệ quản trị viên để được phân quyền vị trí quản lý.
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Header section with location count */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-blue-50/50 p-4 sm:p-5 rounded-3xl border border-purple-100/80">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-purple-600 shrink-0" />
                    <span>Tiến độ sự cố tại các vị trí quản lý ({userLocationIds.length} vị trí)</span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Thống kê thời gian thực theo đúng các cơ sở bạn được phân quyền phụ trách
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCreate('request', 'standard')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all cursor-pointer self-start sm:self-auto touch-manipulation"
                >
                  <Plus className="w-4 h-4" />
                  <span>Gửi yêu cầu sửa chữa</span>
                </button>
              </div>

              {/* 4 Stat Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* THẺ 1: Chưa hoàn thành / Tổng số việc */}
                <div
                  onClick={() => onNavigateToWorkOrders('pending')}
                  className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-slate-200 shadow-xs hover:border-blue-400 hover:shadow-md transition-all cursor-pointer group active:scale-98 touch-manipulation"
                >
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Chưa hoàn thành
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Clock className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="flex items-baseline gap-1.5 font-mono">
                    <span className="text-2xl sm:text-3xl font-black text-blue-700">
                      {requesterIncomplete.length}
                    </span>
                    <span className="text-base font-bold text-slate-400">/</span>
                    <span className="text-base sm:text-lg font-bold text-slate-500">
                      {workOrders.length}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                    <span>Việc đang mở / Tổng việc</span>
                    <ArrowRight className="w-3.5 h-3.5 text-blue-500 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>

                {/* THẺ 2: Trễ hạn (Đổi màu đỏ khi > 0, xanh khi = 0) */}
                <div
                  onClick={() => onNavigateToWorkOrders('overdue')}
                  className={`p-4 sm:p-5 rounded-2xl border-2 shadow-xs transition-all cursor-pointer group active:scale-98 touch-manipulation ${
                    requesterOverdue.length > 0
                      ? 'bg-rose-50/70 border-rose-400 hover:border-rose-500 hover:shadow-md'
                      : 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-md'
                  }`}
                >
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span
                      className={`text-xs font-black uppercase tracking-wider ${
                        requesterOverdue.length > 0 ? 'text-rose-900' : 'text-slate-700'
                      }`}
                    >
                      Trễ hạn
                    </span>
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform ${
                        requesterOverdue.length > 0
                          ? 'bg-rose-100 text-rose-600'
                          : 'bg-emerald-50 text-emerald-600'
                      }`}
                    >
                      {requesterOverdue.length > 0 ? (
                        <AlertTriangle className="w-4 h-4 animate-pulse" />
                      ) : (
                        <CheckCircle2 className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                  <div className="flex items-baseline gap-2 font-mono">
                    <span
                      className={`text-2xl sm:text-3xl font-black ${
                        requesterOverdue.length > 0 ? 'text-rose-600' : 'text-emerald-600'
                      }`}
                    >
                      {requesterOverdue.length}
                    </span>
                    {requesterOverdue.length === 0 && (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                        Đúng tiến độ
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-[10px] mt-1 line-clamp-1 ${
                      requesterOverdue.length > 0 ? 'text-rose-700 font-medium' : 'text-slate-400'
                    }`}
                    title="Hạn đã qua (không tính việc chưa đặt hạn)"
                  >
                    Hạn đã qua (không tính việc chưa đặt hạn)
                  </div>
                </div>

                {/* THẺ 3: Đang xử lý */}
                <div
                  onClick={() => onNavigateToWorkOrders('Đang xử lý')}
                  className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-slate-200 shadow-xs hover:border-amber-400 hover:shadow-md transition-all cursor-pointer group active:scale-98 touch-manipulation"
                >
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Đang xử lý
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Wrench className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-amber-600 font-mono">
                    {inProgress.length}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                    <span>KTV đang sửa chữa</span>
                    <ArrowRight className="w-3.5 h-3.5 text-amber-500 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>

                {/* THẺ 4: Đã hoàn thành */}
                <div
                  onClick={() => onNavigateToWorkOrders('Hoàn thành')}
                  className="bg-white p-4 sm:p-5 rounded-2xl border-2 border-slate-200 shadow-xs hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer group active:scale-98 touch-manipulation"
                >
                  <div className="flex items-center justify-between text-slate-500 mb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Đã hoàn thành
                    </span>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <CheckCircle2 className="w-4 h-4" />
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-black text-emerald-600 font-mono">
                    {completed.length}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
                    <span>Đã xử lý xong</span>
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-500 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>
              </div>

              {/* Danh sách 5 việc gần nhất */}
              <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
                      <span>Yêu cầu gần đây ({requesterRecentOrders.length}/5 việc mới nhất)</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Nhấp vào từng công việc để xem chi tiết tiến độ hoặc hình ảnh hiện trường
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateToWorkOrders('all')}
                    className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 cursor-pointer py-1 px-2 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <span>Xem tất cả</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {requesterRecentOrders.length === 0 ? (
                  <div className="py-10 px-4 text-center rounded-2xl border-2 border-dashed border-slate-200 space-y-3 bg-slate-50/50">
                    <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
                      <Inbox className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-slate-800">Chưa có yêu cầu sự cố nào</h4>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto">
                        Tại các vị trí bạn phụ trách hiện chưa phát sinh yêu cầu sửa chữa. Khi có sự cố thiết bị, hãy bấm nút bên dưới để gửi yêu cầu đầu tiên.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenCreate('request', 'quick')}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-sm transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Gửi yêu cầu đầu tiên</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {requesterRecentOrders.map((wo) => {
                      const isOverdue =
                        wo.dueDate &&
                        wo.status !== 'Hoàn thành' &&
                        wo.status !== 'Đã đóng' &&
                        new Date(wo.dueDate).getTime() < Date.now();

                      return (
                        <div
                          key={wo.id}
                          onClick={() => onSelectWorkOrder(wo)}
                          className="p-3.5 rounded-2xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer flex items-center justify-between gap-3 text-xs active:scale-99 touch-manipulation group"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                                {wo.code}
                              </span>
                              <PriorityBadge priority={wo.priority} />
                              <StatusBadge status={wo.status} />
                              {isOverdue && (
                                <span className="text-[10px] bg-rose-600 text-white font-bold px-1.5 py-0.5 rounded-md animate-pulse">
                                  Trễ hạn
                                </span>
                              )}
                            </div>
                            <div className="font-bold text-slate-900 truncate text-xs sm:text-sm">
                              {wo.title}
                            </div>
                            <div className="text-slate-400 text-[11px] mt-1 flex items-center gap-2 flex-wrap">
                              <span>
                                Hạn:{' '}
                                <strong className={isOverdue ? 'text-rose-600' : 'text-slate-600'}>
                                  {wo.dueDate ? formatDateOnly(wo.dueDate) : 'Chưa đặt hạn'}
                                </strong>
                              </span>
                              <span>•</span>
                              <span>
                                KTV: <strong>{wo.assigneeName || 'Chờ phân công'}</strong>
                              </span>
                              <span>•</span>
                              <span>Tạo: {formatDateOnly(wo.createdAt)}</span>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* FLOATING ACTION BUTTON (FAB "+") ở góc dưới bên phải */}
              <div className="fixed bottom-20 sm:bottom-8 right-4 sm:right-6 z-40 mb-[env(safe-area-inset-bottom)]">
                <button
                  type="button"
                  onClick={() => onOpenCreate('request', 'quick')}
                  className="group flex items-center gap-2 px-4 py-3.5 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-xl shadow-blue-600/40 hover:shadow-2xl hover:scale-105 active:scale-95 transition-all cursor-pointer touch-manipulation border-2 border-white/30"
                  aria-label="Tạo việc nhanh"
                  title="Tạo việc nhanh (form rút gọn)"
                >
                  <Plus className="w-5 h-5 stroke-[2.5]" />
                  <span className="text-xs font-black pr-1 hidden xs:inline sm:inline">
                    Tạo việc nhanh
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* === DASHBOARD ADMIN: ĐẦY ĐỦ CÁC CHỈ SỐ TOÀN HỆ THỐNG === */}
      {isAdmin && (
        <>
          {/* Low Stock Warning Banner for Admin */}
          {lowStockItems.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start justify-between gap-3 animate-in fade-in">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-amber-100 text-amber-700 rounded-xl shrink-0 mt-0.5">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-amber-900">
                    Có {lowStockItems.length} vật tư trong kho sắp hết hàng (tồn kho &le; mức tối thiểu)!
                  </h4>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Các mặt hàng: {lowStockItems.slice(0, 3).map((i) => `${i.name} (${i.qty} ${i.unit})`).join(', ')}
                    {lowStockItems.length > 3 ? ` và ${lowStockItems.length - 3} mặt hàng khác...` : '.'}
                  </p>
                </div>
              </div>
              {onNavigateToInventory && (
                <button
                  onClick={() => onNavigateToInventory('low')}
                  className="shrink-0 text-xs font-bold text-amber-800 bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-xl transition-colors"
                >
                  Kiểm tra kho
                </button>
              )}
            </div>
          )}

          {/* 8 Admin Required Cards in Prompt (B) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Việc mới chưa giao */}
            <div
              onClick={() => onNavigateToWorkOrders('Mới')}
              className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-sky-300 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Việc chưa giao</span>
                <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
                  <Inbox className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-sky-600 font-mono">
                {unassignedNewOrders.length}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Cần phân công kỹ thuật viên</div>
            </div>

            {/* 1b. Việc giao chưa được nhận (Requirement 4) */}
            <div
              onClick={() => onNavigateToWorkOrders('unacknowledged')}
              className={`p-4 sm:p-5 rounded-2xl border shadow-xs transition-all cursor-pointer ${
                unacknowledgedOrders.length > 0
                  ? overdueUnacknowledgedCount > 0
                    ? 'bg-rose-50/60 border-rose-300 hover:border-rose-400 hover:shadow-md'
                    : 'bg-amber-50/60 border-amber-300 hover:border-amber-400 hover:shadow-md'
                  : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
              }`}
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className={`text-xs font-bold uppercase tracking-wider ${
                  overdueUnacknowledgedCount > 0 ? 'text-rose-700' : unacknowledgedOrders.length > 0 ? 'text-amber-800' : 'text-slate-500'
                }`}>
                  Giao chưa nhận
                </span>
                <div className={`p-2 rounded-xl ${
                  overdueUnacknowledgedCount > 0
                    ? 'bg-rose-100 text-rose-700 animate-pulse'
                    : unacknowledgedOrders.length > 0
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  <UserCheck className="w-4 h-4" />
                </div>
              </div>
              <div className={`text-2xl sm:text-3xl font-black font-mono ${
                overdueUnacknowledgedCount > 0 ? 'text-rose-600' : unacknowledgedOrders.length > 0 ? 'text-amber-600' : 'text-slate-800'
              }`}>
                {unacknowledgedOrders.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {overdueUnacknowledgedCount > 0 ? (
                  <span className="text-rose-600 font-bold">Có {overdueUnacknowledgedCount} việc quá 4 giờ!</span>
                ) : unacknowledgedOrders.length > 0 ? (
                  <span className="text-amber-700 font-medium">Bấm xem để đôn đốc</span>
                ) : (
                  'KTV đã nhận đủ việc'
                )}
              </div>
            </div>

            {/* 2. Việc quá hạn */}
            <div
              onClick={() => onNavigateToWorkOrders('overdue')}
              className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-rose-300 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Việc quá hạn</span>
                <div className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <AlertTriangle className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-rose-600 font-mono">
                {overdueOrders.length}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Cần đôn đốc hoàn thành</div>
            </div>

            {/* 3. Hoàn thành trong tháng */}
            <div
              onClick={() => onNavigateToWorkOrders('Hoàn thành')}
              className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Xong trong tháng</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-emerald-600 font-mono">
                {completedThisMonth.length}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Đã có ảnh nghiệm thu</div>
            </div>

            {/* 4. Thời gian xử lý trung bình */}
            <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Xử lý trung bình</span>
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Timer className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-indigo-600 font-mono">
                {avgResolutionTime}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Từ lúc tạo đến hoàn thành</div>
            </div>

            {/* 5. Bảo dưỡng quá hạn / sắp đến hạn */}
            <div
              onClick={onNavigateToMaintenance}
              className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Bảo dưỡng PPM</span>
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <CalendarCheck className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-purple-600 font-mono">
                <span className="text-rose-600">{maintenanceOverdueCount} trễ</span> / {maintenanceDueSoonCount} tới hạn
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Kế hoạch định kỳ thiết bị</div>
            </div>

            {/* 6. Chi phí tháng này so với tháng trước */}
            <div
              onClick={onNavigateToCosts}
              className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-300 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Chi phí tháng này</span>
                <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700 font-mono">
                {formatCurrency(thisMonthCost)}
              </div>
              <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1">
                {costDiffPercent >= 0 ? (
                  <span className="text-rose-600 font-bold">+{costDiffPercent}%</span>
                ) : (
                  <span className="text-emerald-600 font-bold">{costDiffPercent}%</span>
                )}
                <span>so với tháng trước ({formatCurrency(lastMonthCost)})</span>
              </div>
            </div>

            {/* 7. Vật tư sắp hết */}
            <div
              onClick={() => onNavigateToInventory?.('low_stock')}
              className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-amber-300 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Vật tư sắp hết</span>
                <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
                  <Package className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-amber-600 font-mono">
                {lowStockItems.length}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Dưới mức tồn kho an toàn</div>
            </div>

            {/* 8. Thiết bị hỏng / bảo dưỡng */}
            <div
              onClick={onNavigateToEquipment}
              className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-300 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider">Thiết bị hỏng/sửa</span>
                <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
                  <Cpu className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-slate-700 font-mono">
                {brokenOrMaintenanceEqCount}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Cần theo dõi phục hồi</div>
            </div>

            {/* 9. Thiết bị điện cần kiểm tra (Module C) */}
            <div
              onClick={onNavigateToElectrical}
              className={`p-4 sm:p-5 rounded-2xl border shadow-xs transition-all cursor-pointer ${
                electricalNeedCheckCount > 0
                  ? 'bg-amber-50/70 border-amber-300 hover:border-amber-400'
                  : 'bg-white border-slate-200 hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Thiết bị điện cần KT
                </span>
                <div
                  className={`p-2 rounded-xl ${
                    electricalNeedCheckCount > 0
                      ? 'bg-amber-500 text-white animate-pulse'
                      : 'bg-amber-50 text-amber-600'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                </div>
              </div>
              <div
                className={`text-2xl sm:text-3xl font-black font-mono ${
                  electricalNeedCheckCount > 0 ? 'text-amber-700' : 'text-slate-700'
                }`}
              >
                {electricalNeedCheckCount}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {electricalNeedCheckCount > 0
                  ? 'Cảnh báo nguy cơ an toàn điện'
                  : 'Hệ thống điện an toàn'}
              </div>
            </div>

            {/* 10. Việc KTV tự tạo trong tháng */}
            <div
              onClick={() => onNavigateToWorkOrders('self_created')}
              className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-center justify-between text-slate-500 mb-2">
                <span className="text-xs font-bold uppercase tracking-wider text-purple-900">
                  KTV tự tạo tháng này
                </span>
                <div className="p-2 rounded-xl bg-purple-50 text-purple-600">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl sm:text-3xl font-black text-purple-600 font-mono">
                {selfCreatedThisMonth.length}
              </div>
              <div className="text-[11px] text-slate-400 mt-1">
                Phát sinh tại hiện trường
              </div>
            </div>
          </div>

          {/* SVG 6-Month Cost Trend Chart */}
          <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Xu hướng chi phí kỹ thuật & bảo trì 6 tháng gần nhất
                </h3>
              </div>
              {onNavigateToCosts && (
                <button
                  onClick={onNavigateToCosts}
                  className="text-xs font-bold text-emerald-700 hover:underline flex items-center gap-1"
                >
                  <span>Mở trang chi phí</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="w-full h-44 sm:h-52">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 600 160">
                {[0, 0.5, 1].map((r, i) => {
                  const y = 130 - r * 100;
                  const val = Math.round((maxTrendValue * r) / 1000000);
                  return (
                    <g key={i}>
                      <line x1="45" y1={y} x2="570" y2={y} stroke="#f1f5f9" strokeWidth="1" strokeDasharray="3 3" />
                      <text x="40" y={y + 4} textAnchor="end" fontSize="10" fill="#94a3b8" fontFamily="monospace">
                        {val > 0 ? `${val}tr` : '0'}
                      </text>
                    </g>
                  );
                })}

                {monthlyTrends.map((m, idx) => {
                  const barWidth = 38;
                  const x = 75 + idx * 85;
                  const barHeight = (m.total / maxTrendValue) * 100;
                  const y = 130 - barHeight;

                  return (
                    <g key={m.key}>
                      <rect
                        x={x}
                        y="30"
                        width={barWidth}
                        height="100"
                        rx="6"
                        fill="#f8fafc"
                      />
                      {m.total > 0 && (
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={barHeight}
                          rx="6"
                          fill="#059669"
                        />
                      )}
                      {m.total > 0 && (
                        <text
                          x={x + barWidth / 2}
                          y={y - 5}
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight="bold"
                          fill="#065f46"
                          fontFamily="monospace"
                        >
                          {m.total >= 1000000 ? `${(m.total / 1000000).toFixed(1)}tr` : `${Math.round(m.total / 1000)}k`}
                        </text>
                      )}
                      <text
                        x={x + barWidth / 2}
                        y="148"
                        textAnchor="middle"
                        fontSize="11"
                        fontWeight="bold"
                        fill="#64748b"
                      >
                        {m.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Technician Workload Grid (Việc theo từng kỹ thuật viên) */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Việc theo từng kỹ thuật viên</span>
              </h3>
              <span className="text-xs text-slate-400">
                {technicians.length} nhân sự kỹ thuật
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {techWorkload.map(({ tech, totalCount, activeCount, doneCount }) => (
                <div
                  key={tech.uid}
                  className="p-3.5 rounded-2xl border border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0">
                      {tech.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{tech.displayName}</div>
                      <div className="text-slate-400 text-[11px]">{tech.email}</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-bold text-slate-800">
                      <span className="text-amber-600">{activeCount} đang xử lý</span> / {totalCount}
                    </div>
                    <div className="text-[10px] text-emerald-600 font-medium">
                      {doneCount} hoàn thành
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
