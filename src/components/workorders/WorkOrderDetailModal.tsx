import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Clock,
  MapPin,
  Cpu,
  User,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  History,
  Send,
  Trash2,
  DollarSign,
  UserCheck,
  ShieldAlert,
  Zap,
  Play,
  Share2,
  Bell,
  RotateCcw,
  AlertTriangle,
  Eye,
  Edit,
  ArrowLeft,
  FileText,
  CloudUpload,
  ExternalLink,
  FolderCheck,
  Store,
  Users,
  Building,
  Wrench,
  Loader2,
} from 'lucide-react';
import {
  WorkOrder,
  WorkOrderStatus,
  WorkOrderRequestOrigin,
  WorkOrderAssigneeType,
  LocationItem,
  EquipmentItem,
  UserProfile,
  WorkOrderPhoto,
  WorkOrderComment,
  WorkOrderHistory,
  CompanySettings,
  AllowedUser,
  AssignableStaff,
  getAssignableStaffList,
  getWorkOrderOrigin,
  getWorkOrderAssigneeDisplay,
  isWorkOrderAssignedTo,
  isWorkOrderCompleted,
  getDisplayStatus,
  getWorkOrderApproverInfo,
  canUserApproveWorkOrder,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { PriorityBadge, StatusBadge, AcknowledgmentBadge } from '../common/Badge';
import { ZaloShareModal } from './ZaloShareModal';
import { formatDate, formatDateTime, formatRelativeTime, formatCurrency } from '../../utils/formatters';
import { exportWorkOrderSlipPdf } from '../../utils/exportUtils';
import { uploadWorkOrderToDrive } from '../../services/googleDriveService';
import { PhotoSection } from './PhotoSection';
import { WorkOrderMaterialsSection } from './WorkOrderMaterialsSection';
import { ConfirmDialog } from '../common/ConfirmDialog';

import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  orderBy,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType, reportDatabaseError } from '../../services/firebase';
import { InventoryItem, WorkOrderMaterial, ChecklistResultItem, MaintenancePlan } from '../../types';
import { calculateNextDueDate } from '../../utils/maintenanceUtils';
import { ListChecks } from 'lucide-react';
import { triggerPushNotification } from '../../services/pushNotificationService';

interface WorkOrderDetailModalProps {
  workOrder: WorkOrder | null;
  locations: LocationItem[];
  equipmentList: EquipmentItem[];
  technicians: UserProfile[];
  allowedUsers?: AllowedUser[];
  inventoryItems?: InventoryItem[];
  readOnly?: boolean;
  onClose: () => void;
  onWorkOrderUpdated: () => void;
  onWorkOrderDeleted: () => void;
  onError: (msg: string) => void;
  onSuccessToast: (msg: string) => void;
}

export const WorkOrderDetailModal: React.FC<WorkOrderDetailModalProps> = ({
  workOrder,
  locations,
  equipmentList,
  technicians,
  allowedUsers = [],
  inventoryItems = [],
  readOnly = false,
  onClose,
  onWorkOrderUpdated,
  onWorkOrderDeleted,
  onError,
  onSuccessToast,
}) => {
  const { userProfile, isAdmin, isTechnician, isRequester, isViewer } = useAuth();

  const [activeTab, setActiveTab] = useState<'info' | 'checklist' | 'photos' | 'materials' | 'costs' | 'comments' | 'history'>('info');
  const [photos, setPhotos] = useState<WorkOrderPhoto[]>([]);
  const [comments, setComments] = useState<WorkOrderComment[]>([]);
  const [history, setHistory] = useState<WorkOrderHistory[]>([]);

  const isFinishedOrder = isWorkOrderCompleted(workOrder);
  const canApprove = workOrder ? canUserApproveWorkOrder(workOrder, userProfile) : false;
  const approverInfo = workOrder ? getWorkOrderApproverInfo(workOrder) : null;

  // Read-only calculation:
  // - Hoàn thành / Đã đóng: locked for everyone except Admin
  // - Chờ duyệt: locked for Technicians (unless Admin)
  const isLockedForCurrentUser = Boolean(readOnly || (!isAdmin && isFinishedOrder));
  const isTechReadOnly = Boolean(
    readOnly ||
    (!isAdmin && isTechnician && (workOrder?.status === 'Chờ duyệt' || isFinishedOrder))
  );
  const isReadOnlyEditor = Boolean(isLockedForCurrentUser || isTechReadOnly);

  // Self-created task editing state (for technician on own active task)
  const [isEditingSelfCreated, setIsEditingSelfCreated] = useState(false);
  const [editTitle, setEditTitle] = useState(workOrder?.title || '');
  const [editDescription, setEditDescription] = useState(workOrder?.description || '');
  const [editDueDate, setEditDueDate] = useState(workOrder?.dueDate?.split('T')[0] || '');
  const [isSavingSelfCreated, setIsSavingSelfCreated] = useState(false);

  // Self-created cancellation state
  const [showCancelSelfModal, setShowCancelSelfModal] = useState(false);
  const [cancelSelfReason, setCancelSelfReason] = useState('');
  const [isCancelingSelf, setIsCancelingSelf] = useState(false);

  // Checklist state for maintenance
  const isMaintenanceOrder = Boolean(
    workOrder?.orderType === 'maintenance' ||
    workOrder?.planId ||
    (workOrder?.checklistResults && workOrder.checklistResults.length > 0)
  );
  const [checklist, setChecklist] = useState<ChecklistResultItem[]>([]);
  const [isSavingChecklist, setIsSavingChecklist] = useState(false);

  // Request Origin editing state (Admin only)
  const currentOrigin = workOrder ? getWorkOrderOrigin(workOrder) : 'Chưa phân loại';
  const [isEditingOrigin, setIsEditingOrigin] = useState(false);
  const [editOriginVal, setEditOriginVal] = useState<WorkOrderRequestOrigin>(
    currentOrigin === 'Chưa phân loại' ? 'Cửa hàng yêu cầu' : currentOrigin
  );
  const [editStoreId, setEditStoreId] = useState<string>(
    workOrder?.requestingStoreId || workOrder?.locationId || locations[0]?.id || ''
  );
  const [editRequesterName, setEditRequesterName] = useState<string>(
    workOrder?.requesterName || ''
  );
  const [editRequesterNote, setEditRequesterNote] = useState<string>(
    workOrder?.requesterNote || ''
  );
  const [isSavingOrigin, setIsSavingOrigin] = useState(false);

  useEffect(() => {
    if (workOrder) {
      const orig = getWorkOrderOrigin(workOrder);
      setEditOriginVal(orig === 'Chưa phân loại' ? 'Cửa hàng yêu cầu' : orig);
      setEditStoreId(workOrder.requestingStoreId || workOrder.locationId || locations[0]?.id || '');
      setEditRequesterName(workOrder.requesterName || '');
      setEditRequesterNote(workOrder.requesterNote || '');
    }
  }, [workOrder, locations]);

  // State for editable fields
  const [newComment, setNewComment] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Cost editing state
  const [laborCost, setLaborCost] = useState<number>(workOrder?.laborCost || 0);
  const [externalCost, setExternalCost] = useState<number>(workOrder?.externalCost || 0);
  const [costNote, setCostNote] = useState<string>(workOrder?.costNote || '');
  const [materials, setMaterials] = useState<WorkOrderMaterial[]>([]);
  const [isSavingCost, setIsSavingCost] = useState(false);

  // Zalo Notification & Acknowledgment states
  const [isZaloModalOpen, setIsZaloModalOpen] = useState(false);
  const [zaloModalType, setZaloModalType] = useState<'assign' | 'remind' | 'pending_approval' | 'rework_requested' | 'approved'>('assign');
  const [zaloReworkReason, setZaloReworkReason] = useState<string | undefined>(undefined);
  const [zaloRecipient, setZaloRecipient] = useState<UserProfile | null>(null);
  const [isAcknowledging, setIsAcknowledging] = useState(false);

  // Return / reject order for re-work modal
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState('');
  const [isReturning, setIsReturning] = useState(false);

  // Work order slip PDF export state
  const [isExportingSlip, setIsExportingSlip] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanySettings | undefined>(undefined);

  // Google Drive state (Admin only)
  const [isSavingToDrive, setIsSavingToDrive] = useState(false);
  const [driveProgressMessage, setDriveProgressMessage] = useState('');
  const [driveProgressPercent, setDriveProgressPercent] = useState(0);
  const [driveFolderNotice, setDriveFolderNotice] = useState<string | null>(null);

  // Dynamic Assignable Staff (technicians and admins)
  const assignableStaff: AssignableStaff[] = useMemo(() => {
    return getAssignableStaffList(technicians, allowedUsers);
  }, [technicians, allowedUsers]);

  // Admin Assignee editing state (Requirement 1 & 3)
  const [editAssigneeChoice, setEditAssigneeChoice] = useState<'people' | 'team'>('people');
  const [editSelectedUserIds, setEditSelectedUserIds] = useState<string[]>([]);
  const [isSavingAssignee, setIsSavingAssignee] = useState(false);

  useEffect(() => {
    if (workOrder) {
      if (workOrder.assigneeType === 'team') {
        setEditAssigneeChoice('team');
        setEditSelectedUserIds([]);
      } else {
        setEditAssigneeChoice('people');
        if (workOrder.assigneeIds && workOrder.assigneeIds.length > 0) {
          setEditSelectedUserIds(workOrder.assigneeIds);
        } else if (workOrder.assigneeId) {
          setEditSelectedUserIds([workOrder.assigneeId]);
        } else {
          setEditSelectedUserIds([]);
        }
      }
    }
  }, [workOrder]);

  const editSelectedStaffNames = useMemo(() => {
    return editSelectedUserIds
      .map((id) => assignableStaff.find((s) => s.uid === id)?.displayName)
      .filter(Boolean) as string[];
  }, [editSelectedUserIds, assignableStaff]);

  const handleEditSelectAll = () => {
    const allLoggedInUids = assignableStaff
      .filter((s) => s.hasLoggedIn && s.uid)
      .map((s) => s.uid as string);
    setEditSelectedUserIds(allLoggedInUids);
  };

  const handleEditDeselectAll = () => {
    setEditSelectedUserIds([]);
  };

  const handleEditToggleStaff = (uid: string) => {
    setEditSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'systemSettings', 'companyProfile'),
      (snap) => {
        if (snap.exists()) setCompanyProfile(snap.data() as CompanySettings);
      },
      (err) => {
        reportDatabaseError(err, 'Hồ sơ doanh nghiệp (Phiếu công việc)');
      }
    );
    return () => unsub();
  }, []);


  useEffect(() => {
    if (!workOrder) return;
    setLaborCost(workOrder.laborCost || 0);
    setExternalCost(workOrder.externalCost || 0);
    setCostNote(workOrder.costNote || '');
    setEditTitle(workOrder.title || '');
    setEditDescription(workOrder.description || '');
    setEditDueDate(workOrder.dueDate ? workOrder.dueDate.split('T')[0] : '');

    // Populate checklist from workOrder or default if empty
    if (workOrder.checklistResults && workOrder.checklistResults.length > 0) {
      setChecklist(workOrder.checklistResults);
    } else if (isMaintenanceOrder) {
      setChecklist([
        { text: 'Kiểm tra ngoại quan, vệ sinh sạch sẽ', done: false, note: '' },
        { text: 'Kiểm tra thông số kỹ thuật vận hành', done: false, note: '' },
        { text: 'Kiểm tra tiếng ồn và nhiệt độ bề mặt', done: false, note: '' },
        { text: 'Chạy thử nghiệm tải và nghiệm thu', done: false, note: '' },
      ]);
    } else {
      setChecklist([]);
    }

    // 1. Listen to photos
    const photoQ = query(
      collection(db, 'workOrderPhotos'),
      where('workOrderId', '==', workOrder.id)
    );
    const unsubPhotos = onSnapshot(photoQ, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrderPhoto));
      items.sort((a, b) => new Date(b.takenAt).getTime() - new Date(a.takenAt).getTime());
      setPhotos(items);
    }, (err) => {
      if (auth.currentUser) {
        handleFirestoreError(err, OperationType.GET, 'workOrderPhotos');
      }
    });

    // 2. Listen to comments
    const commentQ = query(
      collection(db, 'workOrderComments'),
      where('workOrderId', '==', workOrder.id)
    );
    const unsubComments = onSnapshot(commentQ, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrderComment));
      items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setComments(items);
    }, (err) => {
      if (auth.currentUser) {
        handleFirestoreError(err, OperationType.GET, 'workOrderComments');
      }
    });

    // 3. Listen to history
    const historyQ = query(
      collection(db, 'workOrderHistory'),
      where('workOrderId', '==', workOrder.id)
    );
    const unsubHistory = onSnapshot(historyQ, (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrderHistory));
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setHistory(items);
    }, (err) => {
      if (auth.currentUser) {
        handleFirestoreError(err, OperationType.GET, 'workOrderHistory');
      }
    });

    // 4. Listen to materials (admin & tech only)
    let unsubMaterials = () => {};
    if (isAdmin || isTechnician) {
      const matQ = query(
        collection(db, 'workOrderMaterials'),
        where('workOrderId', '==', workOrder.id)
      );
      unsubMaterials = onSnapshot(matQ, (snap) => {
        const items = snap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrderMaterial));
        setMaterials(items);
      }, (err) => {
        if (auth.currentUser) {
          handleFirestoreError(err, OperationType.GET, 'workOrderMaterials');
        }
      });
    }

    return () => {
      unsubPhotos();
      unsubComments();
      unsubHistory();
      unsubMaterials();
    };
  }, [workOrder?.id, isAdmin, isTechnician]);

  if (!workOrder) return null;

  const location = locations.find((l) => l.id === workOrder.locationId);
  const equipment = equipmentList.find((e) => e.id === workOrder.equipmentId);

  const beforePhotos = photos.filter((p) => p.kind === 'before');
  const afterPhotos = photos.filter((p) => p.kind === 'after');

  const handleToggleChecklistItem = (index: number) => {
    setChecklist((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, done: !item.done } : item))
    );
  };

  const handleChecklistNoteChange = (index: number, note: string) => {
    setChecklist((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, note } : item))
    );
  };

  const handleSaveChecklist = async () => {
    if (!userProfile) return;
    try {
      setIsSavingChecklist(true);
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        checklistResults: checklist,
      });
      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Cập nhật checklist bảo dưỡng',
        details: `Đã hoàn thành ${checklist.filter((c) => c.done).length}/${checklist.length} hạng mục`,
        timestamp: new Date().toISOString(),
      });
      onSuccessToast('Đã lưu tiến độ checklist bảo dưỡng');
      onWorkOrderUpdated();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `workOrders/${workOrder.id}`);
      onError('Không thể lưu tiến độ checklist');
    } finally {
      setIsSavingChecklist(false);
    }
  };

  // Status transition handler with photo completeness enforcement & checklist validation
  const handleStatusChange = async (nextStatus: WorkOrderStatus) => {
    if (!userProfile || !workOrder) return;

    if (isFinishedOrder && !isAdmin) {
      onError('Việc đã hoàn thành, chỉ admin được sửa');
      return;
    }

    if (nextStatus === 'Đã đóng') {
      onError('Trạng thái "Đã đóng" đã được loại bỏ khỏi quy trình.');
      return;
    }

    if (nextStatus === 'Hoàn thành' && !isAdmin && !(canApprove && workOrder.status === 'Chờ duyệt')) {
      onError('Bạn không có quyền duyệt hoàn thành công việc này.');
      return;
    }

    // STRICT VALIDATION: Require >= 1 before photo and >= 1 after photo to mark as Hoàn thành or Chờ duyệt!
    if (nextStatus === 'Hoàn thành' || nextStatus === 'Chờ duyệt') {
      // If approving an order already in 'Chờ duyệt', photos & checklist were checked on submission,
      // unless photos were somehow removed. Still check photos unless missing legacy data when Admin forces completion.
      const requirePhotos = nextStatus === 'Chờ duyệt' || workOrder.status !== 'Chờ duyệt';
      if (requirePhotos && (beforePhotos.length === 0 || afterPhotos.length === 0)) {
        onError(
          `Không thể chuyển trạng thái! Bắt buộc phải có ít nhất 1 ảnh trước (hiện có ${beforePhotos.length}) và 1 ảnh sau (hiện có ${afterPhotos.length}).`
        );
        setActiveTab('photos');
        return;
      }

      // Check checklist requirements for maintenance when submitting or completing directly
      if (requirePhotos && isMaintenanceOrder && checklist.length > 0) {
        const unfulfilled = checklist.find(
          (item) => !item.done && (!item.note || !item.note.trim())
        );
        if (unfulfilled) {
          onError(
            `Để hoàn thành bảo dưỡng, bắt buộc phải tích hoàn tất tất cả mục checklist hoặc nhập lý do vào ô ghi chú của mục "${unfulfilled.text}"!`
          );
          setActiveTab('checklist');
          return;
        }
      }
    }

    try {
      setIsUpdatingStatus(true);
      const now = new Date().toISOString();
      const isApprovingPending = nextStatus === 'Hoàn thành' && workOrder.status === 'Chờ duyệt';
      const updates: Partial<WorkOrder> = {
        status: nextStatus,
        updatedAt: now,
      };

      if (nextStatus === 'Chờ duyệt') {
        updates.submittedAt = now;
        updates.submittedBy = userProfile.uid;
        updates.submittedByName = userProfile.displayName;
        if ((isAdmin || isTechnician) && isMaintenanceOrder && checklist.length > 0) {
          updates.checklistResults = checklist;
        }
      } else if (nextStatus === 'Hoàn thành') {
        updates.approvedBy = userProfile.uid;
        updates.approvedByName = userProfile.displayName;
        updates.approvedAt = now;
        updates.completedAt = now;
        if ((isAdmin || isTechnician) && isMaintenanceOrder && checklist.length > 0) {
          updates.checklistResults = checklist;
        }
      }

      const woRef = doc(db, 'workOrders', workOrder.id);
      await updateDoc(woRef, updates);

      // Record in history
      const adminEditPrefix = isFinishedOrder && isAdmin ? '[Admin sửa việc đã hoàn thành] ' : '';
      const historyAction =
        nextStatus === 'Chờ duyệt'
          ? 'Gửi chờ duyệt nghiệm thu'
          : isApprovingPending
          ? 'Duyệt hoàn thành'
          : 'Cập nhật trạng thái';

      const historyDetails =
        nextStatus === 'Chờ duyệt'
          ? `${userProfile.displayName} đã hoàn thành và gửi ${approverInfo?.label || 'người duyệt'} duyệt nghiệm thu`
          : isApprovingPending
          ? `${userProfile.displayName} đã duyệt hoàn thành công việc`
          : `${adminEditPrefix}Chuyển từ "${getDisplayStatus(workOrder.status)}" sang "${nextStatus}"`;

      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: historyAction,
        details: historyDetails,
        timestamp: now,
      });

      // Non-blocking Web Push notification
      if (nextStatus === 'Chờ duyệt') {
        triggerPushNotification('pending_approval', workOrder.id, {
          actorName: userProfile.displayName,
          requestOrigin: workOrder.requestOrigin,
          selfCreated: workOrder.selfCreated,
          changes: 'báo hoàn thành, gửi duyệt nghiệm thu',
        });
      } else if (nextStatus === 'Hoàn thành') {
        triggerPushNotification('approved', workOrder.id, {
          actorName: userProfile.displayName,
          changes: 'đã duyệt hoàn thành công việc',
        });
      } else {
        triggerPushNotification('status_changed', workOrder.id, {
          actorName: userProfile.displayName,
          newStatus: nextStatus,
          changes: `chuyển sang ${nextStatus}`,
        });
      }

      // If completing a maintenance plan order (Admin/Tech allowed by Rules): write maintenanceLogs and calculate nextDue
      if (nextStatus === 'Hoàn thành' && workOrder.planId && (isAdmin || isTechnician)) {
        try {
          const allDone = checklist.length > 0 ? checklist.every((c) => c.done) : true;
          await addDoc(collection(db, 'maintenanceLogs'), {
            planId: workOrder.planId,
            planTitle: workOrder.title,
            workOrderId: workOrder.id,
            workOrderCode: workOrder.code,
            equipmentId: workOrder.equipmentId || '',
            electricalAssetId: workOrder.electricalAssetId || '',
            doneAt: now,
            doneBy: userProfile.uid,
            doneByName: userProfile.displayName,
            checklistResult: checklist,
            result: allDone ? 'dat' : 'can_theo_doi',
            createdAt: now,
          });

          // Fetch plan to calculate nextDue
          const planSnap = await getDoc(doc(db, 'maintenancePlans', workOrder.planId));
          if (planSnap.exists()) {
            const planData = planSnap.data() as MaintenancePlan;
            const newNextDue = calculateNextDueDate(
              now.split('T')[0],
              planData.frequencyType,
              planData.frequencyValue
            );
            await updateDoc(doc(db, 'maintenancePlans', workOrder.planId), {
              nextDue: newNextDue,
              lastDone: now.split('T')[0],
            });
          }
        } catch (mErr) {
          console.error('Failed to log maintenance plan log or update nextDue', mErr);
        }
      }

      if (nextStatus === 'Chờ duyệt') {
        onSuccessToast('Đã gửi duyệt');
      } else if (isApprovingPending) {
        onSuccessToast('Đã duyệt hoàn thành công việc');
      } else {
        onSuccessToast(`Đã chuyển trạng thái sang "${nextStatus}"`);
      }
      onWorkOrderUpdated();
    } catch (err: unknown) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `workOrders/${workOrder.id}`);
      onError('Không thể cập nhật trạng thái');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Technician saves edits on their self-created task before completion
  const handleSaveSelfCreatedEdit = async () => {
    if (!userProfile || !workOrder) return;
    if (!editTitle.trim()) {
      onError('Tiêu đề công việc không được để trống');
      return;
    }
    try {
      setIsSavingSelfCreated(true);
      const now = new Date().toISOString();
      const updates: Partial<WorkOrder> = {
        title: editTitle.trim(),
        description: editDescription.trim(),
      };
      if (editDueDate) {
        updates.dueDate = editDueDate + 'T18:00:00';
      }
      await updateDoc(doc(db, 'workOrders', workOrder.id), updates);
      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Sửa thông tin việc tự tạo',
        details: `Cập nhật tiêu đề/mô tả/hạn hoàn thành`,
        timestamp: now,
      });
      onSuccessToast('Đã lưu thay đổi thông tin công việc');
      setIsEditingSelfCreated(false);
      onWorkOrderUpdated();
      triggerPushNotification('order_updated', workOrder.id, {
        actorName: userProfile.displayName,
        changes: 'sửa thông tin (hạn xử lý/tiêu đề/mô tả)',
      });
    } catch (err) {
      console.error(err);
      onError('Lỗi khi lưu chỉnh sửa');
    } finally {
      setIsSavingSelfCreated(false);
    }
  };

  // Admin cancels self-created task if created by mistake (status -> Hoàn thành with canceledReason)
  const handleCancelSelfCreated = async () => {
    if (!userProfile || !workOrder) return;
    if (!isAdmin) {
      onError('Chỉ Quản trị viên mới có quyền hủy/đóng công việc tạo nhầm.');
      return;
    }
    if (!cancelSelfReason.trim()) {
      onError('Vui lòng nhập lý do hủy việc');
      return;
    }
    // Condition: ONLY allowed if no materials and no costs recorded
    if (materials.length > 0 || (workOrder.laborCost && workOrder.laborCost > 0) || (workOrder.externalCost && workOrder.externalCost > 0)) {
      onError('Không thể hủy việc đã xuất vật tư/chi phí');
      return;
    }
    try {
      setIsCancelingSelf(true);
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        status: 'Hoàn thành',
        completedAt: now,
        updatedAt: now,
        canceledReason: cancelSelfReason.trim(),
      });
      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Hủy việc tự tạo',
        details: `Hủy việc tự tạo với lý do: ${cancelSelfReason.trim()}`,
        timestamp: now,
      });
      onSuccessToast('Đã hủy việc tự tạo thành công');
      setShowCancelSelfModal(false);
      onWorkOrderUpdated();
      triggerPushNotification('status_changed', workOrder.id, {
        actorName: userProfile.displayName,
        newStatus: 'Hoàn thành',
        changes: `hủy việc tự tạo: ${cancelSelfReason.trim()}`,
      });
      onClose();
    } catch (err) {
      console.error(err);
      onError('Không thể hủy việc tự tạo');
    } finally {
      setIsCancelingSelf(false);
    }
  };

  // Technician takes unassigned order
  const handleClaimOrder = async () => {
    if (!userProfile) return;
    try {
      setIsUpdatingStatus(true);
      const now = new Date().toISOString();
      const updates: Partial<WorkOrder> = {
        assigneeId: userProfile.uid,
        assigneeName: userProfile.displayName,
        assignedAt: now,
        acknowledged: true,
        acknowledgedAt: now,
        acknowledgedBy: userProfile.uid,
        status: workOrder.status === 'Mới' ? 'Đang xử lý' : workOrder.status,
      };

      await updateDoc(doc(db, 'workOrders', workOrder.id), updates);

      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Tiếp nhận công việc',
        details: `${userProfile.displayName} đã nhận xử lý công việc này`,
        timestamp: now,
      });

      onSuccessToast('Bạn đã tiếp nhận công việc này');
      onWorkOrderUpdated();
      triggerPushNotification('assigned', workOrder.id, {
        actorName: userProfile.displayName,
        changes: 'đã tiếp nhận công việc này',
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `workOrders/${workOrder.id}`);
      onError('Không thể tiếp nhận công việc');
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  // Technician confirms order acknowledgment
  const handleAcknowledgeOrder = async () => {
    if (!userProfile) return;
    try {
      setIsAcknowledging(true);
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        acknowledged: true,
        acknowledgedAt: now,
        acknowledgedBy: userProfile.uid,
        acknowledgedByName: userProfile.displayName,
      });

      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Đã nhận việc',
        details: `Kỹ thuật viên ${userProfile.displayName} đã xác nhận nhận việc`,
        timestamp: now,
      });

      onSuccessToast('Đã xác nhận nhận việc thành công');
      onWorkOrderUpdated();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `workOrders/${workOrder.id}`);
      onError('Không thể xác nhận nhận việc');
    } finally {
      setIsAcknowledging(false);
    }
  };

  // Admin saves assignee change
  const handleSaveAssignee = async () => {
    if (!userProfile || !isAdmin || !workOrder) return;

    if (editAssigneeChoice === 'people' && editSelectedUserIds.length === 0) {
      onError('Vui lòng chọn ít nhất một người phụ trách hoặc chọn Cả phòng');
      return;
    }

    try {
      setIsSavingAssignee(true);
      const now = new Date().toISOString();
      let updates: Record<string, any> = {};
      let targetRecipient: UserProfile | null = null;

      if (editAssigneeChoice === 'team') {
        updates = {
          assigneeType: 'team',
          assigneeIds: [],
          assigneeId: '',
          assigneeName: 'Phòng kỹ thuật',
          assignedAt: now,
          acknowledged: false,
          acknowledgedAt: null,
          acknowledgedBy: null,
          acknowledgedByName: null,
        };
      } else {
        const count = editSelectedUserIds.length;
        const names = editSelectedStaffNames;
        const firstUid = editSelectedUserIds[0] || '';
        targetRecipient = technicians.find((t) => t.uid === firstUid) || null;

        if (count === 1) {
          updates = {
            assigneeType: 'single',
            assigneeIds: editSelectedUserIds,
            assigneeId: firstUid,
            assigneeName: names[0] || '',
            assignedAt: now,
            acknowledged: false,
            acknowledgedAt: null,
            acknowledgedBy: null,
            acknowledgedByName: null,
          };
        } else {
          updates = {
            assigneeType: 'multiple',
            assigneeIds: editSelectedUserIds,
            assigneeId: firstUid,
            assigneeName: names.join(', '),
            assignedAt: now,
            acknowledged: false,
            acknowledgedAt: null,
            acknowledgedBy: null,
            acknowledgedByName: null,
          };
        }
      }

      if (workOrder.status === 'Mới') {
        updates.status = 'Đang xử lý';
      }

      await updateDoc(doc(db, 'workOrders', workOrder.id), updates);

      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Phân công kỹ thuật viên',
        details: updates.assigneeName ? `Giao việc cho ${updates.assigneeName}` : 'Hủy phân công kỹ thuật viên',
        timestamp: now,
      });

      onSuccessToast(`Đã phân công cho ${updates.assigneeName}`);
      onWorkOrderUpdated();

      // Non-blocking Web Push notification for assignment
      if (updates.assigneeName) {
        triggerPushNotification('assigned', workOrder.id, {
          actorName: userProfile.displayName,
          changes: `giao việc cho ${updates.assigneeName}`,
        });
      }

      // Automatically open Zalo Share Modal for admin
      if (updates.assigneeName) {
        setZaloRecipient(targetRecipient);
        setZaloModalType('assign');
        setIsZaloModalOpen(true);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `workOrders/${workOrder.id}`);
      onError('Không thể phân công kỹ thuật viên');
    } finally {
      setIsSavingAssignee(false);
    }
  };

  // Admin saves edited Request Origin
  const handleSaveOrigin = async () => {
    if (!isAdmin || !userProfile) return;
    try {
      setIsSavingOrigin(true);
      const updates: Record<string, any> = {
        requestOrigin: editOriginVal,
      };

      if (editOriginVal === 'Cửa hàng yêu cầu') {
        if (!editStoreId) {
          onError('Vui lòng chọn cửa hàng yêu cầu');
          setIsSavingOrigin(false);
          return;
        }
        const storeName = locations.find((l) => l.id === editStoreId)?.name || 'Cửa hàng';
        updates.requestingStoreId = editStoreId;
        updates.requestingStoreName = storeName;
        if (editRequesterName.trim()) updates.requesterName = editRequesterName.trim();
        if (editRequesterNote.trim()) updates.requesterNote = editRequesterNote.trim();
      } else {
        updates.requestOrigin = 'KTV tự tạo';
      }

      await updateDoc(doc(db, 'workOrders', workOrder.id), updates);

      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Cập nhật nguồn công việc',
        details: `Cập nhật nguồn: ${editOriginVal}${editOriginVal === 'Cửa hàng yêu cầu' ? ` (${updates.requestingStoreName})` : ''}`,
        timestamp: new Date().toISOString(),
      });

      setIsEditingOrigin(false);
      onSuccessToast('Đã cập nhật nguồn công việc thành công');
      onWorkOrderUpdated();
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `workOrders/${workOrder.id}`);
      onError('Không thể cập nhật nguồn công việc');
    } finally {
      setIsSavingOrigin(false);
    }
  };

  const materialsCost = materials.reduce((acc, m) => acc + (m.qty * m.unitCost), 0);
  const totalWorkOrderCost = materialsCost + (Number(laborCost) || 0) + (Number(externalCost) || 0);

  // Save labor, external costs and costNote
  const handleSaveCosts = async () => {
    if (!userProfile) return;
    if (Number(laborCost) < 0 || Number(externalCost) < 0) {
      onError('Chi phí nhân công và thuê ngoài không được là số âm');
      return;
    }

    try {
      setIsSavingCost(true);
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        laborCost: Number(laborCost) || 0,
        externalCost: Number(externalCost) || 0,
        costNote: costNote.trim(),
      });

      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Cập nhật chi phí',
        details: `Vật tư: ${formatCurrency(materialsCost)}, Nhân công: ${formatCurrency(laborCost)}, Thuê ngoài: ${formatCurrency(externalCost)} => Tổng: ${formatCurrency(totalWorkOrderCost)}${costNote.trim() ? ` (Ghi chú: ${costNote.trim()})` : ''}`,
        timestamp: new Date().toISOString(),
      });

      onSuccessToast('Đã lưu chi phí công việc');
      onWorkOrderUpdated();
      triggerPushNotification('order_updated', workOrder.id, {
        actorName: userProfile.displayName,
        changes: `cập nhật chi phí thực tế (Tổng: ${formatCurrency(totalWorkOrderCost)})`,
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `workOrders/${workOrder.id}`);
      onError('Không thể lưu chi phí');
    } finally {
      setIsSavingCost(false);
    }
  };

  // Submit comment (Locked for non-admins when order is Hoàn thành / Đã đóng)
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !userProfile || !workOrder) return;

    if (isFinishedOrder && !isAdmin) {
      onError('Việc đã hoàn thành, chỉ admin được sửa');
      return;
    }

    try {
      setIsSubmittingComment(true);
      const now = new Date().toISOString();
      const commentData: Omit<WorkOrderComment, 'id'> = {
        workOrderId: workOrder.id,
        authorId: userProfile.uid,
        authorName: userProfile.displayName,
        authorRole: userProfile.role,
        content: newComment.trim(),
        createdAt: now,
      };

      await addDoc(collection(db, 'workOrderComments'), commentData);

      // Admin edits/comments on completed work orders must write history
      if (isAdmin && isFinishedOrder) {
        await addDoc(collection(db, 'workOrderHistory'), {
          workOrderId: workOrder.id,
          actorId: userProfile.uid,
          actorName: userProfile.displayName,
          action: 'Admin bình luận trên việc đã hoàn thành',
          details: commentData.content,
          timestamp: now,
        });
      }

      triggerPushNotification('comment', workOrder.id, { comment: commentData.content });
      setNewComment('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'workOrderComments');
      onError('Không thể gửi bình luận');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // Delete work order (Admin only)
  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteDoc(doc(db, 'workOrders', workOrder.id));
      onSuccessToast(`Đã xóa công việc ${workOrder.code}`);
      setShowDeleteConfirm(false);
      onWorkOrderDeleted();
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `workOrders/${workOrder.id}`);
      onError('Không thể xóa công việc');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmReturn = async () => {
    if (!userProfile || !workOrder) return;
    if (!canApprove || workOrder.status !== 'Chờ duyệt') {
      onError('Chỉ người có quyền duyệt công việc đang Chờ duyệt mới được yêu cầu làm lại.');
      return;
    }
    const trimmedReason = returnReason.trim();
    if (!trimmedReason) {
      onError('Vui lòng nhập lý do yêu cầu làm lại');
      return;
    }
    try {
      setIsReturning(true);
      const now = new Date().toISOString();
      await updateDoc(doc(db, 'workOrders', workOrder.id), {
        status: 'Đang xử lý',
        approvalNote: trimmedReason,
        updatedAt: now,
      });
      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: workOrder.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: 'Yêu cầu làm lại',
        details: `${userProfile.displayName} yêu cầu làm lại: ${trimmedReason}`,
        timestamp: now,
      });
      await addDoc(collection(db, 'workOrderComments'), {
        workOrderId: workOrder.id,
        authorId: userProfile.uid,
        authorName: userProfile.displayName,
        authorRole: userProfile.role,
        content: `[YÊU CẦU LÀM LẠI]: ${trimmedReason}`,
        createdAt: now,
      });
      onSuccessToast('Đã yêu cầu làm lại và chuyển công việc về Đang xử lý');
      setShowReturnModal(false);
      setReturnReason('');
      onWorkOrderUpdated();
      triggerPushNotification('rework_requested', workOrder.id, {
        actorName: userProfile.displayName,
        reason: trimmedReason,
        newStatus: 'Đang xử lý',
        changes: `yêu cầu làm lại: ${trimmedReason}`,
      });
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.UPDATE, `workOrders/${workOrder.id}`);
      onError('Lỗi khi gửi yêu cầu làm lại');
    } finally {
      setIsReturning(false);
    }
  };

  const handleExportSlip = async () => {
    if (!workOrder) return;
    try {
      setIsExportingSlip(true);
      await exportWorkOrderSlipPdf({
        workOrder,
        companyProfile,
        locationName: location?.name,
        equipmentName: equipment ? `${equipment.code} - ${equipment.name}` : undefined,
        materials,
        checklist,
        technicianName: workOrder.assigneeName,
      });
      onSuccessToast(`Đã xuất phiếu công việc: ${workOrder.code}.pdf`);
    } catch (err) {
      console.error('Error exporting slip PDF:', err);
      onError('Không thể xuất phiếu công việc PDF');
    } finally {
      setIsExportingSlip(false);
    }
  };

  const handleSaveToDrive = async () => {
    if (!workOrder) return;
    setIsSavingToDrive(true);
    setDriveProgressMessage('Đang kết nối Google Drive...');
    setDriveProgressPercent(5);
    setDriveFolderNotice(null);

    try {
      const result = await uploadWorkOrderToDrive({
        workOrder,
        companyProfile,
        locationName: location?.name,
        equipmentName: equipment ? `${equipment.code} - ${equipment.name}` : undefined,
        materials,
        checklist,
        technicianName: workOrder.assigneeName,
        onProgress: (msg, percent) => {
          setDriveProgressMessage(msg);
          setDriveProgressPercent(percent);
        },
        onFolderRecreated: (msg) => {
          setDriveFolderNotice(msg);
        },
      });

      onSuccessToast(`Đã lưu ${result.totalFiles} tệp vào Google Drive thành công!`);
      onWorkOrderUpdated();
    } catch (err: any) {
      console.error('Error saving to Google Drive:', err);
      onError(err.message || 'Lỗi khi lưu vào Google Drive');
    } finally {
      setIsSavingToDrive(false);
    }
  };

  const statusOptions: WorkOrderStatus[] = isAdmin
    ? ['Mới', 'Đã duyệt', 'Đang xử lý', 'Chờ vật tư', 'Chờ duyệt', 'Hoàn thành']
    : ['Đang xử lý', 'Chờ vật tư', 'Chờ duyệt'];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto animate-in fade-in">
        <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-100 my-4 sm:my-8 overflow-hidden flex flex-col max-h-[92vh]">
          {/* Top Bar */}
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-sm font-bold text-blue-700 bg-blue-100/70 px-2.5 py-1 rounded-lg">
                {workOrder.code}
              </span>
              <StatusBadge status={workOrder.status} workOrder={workOrder} />
              <PriorityBadge priority={workOrder.priority} />
              {getWorkOrderOrigin(workOrder) === 'KTV tự tạo' ? (
                <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-blue-100 text-blue-800 border border-blue-200 flex items-center gap-1">
                  <Wrench className="w-3.5 h-3.5" /> KTV tự tạo
                </span>
              ) : getWorkOrderOrigin(workOrder) === 'Cửa hàng yêu cầu' ? (
                <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-purple-100 text-purple-800 border border-purple-200 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" /> {workOrder.requestingStoreName ? `Cửa hàng: ${workOrder.requestingStoreName}` : 'Cửa hàng yêu cầu'}
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-600 border border-slate-300">
                  Chưa phân loại
                </span>
              )}
              {isReadOnlyEditor && (
                <span className="px-2.5 py-1 rounded-lg text-xs font-black bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1">
                  <Eye className="w-3.5 h-3.5 text-slate-500" /> Chỉ xem
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Google Drive Button & Direct Link (Admin Only & Finished/Closed orders) */}
              {isAdmin && isFinishedOrder && (
                <>
                  {workOrder.driveFolderUrl && (
                    <a
                      href={workOrder.driveFolderUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-2.5 py-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs transition-all touch-manipulation cursor-pointer"
                      title="Mở thư mục lưu trữ trên Google Drive"
                    >
                      <FolderCheck className="w-4 h-4 text-emerald-600" />
                      <span className="hidden md:inline">Đã lưu Drive</span>
                      <ExternalLink className="w-3 h-3 text-emerald-600" />
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={handleSaveToDrive}
                    disabled={isSavingToDrive}
                    className="px-3 py-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer touch-manipulation disabled:opacity-50"
                    title="Lưu phiếu PDF và toàn bộ ảnh vào Google Drive"
                  >
                    <CloudUpload className="w-4 h-4 text-blue-600" />
                    <span>
                      {isSavingToDrive
                        ? `${driveProgressPercent}%`
                        : workOrder.driveFolderUrl
                        ? 'Lưu lại Drive'
                        : 'Lưu việc vào Drive'}
                    </span>
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={handleExportSlip}
                disabled={isExportingSlip}
                className="px-3 py-1.5 text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer touch-manipulation"
                title="Xuất phiếu công việc chi tiết PDF (A4 chuẩn font tiếng Việt)"
              >
                <FileText className="w-4 h-4 text-rose-600" />
                <span>{isExportingSlip ? 'Đang tạo...' : 'Xuất phiếu PDF'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl font-bold text-xs flex items-center gap-1.5 shadow-2xs active:scale-95 transition-all cursor-pointer touch-manipulation"
                title="Quay lại danh sách"
              >
                <ArrowLeft className="w-4 h-4 text-slate-600" />
                <span>Quay lại</span>
              </button>
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-200/60 transition-colors cursor-pointer"
                title="Đóng"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Lock Notice for Completed Orders (Non-Admin) */}
          {!isAdmin && isFinishedOrder && (
            <div className="px-5 py-2.5 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between text-xs text-emerald-900">
              <div className="flex items-center gap-1.5 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Việc đã hoàn thành, chỉ admin được sửa</span>
              </div>
              {workOrder.approvedByName && (
                <span className="text-[11px] text-emerald-700 hidden sm:inline">
                  Duyệt bởi: {workOrder.approvedByName}
                </span>
              )}
            </div>
          )}

          {/* Pending Approval Info Bar */}
          {workOrder.status === 'Chờ duyệt' && (
            <div className="px-5 py-2.5 bg-orange-50 border-b border-orange-200 flex flex-wrap items-center justify-between gap-2 text-xs text-orange-950">
              <div className="flex items-center gap-2 font-bold">
                <Clock className="w-4 h-4 text-orange-600 shrink-0" />
                <span>
                  {approverInfo?.badgeText || 'Đang chờ duyệt nghiệm thu'}
                  {workOrder.submittedByName ? ` • Gửi bởi ${workOrder.submittedByName}` : ''}
                </span>
              </div>
              {canApprove && (
                <button
                  type="button"
                  onClick={() => {
                    setZaloModalType('pending_approval');
                    setZaloReworkReason(undefined);
                    setIsZaloModalOpen(true);
                  }}
                  className="text-[11px] font-bold text-orange-800 bg-white hover:bg-orange-100 px-2.5 py-1 rounded-lg border border-orange-200 flex items-center gap-1"
                >
                  <Share2 className="w-3 h-3" /> Chia sẻ Zalo
                </button>
              )}
            </div>
          )}

          {/* Quick Action Header for Technician & Admin */}
          {(isAdmin || isTechnician) && (
            isReadOnlyEditor ? (
              !( !isAdmin && isFinishedOrder ) && (
                <div className="px-5 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between text-xs text-slate-700">
                  <div className="flex items-center gap-1.5 font-bold">
                    <Eye className="w-4 h-4 text-slate-500" />
                    <span>Chế độ Chỉ xem — Công việc đang chờ duyệt, không thể sửa đổi nội dung, vật tư hoặc trạng thái</span>
                  </div>
                </div>
              )
            ) : (
              <div className="px-5 py-3 bg-blue-50/60 border-b border-blue-100 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-700">Chuyển trạng thái:</span>
                  <select
                    disabled={isUpdatingStatus}
                    value={getDisplayStatus(workOrder.status)}
                    onChange={(e) => handleStatusChange(e.target.value as WorkOrderStatus)}
                    className="px-3 py-1.5 rounded-xl border border-blue-200 font-semibold text-blue-900 bg-white shadow-2xs focus:ring-2 focus:ring-blue-500"
                  >
                    {!isAdmin && (workOrder.status === 'Mới' || workOrder.status === 'Đã duyệt') && (
                      <option value={workOrder.status} disabled>
                        {workOrder.status}
                      </option>
                    )}
                    {statusOptions.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* 0. Technician acknowledges newly assigned work order */}
                  {isWorkOrderAssignedTo(workOrder, userProfile?.uid) && workOrder.acknowledged === false && (
                    <button
                      type="button"
                      onClick={handleAcknowledgeOrder}
                      disabled={isAcknowledging}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white font-black hover:bg-emerald-700 active:scale-95 transition-all shadow-md shadow-emerald-600/30 text-xs"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Đã nhận việc
                    </button>
                  )}

                  {/* 0. Admin quick share / remind via Zalo */}
                  {isAdmin && (workOrder.assigneeId || workOrder.assigneeType === 'team' || workOrder.assigneeType === 'multiple') && (
                    <button
                      type="button"
                      onClick={() => {
                        const tech = technicians.find((t) => t.uid === workOrder.assigneeId) || null;
                        setZaloRecipient(tech);
                        setZaloReworkReason(undefined);
                        setZaloModalType(workOrder.acknowledged === false ? 'assign' : 'remind');
                        setIsZaloModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold transition-all shadow-xs"
                      title="Gửi thông báo giao việc hoặc nhắc nhở qua Zalo"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      Gửi Zalo
                    </button>
                  )}

                  {/* 1. Unassigned: Technician can claim order */}
                  {!workOrder.assigneeId && isTechnician && (
                    <button
                      type="button"
                      onClick={handleClaimOrder}
                      disabled={isUpdatingStatus}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-700 active:scale-95 transition-all shadow-xs"
                    >
                      <UserCheck className="w-4 h-4" />
                      Nhận xử lý công việc này
                    </button>
                  )}

                  {/* 2. Assigned & Mới / Đã duyệt: Technician can start working */}
                  {(workOrder.status === 'Mới' || workOrder.status === 'Đã duyệt') &&
                    (isWorkOrderAssignedTo(workOrder, userProfile?.uid) || isAdmin) && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange('Đang xử lý')}
                        disabled={isUpdatingStatus}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white font-bold hover:bg-amber-700 active:scale-95 transition-all shadow-xs"
                      >
                        <Play className="w-4 h-4" />
                        Bắt đầu xử lý
                      </button>
                    )}

                  {/* 3. In Progress: Technician ALWAYS submits to Chờ duyệt; Admin may complete directly */}
                  {(workOrder.status === 'Đang xử lý' || workOrder.status === 'Chờ vật tư') &&
                    (isAdmin || isTechnician) && (
                      <button
                        type="button"
                        onClick={() => handleStatusChange(isAdmin ? 'Hoàn thành' : 'Chờ duyệt')}
                        disabled={isUpdatingStatus}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-700 active:scale-95 transition-all shadow-xs"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isAdmin ? 'Hoàn thành công việc' : 'Hoàn thành (Gửi duyệt)'}</span>
                      </button>
                    )}
                </div>
              </div>
            )
          )}

          {/* Tabs Navigation */}
          <div className="flex border-b border-slate-200 px-5 text-sm font-medium bg-white">
            <button
              onClick={() => setActiveTab('info')}
              className={`py-3 px-3 border-b-2 transition-colors ${
                activeTab === 'info'
                  ? 'border-blue-600 text-blue-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              Thông tin chung
            </button>
            {isMaintenanceOrder && (
              <button
                onClick={() => setActiveTab('checklist')}
                className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'checklist'
                    ? 'border-blue-600 text-blue-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <ListChecks className="w-4 h-4 text-blue-600" />
                <span>Checklist</span>
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                    checklist.length > 0 && checklist.every((c) => c.done)
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {checklist.filter((c) => c.done).length}/{checklist.length}
                </span>
              </button>
            )}
            <button
              onClick={() => setActiveTab('photos')}
              className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'photos'
                  ? 'border-blue-600 text-blue-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Ảnh trước/sau</span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                  beforePhotos.length > 0 && afterPhotos.length > 0
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {photos.length}
              </span>
            </button>
            {(isAdmin || isTechnician) && (
              <button
                onClick={() => setActiveTab('materials')}
                className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'materials'
                    ? 'border-blue-600 text-blue-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Vật tư đã dùng</span>
              </button>
            )}
            {(isAdmin || isTechnician) && (
              <button
                onClick={() => setActiveTab('costs')}
                className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                  activeTab === 'costs'
                    ? 'border-blue-600 text-blue-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" />
                <span>Chi phí</span>
                {totalWorkOrderCost > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-blue-100 text-blue-800 font-bold">
                    {formatCurrency(totalWorkOrderCost)}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setActiveTab('comments')}
              className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'comments'
                  ? 'border-blue-600 text-blue-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Trao đổi</span>
              {comments.length > 0 && (
                <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-700">
                  {comments.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`py-3 px-3 border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'history'
                  ? 'border-blue-600 text-blue-600 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Lịch sử</span>
            </button>
          </div>

          {/* Tab Content Body */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
            {activeTab === 'info' && (
              <div className="space-y-6">
                {/* Google Drive Status Banner (Admin Only for Completed/Closed Orders) */}
                {isAdmin && isFinishedOrder && (
                  <div className="p-4 bg-gradient-to-r from-blue-50/80 to-indigo-50/80 border border-blue-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                        <CloudUpload className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-900">Lưu trữ Google Drive</span>
                          {workOrder.driveFolderUrl ? (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Đã lưu
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[10px] font-bold">
                              Chưa lưu
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                          {workOrder.driveFolderUrl
                            ? `Đã lưu phiếu PDF & ảnh lúc ${formatDateTime(workOrder.driveSavedAt)} (${workOrder.driveSavedBy || 'Admin'})`
                            : `Lưu phiếu chi tiết ${workOrder.code}.pdf và toàn bộ ảnh trước/sau vào thư mục KT-CSVC/${new Date(workOrder.createdAt).getFullYear()}/${String(new Date(workOrder.createdAt).getMonth() + 1).padStart(2, '0')}/${workOrder.code}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                      {workOrder.driveFolderUrl && (
                        <a
                          href={workOrder.driveFolderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-all touch-manipulation cursor-pointer"
                        >
                          <span>Mở Drive</span>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveToDrive}
                        disabled={isSavingToDrive}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all disabled:opacity-50 touch-manipulation cursor-pointer"
                      >
                        <CloudUpload className="w-3.5 h-3.5" />
                        <span>{isSavingToDrive ? 'Đang lưu...' : workOrder.driveFolderUrl ? 'Lưu lại Drive' : 'Lưu vào Google Drive'}</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* REQUIREMENT 6: Mandatory Safety Notice for Electrical Work */}
                {(workOrder.orderType === 'electrical' || Boolean(workOrder.electricalAssetId)) && (
                  <div className="p-4 bg-amber-500 text-white rounded-2xl shadow-sm flex items-start gap-3">
                    <Zap className="w-5 h-5 fill-white shrink-0 mt-0.5 animate-pulse" />
                    <div className="text-xs leading-relaxed">
                      <strong className="block text-sm font-black uppercase tracking-wider mb-0.5">
                        QUY ĐỊNH AN TOÀN ĐIỆN BẮT BUỘC
                      </strong>
                      Ngắt nguồn điện và đảm bảo an toàn trước khi thao tác!
                    </div>
                  </div>
                )}

                {/* Approval note notice if returned for rework */}
                {workOrder.approvalNote && workOrder.status === 'Đang xử lý' && (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1">
                    <div className="font-black flex items-center gap-1.5">
                      <RotateCcw className="w-4 h-4 text-amber-600" />
                      <span>Yêu cầu làm lại</span>
                    </div>
                    <p className="text-[11px] text-amber-800">Lý do: {workOrder.approvalNote}</p>
                  </div>
                )}

                {/* Canceled notice if order was canceled */}
                {workOrder.canceledReason && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 space-y-1">
                    <div className="font-black flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      <span>Công việc đã bị hủy</span>
                    </div>
                    <p className="text-[11px] text-rose-700">Lý do: {workOrder.canceledReason}</p>
                  </div>
                )}

                {/* Self-created task management bar for technician before completion */}
                {workOrder.selfCreated && (workOrder.assigneeId === userProfile?.uid || isAdmin) && !isReadOnlyEditor && (
                  <div className="p-3.5 bg-purple-50/70 border border-purple-200 rounded-2xl flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
                      <span className="text-xs font-bold text-purple-950">Việc do KTV tự tạo tại hiện trường</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isEditingSelfCreated && (
                        <button
                          type="button"
                          onClick={() => setIsEditingSelfCreated(true)}
                          className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center gap-1 transition-all active:scale-95 shadow-2xs"
                        >
                          <Edit className="w-3.5 h-3.5" />
                          <span>Sửa thông tin</span>
                        </button>
                      )}

                      {/* Cancel task button: Admin only (to enforce no tech completion/closing) */}
                      {isAdmin && (() => {
                        const hasExpenses = Boolean(materials.length > 0 || (workOrder.laborCost && workOrder.laborCost > 0) || (workOrder.externalCost && workOrder.externalCost > 0));
                        return (
                          <button
                            type="button"
                            disabled={hasExpenses}
                            onClick={() => setShowCancelSelfModal(true)}
                            title={hasExpenses ? "Không thể hủy việc đã xuất vật tư/chi phí" : "Hủy việc do tạo nhầm"}
                            className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 transition-all ${
                              hasExpenses
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 active:scale-95'
                            }`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hủy việc</span>
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {/* Title & Description (or Edit Form) */}
                {isEditingSelfCreated ? (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-purple-900 tracking-wider">
                        Chỉnh sửa thông tin việc tự tạo
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Tiêu đề công việc</label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-purple-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Mô tả hiện trạng</label>
                      <textarea
                        rows={3}
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-purple-500 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Hạn hoàn thành</label>
                      <input
                        type="date"
                        value={editDueDate}
                        onChange={(e) => setEditDueDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold focus:ring-2 focus:ring-purple-500 bg-white"
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditTitle(workOrder.title || '');
                          setEditDescription(workOrder.description || '');
                          setEditDueDate(workOrder.dueDate ? workOrder.dueDate.split('T')[0] : '');
                          setIsEditingSelfCreated(false);
                        }}
                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                      >
                        Hủy bỏ
                      </button>
                      <button
                        type="button"
                        disabled={isSavingSelfCreated}
                        onClick={handleSaveSelfCreatedEdit}
                        className="px-4 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-black shadow-xs flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isSavingSelfCreated ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 leading-tight">
                      {workOrder.title}
                    </h3>
                    <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                      {workOrder.description || 'Không có mô tả chi tiết'}
                    </p>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200/80 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Vị trí
                    </span>
                    <div className="flex items-center gap-2 text-slate-800 font-medium">
                      <MapPin className="w-4 h-4 text-blue-500 shrink-0" />
                      <span>{location?.name || (workOrder.locationId ? 'Vị trí cũ (Đã thay đổi hoặc không tồn tại)' : 'Chưa xác định / Vị trí chung')}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Thiết bị
                    </span>
                    <div className="flex items-center gap-2 text-slate-800 font-medium">
                      <Cpu className="w-4 h-4 text-blue-500 shrink-0" />
                      <span>
                        {equipment ? (
                          <>
                            [{equipment.code}] {equipment.name}
                            {equipment.status === 'retired' && (
                              <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-slate-200 text-slate-700 font-bold">
                                (Đã ngừng sử dụng)
                              </span>
                            )}
                          </>
                        ) : workOrder.equipmentId ? (
                          <span className="text-slate-400 italic">Thiết bị cũ (Không còn tồn tại)</span>
                        ) : (
                          'Không gắn thiết bị cụ thể'
                        )}
                      </span>
                    </div>
                  </div>

                  {/* NGUỒN CÔNG VIỆC (Request Origin) */}
                  <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Store className="w-3.5 h-3.5 text-slate-400" />
                        <span>Nguồn công việc</span>
                      </span>
                      {isAdmin && !isEditingOrigin && (
                        <button
                          type="button"
                          onClick={() => setIsEditingOrigin(true)}
                          className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" />
                          <span>{getWorkOrderOrigin(workOrder) === 'Chưa phân loại' ? 'Phân loại nguồn' : 'Sửa nguồn'}</span>
                        </button>
                      )}
                    </div>

                    {!isEditingOrigin ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          {getWorkOrderOrigin(workOrder) === 'KTV tự tạo' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200">
                              <Wrench className="w-3.5 h-3.5" />
                              <span>KTV tự tạo</span>
                            </span>
                          ) : getWorkOrderOrigin(workOrder) === 'Cửa hàng yêu cầu' ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-purple-50 text-purple-800 border border-purple-200">
                              <Store className="w-3.5 h-3.5" />
                              <span>Cửa hàng yêu cầu</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-lg bg-amber-50 text-amber-800 border border-amber-200">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              <span>Chưa phân loại</span>
                            </span>
                          )}
                        </div>

                        {getWorkOrderOrigin(workOrder) === 'Cửa hàng yêu cầu' && (
                          <div className="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/80 space-y-1">
                            <div>
                              <span className="text-slate-400">Cửa hàng: </span>
                              <span className="font-bold text-slate-900">
                                {workOrder.requestingStoreName || locations.find((l) => l.id === workOrder.requestingStoreId)?.name || 'Chưa ghi rõ'}
                              </span>
                            </div>
                            {workOrder.requesterName && (
                              <div>
                                <span className="text-slate-400">Người báo: </span>
                                <span className="font-semibold text-slate-800">{workOrder.requesterName}</span>
                              </div>
                            )}
                            {workOrder.requesterNote && (
                              <div>
                                <span className="text-slate-400">Ghi chú: </span>
                                <span className="text-slate-700 italic">{workOrder.requesterNote}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2.5 pt-1 animate-in fade-in">
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setEditOriginVal('Cửa hàng yêu cầu')}
                            className={`p-2 rounded-xl border text-left text-xs font-bold transition-all ${
                              editOriginVal === 'Cửa hàng yêu cầu'
                                ? 'bg-purple-50 text-purple-900 border-purple-300 ring-2 ring-purple-200'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            Cửa hàng yêu cầu
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditOriginVal('KTV tự tạo')}
                            className={`p-2 rounded-xl border text-left text-xs font-bold transition-all ${
                              editOriginVal === 'KTV tự tạo'
                                ? 'bg-blue-50 text-blue-900 border-blue-300 ring-2 ring-blue-200'
                                : 'bg-white text-slate-700 border-slate-200'
                            }`}
                          >
                            KTV tự tạo
                          </button>
                        </div>

                        {editOriginVal === 'Cửa hàng yêu cầu' && (
                          <div className="space-y-2 pt-1 border-t border-slate-200">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                                Cửa hàng yêu cầu:
                              </label>
                              <select
                                value={editStoreId}
                                onChange={(e) => setEditStoreId(e.target.value)}
                                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white font-medium"
                              >
                                {locations.map((loc) => (
                                  <option key={loc.id} value={loc.id}>
                                    {loc.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                                Người yêu cầu tại cửa hàng:
                              </label>
                              <input
                                type="text"
                                value={editRequesterName}
                                onChange={(e) => setEditRequesterName(e.target.value)}
                                placeholder="VD: QL Cường..."
                                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white font-medium"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                                Ghi chú từ cửa hàng:
                              </label>
                              <input
                                type="text"
                                value={editRequesterNote}
                                onChange={(e) => setEditRequesterNote(e.target.value)}
                                placeholder="Ghi chú thêm..."
                                className="w-full px-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white"
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsEditingOrigin(false)}
                            className="flex-1 py-1.5 px-3 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
                          >
                            Hủy
                          </button>
                          <button
                            type="button"
                            disabled={isSavingOrigin}
                            onClick={handleSaveOrigin}
                            className="flex-1 py-1.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs"
                          >
                            {isSavingOrigin ? 'Đang lưu...' : 'Lưu nguồn'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* NGƯỜI YÊU CẦU BAN ĐẦU */}
                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Người khởi tạo hệ thống
                    </span>
                    <div className="flex items-center gap-2 text-slate-800 font-medium">
                      <User className="w-4 h-4 text-slate-500 shrink-0" />
                      <div>
                        <span>{workOrder.requesterName}</span>
                        {workOrder.requesterEmail && (
                          <span className="text-xs text-slate-400 block">{workOrder.requesterEmail}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PHÂN CÔNG KỸ THUẬT VIÊN */}
                  <div className="bg-slate-50/70 p-3.5 rounded-2xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                        Kỹ thuật viên phụ trách
                      </span>
                      <AcknowledgmentBadge workOrder={workOrder} />
                    </div>

                    {/* Assignee Display Badge */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                        workOrder.assigneeType === 'team'
                          ? 'bg-indigo-100 text-indigo-700'
                          : workOrder.assigneeType === 'multiple'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {workOrder.assigneeType === 'team' ? (
                          <Building className="w-4 h-4" />
                        ) : workOrder.assigneeType === 'multiple' ? (
                          <Users className="w-4 h-4" />
                        ) : (
                          <UserCheck className="w-4 h-4" />
                        )}
                      </div>
                      <span className="font-bold text-slate-900 text-xs">
                        {getWorkOrderAssigneeDisplay(workOrder, technicians)}
                      </span>
                      {workOrder.acknowledged && (
                        <span className="text-[10px] text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                          {workOrder.acknowledgedByName
                            ? `Đã nhận: ${workOrder.acknowledgedByName}`
                            : 'Đã nhận việc'}
                        </span>
                      )}
                    </div>

                    {/* Technician Acknowledge Button if not acknowledged */}
                    {isWorkOrderAssignedTo(workOrder, userProfile?.uid) && workOrder.acknowledged === false && (
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={handleAcknowledgeOrder}
                          disabled={isAcknowledging}
                          className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all touch-manipulation"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          <span>XÁC NHẬN ĐÃ NHẬN VIỆC</span>
                        </button>
                      </div>
                    )}

                    {/* Admin Assignment Controls (Requirement 1, 2, 3, 4) */}
                    {isAdmin && (
                      <div className="space-y-3 pt-2.5 border-t border-slate-200/80">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                            Phân công người hoặc nhóm phụ trách:
                          </span>
                          <span className="text-[11px] text-blue-700 font-semibold">
                            {editAssigneeChoice === 'team'
                              ? 'Phòng kỹ thuật'
                              : editSelectedUserIds.length === 0
                              ? 'Chưa chọn'
                              : editSelectedUserIds.length === 1
                              ? '1 người'
                              : `${editSelectedUserIds.length} người`}
                          </span>
                        </div>

                        {/* 2 Lựa chọn: "Chọn người" và "Cả phòng" */}
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setEditAssigneeChoice('people')}
                            className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                              editAssigneeChoice === 'people'
                                ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <Users className="w-4 h-4" />
                            <span>Chọn người {editSelectedUserIds.length > 0 && `(${editSelectedUserIds.length})`}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setEditAssigneeChoice('team')}
                            className={`min-h-[40px] px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                              editAssigneeChoice === 'team'
                                ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            <Building className="w-4 h-4" />
                            <span>Cả phòng</span>
                          </button>
                        </div>

                        {/* Danh sách người khi ở chế độ "Chọn người" */}
                        {editAssigneeChoice === 'people' && (
                          <div className="space-y-2 pt-1 animate-in fade-in">
                            <div className="flex items-center justify-between px-1 text-xs">
                              <span className="text-[11px] font-semibold text-slate-600">
                                Chọn 1 hoặc nhiều người phụ trách:
                              </span>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={handleEditSelectAll}
                                  className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                >
                                  Chọn tất cả
                                </button>
                                <span className="text-slate-300">|</span>
                                <button
                                  type="button"
                                  onClick={handleEditDeselectAll}
                                  className="text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                                >
                                  Bỏ chọn
                                </button>
                              </div>
                            </div>

                            {/* Checkbox list */}
                            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
                              {assignableStaff.length === 0 ? (
                                <div className="p-3 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
                                  Chưa có kỹ thuật viên hoặc quản trị viên nào trong hệ thống
                                </div>
                              ) : (
                                assignableStaff.map((staff) => {
                                  const isChecked = Boolean(staff.uid && editSelectedUserIds.includes(staff.uid));

                                  if (!staff.hasLoggedIn || !staff.uid) {
                                    return (
                                      <div
                                        key={staff.email}
                                        className="p-2 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between opacity-70 cursor-not-allowed select-none"
                                        title="Tài khoản này chưa đăng nhập lần nào, chưa thể giao việc"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <input
                                            type="checkbox"
                                            disabled
                                            checked={false}
                                            className="w-4 h-4 rounded text-slate-300 border-slate-300 cursor-not-allowed"
                                          />
                                          <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs shrink-0">
                                            {staff.displayName.charAt(0).toUpperCase()}
                                          </div>
                                          <div className="min-w-0">
                                            <div className="font-semibold text-xs text-slate-600 truncate">
                                              {staff.displayName}
                                            </div>
                                            <div className="text-[10px] text-slate-400 truncate">{staff.email}</div>
                                          </div>
                                        </div>
                                        <span className="text-[10px] italic font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200 shrink-0">
                                          Chưa đăng nhập, chưa giao được
                                        </span>
                                      </div>
                                    );
                                  }

                                  return (
                                    <label
                                      key={staff.uid}
                                      className={`p-2 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                                        isChecked
                                          ? 'bg-blue-50/80 border-blue-400 text-blue-950 shadow-2xs'
                                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <input
                                          type="checkbox"
                                          checked={isChecked}
                                          onChange={() => handleEditToggleStaff(staff.uid!)}
                                          className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                                        />
                                        {staff.photoURL ? (
                                          <img
                                            src={staff.photoURL}
                                            alt={staff.displayName}
                                            className="w-7 h-7 rounded-full object-cover shrink-0"
                                            referrerPolicy="no-referrer"
                                          />
                                        ) : (
                                          <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0">
                                            {staff.displayName.charAt(0).toUpperCase()}
                                          </div>
                                        )}
                                        <div className="min-w-0">
                                          <div className="font-bold text-xs text-slate-900 truncate flex items-center gap-1.5">
                                            <span>{staff.displayName}</span>
                                            {staff.role === 'admin' && (
                                              <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-700">
                                                Admin
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[10px] text-slate-400 truncate">{staff.email}</div>
                                        </div>
                                      </div>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          </div>
                        )}

                        {/* Dynamic Descriptive Note (Requirement 4) */}
                        <div className="p-2.5 bg-white rounded-xl border border-blue-200 text-[11px] text-slate-600 leading-relaxed">
                          {editAssigneeChoice === 'team' ? (
                            <span>
                              Giao cho cả phòng kỹ thuật. Mọi kỹ thuật viên đều thấy trong mục <em>&quot;Việc hôm nay&quot;</em> và có thể tiếp nhận xử lý.
                            </span>
                          ) : editSelectedUserIds.length === 0 ? (
                            <span className="text-amber-700 font-medium">
                              Chưa chọn người phụ trách. Vui lòng tích chọn ít nhất 1 người hoặc chọn &quot;Cả phòng&quot;.
                            </span>
                          ) : editSelectedUserIds.length === 1 ? (
                            <span>
                              Công việc giao cho <strong>{editSelectedStaffNames[0]}</strong>.
                            </span>
                          ) : (
                            <span>
                              Công việc giao cho <strong>{editSelectedUserIds.length} người</strong>: {editSelectedStaffNames.join(', ')}. Người nào nhấn <em>&quot;Đã nhận việc&quot;</em> trước sẽ được ghi nhận, những người khác vẫn thấy và cùng cập nhật tiến độ.
                            </span>
                          )}
                        </div>

                        {/* Save Button for Assignee */}
                        <button
                          type="button"
                          onClick={handleSaveAssignee}
                          disabled={isSavingAssignee}
                          className="w-full py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
                        >
                          {isSavingAssignee ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Đang cập nhật phân công...</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-4 h-4" />
                              <span>Áp dụng thay đổi phân công</span>
                            </>
                          )}
                        </button>

                        {/* Zalo Share / Remind Actions */}
                        {(workOrder.assigneeId || workOrder.assigneeType === 'team' || workOrder.assigneeType === 'multiple') && (
                          <div className="flex items-center gap-2 flex-wrap pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                const tech = technicians.find((t) => t.uid === workOrder.assigneeId) || null;
                                setZaloRecipient(tech);
                                setZaloModalType('assign');
                                setIsZaloModalOpen(true);
                              }}
                              className="text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1.5 rounded-xl border border-blue-200 flex items-center gap-1 transition-colors"
                            >
                              <Share2 className="w-3 h-3" />
                              Gửi thông báo Zalo
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const tech = technicians.find((t) => t.uid === workOrder.assigneeId) || null;
                                setZaloRecipient(tech);
                                setZaloModalType('remind');
                                setIsZaloModalOpen(true);
                              }}
                              className="text-[11px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-xl border border-amber-200 flex items-center gap-1 transition-colors"
                            >
                              <Bell className="w-3 h-3" />
                              Nhắc việc
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Thời gian tạo
                    </span>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{formatDate(workOrder.createdAt)}</span>
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                      Hạn hoàn thành
                    </span>
                    <div className="flex items-center gap-2 text-slate-700">
                      <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>{workOrder.dueDate ? formatDate(workOrder.dueDate) : 'Không đặt hạn'}</span>
                    </div>
                  </div>
                </div>

                {/* Costs Section (Admin / Technician) */}
                {(isAdmin || isTechnician) && (
                  <div className="p-4 rounded-2xl border border-slate-200 bg-white space-y-3.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-emerald-600" />
                        <span>Bảng kê chi phí công việc</span>
                      </h4>
                      <span className="text-[11px] text-slate-400">Đơn vị: VNĐ</span>
                    </div>

                    {/* Cost Breakdown Table */}
                    <div className="overflow-hidden rounded-xl border border-slate-200 text-xs">
                      <table className="w-full text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px] border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2">Hạng mục chi phí</th>
                            <th className="px-3 py-2 text-right">Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          <tr>
                            <td className="px-3 py-2.5">
                              <span className="font-semibold text-slate-800 block">Vật tư & Phụ tùng đã xuất</span>
                              <span className="text-[11px] text-slate-400">
                                {materials.length} mặt hàng (tính theo đơn giá lúc xuất kho)
                              </span>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-slate-800">
                              {formatCurrency(materialsCost)}
                            </td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2">
                              <label className="font-semibold text-slate-800 block mb-1">
                                Chi phí nhân công / nội bộ
                              </label>
                              <span className="text-[11px] text-slate-400">Số giờ công hoặc định mức khoán</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                disabled={isReadOnlyEditor}
                                value={laborCost}
                                onChange={(e) => setLaborCost(Number(e.target.value))}
                                placeholder="0"
                                className="w-36 px-2.5 py-1.5 rounded-lg border border-slate-200 text-right font-mono text-xs font-bold focus:ring-2 focus:ring-blue-500 bg-slate-50/50 disabled:opacity-60"
                              />
                            </td>
                          </tr>
                          <tr>
                            <td className="px-3 py-2">
                              <label className="font-semibold text-slate-800 block mb-1">
                                Chi phí thuê ngoài / Dịch vụ
                              </label>
                              <span className="text-[11px] text-slate-400">Hóa đơn nhà thầu hoặc đối tác</span>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                disabled={isReadOnlyEditor}
                                value={externalCost}
                                onChange={(e) => setExternalCost(Number(e.target.value))}
                                placeholder="0"
                                className="w-36 px-2.5 py-1.5 rounded-lg border border-slate-200 text-right font-mono text-xs font-bold focus:ring-2 focus:ring-blue-500 bg-slate-50/50 disabled:opacity-60"
                              />
                            </td>
                          </tr>
                          <tr className="bg-slate-50 font-bold">
                            <td className="px-3 py-2.5 text-slate-900">TỔNG CỘNG CHI PHÍ</td>
                            <td className="px-3 py-2.5 text-right font-mono text-sm text-emerald-700">
                              {formatCurrency(totalWorkOrderCost)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Cost Note */}
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 mb-1">
                        Ghi chú chi phí / diễn giải
                      </label>
                      <input
                        type="text"
                        disabled={isReadOnlyEditor}
                        value={costNote}
                        onChange={(e) => setCostNote(e.target.value)}
                        placeholder="VD: Thay dầu máy phát + thuê thợ quấn lại motor bơm nước..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 bg-slate-50/50 disabled:opacity-60"
                      />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <span className="text-xs text-slate-500">
                        Định dạng chuẩn: <strong className="text-slate-800 font-mono">{formatCurrency(totalWorkOrderCost)}</strong>
                      </span>
                      {!isReadOnlyEditor && (
                        <button
                          type="button"
                          onClick={handleSaveCosts}
                          disabled={isSavingCost}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                        >
                          {isSavingCost ? 'Đang lưu...' : 'Lưu bảng chi phí'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Notification History (Admin only / reference) */}
                {isAdmin && workOrder.notificationHistory && workOrder.notificationHistory.length > 0 && (
                  <div className="p-4 bg-sky-50/70 rounded-2xl border border-sky-100 text-xs space-y-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sky-900 flex items-center gap-1.5 uppercase text-[11px] tracking-wider">
                        <Share2 className="w-4 h-4 text-sky-600" />
                        Lịch sử gửi thông báo ({workOrder.notificationHistory.length})
                      </span>
                      <span className="text-[10px] text-sky-600 font-medium">Lưu tham khảo</span>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto">
                      {workOrder.notificationHistory.map((rec) => (
                        <div
                          key={rec.id}
                          className="text-[11px] text-slate-700 flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-sky-100 shadow-2xs gap-2"
                        >
                          <div>
                            <span className="font-bold text-slate-900">
                              {rec.type === 'assign'
                                ? 'Đã gửi giao việc'
                                : rec.type === 'pending_approval'
                                ? 'Đã gửi duyệt'
                                : rec.type === 'rework_requested'
                                ? 'Đã báo làm lại'
                                : rec.type === 'approved'
                                ? 'Đã báo duyệt xong'
                                : 'Đã gửi nhắc việc'}:
                            </span>{' '}
                            {rec.recipientName} bởi {rec.sentByName}
                          </div>
                          <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap">
                            {formatDate(rec.sentAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Delete Work Order (Admin Only) */}
                {isAdmin && (
                  <div className="pt-4 border-t border-slate-200 flex justify-end">
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      Xóa công việc này
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'checklist' && (
              <div className="space-y-4">
                <div className="bg-blue-50/70 p-4 rounded-2xl border border-blue-200/80 flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-bold text-blue-900 flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-blue-600" />
                      <span>Hạng mục kiểm tra bảo dưỡng định kỳ</span>
                    </h4>
                    <p className="text-xs text-blue-700 mt-1 leading-relaxed">
                      Để chuyển sang trạng thái <strong>Hoàn thành</strong>, kỹ thuật viên phải tích đủ tất cả các mục đã thực hiện, hoặc điền lý do chi tiết vào ô ghi chú nếu chưa làm.
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-mono font-bold text-blue-700 bg-white px-2.5 py-1 rounded-xl border border-blue-200 shadow-2xs">
                      {checklist.filter((c) => c.done).length} / {checklist.length} xong
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  {checklist.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                      Chưa có danh mục checklist nào được thiết lập cho công việc này.
                    </div>
                  ) : (
                    checklist.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-4 rounded-2xl border transition-all ${
                          item.done
                            ? 'bg-emerald-50/40 border-emerald-200'
                            : 'bg-white border-slate-200 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={item.done}
                            disabled={isReadOnlyEditor || (!isAdmin && !isTechnician)}
                            onChange={() => handleToggleChecklistItem(idx)}
                            className="w-5 h-5 mt-0.5 rounded-lg text-emerald-600 border-slate-300 focus:ring-emerald-500 cursor-pointer disabled:opacity-60"
                          />
                          <div className="flex-1 min-w-0">
                            <div
                              onClick={() => {
                                if (!isReadOnlyEditor && (isAdmin || isTechnician)) handleToggleChecklistItem(idx);
                              }}
                              className={`text-sm font-semibold ${!isReadOnlyEditor && (isAdmin || isTechnician) ? 'cursor-pointer' : ''} ${
                                item.done ? 'line-through text-slate-500' : 'text-slate-900'
                              }`}
                            >
                              {item.text}
                            </div>
                            <div className="mt-2">
                              <input
                                type="text"
                                value={item.note || ''}
                                disabled={isReadOnlyEditor || (!isAdmin && !isTechnician)}
                                onChange={(e) => handleChecklistNoteChange(idx, e.target.value)}
                                placeholder="Ghi chú kết quả kiểm tra hoặc lý do nếu chưa thực hiện..."
                                className="w-full px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:ring-2 focus:ring-blue-500 text-slate-700 disabled:opacity-60"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {(isAdmin || isTechnician) && !isReadOnlyEditor && checklist.length > 0 && (
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveChecklist}
                      disabled={isSavingChecklist}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>{isSavingChecklist ? 'Đang lưu...' : 'Lưu kết quả Checklist'}</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'photos' && (
              <PhotoSection
                workOrderId={workOrder.id}
                photos={photos}
                canUpload={!isReadOnlyEditor && (isAdmin || isTechnician || workOrder.requesterId === userProfile?.uid)}
                onPhotoAdded={() => onSuccessToast('Đã lưu ảnh hiện trường')}
                onPhotoDeleted={() => onSuccessToast('Đã xóa ảnh')}
                onError={onError}
              />
            )}

            {activeTab === 'materials' && (isAdmin || isTechnician) && (
              <WorkOrderMaterialsSection
                workOrder={workOrder}
                inventoryItems={inventoryItems}
                canEdit={!isReadOnlyEditor && (isAdmin || isTechnician)}
                onMaterialsChanged={onWorkOrderUpdated}
                onError={onError}
                onSuccess={onSuccessToast}
              />
            )}

            {activeTab === 'costs' && (isAdmin || isTechnician) && (
              <div className="space-y-6">
                {/* Cost Header & KPI Cards */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900">Chi tiết chi phí công việc</h3>
                      <p className="text-xs text-slate-500">
                        Tổng hợp chi phí vật tư kho, nhân công nội bộ và thuê ngoài dịch vụ
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-blue-50/50 p-3.5 rounded-2xl border border-blue-100">
                      <div className="text-[11px] font-bold text-blue-700 uppercase tracking-wider mb-1">
                        Chi phí vật tư
                      </div>
                      <div className="text-sm sm:text-base font-black font-mono text-blue-900">
                        {formatCurrency(materialsCost)}
                      </div>
                      <div className="text-[10px] text-blue-600 mt-0.5">{materials.length} loại vật tư</div>
                    </div>

                    <div className="bg-purple-50/50 p-3.5 rounded-2xl border border-purple-100">
                      <div className="text-[11px] font-bold text-purple-700 uppercase tracking-wider mb-1">
                        Chi phí nhân công
                      </div>
                      <div className="text-sm sm:text-base font-black font-mono text-purple-900">
                        {formatCurrency(Number(laborCost) || 0)}
                      </div>
                      <div className="text-[10px] text-purple-600 mt-0.5">Kỹ thuật nội bộ</div>
                    </div>

                    <div className="bg-amber-50/50 p-3.5 rounded-2xl border border-amber-100">
                      <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider mb-1">
                        Thuê ngoài dịch vụ
                      </div>
                      <div className="text-sm sm:text-base font-black font-mono text-amber-900">
                        {formatCurrency(Number(externalCost) || 0)}
                      </div>
                      <div className="text-[10px] text-amber-600 mt-0.5">Nhà thầu/đối tác</div>
                    </div>

                    <div className="bg-emerald-500 text-white p-3.5 rounded-2xl shadow-sm">
                      <div className="text-[11px] font-bold uppercase tracking-wider mb-1 text-emerald-100">
                        TỔNG CHI PHÍ
                      </div>
                      <div className="text-base sm:text-lg font-black font-mono">
                        {formatCurrency(totalWorkOrderCost)}
                      </div>
                      <div className="text-[10px] text-emerald-100 mt-0.5">Vật tư + NC + Thuê ngoài</div>
                    </div>
                  </div>
                </div>

                {/* Table of materials used */}
                <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                  <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      Bảng chi tiết vật tư ({materials.length})
                    </span>
                    {!isReadOnlyEditor && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('materials')}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-700"
                      >
                        + Xuất thêm vật tư
                      </button>
                    )}
                  </div>
                  {materials.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      Chưa có vật tư kho nào được xuất dùng cho phiếu này.
                    </div>
                  ) : (
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50/50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                        <tr>
                          <th className="py-2 px-4">Vật tư</th>
                          <th className="py-2 px-3 text-center">Số lượng</th>
                          <th className="py-2 px-3 text-right">Đơn giá</th>
                          <th className="py-2 px-4 text-right">Thành tiền</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {materials.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50/50">
                            <td className="py-2.5 px-4 font-semibold text-slate-800">
                              {m.itemName}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-700">
                              {m.qty} {m.unit || ''}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                              {formatCurrency(m.unitCost)}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                              {formatCurrency(m.qty * (m.unitCost || 0))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                          <td colSpan={3} className="py-2.5 px-4 text-slate-700 text-right">
                            Cộng tiền vật tư:
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono text-blue-700">
                            {formatCurrency(materialsCost)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  )}
                </div>

                {/* Form to enter labor & external costs */}
                {!isReadOnlyEditor && (isAdmin || (isTechnician && isWorkOrderAssignedTo(workOrder, userProfile?.uid))) ? (
                  <div className="bg-slate-50 p-4 sm:p-5 rounded-2xl border border-slate-200 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <DollarSign className="w-4 h-4 text-blue-600" />
                        <span>Nhập chi phí phát sinh (Nhân công & Thuê ngoài)</span>
                      </h4>
                      <span className="text-[11px] text-slate-400">
                        {isAdmin ? 'Quyền: Quản trị viên' : 'Quyền: KTV được phân công'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Chi phí nhân công nội bộ (VNĐ)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          value={laborCost === 0 ? '' : laborCost}
                          onChange={(e) => setLaborCost(Number(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-mono text-xs focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Hiển thị: {formatCurrency(Number(laborCost) || 0)}
                        </span>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Chi phí thuê ngoài / Dịch vụ đối tác (VNĐ)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1000"
                          value={externalCost === 0 ? '' : externalCost}
                          onChange={(e) => setExternalCost(Number(e.target.value) || 0)}
                          placeholder="0"
                          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white font-mono text-xs focus:ring-2 focus:ring-blue-500"
                        />
                        <span className="text-[10px] text-slate-400 mt-1 block">
                          Hiển thị: {formatCurrency(Number(externalCost) || 0)}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ghi chú chi phí / Lý do phát sinh
                      </label>
                      <input
                        type="text"
                        value={costNote}
                        onChange={(e) => setCostNote(e.target.value)}
                        placeholder="VD: Thuê ép đầu cos cáp nguồn chính, thay thế rơle..."
                        className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        onClick={handleSaveCosts}
                        disabled={isSavingCost}
                        className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{isSavingCost ? 'Đang lưu chi phí...' : 'Lưu thông tin chi phí'}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      {isFinishedOrder && !isAdmin
                        ? 'Việc đã hoàn thành, chỉ admin được sửa chi phí công việc.'
                        : isTechReadOnly
                        ? 'Công việc đang chờ duyệt — không thể chỉnh sửa chi phí.'
                        : isTechnician
                        ? 'Bạn chỉ có thể nhập chi phí cho công việc được phân công trực tiếp cho bạn.'
                        : 'Chỉ Kỹ thuật viên phụ trách hoặc Quản trị viên mới có quyền cập nhật chi phí công việc.'}
                    </span>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'comments' && (
              <div className="space-y-4">
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {comments.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                      Chưa có trao đổi hoặc ghi chú nào cho công việc này.
                    </div>
                  ) : (
                    comments.map((cm) => (
                      <div
                        key={cm.id}
                        className={`p-3.5 rounded-2xl text-xs leading-relaxed ${
                          cm.authorId === userProfile?.uid
                            ? 'bg-blue-50 border border-blue-200 ml-6 text-blue-950'
                            : 'bg-slate-50 border border-slate-200 mr-6 text-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-slate-900">{cm.authorName}</span>
                          <span className="text-[10px] text-slate-400">
                            {formatRelativeTime(cm.createdAt)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{cm.content}</p>
                      </div>
                    ))
                  )}
                </div>

                {!isLockedForCurrentUser ? (
                  <form onSubmit={handleAddComment} className="flex gap-2 pt-2 border-t border-slate-100">
                    <input
                      type="text"
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Viết ghi chú hoặc trao đổi kỹ thuật..."
                      className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={isSubmittingComment || !newComment.trim()}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Gửi
                    </button>
                  </form>
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 text-center font-medium">
                    Việc đã hoàn thành, chỉ admin được sửa — Không thể thêm bình luận mới.
                  </div>
                )}
              </div>
            )}

            {activeTab === 'history' && (
              <div className="space-y-3">
                {history.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                    Chưa có nhật ký thay đổi
                  </div>
                ) : (
                  <div className="relative border-l-2 border-blue-100 ml-3 space-y-4 py-2">
                    {history.map((h) => (
                      <div key={h.id} className="relative pl-6 text-xs">
                        <div className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full bg-blue-500 border-2 border-white" />
                        <div className="font-semibold text-slate-800 flex items-center justify-between">
                          <span>{h.action}</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            {formatRelativeTime(h.timestamp)}
                          </span>
                        </div>
                        <div className="text-slate-500 mt-0.5">{h.details}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Thực hiện bởi: {h.actorName}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer Action Bar: Fixed at bottom for Chờ duyệt (Authorized approvers only) or default close */}
          <div className="px-4 sm:px-5 py-3 border-t border-slate-200 bg-white sm:bg-slate-50 flex items-center justify-between gap-2.5 flex-wrap shrink-0">
            {canApprove && workOrder.status === 'Chờ duyệt' ? (
              <div className="flex-1 flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <button
                  type="button"
                  disabled={isUpdatingStatus}
                  onClick={() => handleStatusChange('Hoàn thành')}
                  className="flex-1 min-h-[48px] px-4 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-emerald-600/25 active:scale-98 transition-all touch-manipulation"
                >
                  <CheckCircle2 className="w-5 h-5 text-white" />
                  <span>Duyệt hoàn thành</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowReturnModal(true)}
                  className="flex-1 min-h-[48px] px-4 py-2.5 rounded-2xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-md shadow-rose-600/25 active:scale-98 transition-all touch-manipulation"
                >
                  <RotateCcw className="w-4 h-4 text-white" />
                  <span>Yêu cầu làm lại</span>
                </button>
              </div>
            ) : (
              <div className="text-xs text-slate-500 hidden sm:block">
                Cập nhật lần cuối: {formatRelativeTime(workOrder.updatedAt || workOrder.createdAt)}
              </div>
            )}

            <button
              onClick={onClose}
              className="min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 active:scale-95 transition-all ml-auto"
            >
              Đóng cửa sổ
            </button>
          </div>
        </div>
      </div>

      {/* Return for Re-work Dialog (Mandatory Reason) */}
      {showReturnModal && canApprove && workOrder.status === 'Chờ duyệt' && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-5 shadow-2xl border border-rose-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Yêu cầu làm lại</h3>
                <p className="text-[11px] text-slate-500">Mã {workOrder.code}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Vui lòng nhập lý do cụ thể cần khắc phục để kỹ thuật viên nắm rõ và xử lý lại:
            </p>

            <textarea
              rows={3}
              required
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="VD: Cần chụp bổ sung ảnh sau khi dọn vệ sinh / Áp suất chưa đạt chuẩn..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-rose-500"
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowReturnModal(false);
                  setReturnReason('');
                }}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isReturning || !returnReason.trim()}
                onClick={handleConfirmReturn}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs disabled:opacity-50 shadow-md shadow-rose-600/20"
              >
                {isReturning ? 'Đang lưu...' : 'Xác nhận trả lại'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Technician Cancel Self-Created Task Dialog (Mandatory Reason) */}
      {showCancelSelfModal && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full rounded-3xl p-5 shadow-2xl border border-rose-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-2.5 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900">Hủy việc tự tạo</h3>
                <p className="text-[11px] text-slate-500">Mã {workOrder.code}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn hủy công việc tự tạo này? Vui lòng nhập lý do hủy việc:
            </p>

            <textarea
              rows={3}
              required
              value={cancelSelfReason}
              onChange={(e) => setCancelSelfReason(e.target.value)}
              placeholder="VD: Tạo trùng việc / Đã kiểm tra lại không có sự cố..."
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:ring-2 focus:ring-rose-500"
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setShowCancelSelfModal(false);
                  setCancelSelfReason('');
                }}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50"
              >
                Quay lại
              </button>
              <button
                type="button"
                disabled={isCancelingSelf || !cancelSelfReason.trim()}
                onClick={handleCancelSelfCreated}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs disabled:opacity-50 shadow-md shadow-rose-600/20"
              >
                {isCancelingSelf ? 'Đang hủy...' : 'Xác nhận hủy'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Xóa công việc này?"
        message={`Bạn có chắc chắn muốn xóa vĩnh viễn công việc "${workOrder.code} - ${workOrder.title}"? Dữ liệu ảnh và lịch sử sẽ không thể phục hồi.`}
        confirmText="Xác nhận xóa"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {isZaloModalOpen && (
        <ZaloShareModal
          isOpen={isZaloModalOpen}
          onClose={() => setIsZaloModalOpen(false)}
          workOrder={workOrder}
          technician={zaloRecipient || technicians.find((t) => t.uid === workOrder.assigneeId) || null}
          location={location || null}
          equipment={equipment || null}
          type={zaloModalType}
          reworkReason={zaloReworkReason}
          onSuccessToast={onSuccessToast}
          onErrorToast={onError}
          onWorkOrderUpdated={onWorkOrderUpdated}
        />
      )}

      {/* Google Drive Uploading Progress Modal */}
      {isSavingToDrive && (
        <div className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <CloudUpload className="w-6 h-6 animate-bounce" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-black text-slate-900">Lưu vào Google Drive</h4>
                <p className="text-xs text-slate-500 truncate">{workOrder.code} - {workOrder.title}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span className="truncate pr-2">{driveProgressMessage || 'Đang xử lý...'}</span>
                <span className="shrink-0">{driveProgressPercent}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${driveProgressPercent}%` }}
                />
              </div>
            </div>

            {driveFolderNotice && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{driveFolderNotice}</span>
              </div>
            )}

            <p className="text-[11px] text-slate-400 text-center italic">
              Vui lòng giữ kết nối mạng trong quá trình sao lưu tài liệu...
            </p>
          </div>
        </div>
      )}
    </>
  );
};
