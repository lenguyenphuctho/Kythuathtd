import React, { useState, useMemo } from 'react';
import {
  CalendarCheck,
  Plus,
  Search,
  Filter,
  Calendar,
  List,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Edit,
  Trash2,
  Power,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Cpu,
  User,
  Zap,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  MaintenancePlan,
  LocationItem,
  EquipmentItem,
  UserProfile,
  ElectricalAsset,
  WorkOrder,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import {
  getFrequencyLabel,
  getMaintenanceDueStatus,
  checkAndGenerateMaintenanceWorkOrders,
} from '../../utils/maintenanceUtils';
import { PlanModal } from './PlanModal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { formatDateOnly } from '../../utils/formatters';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';

interface MaintenanceViewProps {
  plans: MaintenancePlan[];
  locations: LocationItem[];
  equipmentList: EquipmentItem[];
  electricalAssets?: ElectricalAsset[];
  technicians: UserProfile[];
  workOrders: WorkOrder[];
  onSuccessToast: (msg: string) => void;
  onError: (msg: string) => void;
  onRefreshAll?: () => void;
}

export const MaintenanceView: React.FC<MaintenanceViewProps> = ({
  plans,
  locations,
  equipmentList,
  electricalAssets = [],
  technicians,
  workOrders,
  onSuccessToast,
  onError,
  onRefreshAll,
}) => {
  const { userProfile, isAdmin, isTechnician } = useAuth();

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'overdue' | 'due_soon' | 'upcoming' | 'inactive'>('all');

  // Month navigation for Calendar view
  const [currentDate, setCurrentDate] = useState(new Date());

  // Modals state
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MaintenancePlan | null>(null);
  const [deletingPlan, setDeletingPlan] = useState<MaintenancePlan | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Maps for fast lookup
  const locationMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const equipmentMap = useMemo(() => new Map(equipmentList.map((e) => [e.id, e])), [equipmentList]);
  const electricalMap = useMemo(() => new Map(electricalAssets.map((ea) => [ea.id, ea])), [electricalAssets]);

  // Filter plans
  const filteredPlans = useMemo(() => {
    return plans.filter((plan) => {
      const dueInfo = getMaintenanceDueStatus(plan.nextDue);

      if (statusFilter === 'overdue' && (dueInfo.status !== 'overdue' || !plan.active)) return false;
      if (statusFilter === 'due_soon' && (dueInfo.status !== 'due_soon' || !plan.active)) return false;
      if (statusFilter === 'upcoming' && (dueInfo.status !== 'upcoming' || !plan.active)) return false;
      if (statusFilter === 'inactive' && plan.active) return false;

      if (assigneeFilter !== 'all' && plan.assigneeId !== assigneeFilter) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const titleMatch = plan.title.toLowerCase().includes(q);
        const loc = locationMap.get(plan.locationId);
        const locMatch = loc?.name.toLowerCase().includes(q) || false;
        const eq = plan.equipmentId ? equipmentMap.get(plan.equipmentId) : null;
        const eqMatch = eq?.name.toLowerCase().includes(q) || false;
        return titleMatch || locMatch || eqMatch;
      }

      return true;
    });
  }, [plans, statusFilter, assigneeFilter, searchTerm, locationMap, equipmentMap]);

  // Metrics summary
  const overdueCount = plans.filter((p) => p.active && getMaintenanceDueStatus(p.nextDue).status === 'overdue').length;
  const dueSoonCount = plans.filter((p) => p.active && getMaintenanceDueStatus(p.nextDue).status === 'due_soon').length;

  const handleManualScan = async () => {
    if (!userProfile) return;
    try {
      setIsScanning(true);
      const count = await checkAndGenerateMaintenanceWorkOrders(plans, workOrders, userProfile);
      if (count > 0) {
        onSuccessToast(`Đã tự động tạo mới ${count} phiếu công việc bảo dưỡng định kỳ`);
      } else {
        onSuccessToast('Tất cả kế hoạch đã được đồng bộ, không có kế hoạch nào cần tạo thêm phiếu lúc này');
      }
      onRefreshAll?.();
    } catch (err) {
      console.error(err);
      onError('Lỗi khi quét tạo phiếu bảo dưỡng');
    } finally {
      setIsScanning(false);
    }
  };

  const handleTogglePlanActive = async (plan: MaintenancePlan) => {
    try {
      await updateDoc(doc(db, 'maintenancePlans', plan.id), {
        active: !plan.active,
      });
      onSuccessToast(
        !plan.active
          ? `Đã kích hoạt kế hoạch "${plan.title}"`
          : `Đã tạm dừng kế hoạch "${plan.title}"`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `maintenancePlans/${plan.id}`);
      onError('Không thể thay đổi trạng thái kế hoạch');
    }
  };

  const handleDeletePlan = async () => {
    if (!deletingPlan) return;
    try {
      setIsDeleting(true);
      await deleteDoc(doc(db, 'maintenancePlans', deletingPlan.id));
      onSuccessToast(`Đã xóa kế hoạch bảo dưỡng "${deletingPlan.title}"`);
      setDeletingPlan(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `maintenancePlans/${deletingPlan.id}`);
      onError('Không thể xóa kế hoạch bảo dưỡng');
    } finally {
      setIsDeleting(false);
    }
  };

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 is Sunday

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  // Map plans to day of month
  const monthString = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthPlans = useMemo(() => {
    return plans.filter((p) => p.nextDue.startsWith(monthString));
  }, [plans, monthString]);

  return (
    <div className="space-y-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Bảo dưỡng định kỳ (PPM)</span>
            {overdueCount > 0 && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                {overdueCount} quá hạn
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Lập lịch bảo trì, checklist kiểm tra định kỳ và tự động sinh công việc kỹ thuật
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isAdmin && (
            <>
              <button
                onClick={handleManualScan}
                disabled={isScanning}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                title="Quét các kế hoạch đến hạn trong 3 ngày để sinh công việc nếu chưa có"
              >
                <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin text-blue-600' : ''}`} />
                <span>Quét sinh việc tự động</span>
              </button>

              <button
                onClick={() => {
                  setEditingPlan(null);
                  setIsPlanModalOpen(true);
                }}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all touch-manipulation"
              >
                <Plus className="w-4 h-4" />
                <span>Tạo kế hoạch bảo dưỡng</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
            <span>Tổng kế hoạch</span>
            <CalendarCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{plans.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {plans.filter((p) => p.active).length} đang kích hoạt
          </div>
        </div>

        <div className={`p-4 rounded-2xl border shadow-xs ${
          overdueCount > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-white border-slate-200'
        }`}>
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
            <span className={overdueCount > 0 ? 'text-rose-800 font-bold' : ''}>Quá hạn bảo dưỡng</span>
            <AlertTriangle className={`w-4 h-4 ${overdueCount > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <div className={`text-2xl font-black ${overdueCount > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {overdueCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Cần tạo việc xử lý ngay</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
            <span>Đến hạn trong 7 ngày</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black text-amber-600">{dueSoonCount}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Hệ thống sẽ tự sinh việc trước 3 ngày</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
            <span>Việc bảo dưỡng đang mở</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">
            {workOrders.filter((w) => w.orderType === 'maintenance' && w.status !== 'Hoàn thành' && w.status !== 'Đã đóng').length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">KTV đang thực hiện checklist</div>
        </div>
      </div>

      {/* Mode Switch & Search Filter Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm theo tên kế hoạch, thiết bị, khu vực..."
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
            />
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Danh sách</span>
            </button>
            <button
              onClick={() => setViewMode('calendar')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'calendar'
                  ? 'bg-white text-blue-700 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Lịch tháng</span>
            </button>
          </div>
        </div>

        {/* Filter controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Trạng thái hạn bảo dưỡng
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white"
            >
              <option value="all">Tất cả kế hoạch</option>
              <option value="overdue">Quá hạn (Đỏ)</option>
              <option value="due_soon">Đến hạn trong 7 ngày (Vàng)</option>
              <option value="upcoming">Chưa đến hạn (Xanh)</option>
              <option value="inactive">Đang tạm dừng</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
              Kỹ thuật viên phụ trách
            </label>
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white"
            >
              <option value="all">Tất cả KTV</option>
              {technicians.map((t) => (
                <option key={t.uid} value={t.uid}>
                  {t.displayName}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* VIEW 1: LIST MODE */}
      {viewMode === 'list' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredPlans.map((plan) => {
            const loc = locationMap.get(plan.locationId);
            const eq = plan.equipmentId ? equipmentMap.get(plan.equipmentId) : null;
            const ea = plan.electricalAssetId ? electricalMap.get(plan.electricalAssetId) : null;
            const dueInfo = getMaintenanceDueStatus(plan.nextDue);

            return (
              <div
                key={plan.id}
                className={`bg-white rounded-2xl p-4 sm:p-5 border transition-all shadow-xs flex flex-col justify-between ${
                  !plan.active
                    ? 'opacity-60 bg-slate-50/60 border-slate-200'
                    : dueInfo.status === 'overdue'
                    ? 'border-rose-300 ring-1 ring-rose-200'
                    : dueInfo.status === 'due_soon'
                    ? 'border-amber-300 ring-1 ring-amber-100'
                    : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="font-semibold text-xs px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
                      {getFrequencyLabel(plan.frequencyType, plan.frequencyValue)}
                    </span>
                    {plan.active ? (
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] border ${dueInfo.badgeClass}`}>
                        {dueInfo.label}
                      </span>
                    ) : (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                        Tạm dừng
                      </span>
                    )}
                  </div>

                  <h3 className="font-bold text-slate-900 text-base leading-snug mb-1">
                    {plan.title}
                  </h3>

                  <div className="space-y-1 text-xs text-slate-600 mb-3 pt-2 border-t border-slate-100">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">{loc?.name || 'Vị trí chung'}</span>
                    </div>

                    {eq && (
                      <div className="flex items-center gap-1.5 truncate font-medium text-slate-800">
                        <Cpu className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">[{eq.code}] {eq.name}</span>
                      </div>
                    )}

                    {ea && (
                      <div className="flex items-center gap-1.5 truncate font-medium text-amber-800">
                        <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                        <span className="truncate">[{ea.code}] {ea.name}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 text-slate-500">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>KTV phụ trách: {plan.assigneeName || 'Chưa gán'}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Hạn kế tiếp: <strong>{formatDateOnly(plan.nextDue)}</strong></span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <span className="text-slate-400 font-medium">
                    {plan.checklist?.length || 0} mục checklist
                  </span>

                  {isAdmin && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditingPlan(plan);
                          setIsPlanModalOpen(true);
                        }}
                        className="p-1.5 text-slate-500 hover:text-blue-600 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Sửa kế hoạch"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleTogglePlanActive(plan)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          plan.active
                            ? 'text-slate-500 hover:text-amber-600 hover:bg-amber-50'
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={plan.active ? 'Tạm dừng kế hoạch' : 'Tiếp tục kích hoạt'}
                      >
                        <Power className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeletingPlan(plan)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                        title="Xóa kế hoạch"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {filteredPlans.length === 0 && (
            <div className="col-span-full p-8 text-center bg-white rounded-3xl border border-slate-200">
              <CalendarCheck className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Không tìm thấy kế hoạch bảo dưỡng nào phù hợp.</p>
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: CALENDAR MONTHLY MODE */}
      {viewMode === 'calendar' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                Tháng {month + 1} / {year}
              </h2>
              <button
                onClick={nextMonth}
                className="p-2 text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500">
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span>Quá hạn</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span>7 ngày tới</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span>Còn xa</span>
              </div>
            </div>
          </div>

          {/* Days of week header */}
          <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs text-slate-400 py-1 border-b">
            <span>CN</span>
            <span>T2</span>
            <span>T3</span>
            <span>T4</span>
            <span>T5</span>
            <span>T6</span>
            <span>T7</span>
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {/* Empty offset days */}
            {Array.from({ length: firstDayIndex }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-20 sm:min-h-24 p-1 rounded-xl bg-slate-50/50" />
            ))}

            {/* Actual month days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const dayStr = `${monthString}-${String(day).padStart(2, '0')}`;
              const dayPlans = monthPlans.filter((p) => p.nextDue === dayStr);
              const isToday = dayStr === new Date().toISOString().split('T')[0];

              return (
                <div
                  key={day}
                  className={`min-h-20 sm:min-h-24 p-1.5 sm:p-2 rounded-xl border flex flex-col justify-between transition-colors ${
                    isToday ? 'bg-blue-50/50 border-blue-300' : 'bg-white border-slate-100 hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-bold ${isToday ? 'text-blue-700 bg-blue-100 px-1.5 py-0.5 rounded-full' : 'text-slate-700'}`}>
                      {day}
                    </span>
                    {dayPlans.length > 0 && (
                      <span className="text-[10px] font-bold text-slate-400">
                        {dayPlans.length} việc
                      </span>
                    )}
                  </div>

                  <div className="space-y-1 mt-1 overflow-y-auto max-h-16">
                    {dayPlans.map((p) => {
                      const due = getMaintenanceDueStatus(p.nextDue);
                      const dotBg =
                        due.status === 'overdue'
                          ? 'bg-rose-500 text-white'
                          : due.status === 'due_soon'
                          ? 'bg-amber-500 text-white'
                          : 'bg-emerald-600 text-white';

                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            if (isAdmin) {
                              setEditingPlan(p);
                              setIsPlanModalOpen(true);
                            }
                          }}
                          title={`${p.title} (${p.assigneeName || 'Chưa gán KTV'})`}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold truncate cursor-pointer hover:opacity-90 ${dotBg}`}
                        >
                          {p.title}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Plan Modal */}
      <PlanModal
        isOpen={isPlanModalOpen}
        plan={editingPlan}
        locations={locations}
        equipmentList={equipmentList}
        electricalAssets={electricalAssets}
        technicians={technicians}
        onClose={() => {
          setIsPlanModalOpen(false);
          setEditingPlan(null);
        }}
        onSuccess={onSuccessToast}
        onError={onError}
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletingPlan)}
        title="Xóa kế hoạch bảo dưỡng?"
        message={`Bạn có chắc muốn xóa kế hoạch "${deletingPlan?.title}"? Các công việc đã sinh trước đó vẫn được lưu giữ.`}
        confirmText="Xác nhận xóa"
        isLoading={isDeleting}
        onConfirm={handleDeletePlan}
        onCancel={() => setDeletingPlan(null)}
      />
    </div>
  );
};
