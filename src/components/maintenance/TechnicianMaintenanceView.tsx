import React, { useState, useMemo } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Search,
  Filter,
  Calendar,
  ChevronRight,
  Eye,
  CheckSquare,
  Wrench,
  Sparkles,
  MapPin,
  Cpu,
  Layers,
} from 'lucide-react';
import { WorkOrder, LocationItem, EquipmentItem, UserProfile } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { PriorityBadge, StatusBadge } from '../common/Badge';
import { formatDateOnly } from '../../utils/formatters';

interface TechnicianMaintenanceViewProps {
  workOrders: WorkOrder[];
  locations: LocationItem[];
  equipmentList: EquipmentItem[];
  onSelectWorkOrder: (wo: WorkOrder, readOnly?: boolean) => void;
  onOpenCreateSelfJob?: () => void;
  initialSubTab?: 'periodic' | 'completed';
}

export const TechnicianMaintenanceView: React.FC<TechnicianMaintenanceViewProps> = ({
  workOrders,
  locations,
  equipmentList,
  onSelectWorkOrder,
  onOpenCreateSelfJob,
  initialSubTab = 'periodic',
}) => {
  const { userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<'periodic' | 'completed'>(initialSubTab);

  React.useEffect(() => {
    if (initialSubTab) {
      setActiveTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Search and filter for "Đã hoàn thành" tab
  const [completedSearch, setCompletedSearch] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'repair' | 'maintenance' | 'self_created' | 'other'>('all');

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const getDaysDiff = (dueDateStr?: string) => {
    if (!dueDateStr) return 999;
    const due = new Date(dueDateStr.split('T')[0]).getTime();
    const cur = new Date(todayStr).getTime();
    return Math.round((due - cur) / (1000 * 60 * 60 * 24));
  };

  // 1. "Định kỳ" Tab: Active maintenance tasks assigned to this technician
  const periodicTasks = useMemo(() => {
    const list = workOrders.filter((w) => {
      const isMine = w.assigneeId === userProfile?.uid;
      const isMaint = w.orderType === 'maintenance' || Boolean(w.planId);
      const isActive = w.status !== 'Hoàn thành' && w.status !== 'Đã đóng';
      return isMine && isMaint && isActive;
    });

    // Sort by deadline:
    // Red (overdue, daysDiff < 0) first,
    // Yellow (due within 7 days, 0 <= daysDiff <= 7) second,
    // Green (distant, daysDiff > 7) third
    return list.sort((a, b) => {
      const diffA = getDaysDiff(a.dueDate);
      const diffB = getDaysDiff(b.dueDate);
      return diffA - diffB;
    });
  }, [workOrders, userProfile?.uid, todayStr]);

  // 2. "Đã hoàn thành" Tab: All tasks completed by this technician
  const allMyCompleted = useMemo(() => {
    return workOrders.filter(
      (w) => w.assigneeId === userProfile?.uid && (w.status === 'Hoàn thành' || w.status === 'Đã đóng')
    );
  }, [workOrders, userProfile?.uid]);

  // Extract unique available months (MM/YYYY) from completed orders
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    allMyCompleted.forEach((w) => {
      const dateStr = w.completedAt || w.closedAt || w.createdAt;
      if (dateStr) {
        const d = new Date(dateStr);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        monthsSet.add(`${mm}/${yyyy}`);
      }
    });
    return Array.from(monthsSet).sort().reverse();
  }, [allMyCompleted]);

  // Filtered completed list
  const filteredCompletedTasks = useMemo(() => {
    let list = allMyCompleted;

    // Search query
    if (completedSearch.trim()) {
      const q = completedSearch.toLowerCase();
      list = list.filter((w) => {
        const eq = equipmentList.find((e) => e.id === w.equipmentId);
        return (
          w.code.toLowerCase().includes(q) ||
          w.title.toLowerCase().includes(q) ||
          (w.description || '').toLowerCase().includes(q) ||
          (eq?.name || '').toLowerCase().includes(q)
        );
      });
    }

    // Month filter
    if (selectedMonth !== 'all') {
      list = list.filter((w) => {
        const dateStr = w.completedAt || w.closedAt || w.createdAt;
        if (!dateStr) return false;
        const d = new Date(dateStr);
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${mm}/${yyyy}` === selectedMonth;
      });
    }

    // Type filter
    if (typeFilter === 'repair') {
      list = list.filter((w) => w.orderType === 'repair' && !w.selfCreated);
    } else if (typeFilter === 'maintenance') {
      list = list.filter((w) => w.orderType === 'maintenance' || Boolean(w.planId));
    } else if (typeFilter === 'self_created') {
      list = list.filter((w) => w.selfCreated === true);
    } else if (typeFilter === 'other') {
      list = list.filter((w) => w.orderType !== 'repair' && w.orderType !== 'maintenance' && !w.selfCreated);
    }

    // Sort newest first
    return [...list].sort((a, b) => {
      const dateA = new Date(a.completedAt || a.closedAt || a.createdAt).getTime();
      const dateB = new Date(b.completedAt || b.closedAt || b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [allMyCompleted, completedSearch, selectedMonth, typeFilter, equipmentList]);

  const getLocationName = (locId: string) => {
    return locations.find((l) => l.id === locId)?.name || 'Vị trí chung';
  };

  const getEquipmentName = (eqId?: string) => {
    if (!eqId) return null;
    return equipmentList.find((e) => e.id === eqId)?.name || null;
  };

  return (
    <div className="space-y-4 px-3 sm:px-4 py-3 max-w-2xl mx-auto pb-24 animate-in fade-in">
      {/* Top Header Card */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-2xs">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
              <CalendarCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900 leading-tight">
                Quản lý Bảo dưỡng
              </h1>
              <p className="text-[11px] text-slate-500">
                Kế hoạch định kỳ & Hồ sơ việc đã hoàn thành
              </p>
            </div>
          </div>

          {onOpenCreateSelfJob && (
            <button
              onClick={onOpenCreateSelfJob}
              className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all active:scale-95 touch-manipulation"
            >
              <span>+ Tự tạo việc</span>
            </button>
          )}
        </div>

        {/* Subtabs Switcher */}
        <div className="grid grid-cols-2 gap-2 mt-3 p-1 bg-slate-100 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('periodic')}
            className={`min-h-[44px] py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 touch-manipulation ${
              activeTab === 'periodic'
                ? 'bg-white text-indigo-700 shadow-sm shadow-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarCheck className="w-4 h-4" />
            <span>Định kỳ ({periodicTasks.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('completed')}
            className={`min-h-[44px] py-2 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 touch-manipulation ${
              activeTab === 'completed'
                ? 'bg-white text-emerald-700 shadow-sm shadow-slate-200'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Đã hoàn thành ({allMyCompleted.length})</span>
          </button>
        </div>
      </div>

      {/* ===================== TAB 1: ĐỊNH KỲ ===================== */}
      {activeTab === 'periodic' && (
        <div className="space-y-3">
          {/* Summary Legend / Guidance */}
          <div className="flex items-center justify-between text-[11px] px-1 text-slate-500 font-medium">
            <span>Sắp xếp theo hạn chót bảo dưỡng:</span>
            <div className="flex items-center gap-2 font-bold text-[10px]">
              <span className="flex items-center gap-1 text-rose-600">
                <span className="w-2 h-2 rounded-full bg-rose-500" /> Quá hạn
              </span>
              <span className="flex items-center gap-1 text-amber-600">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> Trong 7 ngày
              </span>
              <span className="flex items-center gap-1 text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> Còn xa
              </span>
            </div>
          </div>

          {periodicTasks.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-3xl border border-dashed border-slate-200 space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <div className="text-sm font-black text-slate-800">
                Không có việc bảo dưỡng nào cần làm!
              </div>
              <p className="text-xs text-slate-400">
                Tất cả thiết bị được giao đã hoàn tất bảo dưỡng hoặc chưa tới hạn kỳ mới.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {periodicTasks.map((wo) => {
                const daysDiff = getDaysDiff(wo.dueDate);
                const isOverdue = daysDiff < 0;
                const isWithin7Days = daysDiff >= 0 && daysDiff <= 7;
                const eqName = getEquipmentName(wo.equipmentId);
                const locName = getLocationName(wo.locationId);

                // Checklist calculation
                const totalChecklist = wo.checklistResults?.length || 0;
                const doneChecklist = wo.checklistResults?.filter((c) => c.done).length || 0;

                return (
                  <div
                    key={wo.id}
                    onClick={() => onSelectWorkOrder(wo, false)}
                    className={`p-4 rounded-3xl border transition-all active:scale-98 cursor-pointer touch-manipulation shadow-2xs space-y-3 ${
                      isOverdue
                        ? 'bg-rose-50/40 border-rose-300 ring-1 ring-rose-200'
                        : isWithin7Days
                        ? 'bg-amber-50/40 border-amber-300 ring-1 ring-amber-200'
                        : 'bg-emerald-50/20 border-emerald-300'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                            {wo.code}
                          </span>
                          <PriorityBadge priority={wo.priority} />

                          {/* Deadline Badge */}
                          {isOverdue && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                              Quá hạn {Math.abs(daysDiff)} ngày
                            </span>
                          )}
                          {isWithin7Days && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500 text-white">
                              {daysDiff === 0 ? 'Hạn hôm nay' : `Hạn trong ${daysDiff} ngày`}
                            </span>
                          )}
                          {!isOverdue && !isWithin7Days && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Còn {daysDiff} ngày
                            </span>
                          )}
                        </div>

                        <h3 className="font-black text-slate-900 text-sm mt-1.5 leading-snug">
                          {wo.title}
                        </h3>
                      </div>

                      <StatusBadge status={wo.status} />
                    </div>

                    {/* Equipment & Location details */}
                    <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-white/70 p-2.5 rounded-2xl border border-slate-200/60">
                      <div className="flex items-center gap-1.5 truncate">
                        <Cpu className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                        <span className="truncate font-semibold">{eqName || 'Thiết bị cơ sở'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{locName}</span>
                      </div>
                    </div>

                    {/* Checklist progress bar */}
                    {totalChecklist > 0 && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-600 flex items-center gap-1">
                            <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                            Tiến độ Checklist:
                          </span>
                          <span className="font-mono font-bold text-indigo-700">
                            {doneChecklist}/{totalChecklist} mục ({Math.round((doneChecklist / totalChecklist) * 100)}%)
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              doneChecklist === totalChecklist ? 'bg-emerald-500' : 'bg-indigo-600'
                            }`}
                            style={{ width: `${(doneChecklist / totalChecklist) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Action Bar Footer */}
                    <div className="flex items-center justify-between pt-1 border-t border-slate-200/60 text-xs">
                      <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                        <Clock className="w-3 h-3" />
                        <span>Hạn chót: {formatDateOnly(wo.dueDate)}</span>
                      </div>

                      <div className="flex items-center gap-1 text-indigo-600 font-black">
                        <span>Làm việc & Nghiệm thu</span>
                        <ChevronRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================== TAB 2: ĐÃ HOÀN THÀNH ===================== */}
      {activeTab === 'completed' && (
        <div className="space-y-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={completedSearch}
              onChange={(e) => setCompletedSearch(e.target.value)}
              placeholder="Tìm theo mã CV, tên việc, thiết bị..."
              className="w-full min-h-[48px] pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-xs font-semibold focus:ring-2 focus:ring-emerald-500 shadow-2xs"
            />
          </div>

          {/* Month & Type Filter Controls */}
          <div className="grid grid-cols-2 gap-2">
            {/* Month Filter */}
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              >
                <option value="all">Tất cả các tháng</option>
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    Tháng {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Type Filter */}
            <div className="relative">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              >
                <option value="all">Tất cả loại việc</option>
                <option value="maintenance">Bảo dưỡng định kỳ</option>
                <option value="repair">Sửa chữa đột xuất</option>
                <option value="self_created">KTV tự tạo</option>
                <option value="other">Loại khác</option>
              </select>
            </div>
          </div>

          {/* Completed List */}
          {filteredCompletedTasks.length === 0 ? (
            <div className="p-8 text-center bg-white rounded-3xl border border-dashed border-slate-200 space-y-2">
              <Clock className="w-10 h-10 text-slate-400 mx-auto" />
              <div className="text-sm font-black text-slate-800">
                Không tìm thấy công việc hoàn thành nào
              </div>
              <p className="text-xs text-slate-400">
                Thử thay đổi bộ lọc tháng hoặc từ khóa tìm kiếm.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {filteredCompletedTasks.map((wo) => {
                const eqName = getEquipmentName(wo.equipmentId);
                const locName = getLocationName(wo.locationId);
                const finishDate = wo.completedAt || wo.closedAt || wo.createdAt;

                return (
                  <div
                    key={wo.id}
                    onClick={() => onSelectWorkOrder(wo, true)}
                    className="p-4 rounded-3xl bg-white border border-slate-200 hover:border-slate-300 shadow-2xs space-y-2.5 cursor-pointer active:scale-98 transition-all touch-manipulation"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                            {wo.code}
                          </span>
                          <PriorityBadge priority={wo.priority} />
                          {wo.selfCreated && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-purple-100 text-purple-800 border border-purple-200">
                              KTV tự tạo
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 flex items-center gap-1">
                            <Eye className="w-3 h-3 text-slate-500" /> Chỉ xem
                          </span>
                        </div>

                        <h4 className="font-black text-slate-900 text-sm mt-1.5 leading-snug">
                          {wo.title}
                        </h4>
                      </div>

                      <StatusBadge status={wo.status} />
                    </div>

                    {/* Metadata details */}
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                      {eqName && (
                        <span className="flex items-center gap-1 truncate max-w-[180px]">
                          <Cpu className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="truncate">{eqName}</span>
                        </span>
                      )}
                      <span className="flex items-center gap-1 truncate max-w-[150px]">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{locName}</span>
                      </span>
                    </div>

                    {/* Footer Row */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <div className="flex items-center gap-1 text-slate-500 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Hoàn tất: {formatDateOnly(finishDate)}</span>
                      </div>

                      <div className="flex items-center gap-1 text-blue-600 font-bold">
                        <span>Xem chi tiết</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
