import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  X,
  Camera,
  Search,
  MapPin,
  Cpu,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Calendar,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  Users,
  Store,
  Wrench,
  Building,
  Zap,
  FileText,
  SlidersHorizontal,
  ChevronRight,
  Plus,
  Info,
} from 'lucide-react';
import {
  WorkOrder,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderType,
  WorkOrderRequestOrigin,
  WorkOrderAssigneeType,
  LocationItem,
  EquipmentItem,
  ElectricalAsset,
  UserProfile,
  AllowedUser,
  AssignableStaff,
  getAssignableStaffList,
  getWorkOrderOrigin,
  getWorkOrderAssigneeDisplay,
  isWorkOrderCompleted,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { compressImage } from '../../utils/imageCompressor';
import { doc, addDoc, updateDoc, collection } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { getFriendlyErrorMessage } from '../../utils/formatters';
import { triggerPushNotification } from '../../services/pushNotificationService';

export interface UniversalWorkOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Mode: 'quick' is the streamlined/compact mode, 'standard' has all detailed fields
  initialMode?: 'quick' | 'standard';
  // Default source: 'request' | 'internal'
  defaultSource?: WorkOrderSource;
  // Default origin: 'Cửa hàng yêu cầu' | 'KTV tự tạo'
  defaultOrigin?: WorkOrderRequestOrigin;
  // If provided, this modal performs "Duyệt & Giao việc" on that order
  targetWorkOrder?: WorkOrder | null;
  locations: LocationItem[];
  equipmentList: EquipmentItem[];
  technicians: UserProfile[];
  allowedUsers?: AllowedUser[];
  workOrders?: WorkOrder[];
  electricalAssets?: ElectricalAsset[];
  defaultElectricalAssetId?: string;
  defaultOrderType?: WorkOrderType;
  onSuccess: (workOrder: WorkOrder, assignedTech: UserProfile | null) => void;
  onError: (msg: string) => void;
}

export const UniversalWorkOrderModal: React.FC<UniversalWorkOrderModalProps> = ({
  isOpen,
  onClose,
  initialMode = 'quick',
  defaultSource,
  defaultOrigin,
  targetWorkOrder,
  locations,
  equipmentList,
  technicians,
  allowedUsers = [],
  workOrders = [],
  electricalAssets = [],
  defaultElectricalAssetId,
  defaultOrderType,
  onSuccess,
  onError,
}) => {
  const { userProfile, isAdmin, isTechnician, isRequester, userLocationIds } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Available locations for this user:
  // Requester is strictly restricted to assigned userLocationIds
  const availableLocations: LocationItem[] = useMemo(() => {
    if (isRequester) {
      const allowedSet = new Set(userLocationIds || []);
      return locations.filter((l) => allowedSet.has(l.id));
    }
    return locations;
  }, [locations, isRequester, userLocationIds]);

  // Form Mode: 'quick' (Rút gọn) or 'standard' (Đầy đủ)
  const [formMode, setFormMode] = useState<'quick' | 'standard'>(initialMode);

  useEffect(() => {
    if (isOpen) {
      setFormMode(initialMode);
    }
  }, [isOpen, initialMode]);

  // Determine initial origin:
  // Admin: defaultOrigin or if defaultSource == 'request' then 'Cửa hàng yêu cầu' else 'KTV tự tạo'
  // Tech: always 'KTV tự tạo'
  // Requester: always 'Cửa hàng yêu cầu'
  const computedInitialOrigin: WorkOrderRequestOrigin = useMemo(() => {
    if (targetWorkOrder) return getWorkOrderOrigin(targetWorkOrder);
    if (isRequester) return 'Cửa hàng yêu cầu';
    if (isTechnician) return 'KTV tự tạo';
    if (defaultOrigin) return defaultOrigin;
    if (defaultSource === 'request') return 'Cửa hàng yêu cầu';
    return 'KTV tự tạo'; // Admin default as requested
  }, [targetWorkOrder, isRequester, isTechnician, defaultOrigin, defaultSource]);

  // Request Origin states
  const [requestOrigin, setRequestOrigin] = useState<WorkOrderRequestOrigin>(computedInitialOrigin);

  const initialLocId = useMemo(() => {
    if (targetWorkOrder?.locationId) return targetWorkOrder.locationId;
    if (isRequester) {
      return availableLocations.length > 0 ? availableLocations[0].id : '';
    }
    return locations[0]?.id || '';
  }, [targetWorkOrder, isRequester, availableLocations, locations]);

  const [requestingStoreId, setRequestingStoreId] = useState<string>(
    targetWorkOrder?.requestingStoreId || targetWorkOrder?.locationId || initialLocId
  );
  const [requesterName, setRequesterName] = useState<string>(
    targetWorkOrder?.requesterName || (isRequester ? userProfile?.displayName || '' : '')
  );
  const [requesterNote, setRequesterNote] = useState<string>(
    targetWorkOrder?.requesterNote || ''
  );

  // General fields
  const [title, setTitle] = useState(targetWorkOrder?.title || '');
  const [description, setDescription] = useState(targetWorkOrder?.description || '');
  const [orderType, setOrderType] = useState<WorkOrderType>(
    targetWorkOrder?.orderType || defaultOrderType || (defaultElectricalAssetId ? 'electrical' : 'repair')
  );
  const [priority, setPriority] = useState<WorkOrderPriority>(targetWorkOrder?.priority || 'trung_binh');
  const [locationId, setLocationId] = useState<string>(initialLocId);
  const [equipmentId, setEquipmentId] = useState<string | undefined>(targetWorkOrder?.equipmentId);
  const [electricalAssetId, setElectricalAssetId] = useState<string | undefined>(
    targetWorkOrder?.electricalAssetId || defaultElectricalAssetId
  );
  const [equipmentSearch, setEquipmentSearch] = useState('');

  // Auto-sync locationId if isRequester has locations
  useEffect(() => {
    if (isRequester && availableLocations.length > 0) {
      if (!locationId || !availableLocations.some((l) => l.id === locationId)) {
        setLocationId(availableLocations[0].id);
        setRequestingStoreId(availableLocations[0].id);
      }
    }
  }, [isRequester, availableLocations, locationId]);

  // Dynamic Assignable Staff (technicians and admins)
  const assignableStaff: AssignableStaff[] = useMemo(() => {
    return getAssignableStaffList(technicians, allowedUsers);
  }, [technicians, allowedUsers]);

  // First staff member with uid
  const firstAvailableStaffUid = useMemo(() => {
    return assignableStaff.find((s) => s.hasLoggedIn && s.uid)?.uid || '';
  }, [assignableStaff]);

  // Assignee Choice: 'people' | 'team' (Requirement 1: 2 choices)
  const [assigneeChoice, setAssigneeChoice] = useState<'people' | 'team'>(() => {
    if (targetWorkOrder?.assigneeType === 'team') return 'team';
    return 'people';
  });

  // Selected Assignee UIDs (for 'people' choice: 1 or multiple, Requirement 1 & 2)
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(() => {
    if (targetWorkOrder) {
      if (targetWorkOrder.assigneeType === 'team') return [];
      if (targetWorkOrder.assigneeIds && targetWorkOrder.assigneeIds.length > 0) {
        return targetWorkOrder.assigneeIds;
      }
      if (targetWorkOrder.assigneeId) {
        return [targetWorkOrder.assigneeId];
      }
    }
    const defaultUid = assignableStaff.find((s) => s.hasLoggedIn && s.uid)?.uid;
    return defaultUid ? [defaultUid] : [];
  });

  // Tên những người được chọn (dùng cho ghi chú giải thích động và lưu tên)
  const selectedStaffNames = useMemo(() => {
    return selectedUserIds
      .map((id) => assignableStaff.find((s) => s.uid === id)?.displayName)
      .filter(Boolean) as string[];
  }, [selectedUserIds, assignableStaff]);

  const handleSelectAll = () => {
    const allLoggedInUids = assignableStaff
      .filter((s) => s.hasLoggedIn && s.uid)
      .map((s) => s.uid as string);
    setSelectedUserIds(allLoggedInUids);
  };

  const handleDeselectAll = () => {
    setSelectedUserIds([]);
  };

  const handleToggleStaff = (uid: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(uid) ? prev.filter((id) => id !== uid) : [...prev, uid]
    );
  };

  // Due Date state: 'today' | 'tomorrow' | '3days' | 'custom'
  const [duePreset, setDuePreset] = useState<'today' | 'tomorrow' | '3days' | 'custom'>(
    targetWorkOrder?.dueDate ? 'custom' : 'tomorrow'
  );
  const [customDueDate, setCustomDueDate] = useState<string>(() => {
    if (targetWorkOrder?.dueDate) {
      return targetWorkOrder.dueDate.split('T')[0];
    }
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });

  // Photo state
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoSizeKb, setPhotoSizeKb] = useState<number>(0);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Quick suggestions for common issues
  const quickTitleSuggestions = [
    'Hỏng điều hòa nhiệt độ',
    'Mất nguồn điện tổng',
    'Tủ mát không làm lạnh',
    'Chập aptomat tầng',
    'Rò rỉ đường ống nước',
    'Cháy bóng đèn chiếu sáng',
    'Kẹt cửa cuốn tự động',
    'Bơm nước kêu to bất thường',
  ];

  // Sync state when targetWorkOrder changes
  useEffect(() => {
    if (targetWorkOrder) {
      setTitle(targetWorkOrder.title || '');
      setDescription(targetWorkOrder.description || '');
      setLocationId(targetWorkOrder.locationId || locations[0]?.id || '');
      setEquipmentId(targetWorkOrder.equipmentId);
      setPriority(targetWorkOrder.priority || 'trung_binh');
      const origin = getWorkOrderOrigin(targetWorkOrder);
      setRequestOrigin(origin === 'Chưa phân loại' ? 'Cửa hàng yêu cầu' : origin);
      setRequestingStoreId(targetWorkOrder.requestingStoreId || targetWorkOrder.locationId || locations[0]?.id || '');
      setRequesterName(targetWorkOrder.requesterName || '');
      setRequesterNote(targetWorkOrder.requesterNote || '');
      if (targetWorkOrder.assigneeType === 'team') {
        setAssigneeChoice('team');
        setSelectedUserIds([]);
      } else {
        setAssigneeChoice('people');
        if (targetWorkOrder.assigneeIds && targetWorkOrder.assigneeIds.length > 0) {
          setSelectedUserIds(targetWorkOrder.assigneeIds);
        } else if (targetWorkOrder.assigneeId) {
          setSelectedUserIds([targetWorkOrder.assigneeId]);
        } else if (firstAvailableStaffUid) {
          setSelectedUserIds([firstAvailableStaffUid]);
        }
      }
      if (targetWorkOrder.dueDate) {
        setDuePreset('custom');
        setCustomDueDate(targetWorkOrder.dueDate.split('T')[0]);
      }
    }
  }, [targetWorkOrder, locations, firstAvailableStaffUid]);

  // Compute workload for each staff (number of active jobs)
  const techWorkloadMap = useMemo(() => {
    const map = new Map<string, number>();
    assignableStaff.forEach((s) => {
      if (s.uid) map.set(s.uid, 0);
    });
    workOrders.forEach((wo) => {
      if (!isWorkOrderCompleted(wo)) {
        if (wo.assigneeType === 'multiple' && Array.isArray(wo.assigneeIds)) {
          wo.assigneeIds.forEach((uid) => {
            map.set(uid, (map.get(uid) || 0) + 1);
          });
        } else if (wo.assigneeId) {
          map.set(wo.assigneeId, (map.get(wo.assigneeId) || 0) + 1);
        }
      }
    });
    return map;
  }, [assignableStaff, workOrders]);

  // Filtered equipment by search and location
  const filteredEquipment = useMemo(() => {
    let list = equipmentList;
    if (isRequester) {
      const allowedLocSet = new Set(availableLocations.map((l) => l.id));
      list = list.filter((e) => allowedLocSet.has(e.locationId));
    }
    if (locationId) {
      const matchLoc = list.filter((e) => e.locationId === locationId);
      if (matchLoc.length > 0) list = matchLoc;
    }
    if (!equipmentSearch.trim()) return list.slice(0, 15);
    const q = equipmentSearch.toLowerCase();
    return list
      .filter((e) => e.code.toLowerCase().includes(q) || e.name.toLowerCase().includes(q))
      .slice(0, 15);
  }, [equipmentList, isRequester, availableLocations, locationId, equipmentSearch]);

  const selectedEquipment = useMemo(() => {
    return equipmentList.find((e) => e.id === equipmentId);
  }, [equipmentList, equipmentId]);

  const handleSelectEquipment = (eq: EquipmentItem) => {
    setEquipmentId(eq.id);
    if (eq.locationId) {
      setLocationId(eq.locationId);
      if (requestOrigin === 'Cửa hàng yêu cầu' && !requestingStoreId) {
        setRequestingStoreId(eq.locationId);
      }
    }
  };

  // Photo capture
  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressingPhoto(true);
      const res = await compressImage(file);
      setPhotoDataUrl(res.dataUrl);
      setPhotoSizeKb(res.sizeInKb);
    } catch (err) {
      console.error(err);
      onError('Không thể nén ảnh. Vui lòng thử lại.');
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  // Calculate final due date
  const calculateFinalDueDate = (): string => {
    const now = new Date();
    if (duePreset === 'today') {
      return now.toISOString().split('T')[0] + 'T18:00:00';
    } else if (duePreset === 'tomorrow') {
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      return tomorrow.toISOString().split('T')[0] + 'T18:00:00';
    } else if (duePreset === '3days') {
      const threeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      return threeDays.toISOString().split('T')[0] + 'T18:00:00';
    } else if (duePreset === 'custom' && customDueDate) {
      return customDueDate + 'T18:00:00';
    }
    const defaultD = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return defaultD.toISOString().split('T')[0] + 'T18:00:00';
  };

  // Handle Form Submit
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (isRequester && availableLocations.length === 0) {
      onError('Tài khoản chưa được gán vị trí, hãy liên hệ quản trị viên.');
      return;
    }

    if (!title.trim()) {
      onError('Vui lòng nhập tiêu đề sự cố / công việc');
      return;
    }

    if (!locationId) {
      onError('Vui lòng chọn vị trí xảy ra sự cố');
      return;
    }

    if (!userProfile) {
      onError('Vui lòng đăng nhập lại');
      return;
    }

    // Validation for "Cửa hàng yêu cầu"
    const effectiveOrigin: WorkOrderRequestOrigin = isRequester
      ? 'Cửa hàng yêu cầu'
      : isTechnician
      ? 'KTV tự tạo'
      : requestOrigin;

    if (effectiveOrigin === 'Cửa hàng yêu cầu' && !requestingStoreId && !locationId) {
      onError('Vui lòng chọn cửa hàng gửi yêu cầu');
      return;
    }

    try {
      setIsSubmitting(true);
      const now = new Date().toISOString();
      const finalDueDate = calculateFinalDueDate();

      // Resolve store name
      const storeIdToUse = requestingStoreId || locationId;
      const storeName = locations.find((l) => l.id === storeIdToUse)?.name || 'Cửa hàng';

      // 1. Resolve Assignee details
      let finalAssigneeType: WorkOrderAssigneeType = 'single';
      let finalAssigneeIds: string[] = [];
      let finalAssigneeId = '';
      let finalAssigneeName = '';
      let assignedTechObj: UserProfile | null = null;
      let finalAssignedAt: string | undefined = undefined;

      if (isTechnician) {
        // Technician creating internal task: locked to self
        finalAssigneeType = 'single';
        finalAssigneeIds = [userProfile.uid];
        finalAssigneeId = userProfile.uid;
        finalAssigneeName = userProfile.displayName;
        finalAssignedAt = now;
        assignedTechObj = userProfile;
      } else if (isAdmin) {
        if (assigneeChoice === 'team') {
          finalAssigneeType = 'team';
          finalAssigneeIds = [];
          finalAssigneeId = '';
          finalAssigneeName = 'Phòng kỹ thuật';
          finalAssignedAt = now;
          assignedTechObj = null;
        } else {
          // 'people'
          if (selectedUserIds.length === 0) {
            onError('Vui lòng chọn ít nhất một người phụ trách hoặc chọn Cả phòng');
            setIsSubmitting(false);
            return;
          }
          const selectedStaffObjs = selectedUserIds
            .map((id) => assignableStaff.find((s) => s.uid === id))
            .filter(Boolean);
          const names = selectedStaffObjs.map((s) => s!.displayName);

          if (selectedUserIds.length === 1) {
            finalAssigneeType = 'single';
            finalAssigneeIds = selectedUserIds;
            finalAssigneeId = selectedUserIds[0];
            finalAssigneeName = names[0] || '';
            finalAssignedAt = now;
            assignedTechObj = technicians.find((t) => t.uid === finalAssigneeId) || null;
          } else {
            finalAssigneeType = 'multiple';
            finalAssigneeIds = selectedUserIds;
            finalAssigneeId = selectedUserIds[0];
            finalAssigneeName = names.join(', ');
            finalAssignedAt = now;
            assignedTechObj = technicians.find((t) => t.uid === finalAssigneeId) || null;
          }
        }
      }

      // 2. Resolve Source
      const finalSource: WorkOrderSource = isRequester
        ? 'request'
        : isTechnician
        ? 'internal'
        : effectiveOrigin === 'Cửa hàng yêu cầu'
        ? 'request'
        : 'internal';

      // 3. Resolve Status
      let finalStatus = 'Mới';
      if (isTechnician) {
        finalStatus = 'Đang xử lý';
      } else if (isAdmin) {
        if (finalAssigneeId || finalAssigneeType === 'team' || finalAssigneeType === 'multiple') {
          finalStatus = 'Đang xử lý';
        } else {
          finalStatus = 'Mới';
        }
      } else {
        finalStatus = 'Mới';
      }

      // 4. CASE A: Target Work Order Approval ("Duyệt & Giao việc")
      if (targetWorkOrder) {
        const updatePayload: Record<string, any> = {
          title: title.trim(),
          description: description.trim(),
          locationId,
          priority,
          requestOrigin: effectiveOrigin,
          assigneeType: finalAssigneeType,
          assigneeIds: finalAssigneeIds,
          assigneeId: finalAssigneeId,
          assigneeName: finalAssigneeName,
          status: 'Đang xử lý',
          assignedAt: now,
          dueDate: finalDueDate,
        };

        if (effectiveOrigin === 'Cửa hàng yêu cầu') {
          updatePayload.requestingStoreId = storeIdToUse;
          updatePayload.requestingStoreName = storeName;
          if (requesterName.trim()) updatePayload.requesterName = requesterName.trim();
          if (requesterNote.trim()) updatePayload.requesterNote = requesterNote.trim();
        }
        if (equipmentId) updatePayload.equipmentId = equipmentId;

        await updateDoc(doc(db, 'workOrders', targetWorkOrder.id), updatePayload);

        // Record history
        await addDoc(collection(db, 'workOrderHistory'), {
          workOrderId: targetWorkOrder.id,
          actorId: userProfile.uid,
          actorName: userProfile.displayName,
          action: 'Duyệt & Giao việc',
          details: `Admin ${userProfile.displayName} đã duyệt và giao việc cho ${finalAssigneeName || 'kỹ thuật viên'} (Nguồn: ${effectiveOrigin})`,
          timestamp: now,
        });

        // Add photo if taken
        if (photoDataUrl) {
          await addDoc(collection(db, 'workOrderPhotos'), {
            workOrderId: targetWorkOrder.id,
            kind: 'before',
            dataUrl: photoDataUrl,
            takenBy: userProfile.uid,
            takenByName: userProfile.displayName,
            takenAt: now,
          });
        }

        // Non-blocking Web Push notification for assignment
        triggerPushNotification('assigned', targetWorkOrder.id, {
          actorName: userProfile.displayName,
          changes: finalAssigneeName ? `giao việc cho ${finalAssigneeName}` : 'cập nhật công việc',
        });

        const updatedOrder: WorkOrder = {
          ...targetWorkOrder,
          ...updatePayload,
        };

        onSuccess(updatedOrder, assignedTechObj);
        onClose();
        return;
      }

      // 5. CASE B: Create Brand New Work Order
      const year = new Date().getFullYear();
      const random = Math.floor(1000 + Math.random() * 9000);
      const code = `CV-${year}-${random}`;

      const newOrderData: Record<string, any> = {
        code,
        source: finalSource,
        requestOrigin: effectiveOrigin,
        assigneeType: finalAssigneeType,
        assigneeIds: finalAssigneeIds,
        assigneeId: finalAssigneeId,
        assigneeName: finalAssigneeName,
        orderType: electricalAssetId ? 'electrical' : orderType,
        title: title.trim(),
        description: description.trim(),
        priority,
        status: finalStatus,
        locationId,
        requesterId: userProfile.uid,
        requesterName:
          effectiveOrigin === 'Cửa hàng yêu cầu' && requesterName.trim()
            ? requesterName.trim()
            : userProfile.displayName,
        requesterEmail: userProfile.email,
        createdAt: now,
        dueDate: finalDueDate,
      };

      if (isTechnician) {
        newOrderData.selfCreated = true;
        newOrderData.createdBy = userProfile.uid;
        newOrderData.acknowledged = true;
        newOrderData.acknowledgedAt = now;
        newOrderData.acknowledgedBy = userProfile.uid;
        newOrderData.acknowledgedByName = userProfile.displayName;
      }

      if (finalAssignedAt) {
        newOrderData.assignedAt = finalAssignedAt;
      }

      if (effectiveOrigin === 'Cửa hàng yêu cầu') {
        newOrderData.requestingStoreId = storeIdToUse;
        newOrderData.requestingStoreName = storeName;
        if (requesterNote.trim()) newOrderData.requesterNote = requesterNote.trim();
      }

      if (equipmentId) newOrderData.equipmentId = equipmentId;
      if (electricalAssetId) newOrderData.electricalAssetId = electricalAssetId;

      const docRef = await addDoc(collection(db, 'workOrders'), newOrderData);

      // Record history
      await addDoc(collection(db, 'workOrderHistory'), {
        workOrderId: docRef.id,
        actorId: userProfile.uid,
        actorName: userProfile.displayName,
        action: isTechnician ? 'KTV tự tạo việc' : 'Tạo công việc mới',
        details: isTechnician
          ? `Kỹ thuật viên ${userProfile.displayName} tự khởi tạo và xử lý công việc`
          : `${userProfile.displayName} tạo công việc mới (Nguồn: ${effectiveOrigin}, Phụ trách: ${finalAssigneeName || 'Chờ giao'})`,
        timestamp: now,
      });

      // Add photo if taken
      if (photoDataUrl) {
        await addDoc(collection(db, 'workOrderPhotos'), {
          workOrderId: docRef.id,
          kind: 'before',
          dataUrl: photoDataUrl,
          takenBy: userProfile.uid,
          takenByName: userProfile.displayName,
          takenAt: now,
        });
      }

      // Non-blocking Web Push notification
      const resolvedLocationName = locations.find((l) => l.id === locationId)?.name || storeName || '';
      triggerPushNotification('new_request', docRef.id, {
        actorName: userProfile.displayName,
        workOrderCode: code,
        workOrderTitle: title.trim(),
        locationName: resolvedLocationName,
        priority,
        status: finalStatus,
        assigneeId: finalAssigneeId,
        assigneeName: finalAssigneeName,
        assigneeType: finalAssigneeType,
        assigneeIds: finalAssigneeIds,
        changes: finalAssigneeName ? `tạo việc mới và giao cho ${finalAssigneeName}` : 'tạo yêu cầu sửa chữa mới',
      });

      const createdWorkOrder: WorkOrder = {
        id: docRef.id,
        ...newOrderData,
      } as WorkOrder;

      onSuccess(createdWorkOrder, assignedTechObj);
      onClose();
    } catch (err: any) {
      console.error('Error creating/assigning work order:', err);
      handleFirestoreError(err, OperationType.CREATE, 'workOrders');
      onError(getFriendlyErrorMessage(err, 'Lỗi tạo công việc'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] my-auto animate-in zoom-in-95">
        {/* Top Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              {targetWorkOrder ? <Sparkles className="w-5 h-5" /> : formMode === 'quick' ? <Zap className="w-5 h-5 text-amber-400" /> : <FileText className="w-5 h-5 text-blue-400" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black tracking-tight">
                  {targetWorkOrder
                    ? `Duyệt & Giao việc [${targetWorkOrder.code}]`
                    : isTechnician
                    ? 'Kỹ thuật viên tự tạo việc'
                    : isRequester
                    ? 'Gửi yêu cầu sửa chữa'
                    : formMode === 'quick'
                    ? 'Tạo việc nhanh & Giao việc'
                    : 'Tạo công việc mới (Đầy đủ)'}
                </h3>
                {isAdmin && !targetWorkOrder && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${formMode === 'quick' ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30' : 'bg-blue-400/20 text-blue-300 border border-blue-400/30'}`}>
                    {formMode === 'quick' ? 'Tạo nhanh' : 'Đầy đủ'}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300">
                {isTechnician
                  ? 'Việc tự tạo được tiếp nhận xử lý ngay'
                  : isRequester
                  ? 'Gửi thông tin sự cố đến bộ phận kỹ thuật'
                  : 'Phân loại nguồn và chỉ định người phụ trách chính xác'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Mode switcher toggle for Admin */}
            {isAdmin && !targetWorkOrder && (
              <button
                type="button"
                onClick={() => setFormMode(formMode === 'quick' ? 'standard' : 'quick')}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all flex items-center gap-1 border border-white/15"
                title={formMode === 'quick' ? 'Chuyển sang biểu mẫu đầy đủ chi tiết' : 'Chuyển sang chế độ tạo nhanh'}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{formMode === 'quick' ? 'Mẫu đầy đủ' : 'Tạo nhanh'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 active:scale-95 text-slate-300 hover:text-white flex items-center justify-center transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 overflow-y-auto space-y-4 text-xs">
          {/* Warning banner if requester has no assigned locations (Requirement 3) */}
          {isRequester && availableLocations.length === 0 && (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3 animate-in fade-in">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold text-amber-900 text-xs sm:text-sm">Tài khoản chưa được gán vị trí</h4>
                <p className="text-[11px] text-amber-700 mt-0.5 leading-relaxed">
                  Tài khoản chưa được gán vị trí, hãy liên hệ quản trị viên để được phân quyền quản lý cửa hàng trước khi tạo yêu cầu.
                </p>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 1: NGUỒN CÔNG VIỆC (CHỈ ADMIN THẤY ĐỦ; TECH & REQUESTER CỐ ĐỊNH) */}
          {/* ============================================================== */}
          {isAdmin && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-blue-600" />
                  <span>1. Nguồn phát sinh công việc</span>
                </span>
                <span className="text-[11px] text-slate-500">Dùng cho báo cáo cuối tháng</span>
              </div>

              {/* Toggle 2 options: KTV tự tạo vs Cửa hàng yêu cầu */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRequestOrigin('KTV tự tạo')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    requestOrigin === 'KTV tự tạo'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Wrench className="w-4 h-4" />
                  <span>KTV tự tạo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRequestOrigin('Cửa hàng yêu cầu')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    requestOrigin === 'Cửa hàng yêu cầu'
                      ? 'bg-purple-600 border-purple-600 text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Store className="w-4 h-4" />
                  <span>Cửa hàng yêu cầu</span>
                </button>
              </div>

              {/* Sub-fields when "Cửa hàng yêu cầu" is selected */}
              {requestOrigin === 'Cửa hàng yêu cầu' && (
                <div className="pt-2 border-t border-slate-200 space-y-3 animate-in fade-in">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Cửa hàng gửi yêu cầu <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={requestingStoreId}
                        onChange={(e) => {
                          setRequestingStoreId(e.target.value);
                          setLocationId(e.target.value);
                        }}
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-purple-500 text-xs"
                      >
                        <option value="">-- Chọn cửa hàng / cơ sở --</option>
                        {locations.map((loc) => (
                          <option key={loc.id} value={loc.id}>
                            {loc.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Người yêu cầu (tại cửa hàng)
                      </label>
                      <input
                        type="text"
                        value={requesterName}
                        onChange={(e) => setRequesterName(e.target.value)}
                        placeholder="VD: Cửa hàng trưởng, Nhân viên thu ngân..."
                        className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-purple-500 text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Ghi chú / Yêu cầu từ cửa hàng
                    </label>
                    <input
                      type="text"
                      value={requesterNote}
                      onChange={(e) => setRequesterNote(e.target.value)}
                      placeholder="VD: Tủ mát không lạnh từ sáng, cần sửa trước giờ cao điểm..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-purple-500 text-xs"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 2: TIÊU ĐỀ & MÔ TẢ CÔNG VIỆC */}
          {/* ============================================================== */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800">
              Tiêu đề công việc / Sự cố <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="VD: Sửa chữa điều hòa phòng khách, thay aptomat..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-blue-500"
              required
            />

            {/* Quick Title Suggestion Chips */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-0.5 text-[11px]">
              <span className="text-slate-400 font-medium shrink-0 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                Gợi ý:
              </span>
              {quickTitleSuggestions.map((sug, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTitle(sug)}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 transition-colors shrink-0 font-medium cursor-pointer"
                >
                  {sug}
                </button>
              ))}
            </div>
          </div>

          {/* Mô tả chi tiết (Always in standard mode, expandable in quick mode) */}
          {(formMode === 'standard' || description) && (
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-800">
                Mô tả chi tiết sự cố / yêu cầu kỹ thuật
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mô tả hiện trạng hư hỏng, dấu hiệu lạ, nguyên nhân sơ bộ..."
                rows={3}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          {/* Phân loại công việc (Standard mode) */}
          {formMode === 'standard' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Phân loại công việc
                </label>
                <select
                  value={orderType}
                  onChange={(e) => setOrderType(e.target.value as WorkOrderType)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-blue-500"
                >
                  <option value="repair">Sửa chữa sự cố (Đột xuất)</option>
                  <option value="maintenance">Bảo dưỡng định kỳ</option>
                  <option value="electrical">Sự cố hệ thống điện</option>
                  <option value="inspection">Kiểm tra / Giám định</option>
                  <option value="installation">Lắp đặt mới</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Độ ưu tiên
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as WorkOrderPriority)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-blue-500"
                >
                  <option value="trung_binh">Trung bình (Bình thường)</option>
                  <option value="cao">Cao (Cần giải quyết sớm)</option>
                  <option value="khan_cap">Khẩn cấp (Ngừng vận hành)</option>
                  <option value="thap">Thấp (Có thể hoãn)</option>
                </select>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 3: VỊ TRÍ & THIẾT BỊ KỸ THUẬT */}
          {/* ============================================================== */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Khu vực / Vị trí <span className="text-rose-500">*</span>
              </label>
              {isRequester && availableLocations.length === 1 ? (
                <div className="w-full px-3 py-2.5 rounded-xl border border-purple-200 bg-purple-50/60 font-bold text-xs text-purple-950 flex items-center justify-between">
                  <span className="flex items-center gap-1.5 truncate">
                    <MapPin className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                    <span>{availableLocations[0].name}</span>
                  </span>
                  <span className="text-[10px] bg-purple-200/70 text-purple-800 px-2 py-0.5 rounded-md font-semibold shrink-0">
                    Cố định
                  </span>
                </div>
              ) : (
                <select
                  value={locationId}
                  onChange={(e) => {
                    setLocationId(e.target.value);
                    if (isRequester) setRequestingStoreId(e.target.value);
                  }}
                  disabled={isRequester && availableLocations.length === 0}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                  required
                >
                  {availableLocations.length === 0 ? (
                    <option value="">-- Chưa được gán vị trí --</option>
                  ) : (
                    <>
                      {availableLocations.length > 1 && <option value="">-- Chọn vị trí / cơ sở --</option>}
                      {availableLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                        </option>
                      ))}
                    </>
                  )}
                </select>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Thiết bị liên quan (tùy chọn)
              </label>
              <select
                value={equipmentId || ''}
                onChange={(e) => {
                  const eq = equipmentList.find((x) => x.id === e.target.value);
                  if (eq) handleSelectEquipment(eq);
                  else setEquipmentId(undefined);
                }}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium text-xs focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Không gắn thiết bị cụ thể --</option>
                {filteredEquipment.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    [{eq.code}] {eq.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Equipment Search Pill in Quick Mode if equipment list is large */}
          {equipmentList.length > 5 && !equipmentId && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={equipmentSearch}
                onChange={(e) => setEquipmentSearch(e.target.value)}
                placeholder="Tìm nhanh mã hoặc tên thiết bị..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/60"
              />
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 4: HẠN HOÀN THÀNH (DUE DATE) */}
          {/* ============================================================== */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-blue-600" />
              <span>Hạn hoàn thành mong muốn</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => setDuePreset('today')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  duePreset === 'today'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Hôm nay
              </button>
              <button
                type="button"
                onClick={() => setDuePreset('tomorrow')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  duePreset === 'tomorrow'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Ngày mai
              </button>
              <button
                type="button"
                onClick={() => setDuePreset('3days')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  duePreset === '3days'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                3 ngày
              </button>
              <button
                type="button"
                onClick={() => setDuePreset('custom')}
                className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                  duePreset === 'custom'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Tùy chọn
              </button>
            </div>

            {duePreset === 'custom' && (
              <div className="pt-1">
                <input
                  type="date"
                  value={customDueDate}
                  onChange={(e) => setCustomDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold"
                />
              </div>
            )}
          </div>

          {/* ============================================================== */}
          {/* SECTION 5: NGƯỜI PHỤ TRÁCH (CHỈ ADMIN THẤY) */}
          {/* ============================================================== */}
          {isAdmin && (
            <div className="p-3.5 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-600" />
                  <span>Người phụ trách công việc</span>
                </span>
                <span className="text-[11px] text-blue-700 font-semibold">
                  {assigneeChoice === 'team'
                    ? 'Phòng kỹ thuật'
                    : selectedUserIds.length === 0
                    ? 'Chưa chọn'
                    : selectedUserIds.length === 1
                    ? '1 người'
                    : `${selectedUserIds.length} người`}
                </span>
              </div>

              {/* 2 Lựa chọn: "Chọn người" và "Cả phòng" */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAssigneeChoice('people')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    assigneeChoice === 'people'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  <span>Chọn người {selectedUserIds.length > 0 && `(${selectedUserIds.length})`}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setAssigneeChoice('team')}
                  className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                    assigneeChoice === 'team'
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Building className="w-4 h-4" />
                  <span>Cả phòng</span>
                </button>
              </div>

              {/* Danh sách người khi ở chế độ "Chọn người" */}
              {assigneeChoice === 'people' && (
                <div className="space-y-2 pt-1 animate-in fade-in">
                  {/* Thanh tiện ích: Chọn tất cả / Bỏ chọn */}
                  <div className="flex items-center justify-between px-1 text-xs">
                    <span className="text-[11px] font-semibold text-slate-600">
                      Chọn 1 hoặc nhiều người phụ trách:
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSelectAll}
                        className="text-[11px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                      >
                        Chọn tất cả
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={handleDeselectAll}
                        className="text-[11px] font-bold text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  </div>

                  {/* Checkbox list */}
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
                    {assignableStaff.length === 0 ? (
                      <div className="p-3 text-center text-xs text-slate-500 bg-white rounded-xl border border-slate-200">
                        Chưa có kỹ thuật viên hoặc quản trị viên nào trong hệ thống
                      </div>
                    ) : (
                      assignableStaff.map((staff) => {
                        const isChecked = Boolean(staff.uid && selectedUserIds.includes(staff.uid));
                        const activeJobs = staff.uid ? (techWorkloadMap.get(staff.uid) || 0) : 0;

                        if (!staff.hasLoggedIn || !staff.uid) {
                          return (
                            <div
                              key={staff.email}
                              className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 flex items-center justify-between opacity-70 cursor-not-allowed select-none"
                              title="Tài khoản này chưa đăng nhập lần nào, chưa thể giao việc"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="checkbox"
                                  disabled
                                  checked={false}
                                  className="w-4 h-4 rounded text-slate-300 border-slate-300 cursor-not-allowed"
                                />
                                <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-xs shrink-0">
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
                            className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                              isChecked
                                ? 'bg-blue-50/80 border-blue-400 text-blue-950 shadow-2xs'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleToggleStaff(staff.uid!)}
                                className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                              />
                              {staff.photoURL ? (
                                <img
                                  src={staff.photoURL}
                                  alt={staff.displayName}
                                  className="w-8 h-8 rounded-full object-cover shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs shrink-0">
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
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                activeJobs > 3 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {activeJobs} việc
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              )}

              {/* Dynamic Descriptive Note (Requirement 4) */}
              <div className="p-2.5 bg-white rounded-xl border border-blue-200 text-[11px] text-slate-600 leading-relaxed">
                {assigneeChoice === 'team' ? (
                  <span>
                    Giao cho cả phòng kỹ thuật. Mọi kỹ thuật viên đều thấy trong mục <em>&quot;Việc hôm nay&quot;</em> và có thể tiếp nhận xử lý.
                  </span>
                ) : selectedUserIds.length === 0 ? (
                  <span className="text-amber-700 font-medium">
                    Chưa chọn người phụ trách. Vui lòng tích chọn ít nhất 1 người hoặc chọn &quot;Cả phòng&quot;.
                  </span>
                ) : selectedUserIds.length === 1 ? (
                  <span>
                    Công việc giao cho <strong>{selectedStaffNames[0]}</strong>.
                  </span>
                ) : (
                  <span>
                    Công việc giao cho <strong>{selectedUserIds.length} người</strong>: {selectedStaffNames.join(', ')}. Người nào nhấn <em>&quot;Đã nhận việc&quot;</em> trước sẽ được ghi nhận, những người khác vẫn thấy và cùng cập nhật tiến độ.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* SECTION 6: CHỤP ẢNH BAN ĐẦU (CAMERA / THƯ VIỆN) */}
          {/* ============================================================== */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-blue-600" />
              <span>Ảnh hiện trạng sự cố (tùy chọn)</span>
            </label>

            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={handlePhotoCapture}
              className="hidden"
            />

            {photoDataUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center group max-h-48">
                <img
                  src={photoDataUrl}
                  alt="Ảnh hiện trạng"
                  className="w-full h-48 object-cover"
                />
                <div className="absolute top-2 right-2 flex items-center gap-1.5">
                  <span className="text-[10px] bg-slate-900/70 backdrop-blur-xs text-white px-2 py-0.5 rounded-full font-mono">
                    {photoSizeKb} KB
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPhotoDataUrl(null);
                      setPhotoSizeKb(0);
                    }}
                    className="p-1.5 bg-rose-600 text-white rounded-xl shadow-md hover:bg-rose-700 active:scale-95 transition-all"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={isCompressingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3.5 border-2 border-dashed border-slate-200 hover:border-blue-400 bg-slate-50/50 hover:bg-blue-50/30 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-slate-600 hover:text-blue-700 transition-all cursor-pointer"
              >
                {isCompressingPhoto ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Đang nén ảnh dưới 150KB...</span>
                  </>
                ) : (
                  <>
                    <Camera className="w-4 h-4 text-blue-600" />
                    <span>Chụp ảnh sự cố hoặc chọn từ máy</span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Bottom Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || isCompressingPhoto || (isRequester && availableLocations.length === 0)}
              className="w-full min-h-[48px] py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:scale-98 text-white font-black text-sm shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Đang ghi dữ liệu vào hệ thống...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>
                    {targetWorkOrder
                      ? 'Xác nhận Duyệt & Giao việc'
                      : isTechnician
                      ? 'Khởi tạo & Tiếp nhận làm việc ngay'
                      : isRequester
                      ? 'Gửi yêu cầu sửa chữa'
                      : 'Hoàn tất khởi tạo công việc'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
