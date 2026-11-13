import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginView } from './components/auth/LoginView';
import { Navbar } from './components/common/Navbar';
import { BottomNav, NavTab } from './components/common/BottomNav';
import { Sidebar } from './components/common/Sidebar';
import { ToastContainer, ToastMessage, ToastType } from './components/common/Toast';
import { DashboardView } from './components/dashboard/DashboardView';
import { WorkOrderList } from './components/workorders/WorkOrderList';
import { EquipmentView } from './components/equipment/EquipmentView';
import { LocationView } from './components/locations/LocationView';
import { InventoryView } from './components/inventory/InventoryView';
import { MaintenanceView } from './components/maintenance/MaintenanceView';
import { CostsView } from './components/costs/CostsView';
import { ElectricalView } from './components/electrical/ElectricalView';
import { ReportsView } from './components/reports/ReportsView';
import { UserManagementView } from './components/users/UserManagementView';
import { SettingsView } from './components/settings/SettingsView';
import { CreateWorkOrderModal } from './components/workorders/CreateWorkOrderModal';
import { WorkOrderDetailModal } from './components/workorders/WorkOrderDetailModal';
import { TechnicianMobileHome } from './components/dashboard/TechnicianMobileHome';
import { AdminMobileHome } from './components/dashboard/AdminMobileHome';
import { TechnicianMaintenanceView } from './components/maintenance/TechnicianMaintenanceView';
import { TechnicianSelfCreateModal } from './components/workorders/TechnicianSelfCreateModal';
import { AdminQuickAssignModal } from './components/workorders/AdminQuickAssignModal';
import { ZaloShareModal } from './components/workorders/ZaloShareModal';
import { ProfileView } from './components/profile/ProfileView';
import { QuickCameraCaptureModal } from './components/common/QuickCameraCaptureModal';
import { AppUpdateBanner } from './components/common/AppUpdateBanner';
import { PendingApprovalView } from './components/auth/PendingApprovalView';
import { NotificationPromptBanner } from './components/notifications/NotificationPromptBanner';
import { NotificationSettingsModal } from './components/notifications/NotificationSettingsModal';
import {
  WorkOrder,
  LocationItem,
  EquipmentItem,
  UserProfile,
  WorkOrderSource,
  InventoryItem,
  InventoryTransaction,
  MaintenancePlan,
  MaintenanceLog,
  CostEntry,
  WorkOrderMaterial,
  ElectricalAsset,
  MeterReading,
  ElectricalCheck,
  AllowedUser,
  AccessRequest,
  isWorkOrderCompleted,
} from './types';
import { checkAndGenerateMaintenanceWorkOrders } from './utils/maintenanceUtils';
import {
  collection,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
  subscribeDatabaseError,
  clearDatabaseError,
  verifyServerConnection,
  isDatabaseLocked,
} from './services/firebase';
import { Wrench, ShieldAlert, LogOut, Loader2, ArrowRightLeft, AlertOctagon, RefreshCw, Copy, Check } from 'lucide-react';

function MainApp() {
  const {
    currentUser,
    userProfile,
    loading: authLoading,
    isAdmin,
    isTechnician,
    isRequester,
    isViewer,
    isPendingApproval,
    userLocationIds,
    recheckApproval,
    logout,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Database Connection Error & Write-Lock State (Requirement 2 & 3)
  const [dbErrorMessage, setDbErrorMessage] = useState<string | null>(null);
  const [isDbLocked, setIsDbLocked] = useState<boolean>(false);
  const [isRetryingConnection, setIsRetryingConnection] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeDatabaseError((err) => {
      setDbErrorMessage(err);
      setIsDbLocked(isDatabaseLocked());
    });
    return () => unsub();
  }, []);

  // Kiểm tra đọc tài liệu cấu hình từ máy chủ khi khởi động (Requirement 3)
  useEffect(() => {
    if (!currentUser) return;
    verifyServerConnection().then((res) => {
      if (!res.success) {
        setIsDbLocked(true);
      }
    });
  }, [currentUser]);

  const handleRetryConnection = async () => {
    setIsRetryingConnection(true);
    try {
      const res = await verifyServerConnection();
      if (res.success) {
        clearDatabaseError();
        setIsDbLocked(false);
        addToast('success', 'Kết nối lại cơ sở dữ liệu thành công!');
      } else {
        addToast('error', `Kết nối thất bại: ${res.error || 'Vẫn chưa kết nối được với Firestore'}`);
      }
    } finally {
      setIsRetryingConnection(false);
    }
  };

  // Safe write-action guard to prevent writing to offline cache when DB is disconnected
  const checkDbCanWrite = (actionName = 'thao tác'): boolean => {
    if (isDbLocked || dbErrorMessage) {
      addToast('error', `Thao tác bị khóa: Không thể thực hiện ${actionName} khi mất kết nối cơ sở dữ liệu.`);
      return false;
    }
    return true;
  };

  // Admin mobile & preview as technician mode (Requirement 2 & 3)
  const [adminViewAsTech, setAdminViewAsTech] = useState<boolean>(false);
  const [isAdminQuickAssignOpen, setIsAdminQuickAssignOpen] = useState(false);
  const [adminQuickAssignTarget, setAdminQuickAssignTarget] = useState<WorkOrder | null>(null);
  const [adminZaloTarget, setAdminZaloTarget] = useState<WorkOrder | null>(null);
  const [adminZaloTech, setAdminZaloTech] = useState<UserProfile | null>(null);
  const [isNotificationSettingsOpen, setIsNotificationSettingsOpen] = useState<boolean>(false);

  // Collections state synced realtime
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [allowedUsers, setAllowedUsers] = useState<AllowedUser[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [disabledEmailCopied, setDisabledEmailCopied] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryTransactions, setInventoryTransactions] = useState<InventoryTransaction[]>([]);
  const [maintenancePlans, setMaintenancePlans] = useState<MaintenancePlan[]>([]);
  const [maintenanceLogs, setMaintenanceLogs] = useState<MaintenanceLog[]>([]);
  const [hasCheckedAutoMaintenance, setHasCheckedAutoMaintenance] = useState(false);
  const [costEntries, setCostEntries] = useState<CostEntry[]>([]);
  const [allMaterials, setAllMaterials] = useState<WorkOrderMaterial[]>([]);
  const [electricalAssets, setElectricalAssets] = useState<ElectricalAsset[]>([]);
  const [meterReadings, setMeterReadings] = useState<MeterReading[]>([]);
  const [electricalChecks, setElectricalChecks] = useState<ElectricalCheck[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  // Cross-component modals
  const [quickCreateSource, setQuickCreateSource] = useState<WorkOrderSource | null>(null);
  const [quickCreateMode, setQuickCreateMode] = useState<'quick' | 'standard'>('quick');
  const [quickCreateElectricalAssetId, setQuickCreateElectricalAssetId] = useState<string | undefined>(undefined);
  const [inspectedWorkOrder, setInspectedWorkOrder] = useState<WorkOrder | null>(null);
  const [inspectedWorkOrderReadOnly, setInspectedWorkOrderReadOnly] = useState<boolean>(false);
  const [isTechSelfCreateOpen, setIsTechSelfCreateOpen] = useState<boolean>(false);
  const [workOrderInitialStatus, setWorkOrderInitialStatus] = useState<string>('all');

  // Mobile detection for technician view
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [maintenanceInitialSubTab, setMaintenanceInitialSubTab] = useState<'periodic' | 'completed'>('periodic');


  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Quick Camera state
  const [isQuickCameraOpen, setIsQuickCameraOpen] = useState(false);
  const [quickCameraKind, setQuickCameraKind] = useState<'before' | 'after'>('before');
  const [quickCameraWorkOrderId, setQuickCameraWorkOrderId] = useState<string | undefined>(undefined);


  const addToast = (type: ToastType, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Deep linking support (?cv=<code_or_id> or ?orderId=<id>) - Requirement 3
  const [deepLinkParam, setDeepLinkParam] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const urlParams = new URLSearchParams(window.location.search);
    const cvFromUrl = urlParams.get('cv');
    const orderIdFromUrl = urlParams.get('orderId');
    const initialTarget = cvFromUrl || orderIdFromUrl;
    if (initialTarget) {
      sessionStorage.setItem('pendingWorkOrderParam', initialTarget);
      return initialTarget;
    }
    return sessionStorage.getItem('pendingWorkOrderParam') || sessionStorage.getItem('pendingOrderId');
  });

  useEffect(() => {
    // If no deep link param, still loading data, no profile, or user is still waiting for approval, wait (keep param stored)
    if (!deepLinkParam || isLoadingData || !currentUser || !userProfile || isPendingApproval) return;

    const trimmedTarget = deepLinkParam.trim().toLowerCase();
    const targetOrder = workOrders.find(
      (w) => w.code.toLowerCase() === trimmedTarget || w.id.toLowerCase() === trimmedTarget
    );

    if (targetOrder) {
      // Permission check:
      // Admin, Technician, Viewer can view all orders
      // Requester can view their own requests OR requests belonging to their assigned locations
      const isAllowed =
        isAdmin ||
        isTechnician ||
        isViewer ||
        targetOrder.requesterId === currentUser.uid ||
        Boolean(
          userLocationIds &&
          ((targetOrder.locationId && userLocationIds.includes(targetOrder.locationId)) ||
           (targetOrder.requestingStoreId && userLocationIds.includes(targetOrder.requestingStoreId)))
        );

      if (isAllowed) {
        setInspectedWorkOrder(targetOrder);
        setActiveTab('workorders');
        addToast('info', `Đang mở công việc: ${targetOrder.code}`);
      } else {
        addToast('error', 'Bạn không có quyền xem công việc này');
      }

      sessionStorage.removeItem('pendingWorkOrderParam');
      sessionStorage.removeItem('pendingOrderId');
      setDeepLinkParam(null);
      if (typeof window !== 'undefined' && window.history.replaceState) {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
    } else if (!isLoadingData && workOrders.length > 0) {
      if (isRequester) {
        addToast('error', 'Bạn không có quyền xem công việc này');
      } else {
        addToast('error', `Công việc với mã "${deepLinkParam}" không tồn tại hoặc đã bị xóa`);
      }
      sessionStorage.removeItem('pendingWorkOrderParam');
      sessionStorage.removeItem('pendingOrderId');
      setDeepLinkParam(null);
      if (typeof window !== 'undefined' && window.history.replaceState) {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, '', cleanUrl);
      }
    }
  }, [
    deepLinkParam,
    workOrders,
    isLoadingData,
    currentUser,
    userProfile,
    isPendingApproval,
    isAdmin,
    isTechnician,
    isViewer,
    isRequester,
  ]);

  // Realtime Listeners for Firestore collections
  useEffect(() => {
    if (!currentUser || !userProfile) return;

    setIsLoadingData(true);

    // 1. Work Orders (Scoped strictly by role to comply with Firestore rules)
    let unsubOrders: () => void;

    if (isAdmin || isViewer) {
      unsubOrders = onSnapshot(
        collection(db, 'workOrders'),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrder));
          items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setWorkOrders(items);
          setIsLoadingData(false);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'workOrders');
          }
          setIsLoadingData(false);
        }
      );
    } else if (isTechnician) {
      // Kỹ thuật viên: Chạy các truy vấn con khớp với Security Rules rồi gộp
      // (1: assigneeIds array-contains, 2: assigneeId cũ, 3: assigneeType == 'team', 4: do mình tạo)
      const queryResultsMap: Record<string, Map<string, WorkOrder>> = {
        arrayContains: new Map(),
        legacyAssignee: new Map(),
        teamAssignee: new Map(),
        createdTasks: new Map(),
      };

      const recomputeMergedOrders = () => {
        const merged = new Map<string, WorkOrder>();
        Object.values(queryResultsMap).forEach((subMap) => {
          subMap.forEach((val, key) => merged.set(key, val));
        });
        const items = Array.from(merged.values());
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setWorkOrders(items);
        setIsLoadingData(false);
      };

      const qArray = query(
        collection(db, 'workOrders'),
        where('assigneeIds', 'array-contains', currentUser.uid)
      );
      const qLegacy = query(
        collection(db, 'workOrders'),
        where('assigneeId', '==', currentUser.uid)
      );
      const qTeam = query(
        collection(db, 'workOrders'),
        where('assigneeType', '==', 'team')
      );
      const qCreated = query(
        collection(db, 'workOrders'),
        where('createdBy', '==', currentUser.uid)
      );

      const unsub1 = onSnapshot(qArray, (snap) => {
        queryResultsMap.arrayContains.clear();
        snap.docs.forEach((d) => queryResultsMap.arrayContains.set(d.id, { id: d.id, ...d.data() } as WorkOrder));
        recomputeMergedOrders();
      }, (err) => console.warn('Array query non-fatal note:', err));

      const unsub2 = onSnapshot(qLegacy, (snap) => {
        queryResultsMap.legacyAssignee.clear();
        snap.docs.forEach((d) => queryResultsMap.legacyAssignee.set(d.id, { id: d.id, ...d.data() } as WorkOrder));
        recomputeMergedOrders();
      }, (err) => console.warn('Legacy query non-fatal note:', err));

      const unsub3 = onSnapshot(qTeam, (snap) => {
        queryResultsMap.teamAssignee.clear();
        snap.docs.forEach((d) => queryResultsMap.teamAssignee.set(d.id, { id: d.id, ...d.data() } as WorkOrder));
        recomputeMergedOrders();
      }, (err) => console.warn('Team query non-fatal note:', err));

      const unsub4 = onSnapshot(qCreated, (snap) => {
        queryResultsMap.createdTasks.clear();
        snap.docs.forEach((d) => queryResultsMap.createdTasks.set(d.id, { id: d.id, ...d.data() } as WorkOrder));
        recomputeMergedOrders();
      }, (err) => console.warn('Created query non-fatal note:', err));

      unsubOrders = () => {
        unsub1();
        unsub2();
        unsub3();
        unsub4();
      };
    } else {
      // Người yêu cầu: Chạy truy vấn theo locationId (in userLocationIds) và theo requesterId (do chính mình gửi) rồi gộp kết quả
      const queryResultsMap: Record<string, Map<string, WorkOrder>> = {
        requesterTasks: new Map(),
      };

      const recomputeMergedOrders = () => {
        const merged = new Map<string, WorkOrder>();
        Object.values(queryResultsMap).forEach((subMap) => {
          subMap.forEach((val, key) => merged.set(key, val));
        });
        const items = Array.from(merged.values());
        items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setWorkOrders(items);
        setIsLoadingData(false);
      };

      const unsubs: (() => void)[] = [];

      // 1. Truy vấn các yêu cầu do chính mình gửi
      const qRequester = query(collection(db, 'workOrders'), where('requesterId', '==', currentUser.uid));
      const unsubReq = onSnapshot(
        qRequester,
        (snap) => {
          queryResultsMap.requesterTasks.clear();
          snap.docs.forEach((d) => queryResultsMap.requesterTasks.set(d.id, { id: d.id, ...d.data() } as WorkOrder));
          recomputeMergedOrders();
        },
        (err) => {
          console.warn('Requester tasks query non-fatal note:', err);
          setIsLoadingData(false);
        }
      );
      unsubs.push(unsubReq);

      // 2. Nếu người dùng có các vị trí được gán, chia thành các đoạn tối đa 30 phần tử (giới hạn Firestore in)
      if (userLocationIds && userLocationIds.length > 0) {
        const chunkSize = 30;
        for (let i = 0; i < userLocationIds.length; i += chunkSize) {
          const chunk = userLocationIds.slice(i, i + chunkSize);
          const chunkKey = `locChunk_${i}`;
          queryResultsMap[chunkKey] = new Map();

          const qLoc = query(collection(db, 'workOrders'), where('locationId', 'in', chunk));
          const unsubLoc = onSnapshot(
            qLoc,
            (snap) => {
              queryResultsMap[chunkKey].clear();
              snap.docs.forEach((d) => queryResultsMap[chunkKey].set(d.id, { id: d.id, ...d.data() } as WorkOrder));
              recomputeMergedOrders();
            },
            (err) => {
              console.warn(`Location chunk query ${i} note:`, err);
              setIsLoadingData(false);
            }
          );
          unsubs.push(unsubLoc);
        }
      } else {
        // Tài khoản chưa được gán vị trí: chỉ hiển thị việc do mình tạo (nếu có)
        setIsLoadingData(false);
      }

      unsubOrders = () => {
        unsubs.forEach((fn) => fn());
      };
    }

    // 2. Locations (all authenticated users can read)
    const unsubLocations = onSnapshot(
      collection(db, 'locations'),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as LocationItem));
        items.sort((a, b) => a.name.localeCompare(b.name));
        setLocations(items);
      },
      (err) => {
        if (auth.currentUser) {
          handleFirestoreError(err, OperationType.GET, 'locations');
        }
      }
    );

    // 3. Equipment (all authenticated users can read)
    const unsubEquipment = onSnapshot(
      collection(db, 'equipment'),
      (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as EquipmentItem));
        items.sort((a, b) => a.name.localeCompare(b.name));
        setEquipmentList(items);
      },
      (err) => {
        if (auth.currentUser) {
          handleFirestoreError(err, OperationType.GET, 'equipment');
        }
      }
    );

    // 4. Users (all authenticated users can read display names)
    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const items = snap.docs.map((d) => ({ uid: d.id, ...d.data() } as unknown as UserProfile));
        setUsers(items);
      },
      (err) => {
        if (auth.currentUser) {
          handleFirestoreError(err, OperationType.GET, 'users');
        }
      }
    );

    // 4b. Allowed Users (admin only)
    let unsubAllowedUsers = () => {};
    let unsubAccessRequests = () => {};
    if (isAdmin) {
      unsubAllowedUsers = onSnapshot(
        collection(db, 'allowedUsers'),
        (snap) => {
          const items = snap.docs.map((d) => ({ ...d.data() } as AllowedUser));
          items.sort((a, b) => a.email.localeCompare(b.email));
          setAllowedUsers(items);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'allowedUsers');
          }
        }
      );

      // 4c. Access Requests (admin only)
      unsubAccessRequests = onSnapshot(
        collection(db, 'accessRequests'),
        (snap) => {
          const items = snap.docs.map((d) => ({ ...d.data() } as AccessRequest));
          items.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
          setAccessRequests(items);
        },
        (err) => {
          // Non-fatal: rules may not have been published in Firebase Console yet by the user
          console.warn('Lưu ý: Chưa tải được collection accessRequests (cần dán Security Rules mới vào Firebase Console):', err);
        }
      );
    }

    // 5. Inventory Items (tech & admin only)
    let unsubInventory = () => {};
    if (isAdmin || isTechnician) {
      unsubInventory = onSnapshot(
        collection(db, 'inventoryItems'),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryItem));
          items.sort((a, b) => a.name.localeCompare(b.name));
          setInventoryItems(items);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'inventoryItems');
          }
        }
      );
    }

    // 6. Inventory Transactions (tech & admin only)
    let unsubTransactions = () => {};
    if (isAdmin || isTechnician) {
      unsubTransactions = onSnapshot(
        collection(db, 'inventoryTransactions'),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as InventoryTransaction));
          items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setInventoryTransactions(items);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'inventoryTransactions');
          }
        }
      );
    }

    // 7. Maintenance Plans (tech & admin only)
    let unsubPlans = () => {};
    if (isAdmin || isTechnician) {
      unsubPlans = onSnapshot(
        collection(db, 'maintenancePlans'),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MaintenancePlan));
          items.sort((a, b) => a.nextDue.localeCompare(b.nextDue));
          setMaintenancePlans(items);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'maintenancePlans');
          }
        }
      );
    }

    // 8. Maintenance Logs (tech, admin & viewer)
    let unsubLogs = () => {};
    if (isAdmin || isTechnician || isViewer) {
      unsubLogs = onSnapshot(
        collection(db, 'maintenanceLogs'),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MaintenanceLog));
          items.sort((a, b) => new Date(b.doneAt).getTime() - new Date(a.doneAt).getTime());
          setMaintenanceLogs(items);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'maintenanceLogs');
          }
        }
      );
    }

    // 9. Cost Entries (Admin only)
    let unsubCosts = () => {};
    if (isAdmin) {
      unsubCosts = onSnapshot(
        collection(db, 'costEntries'),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as CostEntry));
          items.sort((a, b) => b.date.localeCompare(a.date));
          setCostEntries(items);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'costEntries');
          }
        }
      );
    }

    // 10. Work Order Materials (tech & admin only)
    let unsubAllMaterials = () => {};
    if (isAdmin || isTechnician) {
      unsubAllMaterials = onSnapshot(
        collection(db, 'workOrderMaterials'),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrderMaterial));
          setAllMaterials(items);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'workOrderMaterials');
          }
        }
      );
    }

    // 11. Electrical Assets (tech & admin only)
    let unsubElectricalAssets = () => {};
    let unsubMeterReadings = () => {};
    let unsubElectricalChecks = () => {};
    if (isAdmin || isTechnician) {
      unsubElectricalAssets = onSnapshot(
        collection(db, 'electricalAssets'),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ElectricalAsset));
          items.sort((a, b) => a.code.localeCompare(b.code));
          setElectricalAssets(items);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'electricalAssets');
          }
        }
      );

      // 12. Meter Readings
      unsubMeterReadings = onSnapshot(
        collection(db, 'meterReadings'),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MeterReading));
          items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setMeterReadings(items);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'meterReadings');
          }
        }
      );

      // 13. Electrical Checks
      unsubElectricalChecks = onSnapshot(
        collection(db, 'electricalChecks'),
        (snap) => {
          const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ElectricalCheck));
          items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
          setElectricalChecks(items);
        },
        (err) => {
          if (auth.currentUser) {
            handleFirestoreError(err, OperationType.GET, 'electricalChecks');
          }
        }
      );
    }

    return () => {
      unsubOrders();
      unsubLocations();
      unsubEquipment();
      unsubUsers();
      unsubAllowedUsers();
      unsubAccessRequests();
      unsubInventory();
      unsubTransactions();
      unsubPlans();
      unsubLogs();
      unsubCosts();
      unsubAllMaterials();
      unsubElectricalAssets();
      unsubMeterReadings();
      unsubElectricalChecks();
    };
  }, [currentUser?.uid, isAdmin, isTechnician, isRequester, isViewer, adminViewAsTech, userProfile?.role, userLocationIds]);

  // Auto-generate maintenance work orders when nextDue <= today + 3 days
  useEffect(() => {
    if (!currentUser || !userProfile || (!isAdmin && !isTechnician)) return;
    if (hasCheckedAutoMaintenance || maintenancePlans.length === 0) return;

    setHasCheckedAutoMaintenance(true);
    checkAndGenerateMaintenanceWorkOrders(maintenancePlans, workOrders, userProfile)
      .then((count) => {
        if (count > 0) {
          addToast('info', `Hệ thống vừa tự động lập ${count} phiếu bảo dưỡng định kỳ đến hạn.`);
        }
      })
      .catch((err) => console.error('Auto maintenance error:', err));
  }, [currentUser?.uid, maintenancePlans.length, hasCheckedAutoMaintenance]);

  // Navigation guard against unauthorized tab access
  useEffect(() => {
    if (!currentUser) return;

    // 1. Non-admin trying to access admin-only tabs
    if (!isAdmin && (activeTab === 'costs' || activeTab === 'users' || activeTab === 'settings')) {
      setActiveTab('dashboard');
      return;
    }

    // 2. Requester can only access dashboard and workorders
    if (
      isRequester &&
      (activeTab === 'equipment' ||
        activeTab === 'locations' ||
        activeTab === 'inventory' ||
        activeTab === 'maintenance' ||
        activeTab === 'electrical' ||
        activeTab === 'reports')
    ) {
      setActiveTab('workorders');
      return;
    }

    // 3. Viewer cannot access inventory, maintenance, electrical, reports
    if (
      isViewer &&
      (activeTab === 'inventory' ||
        activeTab === 'maintenance' ||
        activeTab === 'electrical' ||
        activeTab === 'reports')
    ) {
      setActiveTab('workorders');
      return;
    }
  }, [currentUser, isAdmin, isRequester, isViewer, activeTab]);

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 text-white flex items-center justify-center mb-4 shadow-lg shadow-blue-500/20">
          <Wrench className="w-7 h-7 animate-pulse" />
        </div>
        <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          <span>Đang kết nối hệ thống Kỹ thuật & Cơ sở vật chất...</span>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView />;
  }

  // Pending approval screen (Requirement 2: Google verified but not in allowlist)
  if (isPendingApproval) {
    return (
      <PendingApprovalView
        currentUser={currentUser}
        onLogout={logout}
        onRecheck={recheckApproval}
      />
    );
  }

  // Disabled account screen (Requirement 5: Display exact email and copy button)
  if (userProfile?.disabled) {
    const userEmail = (currentUser.email || userProfile.email || '').toLowerCase().trim();
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-3xl p-6 sm:p-8 border border-rose-200 shadow-xl text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-black text-slate-900">Tài khoản đã bị tạm khóa</h2>
          <p className="text-xs text-slate-600 leading-relaxed">
            Tài khoản của bạn đã bị vô hiệu hóa bởi Quản trị viên hệ thống. Vui lòng gửi địa chỉ email bên dưới cho Trưởng bộ phận Kỹ thuật để được hỗ trợ mở khóa.
          </p>

          <div className="flex items-center justify-center gap-2 p-2.5 bg-slate-100 rounded-xl border border-slate-200 max-w-xs mx-auto">
            <span className="font-mono text-xs text-slate-800 font-bold truncate">{userEmail}</span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(userEmail);
                setDisabledEmailCopied(true);
                setTimeout(() => setDisabledEmailCopied(false), 2000);
              }}
              className="p-1 hover:bg-slate-200 rounded-md text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title="Sao chép email"
            >
              {disabledEmailCopied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          <button
            onClick={logout}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Đăng xuất</span>
          </button>
        </div>
      </div>
    );
  }

  const technicians = users.filter((u) => u.role === 'technician' || u.role === 'admin');
  const lowStockCount = inventoryItems.filter((i) => i.active && i.qty <= i.minQty).length;
  const pendingRequestsCount = accessRequests.filter((r) => r.status === 'pending').length;

  return (
    <div className="min-h-[100dvh] bg-slate-100/70 text-slate-900 flex flex-col font-sans pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] md:pb-0">
      {/* Database Connection Error & Lock Banner (Requirement 2 & 3) */}
      {dbErrorMessage && (
        <div className="bg-rose-600 text-white px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs font-bold sticky top-0 z-[60] shadow-lg animate-in slide-in-from-top">
          <div className="flex items-center gap-2.5">
            <AlertOctagon className="w-5 h-5 flex-shrink-0 text-white animate-bounce" />
            <div>
              <p className="font-black text-sm">Không kết nối được cơ sở dữ liệu: {dbErrorMessage}</p>
              {isDbLocked && (
                <p className="text-[11px] text-rose-100 font-normal mt-0.5">
                  Đang khóa các thao tác tạo mới và chỉnh sửa dữ liệu để bảo vệ hệ thống khỏi ghi vào bộ nhớ đệm ngoại tuyến.
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleRetryConnection}
            disabled={isRetryingConnection}
            className="px-3.5 py-1.5 bg-white text-rose-700 hover:bg-rose-50 active:bg-rose-100 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all flex-shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRetryingConnection ? 'animate-spin' : ''}`} />
            <span>{isRetryingConnection ? 'Đang thử...' : 'Thử kết nối lại'}</span>
          </button>
        </div>
      )}

      {/* Real-time Version Update Notification Banner */}
      <AppUpdateBanner />

      {/* Admin previewing technician mode banner (Requirement 2) */}
      {isAdmin && adminViewAsTech && (
        <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white px-4 py-2.5 flex items-center justify-between text-xs font-bold sticky top-0 z-50 shadow-md">
          <div className="flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4 animate-pulse" />
            <span>Đang xem thử giao diện Kỹ thuật viên (Chế độ xem trước)</span>
          </div>
          <button
            type="button"
            onClick={() => setAdminViewAsTech(false)}
            className="px-3 py-1 bg-white text-slate-900 rounded-lg text-[11px] font-black hover:bg-amber-50 active:scale-95 transition-all shadow-xs"
          >
            Quay lại chế độ Quản lý
          </button>
        </div>
      )}

      {/* Non-intrusive Web Push Notification opt-in banner */}
      <NotificationPromptBanner onOpenSettings={() => setIsNotificationSettingsOpen(true)} />

      {/* Top Navbar */}
      <Navbar
        onSync={() => addToast('info', 'Dữ liệu đang được đồng bộ thời gian thực từ Firestore')}
        onOpenNotificationSettings={() => setIsNotificationSettingsOpen(true)}
      />

      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        {/* Desktop Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={(tab) => setActiveTab(tab)}
          workOrderCount={workOrders.length}
          lowStockCount={lowStockCount}
          pendingRequestsCount={pendingRequestsCount}
          onOpenQuickAssign={() => {
            if (!checkDbCanWrite('giao việc')) return;
            setAdminQuickAssignTarget(null);
            setIsAdminQuickAssignOpen(true);
          }}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 pb-12">
          {activeTab === 'dashboard' && (
            (userProfile?.role === 'technician' || (isAdmin && adminViewAsTech)) ? (
              <TechnicianMobileHome
                workOrders={workOrders}
                maintenancePlans={maintenancePlans}
                inventoryItems={inventoryItems}
                onOpenWorkOrder={(wo, readOnly) => {
                  setInspectedWorkOrderReadOnly(Boolean(readOnly));
                  setInspectedWorkOrder(wo);
                }}
                onOpenQuickCamera={(kind, woId) => {
                  if (!checkDbCanWrite('chụp ảnh')) return;
                  setQuickCameraKind(kind);
                  setQuickCameraWorkOrderId(woId);
                  setIsQuickCameraOpen(true);
                }}
                onOpenQuickMaterial={() => {
                  const targetWo = workOrders.find(
                    (w) => w.assigneeId === userProfile?.uid && !isWorkOrderCompleted(w) && w.status !== 'Chờ duyệt'
                  );
                  if (targetWo) setInspectedWorkOrder(targetWo);
                  else setActiveTab('inventory');
                }}
                onOpenQuickFinish={() => {
                  const targetWo = workOrders.find(
                    (w) => w.assigneeId === userProfile?.uid && !isWorkOrderCompleted(w) && w.status !== 'Chờ duyệt'
                  );
                  if (targetWo) setInspectedWorkOrder(targetWo);
                  else addToast('info', 'Chưa có công việc nào đang xử lý để hoàn thành');
                }}
                onOpenQuickMeter={() => setActiveTab('electrical')}
                onNavigateToTab={(tab, subTab) => {
                  if (tab === 'maintenance' && subTab) {
                    setMaintenanceInitialSubTab(subTab as any);
                  }
                  setActiveTab(tab);
                }}
                onShowToast={(type, msg) => addToast(type, msg)}
              />
            ) : isAdmin && isMobile && !adminViewAsTech ? (
              <AdminMobileHome
                workOrders={workOrders}
                maintenancePlans={maintenancePlans}
                inventoryItems={inventoryItems}
                equipmentList={equipmentList}
                locations={locations}
                technicians={technicians}
                onOpenCreateQuickAssign={() => {
                  if (!checkDbCanWrite('giao việc')) return;
                  setAdminQuickAssignTarget(null);
                  setIsAdminQuickAssignOpen(true);
                }}
                onOpenApproveModal={(wo) => {
                  setAdminQuickAssignTarget(wo);
                  setIsAdminQuickAssignOpen(true);
                }}
                onSelectWorkOrder={(wo) => setInspectedWorkOrder(wo)}
                onNavigateToWorkOrdersWithFilter={(filterKey) => {
                  setWorkOrderInitialStatus(filterKey);
                  setActiveTab('workorders');
                }}
                onNavigateToTab={(tab) => setActiveTab(tab)}
                onSuccessToast={(msg) => addToast('success', msg)}
                onErrorToast={(msg) => addToast('error', msg)}
              />
            ) : (
              <DashboardView
                workOrders={workOrders}
                equipmentList={equipmentList}
                technicians={technicians}
                inventoryItems={inventoryItems}
                costEntries={costEntries}
                maintenancePlans={maintenancePlans}
                workOrderMaterials={allMaterials}
                isLoading={isLoadingData}
                onOpenCreate={(source, mode) => {
                  if (!checkDbCanWrite('tạo công việc')) return;
                  setQuickCreateMode(mode || 'standard');
                  setQuickCreateSource(source);
                }}
                onOpenQuickAssign={() => {
                  if (!checkDbCanWrite('giao việc')) return;
                  setAdminQuickAssignTarget(null);
                  setIsAdminQuickAssignOpen(true);
                }}
                onSelectWorkOrder={(wo) => setInspectedWorkOrder(wo)}
                onNavigateToWorkOrders={(statusFilter) => {
                  setWorkOrderInitialStatus(statusFilter || 'all');
                  setActiveTab('workorders');
                }}
                onNavigateToInventory={() => {
                  setActiveTab('inventory');
                }}
                onNavigateToCosts={() => {
                  setActiveTab('costs');
                }}
                onNavigateToMaintenance={() => {
                  setActiveTab('maintenance');
                }}
                onNavigateToEquipment={() => {
                  setActiveTab('equipment');
                }}
                electricalAssets={electricalAssets}
                onNavigateToElectrical={() => {
                  setActiveTab('electrical');
                }}
              />
            )
          )}

          {activeTab === 'workorders' && (
            <WorkOrderList
              workOrders={workOrders}
              locations={locations}
              equipmentList={equipmentList}
              technicians={technicians}
              allowedUsers={allowedUsers}
              inventoryItems={inventoryItems}
              initialStatusFilter={workOrderInitialStatus}
              isLoading={isLoadingData}
              onRefresh={() => addToast('info', 'Dữ liệu được cập nhật')}
              onError={(msg) => addToast('error', msg)}
              onSuccessToast={(msg) => addToast('success', msg)}
            />
          )}

          {activeTab === 'maintenance' && !isRequester && (
            (userProfile?.role === 'technician' || (isAdmin && adminViewAsTech)) ? (
              <TechnicianMaintenanceView
                workOrders={workOrders}
                equipmentList={equipmentList}
                locations={locations}
                initialSubTab={maintenanceInitialSubTab}
                onSelectWorkOrder={(wo, readOnly) => {
                  setInspectedWorkOrderReadOnly(Boolean(readOnly));
                  setInspectedWorkOrder(wo);
                }}
                onOpenCreateSelfJob={() => setIsTechSelfCreateOpen(true)}
              />
            ) : (
              <MaintenanceView
                plans={maintenancePlans}
                locations={locations}
                equipmentList={equipmentList}
                technicians={technicians}
                workOrders={workOrders}
                onSuccessToast={(msg) => addToast('success', msg)}
                onError={(msg) => addToast('error', msg)}
                onRefreshAll={() => addToast('info', 'Đã cập nhật lịch bảo dưỡng')}
              />
            )
          )}

          {activeTab === 'inventory' && !isRequester && (
            <InventoryView
              inventoryItems={inventoryItems}
              transactions={inventoryTransactions}
              onSuccessToast={(msg) => addToast('success', msg)}
              onError={(msg) => addToast('error', msg)}
            />
          )}

          {activeTab === 'equipment' && !isRequester && (
            <EquipmentView
              equipmentList={equipmentList}
              locations={locations}
              workOrders={workOrders}
              onSelectWorkOrder={(wo) => setInspectedWorkOrder(wo)}
              onError={(msg) => addToast('error', msg)}
              onSuccessToast={(msg) => addToast('success', msg)}
            />
          )}

          {activeTab === 'costs' && isAdmin && (
            <CostsView
              costEntries={costEntries}
              workOrders={workOrders}
              workOrderMaterials={allMaterials}
              equipmentList={equipmentList}
              locations={locations}
              onSelectWorkOrder={(wo) => setInspectedWorkOrder(wo)}
              onSuccessToast={(msg) => addToast('success', msg)}
              onError={(msg) => addToast('error', msg)}
            />
          )}

          {activeTab === 'electrical' && !isRequester && (
            userProfile?.role === 'technician' && !adminViewAsTech ? (
              <div className="p-6 max-w-md mx-auto text-center mt-12 bg-white rounded-3xl border border-slate-200 shadow-sm space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
                  <ShieldAlert className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-black text-slate-900">Bạn không có quyền truy cập</h2>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Mục Quản lý Điện chỉ dành cho Trưởng bộ phận / Quản trị viên. Kỹ thuật viên xem các công việc bảo dưỡng thiết bị điện được giao trong tab Bảo dưỡng.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('dashboard')}
                  className="w-full py-2.5 px-4 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 transition-colors"
                >
                  Quay về Việc của tôi
                </button>
              </div>
            ) : (
              <ElectricalView
                assets={electricalAssets}
                locations={locations}
                workOrders={workOrders}
                workOrderMaterials={allMaterials}
                meterReadings={meterReadings}
                electricalChecks={electricalChecks}
                onSelectWorkOrder={(wo) => setInspectedWorkOrder(wo)}
                onOpenCreateWorkOrder={(source, assetId) => {
                  setQuickCreateElectricalAssetId(assetId);
                  setQuickCreateSource(source);
                }}
                onSuccessToast={(msg) => addToast('success', msg)}
                onError={(msg) => addToast('error', msg)}
              />
            )
          )}

          {activeTab === 'locations' && !isRequester && (
            <LocationView
              locations={locations}
              equipmentList={equipmentList}
              workOrders={workOrders}
              onError={(msg) => addToast('error', msg)}
              onSuccessToast={(msg) => addToast('success', msg)}
            />
          )}

          {activeTab === 'users' && isAdmin && (
            <UserManagementView
              users={users}
              allowedUsers={allowedUsers}
              accessRequests={accessRequests}
              locations={locations}
              onError={(msg) => addToast('error', msg)}
              onSuccessToast={(msg) => addToast('success', msg)}
            />
          )}

          {activeTab === 'reports' && !isRequester && (
            <ReportsView
              workOrders={workOrders}
              costEntries={costEntries}
              inventoryItems={inventoryItems}
              inventoryTransactions={inventoryTransactions}
              maintenancePlans={maintenancePlans}
              maintenanceLogs={maintenanceLogs}
              electricalAssets={electricalAssets}
              meterReadings={meterReadings}
              electricalChecks={electricalChecks}
              locations={locations}
              technicians={technicians}
              equipmentList={equipmentList}
              workOrderMaterials={allMaterials}
              onSuccessToast={(msg) => addToast('success', msg)}
              onError={(msg) => addToast('error', msg)}
            />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              onSuccessToast={(msg) => addToast('success', msg)}
              onError={(msg) => addToast('error', msg)}
              onRefreshAll={() => addToast('info', 'Đã làm mới dữ liệu')}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView
              onLogout={logout}
              onRefreshAll={() => addToast('info', 'Đã làm mới dữ liệu')}
            />
          )}
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab)}
        openNewRequest={() => {
          if (!checkDbCanWrite('tạo yêu cầu')) return;
          setQuickCreateSource('request');
        }}
        lowStockCount={lowStockCount}
        pendingRequestsCount={pendingRequestsCount}
        onOpenCreateQuickAssign={() => {
          if (!checkDbCanWrite('giao việc')) return;
          setAdminQuickAssignTarget(null);
          setIsAdminQuickAssignOpen(true);
        }}
        onOpenTechSelfCreate={() => {
          if (!checkDbCanWrite('tự tạo việc')) return;
          setIsTechSelfCreateOpen(true);
        }}
        adminViewAsTech={adminViewAsTech}
        onToggleAdminViewAsTech={() => setAdminViewAsTech(!adminViewAsTech)}
      />

      {/* Global Toast Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Quick Create Work Order Modal from Dashboard */}
      {quickCreateSource && (
        <CreateWorkOrderModal
          isOpen={Boolean(quickCreateSource)}
          initialMode={quickCreateMode}
          defaultSource={quickCreateSource}
          locations={locations}
          equipmentList={equipmentList}
          technicians={technicians}
          electricalAssets={electricalAssets}
          defaultElectricalAssetId={quickCreateElectricalAssetId}
          onClose={() => {
            setQuickCreateSource(null);
            setQuickCreateElectricalAssetId(undefined);
          }}
          onSuccess={(newWo) => {
            addToast('success', `Đã tạo thành công công việc ${newWo.code}`);
            setInspectedWorkOrder(newWo);
          }}
          onError={(msg) => addToast('error', msg)}
        />
      )}

      {/* Technician Self-Create Work Order Modal */}
      {isTechSelfCreateOpen && (
        <TechnicianSelfCreateModal
          isOpen={isTechSelfCreateOpen}
          onClose={() => setIsTechSelfCreateOpen(false)}
          locations={locations}
          equipmentList={equipmentList}
          onSuccess={(newWo) => {
            addToast('success', `Đã tạo công việc "${newWo.code}" thành công`);
            setInspectedWorkOrder(newWo);
          }}
          onError={(msg) => addToast('error', msg)}
        />
      )}

      {/* Work Order Detail Modal from Dashboard, Equipment View, or Direct */}
      {inspectedWorkOrder && (
        <WorkOrderDetailModal
          workOrder={inspectedWorkOrder}
          readOnly={inspectedWorkOrderReadOnly}
          locations={locations}
          equipmentList={equipmentList}
          technicians={technicians}
          allowedUsers={allowedUsers}
          inventoryItems={inventoryItems}
          onClose={() => {
            setInspectedWorkOrder(null);
            setInspectedWorkOrderReadOnly(false);
          }}
          onWorkOrderUpdated={() => {
            if (inspectedWorkOrder) {
              const updated = workOrders.find((w) => w.id === inspectedWorkOrder.id);
              if (updated) setInspectedWorkOrder(updated);
            }
          }}
          onWorkOrderDeleted={() => {
            setInspectedWorkOrder(null);
            setInspectedWorkOrderReadOnly(false);
          }}
          onError={(msg) => addToast('error', msg)}
          onSuccessToast={(msg) => addToast('success', msg)}
        />
      )}

      {/* Quick Camera Capture Modal for Mobile Technicians */}
      {isQuickCameraOpen && (
        <QuickCameraCaptureModal
          isOpen={isQuickCameraOpen}
          defaultKind={quickCameraKind}
          defaultWorkOrderId={quickCameraWorkOrderId}
          workOrders={workOrders}
          onClose={() => setIsQuickCameraOpen(false)}
          onPhotoSaved={(woId, savedKind) => {
            setIsQuickCameraOpen(false);
            addToast('success', `Đã lưu ảnh ${savedKind === 'before' ? 'TRƯỚC' : 'SAU'} thành công!`);
            const targetWo = workOrders.find((w) => w.id === woId);
            if (targetWo) {
              setInspectedWorkOrder(targetWo);
            }
          }}
          onError={(msg) => addToast('error', msg)}
        />
      )}

      {/* Admin Quick Assign Modal from BottomNav or Admin Mobile Home */}
      {isAdminQuickAssignOpen && (
        <AdminQuickAssignModal
          isOpen={isAdminQuickAssignOpen}
          onClose={() => {
            setIsAdminQuickAssignOpen(false);
            setAdminQuickAssignTarget(null);
          }}
          locations={locations}
          equipmentList={equipmentList}
          technicians={technicians}
          allowedUsers={allowedUsers}
          workOrders={workOrders}
          targetWorkOrder={adminQuickAssignTarget}
          onSuccess={(newWo, assignedTech) => {
            const techName = assignedTech ? assignedTech.displayName : (newWo.assigneeType === 'team' ? 'Phòng kỹ thuật' : 'kỹ thuật viên');
            addToast('success', `Đã giao việc thành công cho ${techName}`);
            setAdminZaloTarget(newWo);
            setAdminZaloTech(assignedTech);
          }}
          onError={(msg) => addToast('error', msg)}
        />
      )}

      {/* Admin Zalo Share Modal after creating or assigning */}
      {adminZaloTarget && (
        <ZaloShareModal
          isOpen={Boolean(adminZaloTarget)}
          onClose={() => {
            setAdminZaloTarget(null);
            setAdminZaloTech(null);
          }}
          workOrder={adminZaloTarget}
          technician={adminZaloTech || technicians.find((t) => t.uid === adminZaloTarget.assigneeId) || null}
          location={locations.find((l) => l.id === adminZaloTarget.locationId) || null}
          equipment={adminZaloTarget.equipmentId ? equipmentList.find((e) => e.id === adminZaloTarget.equipmentId) || null : null}
          type="assign"
          onSuccessToast={(msg) => addToast('success', msg)}
          onErrorToast={(msg) => addToast('error', msg)}
        />
      )}

      {/* Web Push Notification Settings Modal */}
      <NotificationSettingsModal
        isOpen={isNotificationSettingsOpen}
        onClose={() => setIsNotificationSettingsOpen(false)}
        onToast={(type, msg) => addToast(type, msg)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
