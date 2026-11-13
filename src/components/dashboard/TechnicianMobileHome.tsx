import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Wrench,
  Camera,
  Package,
  CheckCircle2,
  AlertTriangle,
  Clock,
  CalendarCheck,
  Search,
  ChevronRight,
  Wifi,
  WifiOff,
  Flame,
  BellRing,
  Zap,
  MapPin,
  Cpu,
  X,
} from 'lucide-react';
import {
  WorkOrder,
  MaintenancePlan,
  InventoryItem,
  isWorkOrderAssignedTo,
  isWorkOrderCompleted,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { PriorityBadge, StatusBadge, AcknowledgmentBadge } from '../common/Badge';
import { formatDateOnly, formatRelativeTime } from '../../utils/formatters';
import { PWAInstallBanner } from '../common/PWAInstallBanner';
import { doc, updateDoc, addDoc, collection } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { triggerPushNotification } from '../../services/pushNotificationService';

interface TechnicianMobileHomeProps {
  workOrders: WorkOrder[];
  maintenancePlans: MaintenancePlan[];
  inventoryItems: InventoryItem[];
  onOpenWorkOrder: (wo: WorkOrder, readOnly?: boolean) => void;
  onOpenQuickCamera: (kind: 'before' | 'after', defaultWorkOrderId?: string) => void;
  onOpenQuickMaterial: () => void;
  onOpenQuickFinish: () => void;
  onOpenQuickMeter: () => void;
  onNavigateToTab: (tab: any, subTab?: string) => void;
  onShowToast?: (type: 'success' | 'error' | 'info', message: string) => void;
}

export const TechnicianMobileHome: React.FC<TechnicianMobileHomeProps> = ({
  workOrders,
  maintenancePlans,
  inventoryItems,
  onOpenWorkOrder,
  onOpenQuickCamera,
  onOpenQuickMaterial,
  onOpenQuickFinish,
  onOpenQuickMeter,
  onNavigateToTab,
  onShowToast,
}) => {
  const { userProfile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  
  // Persistent filter state across navigations
  const [taskFilter, setTaskFilter] = useState<'today' | 'overdue' | 'new' | 'completed' | 'all'>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('tech_task_filter');
      if (saved && ['today', 'overdue', 'new', 'completed', 'all'].includes(saved)) {
        return saved as any;
      }
    }
    return 'today';
  });

  const [isListHighlighted, setIsListHighlighted] = useState(false);
  const taskListRef = useRef<HTMLDivElement>(null);
  const [pendingQuickAction, setPendingQuickAction] = useState<'before' | 'after' | 'material' | 'finish' | null>(null);

  // Restore scroll position when returning from work order detail
  useEffect(() => {
    const savedPos = sessionStorage.getItem('tech_scroll_pos');
    if (savedPos) {
      const scrollTimer = setTimeout(() => {
        window.scrollTo({ top: parseInt(savedPos, 10), behavior: 'smooth' });
        sessionStorage.removeItem('tech_scroll_pos');
      }, 100);
      return () => clearTimeout(scrollTimer);
    }
  }, []);

  const handleSelectWorkOrder = (wo: WorkOrder, readOnly?: boolean) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('tech_scroll_pos', window.scrollY.toString());
      sessionStorage.setItem('tech_task_filter', taskFilter);
    }
    onOpenWorkOrder(wo, readOnly);
  };

  const handleUpdateFilter = (newFilter: 'today' | 'overdue' | 'new' | 'completed' | 'all') => {
    setTaskFilter(newFilter);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('tech_task_filter', newFilter);
    }
  };

  // Network status detection (Requirement 5)
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const todayStr = new Date().toISOString().split('T')[0];

  // 1. My assigned work orders (single, multiple or team)
  const myWorkOrders = useMemo(() => {
    return workOrders.filter((w) => isWorkOrderAssignedTo(w, userProfile?.uid));
  }, [workOrders, userProfile?.uid]);

  // 1b. Unacknowledged tasks assigned to this technician (Requirement 2)
  const unacknowledgedTasks = useMemo(() => {
    return myWorkOrders.filter(
      (w) => w.acknowledged === false && !isWorkOrderCompleted(w)
    );
  }, [myWorkOrders]);

  const [acknowledgingId, setAcknowledgingId] = useState<string | null>(null);

  const handleAcknowledgeTask = async (e: React.MouseEvent, wo: WorkOrder) => {
    e.stopPropagation();
    if (!userProfile) return;
    try {
      setAcknowledgingId(wo.id);
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'workOrders', wo.id), {
        acknowledged: true,
        acknowledgedAt: now,
        acknowledgedBy: userProfile.uid,
        acknowledgedByName: userProfile.displayName,
      });
      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: wo.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Đã nhận việc',
        details: `Kỹ thuật viên ${userProfile.displayName} đã xác nhận nhận việc trên điện thoại`,
        timestamp: now,
      });
      onShowToast?.('success', `Đã xác nhận nhận việc ${wo.code}`);
      triggerPushNotification('status_changed', wo.id, {
        actorName: userProfile.displayName,
        changes: 'xác nhận đã nhận việc',
      });
    } catch (err) {
      console.error('Failed to acknowledge task:', err);
      onShowToast?.('error', 'Không thể xác nhận nhận việc');
    } finally {
      setAcknowledgingId(null);
    }
  };

  // 2. Overdue tasks (dueDate < today)
  const overdueTasks = useMemo(() => {
    return myWorkOrders.filter((w) => {
      if (!w.dueDate || isWorkOrderCompleted(w)) return false;
      const due = w.dueDate.split('T')[0];
      return due < todayStr;
    });
  }, [myWorkOrders, todayStr]);

  // 3. Newly assigned tasks (status === 'Đã duyệt' or 'Mới')
  const newlyAssignedTasks = useMemo(() => {
    return myWorkOrders.filter((w) => w.status === 'Đã duyệt' || w.status === 'Mới');
  }, [myWorkOrders]);

  // 4. Maintenance due tasks (orderType === 'maintenance' or due today/overdue)
  const maintenanceDueTasks = useMemo(() => {
    return myWorkOrders.filter((w) => {
      if (isWorkOrderCompleted(w)) return false;
      if (w.orderType === 'maintenance') return true;
      if (w.dueDate) {
        return w.dueDate.split('T')[0] <= todayStr;
      }
      return false;
    });
  }, [myWorkOrders, todayStr]);

  // 4b. All completed tasks for this technician (bao gồm 'Đã đóng' cũ)
  const allCompletedTasks = useMemo(() => {
    return workOrders.filter(
      (w) => isWorkOrderAssignedTo(w, userProfile?.uid) && isWorkOrderCompleted(w)
    );
  }, [workOrders, userProfile?.uid]);

  // 4c. Tasks currently in progress / actionable by technician
  const actionableTasks = useMemo(() => {
    return myWorkOrders.filter(
      (w) => !isWorkOrderCompleted(w) && w.status !== 'Chờ duyệt'
    );
  }, [myWorkOrders]);

  // 5. Card click handlers
  const handleTodayCardClick = () => {
    handleUpdateFilter('today');
    const todayCount = myWorkOrders.filter((w) => {
      if (isWorkOrderCompleted(w)) return false;
      if (!w.dueDate) return true;
      return w.dueDate.split('T')[0] <= todayStr;
    }).length;

    if (todayCount === 0) {
      onShowToast?.('info', 'Hôm nay không có việc nào');
    }

    setTimeout(() => {
      taskListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setIsListHighlighted(true);
      setTimeout(() => setIsListHighlighted(false), 1000);
    }, 60);
  };

  const handleOverdueBannerClick = () => {
    handleUpdateFilter('overdue');
    setTimeout(() => {
      taskListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setIsListHighlighted(true);
      setTimeout(() => setIsListHighlighted(false), 1000);
    }, 60);
  };

  const handleMaintenanceCardClick = () => {
    onNavigateToTab('maintenance', 'periodic');
  };

  // 6. Quick Action Handlers (Requirement 6)
  const executeQuickAction = (action: 'before' | 'after' | 'material' | 'finish', targetWo: WorkOrder) => {
    if (!targetWo) {
      onShowToast?.('info', 'Chưa có việc đang xử lý, hãy chọn hoặc tự tạo việc');
      return;
    }

    if (action === 'before') {
      onOpenQuickCamera('before', targetWo.id);
    } else if (action === 'after') {
      onOpenQuickCamera('after', targetWo.id);
    } else if (action === 'material') {
      handleSelectWorkOrder(targetWo);
    } else if (action === 'finish') {
      handleSelectWorkOrder(targetWo);
    }
  };

  const handleQuickActionClick = (action: 'before' | 'after' | 'material' | 'finish') => {
    if (actionableTasks.length === 0) {
      onShowToast?.('info', 'Chưa có việc đang xử lý, hãy chọn hoặc tự tạo việc');
      return;
    }

    if (actionableTasks.length === 1) {
      executeQuickAction(action, actionableTasks[0]);
      return;
    }

    // >1 tasks: Open modal to pick task
    setPendingQuickAction(action);
  };

  // 7. Filtered list based on active pill
  const displayedTasks = useMemo(() => {
    let list = myWorkOrders;
    if (taskFilter === 'overdue') {
      list = overdueTasks;
    } else if (taskFilter === 'new') {
      list = newlyAssignedTasks;
    } else if (taskFilter === 'completed') {
      list = allCompletedTasks;
    } else if (taskFilter === 'today') {
      list = myWorkOrders.filter((w) => {
        if (isWorkOrderCompleted(w)) return false;
        if (!w.dueDate) return true;
        return w.dueDate.split('T')[0] <= todayStr;
      });
    }

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (w) =>
          w.code.toLowerCase().includes(q) ||
          w.title.toLowerCase().includes(q) ||
          (w.description || '').toLowerCase().includes(q)
      );
    }

    // Sort: Overdue first, then newly assigned, then by createdAt
    return [...list].sort((a, b) => {
      const aOverdue = a.dueDate && a.dueDate.split('T')[0] < todayStr;
      const bOverdue = b.dueDate && b.dueDate.split('T')[0] < todayStr;
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [myWorkOrders, overdueTasks, newlyAssignedTasks, allCompletedTasks, taskFilter, searchTerm, todayStr]);

  return (
    <div className="space-y-4 px-3 sm:px-4 py-3 max-w-xl mx-auto pb-24">
      {/* 1. Header: Greeting & Live Network Status */}
      <div className="flex items-center justify-between bg-white p-3.5 rounded-3xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-3">
          {userProfile?.photoURL ? (
            <img
              src={userProfile.photoURL}
              alt={userProfile.displayName}
              className="w-11 h-11 rounded-2xl ring-2 ring-blue-500/20 object-cover"
            />
          ) : (
            <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white font-black text-base flex items-center justify-center shadow-xs">
              {userProfile?.displayName?.charAt(0).toUpperCase() || 'K'}
            </div>
          )}
          <div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {userProfile?.role === 'admin' ? 'Quản trị viên (Chế độ Di động)' : 'Kỹ thuật viên'}
              </span>
            </div>
            <h2 className="text-base font-black text-slate-900 leading-tight">
              {userProfile?.displayName || 'Kỹ thuật viên'}
            </h2>
          </div>
        </div>

        {/* Network status indicator (Requirement 5) */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
            isOnline
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200 animate-pulse'
          }`}
          title={isOnline ? 'Đã kết nối máy chủ' : 'Mất kết nối mạng - Dữ liệu đang được giữ tạm'}
        >
          {isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span>Online</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-rose-600" />
              <span>Offline</span>
            </>
          )}
        </div>
      </div>

      {/* 2. PWA Install Prompt Banner (Requirement 1) */}
      <PWAInstallBanner compact />

      {/* 2b. Urgent Acknowledgment Needed Section (Requirement 2) */}
      {unacknowledgedTasks.length > 0 && (
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-400 p-4 rounded-3xl shadow-md space-y-3 animate-in fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
              <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-amber-950">
                Việc mới giao cần bạn xác nhận ({unacknowledgedTasks.length})
              </h3>
            </div>
            <span className="text-[10px] font-bold bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
              Chưa nhận việc
            </span>
          </div>

          <div className="space-y-2.5">
            {unacknowledgedTasks.map((wo) => {
              const isAcknowledging = acknowledgingId === wo.id;
              return (
                <div
                  key={wo.id}
                  onClick={() => handleSelectWorkOrder(wo)}
                  className="bg-white p-3.5 rounded-2xl border border-amber-200 shadow-2xs space-y-3 cursor-pointer transition-all active:scale-98"
                >
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                        {wo.code}
                      </span>
                      <PriorityBadge priority={wo.priority} />
                      <AcknowledgmentBadge workOrder={wo} />
                    </div>
                    <h4 className="font-black text-slate-900 text-sm mt-1.5 leading-snug">
                      {wo.title}
                    </h4>
                  </div>

                  {wo.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {wo.description}
                    </p>
                  )}

                  {/* Big Touch-Friendly Button >= 48px: ĐÃ NHẬN VIỆC */}
                  <button
                    type="button"
                    disabled={isAcknowledging}
                    onClick={(e) => handleAcknowledgeTask(e, wo)}
                    className="w-full min-h-[48px] p-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-98 text-white font-black text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/30 transition-all touch-manipulation cursor-pointer"
                  >
                    <CheckCircle2 className="w-5 h-5 text-white" />
                    <span>{isAcknowledging ? 'Đang ghi nhận...' : 'ĐÃ NHẬN VIỆC'}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. High Priority Reminders - Real Interactive Button (Requirement 2 & 4) */}
      {overdueTasks.length > 0 && (
        <button
          type="button"
          onClick={handleOverdueBannerClick}
          className="w-full min-h-[52px] p-3.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-2xl shadow-md shadow-rose-600/20 flex items-center justify-between text-left active:scale-[0.98] transition-all touch-manipulation cursor-pointer hover:brightness-105"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Flame className="w-5 h-5 text-white animate-bounce" />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-wide">
                Cảnh báo quá hạn xử lý!
              </div>
              <div className="text-[11px] text-rose-100">
                Bạn có <strong>{overdueTasks.length}</strong> công việc đã trễ hạn cần hoàn thành ngay
              </div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-rose-200 shrink-0" />
        </button>
      )}

      {newlyAssignedTasks.length > 0 && (
        <button
          type="button"
          onClick={() => {
            handleUpdateFilter('new');
            setTimeout(() => {
              taskListRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              setIsListHighlighted(true);
              setTimeout(() => setIsListHighlighted(false), 1000);
            }, 60);
          }}
          className="w-full min-h-[52px] p-3.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-2xl shadow-md shadow-amber-500/20 flex items-center justify-between text-left active:scale-[0.98] transition-all touch-manipulation cursor-pointer hover:brightness-105"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="text-xs font-black uppercase tracking-wide">
                Việc mới được phân công
              </div>
              <div className="text-[11px] text-amber-100">
                Có <strong>{newlyAssignedTasks.length}</strong> việc mới cần tiếp nhận xử lý
              </div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-200 shrink-0" />
        </button>
      )}

      {/* 4. Fast Metrics Row - Real Interactive Buttons (Requirement 1, 3, 4) */}
      <div className="grid grid-cols-2 gap-3">
        {/* Thẻ "Việc hôm nay" */}
        <button
          type="button"
          onClick={handleTodayCardClick}
          className={`min-h-[100px] p-4 rounded-3xl border text-left transition-all active:scale-[0.98] touch-manipulation cursor-pointer shadow-2xs ${
            taskFilter === 'today'
              ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/25 ring-2 ring-blue-400'
              : 'bg-white text-slate-800 border-slate-200 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className={`text-[11px] font-bold uppercase tracking-wider ${
              taskFilter === 'today' ? 'text-blue-100' : 'text-slate-500'
            }`}>
              Việc hôm nay
            </span>
            <Clock className={`w-4 h-4 ${taskFilter === 'today' ? 'text-white' : 'text-blue-600'}`} />
          </div>
          <div className="text-3xl font-black font-mono leading-none">
            {myWorkOrders.filter((w) => {
              if (isWorkOrderCompleted(w)) return false;
              if (!w.dueDate) return true;
              return w.dueDate.split('T')[0] <= todayStr;
            }).length}
          </div>
          <div className={`text-[10px] mt-1.5 font-medium ${
            taskFilter === 'today' ? 'text-blue-100' : 'text-slate-400'
          }`}>
            Chạm để xem & xử lý ngay
          </div>
        </button>

        {/* Thẻ "Đến hạn bảo dưỡng" */}
        <button
          type="button"
          onClick={handleMaintenanceCardClick}
          className="min-h-[100px] p-4 bg-white rounded-3xl border border-slate-200 text-left transition-all active:scale-[0.98] touch-manipulation cursor-pointer shadow-2xs hover:border-indigo-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Đến hạn bảo dưỡng
            </span>
            <CalendarCheck className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="text-3xl font-black font-mono leading-none text-slate-900">
            {maintenanceDueTasks.length}
          </div>
          <div className="text-[10px] text-indigo-600 mt-1.5 font-bold">
            Xem lịch định kỳ &rarr;
          </div>
        </button>
      </div>

      {/* 5. Requirement 2 & 6: Big Quick Action Buttons (Height >= 48px, One-handed thumb use, Modal selection if multiple tasks) */}
      <div className="bg-white p-4 rounded-3xl border border-slate-200 shadow-2xs space-y-2.5">
        <div className="flex items-center justify-between pb-1">
          <span className="text-xs font-black uppercase tracking-wider text-slate-700">
            Thao tác nhanh hiện trường
          </span>
          <span className="text-[10px] text-slate-400 font-medium">1 chạm mở ngay</span>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          {/* Nút lớn: Chụp ảnh trước */}
          <button
            type="button"
            onClick={() => handleQuickActionClick('before')}
            className="min-h-[52px] p-3 rounded-2xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 active:scale-[0.98] text-white font-bold text-xs flex items-center gap-2.5 shadow-sm shadow-amber-500/20 transition-all touch-manipulation cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div className="text-left leading-tight">
              <span className="block text-[13px] font-black">Chụp ảnh trước</span>
              <span className="text-[10px] text-amber-100 font-normal">Hiện trường ban đầu</span>
            </div>
          </button>

          {/* Nút lớn: Chụp ảnh sau */}
          <button
            type="button"
            onClick={() => handleQuickActionClick('after')}
            className="min-h-[52px] p-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 active:scale-[0.98] text-white font-bold text-xs flex items-center gap-2.5 shadow-sm shadow-emerald-600/20 transition-all touch-manipulation cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div className="text-left leading-tight">
              <span className="block text-[13px] font-black">Chụp ảnh sau</span>
              <span className="text-[10px] text-emerald-100 font-normal">Nghiệm thu hoàn tất</span>
            </div>
          </button>

          {/* Nút lớn: Ghi vật tư */}
          <button
            type="button"
            onClick={() => handleQuickActionClick('material')}
            className="min-h-[52px] p-3 rounded-2xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 active:scale-[0.98] text-white font-bold text-xs flex items-center gap-2.5 shadow-sm shadow-blue-600/20 transition-all touch-manipulation cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div className="text-left leading-tight">
              <span className="block text-[13px] font-black">Ghi vật tư</span>
              <span className="text-[10px] text-blue-100 font-normal">Xuất linh kiện kho</span>
            </div>
          </button>

          {/* Nút lớn: Hoàn thành */}
          <button
            type="button"
            onClick={() => handleQuickActionClick('finish')}
            className="min-h-[52px] p-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 active:scale-[0.98] text-white font-bold text-xs flex items-center gap-2.5 shadow-sm shadow-indigo-600/20 transition-all touch-manipulation cursor-pointer"
          >
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="text-left leading-tight">
              <span className="block text-[13px] font-black">Hoàn thành việc</span>
              <span className="text-[10px] text-indigo-100 font-normal">Chuyển chờ duyệt</span>
            </div>
          </button>
        </div>
      </div>

      {/* 6. Requirement 3 & 7: Quick Search and Filtered Tasks List */}
      <div
        ref={taskListRef}
        className={`space-y-3 transition-all duration-300 rounded-3xl p-1 ${
          isListHighlighted ? 'ring-4 ring-blue-500/40 bg-blue-50/40 p-2' : ''
        }`}
      >
        {/* Quick Search */}
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo mã CV, tên thiết bị, phòng ban..."
            className="w-full min-h-[48px] pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-xs font-semibold focus:ring-2 focus:ring-blue-500 shadow-2xs"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
          <button
            type="button"
            onClick={() => handleUpdateFilter('today')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all touch-manipulation cursor-pointer ${
              taskFilter === 'today'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            Hôm nay ({myWorkOrders.filter((w) => {
              if (isWorkOrderCompleted(w)) return false;
              if (!w.dueDate) return true;
              return w.dueDate.split('T')[0] <= todayStr;
            }).length})
          </button>

          <button
            type="button"
            onClick={() => handleUpdateFilter('overdue')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all touch-manipulation cursor-pointer ${
              taskFilter === 'overdue'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            Quá hạn ({overdueTasks.length})
          </button>

          <button
            type="button"
            onClick={() => handleUpdateFilter('new')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all touch-manipulation cursor-pointer ${
              taskFilter === 'new'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            Mới giao ({newlyAssignedTasks.length})
          </button>

          <button
            type="button"
            onClick={() => handleUpdateFilter('completed')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all touch-manipulation cursor-pointer ${
              taskFilter === 'completed'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            Đã hoàn thành ({allCompletedTasks.length})
          </button>

          <button
            type="button"
            onClick={() => handleUpdateFilter('all')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl font-bold whitespace-nowrap transition-all touch-manipulation cursor-pointer ${
              taskFilter === 'all'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
            }`}
          >
            Tất cả ({myWorkOrders.length})
          </button>
        </div>

        {/* Task Cards */}
        {displayedTasks.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 bg-white rounded-3xl border border-dashed border-slate-200 space-y-2">
            <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500" />
            <div className="font-bold text-slate-700">
              {taskFilter === 'today' ? 'Hôm nay không có việc nào' : 'Không có việc nào trong mục này.'}
            </div>
            <p className="text-[11px] text-slate-400">
              {taskFilter === 'today'
                ? 'Bạn không có việc đến hạn trong ngày hôm nay.'
                : 'Tất cả công việc đã được hoàn thành hoặc chưa có phát sinh mới.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {displayedTasks.map((wo) => {
              const isCompleted = isWorkOrderCompleted(wo);
              const isOverdue = wo.dueDate && wo.dueDate.split('T')[0] < todayStr && !isCompleted;
              const isNew = wo.status === 'Đã duyệt' || wo.status === 'Mới';

              return (
                <div
                  key={wo.id}
                  onClick={() => handleSelectWorkOrder(wo, isCompleted || wo.status === 'Chờ duyệt')}
                  className={`p-4 rounded-3xl border transition-all active:scale-[0.98] cursor-pointer touch-manipulation shadow-2xs space-y-2.5 ${
                    isOverdue
                      ? 'bg-rose-50/50 border-rose-300 ring-1 ring-rose-200'
                      : isNew
                      ? 'bg-amber-50/40 border-amber-300'
                      : isCompleted
                      ? 'bg-slate-50/80 border-slate-200'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                          {wo.code}
                        </span>
                        <PriorityBadge priority={wo.priority} />
                        <AcknowledgmentBadge workOrder={wo} />
                        {wo.selfCreated && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                            KTV tự tạo
                          </span>
                        )}
                        {isOverdue && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white animate-pulse">
                            Quá hạn!
                          </span>
                        )}
                        {isNew && !isOverdue && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white">
                            Mới giao
                          </span>
                        )}
                        {isCompleted && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                            Chỉ xem
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-900 text-sm mt-1.5 line-clamp-2">
                        {wo.title}
                      </h4>
                    </div>

                    <StatusBadge status={wo.status} workOrder={wo} />
                  </div>

                  {wo.description && (
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {wo.description}
                    </p>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    <div className="flex items-center gap-2">
                      {wo.dueDate ? (
                        <span className={`font-mono font-semibold flex items-center gap-1 ${
                          isOverdue ? 'text-rose-600 font-bold' : 'text-slate-600'
                        }`}>
                          <Clock className="w-3 h-3" />
                          Hạn: {formatDateOnly(wo.dueDate)}
                        </span>
                      ) : (
                        <span>Tạo: {formatRelativeTime(wo.createdAt)}</span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 text-blue-600 font-bold">
                      <span>Chi tiết</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Requirement 6: Modal "Chọn công việc" for Quick Actions when >1 actionable tasks */}
      {pendingQuickAction && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-black text-slate-900 text-base">
                  Chọn công việc đang xử lý
                </h3>
                <p className="text-xs text-slate-500">
                  {pendingQuickAction === 'before' && 'Chọn công việc để chụp ảnh trước'}
                  {pendingQuickAction === 'after' && 'Chọn công việc để chụp ảnh sau'}
                  {pendingQuickAction === 'material' && 'Chọn công việc để ghi xuất vật tư'}
                  {pendingQuickAction === 'finish' && 'Chọn công việc cần hoàn thành'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPendingQuickAction(null)}
                className="w-9 h-9 rounded-full bg-slate-200/80 flex items-center justify-center text-slate-600 hover:bg-slate-300 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
              {actionableTasks.map((wo) => (
                <div
                  key={wo.id}
                  onClick={() => {
                    const action = pendingQuickAction;
                    setPendingQuickAction(null);
                    executeQuickAction(action, wo);
                  }}
                  className="p-3.5 rounded-2xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer active:scale-[0.98] flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100">
                        {wo.code}
                      </span>
                      <PriorityBadge priority={wo.priority} />
                      <StatusBadge status={wo.status} workOrder={wo} />
                    </div>
                    <div className="font-bold text-slate-900 text-sm truncate">
                      {wo.title}
                    </div>
                    {wo.dueDate && (
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Hạn: {formatDateOnly(wo.dueDate)}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    className="min-h-[40px] px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shrink-0 cursor-pointer"
                  >
                    Chọn việc này
                  </button>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-slate-100 bg-slate-50 text-center">
              <button
                type="button"
                onClick={() => setPendingQuickAction(null)}
                className="w-full min-h-[44px] py-2.5 rounded-xl text-slate-600 font-bold text-xs hover:bg-slate-200/60 transition-all cursor-pointer"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

