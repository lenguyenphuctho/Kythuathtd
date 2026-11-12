import React, { useState } from 'react';
import {
  Users,
  Shield,
  HardHat,
  UserCheck,
  Eye,
  CheckCircle2,
  AlertCircle,
  Search,
  Power,
  ShieldAlert,
  UserPlus,
  RefreshCw,
  Mail,
  Lock,
  Clock,
  Calendar,
  X,
  Copy,
  Check,
  ThumbsUp,
  ThumbsDown,
  MapPin,
} from 'lucide-react';
import { UserProfile, UserRole, AllowedUser, ROOT_ADMIN_EMAIL, AccessRequest, LocationItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { RoleBadge } from '../common/Badge';
import { formatDate, formatDateTime, formatRelativeTime } from '../../utils/formatters';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';

interface UserManagementViewProps {
  users: UserProfile[];
  allowedUsers: AllowedUser[];
  accessRequests?: AccessRequest[];
  locations: LocationItem[];
  onError: (msg: string) => void;
  onSuccessToast: (msg: string) => void;
}

export const UserManagementView: React.FC<UserManagementViewProps> = ({
  users,
  allowedUsers,
  accessRequests = [],
  locations = [],
  onError,
  onSuccessToast,
}) => {
  const { userProfile: currentAdmin } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'allowlist' | 'requests'>('allowlist');
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [isUpdating, setIsUpdating] = useState<string | null>(null);
  const [copiedEmailMap, setCopiedEmailMap] = useState<Record<string, boolean>>({});

  // Add allowed user modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('technician');
  const [newLocationIds, setNewLocationIds] = useState<string[]>([]);
  const [addError, setAddError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Approval modal for Requester (Requirement: mandatory location selection)
  const [approveRequesterTarget, setApproveRequesterTarget] = useState<AccessRequest | null>(null);
  const [approveLocationIds, setApproveLocationIds] = useState<string[]>([]);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);

  // Edit locations modal for existing Requester
  const [editLocationTarget, setEditLocationTarget] = useState<AllowedUser | null>(null);
  const [editLocationIds, setEditLocationIds] = useState<string[]>([]);
  const [isEditLocationModalOpen, setIsEditLocationModalOpen] = useState(false);
  const [isSavingLocations, setIsSavingLocations] = useState(false);

  // Migration running state
  const [isMigrating, setIsMigrating] = useState(false);

  const pendingRequests = (accessRequests || []).filter((r) => r.status === 'pending');

  const handleCopyEmail = (email: string) => {
    navigator.clipboard?.writeText(email);
    setCopiedEmailMap((prev) => ({ ...prev, [email]: true }));
    setTimeout(() => {
      setCopiedEmailMap((prev) => ({ ...prev, [email]: false }));
    }, 2000);
    onSuccessToast(`Đã sao chép email: ${email}`);
  };

  const handleOpenApproveRequesterModal = (request: AccessRequest) => {
    setApproveRequesterTarget(request);
    setApproveLocationIds(locations.length > 0 ? [locations[0].id] : []);
    setIsApproveModalOpen(true);
  };

  const handleConfirmApproveRequester = async () => {
    if (!approveRequesterTarget) return;
    if (approveLocationIds.length === 0) {
      onError('Vui lòng chọn ít nhất một vị trí cho Người yêu cầu');
      return;
    }
    const targetEmail = approveRequesterTarget.email.toLowerCase().trim();
    try {
      setIsUpdating(targetEmail);
      // 1. Create/update in allowedUsers with locationIds
      await setDoc(doc(db, 'allowedUsers', targetEmail), {
        email: targetEmail,
        name: approveRequesterTarget.name || targetEmail.split('@')[0],
        role: 'requester',
        locationIds: approveLocationIds,
        active: true,
        addedBy: currentAdmin?.email || 'admin',
        addedAt: new Date().toISOString(),
        lastLoginAt: null,
      });

      // 2. Update accessRequests
      await updateDoc(doc(db, 'accessRequests', targetEmail), {
        status: 'approved',
        assignedRole: 'requester',
        reviewedBy: currentAdmin?.email || 'admin',
        reviewedAt: new Date().toISOString(),
      });

      // 3. Update user profile if exists
      const targetUser = users.find((u) => u.email.toLowerCase() === targetEmail);
      if (targetUser) {
        await updateDoc(doc(db, 'users', targetUser.uid), {
          role: 'requester',
          disabled: false,
        }).catch(() => {});
      }

      onSuccessToast(`Đã duyệt cấp quyền Người yêu cầu (${approveLocationIds.length} vị trí) cho ${targetEmail}`);
      setIsApproveModalOpen(false);
      setApproveRequesterTarget(null);
    } catch (err) {
      console.error(err);
      onError(`Lỗi khi duyệt yêu cầu: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleSaveRequesterLocations = async () => {
    if (!editLocationTarget) return;
    if (editLocationIds.length === 0) {
      onError('Vui lòng chọn ít nhất một vị trí quản lý');
      return;
    }
    const email = editLocationTarget.email.toLowerCase().trim();
    try {
      setIsSavingLocations(true);
      await updateDoc(doc(db, 'allowedUsers', email), {
        locationIds: editLocationIds,
      });
      onSuccessToast(`Đã cập nhật ${editLocationIds.length} vị trí quản lý cho ${email}`);
      setIsEditLocationModalOpen(false);
      setEditLocationTarget(null);
    } catch (err) {
      console.error(err);
      onError(`Lỗi khi cập nhật vị trí: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSavingLocations(false);
    }
  };

  const handleApproveRequest = async (request: AccessRequest, assignedRole: UserRole) => {
    if (assignedRole === 'requester') {
      handleOpenApproveRequesterModal(request);
      return;
    }
    const targetEmail = request.email.toLowerCase().trim();
    try {
      setIsUpdating(targetEmail);
      // 1. Create/update in allowedUsers
      await setDoc(doc(db, 'allowedUsers', targetEmail), {
        email: targetEmail,
        name: request.name || targetEmail.split('@')[0],
        role: assignedRole,
        active: true,
        addedBy: currentAdmin?.email || 'admin',
        addedAt: new Date().toISOString(),
        lastLoginAt: null,
      });

      // 2. Update accessRequests
      await updateDoc(doc(db, 'accessRequests', targetEmail), {
        status: 'approved',
        assignedRole,
        reviewedBy: currentAdmin?.email || 'admin',
        reviewedAt: new Date().toISOString(),
      });

      // 3. Update user profile if exists
      const targetUser = users.find((u) => u.email.toLowerCase() === targetEmail);
      if (targetUser) {
        await updateDoc(doc(db, 'users', targetUser.uid), {
          role: assignedRole,
          disabled: false,
        }).catch(() => {});
      }

      const roleLabel =
        assignedRole === 'technician' ? 'Kỹ thuật viên' : assignedRole === 'admin' ? 'Quản trị viên' : 'Người xem';
      onSuccessToast(`Đã duyệt cấp quyền "${roleLabel}" cho ${targetEmail}`);
    } catch (err) {
      console.error(err);
      onError(`Lỗi khi duyệt yêu cầu: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdating(null);
    }
  };

  const handleRejectRequest = async (request: AccessRequest) => {
    const targetEmail = request.email.toLowerCase().trim();
    try {
      setIsUpdating(targetEmail);
      await updateDoc(doc(db, 'accessRequests', targetEmail), {
        status: 'rejected',
        reviewedBy: currentAdmin?.email || 'admin',
        reviewedAt: new Date().toISOString(),
      });
      onSuccessToast(`Đã từ chối yêu cầu của ${targetEmail}`);
    } catch (err) {
      console.error(err);
      onError(`Lỗi khi từ chối yêu cầu: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsUpdating(null);
    }
  };

  // Merge allowedUsers with registered users for full view
  const combinedList = React.useMemo(() => {
    const list: (AllowedUser & { uid?: string; photoURL?: string; userDocDisabled?: boolean })[] = [];
    const allowedMap = new Map<string, AllowedUser>();

    allowedUsers.forEach((a) => {
      allowedMap.set(a.email.toLowerCase(), a);
    });

    // Ensure root admin is present
    if (!allowedMap.has(ROOT_ADMIN_EMAIL.toLowerCase())) {
      const rootAdminEntry: AllowedUser = {
        email: ROOT_ADMIN_EMAIL.toLowerCase(),
        name: 'Trưởng nhóm Kỹ thuật (Admin gốc)',
        role: 'admin',
        active: true,
        addedBy: 'system',
        addedAt: '2026-01-01T00:00:00.000Z',
        lastLoginAt: null,
      };
      allowedMap.set(ROOT_ADMIN_EMAIL.toLowerCase(), rootAdminEntry);
    }

    allowedMap.forEach((entry) => {
      const matchingUser = users.find((u) => u.email.toLowerCase() === entry.email.toLowerCase());
      list.push({
        ...entry,
        uid: matchingUser?.uid,
        photoURL: matchingUser?.photoURL,
        userDocDisabled: matchingUser?.disabled,
      });
    });

    return list;
  }, [allowedUsers, users]);

  const filteredList = combinedList.filter((u) => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const nameMatch = u.name.toLowerCase().includes(q);
      const emailMatch = u.email.toLowerCase().includes(q);
      return nameMatch || emailMatch;
    }
    return true;
  });

  // Handle Role change in allowlist & user doc
  const handleRoleChange = async (email: string, newRole: UserRole) => {
    if (email.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase()) {
      onError('Không thể thay đổi vai trò của Admin gốc');
      return;
    }

    try {
      setIsUpdating(email);
      await updateDoc(doc(db, 'allowedUsers', email.toLowerCase()), {
        role: newRole,
      });

      // Also sync user profile if exists
      const targetUser = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
      if (targetUser) {
        await updateDoc(doc(db, 'users', targetUser.uid), {
          role: newRole,
        }).catch(() => {});
      }

      onSuccessToast(`Đã đổi vai trò của ${email} sang ${newRole}`);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `allowedUsers/${email}`);
      onError('Không thể thay đổi vai trò. Vui lòng kiểm tra quyền admin.');
    } finally {
      setIsUpdating(null);
    }
  };

  // Handle Toggle Active/Disabled in allowlist & user doc
  const handleToggleActive = async (userItem: AllowedUser & { uid?: string }) => {
    const targetEmail = userItem.email.toLowerCase();

    // Protection 1: Root admin cannot be disabled
    if (targetEmail === ROOT_ADMIN_EMAIL.toLowerCase()) {
      onError('Không thể vô hiệu hóa tài khoản Admin gốc');
      return;
    }

    // Protection 2: Admin cannot disable self
    if (targetEmail === currentAdmin?.email.toLowerCase()) {
      onError('Bạn không thể tự vô hiệu hóa tài khoản quản trị của chính mình');
      return;
    }

    try {
      setIsUpdating(targetEmail);
      const newActive = !userItem.active;

      await updateDoc(doc(db, 'allowedUsers', targetEmail), {
        active: newActive,
      });

      // Sync user profile if user has logged in before
      if (userItem.uid) {
        await updateDoc(doc(db, 'users', userItem.uid), {
          disabled: !newActive,
        }).catch(() => {});
      }

      onSuccessToast(
        newActive
          ? `Đã kích hoạt cấp quyền cho ${targetEmail}`
          : `Đã vô hiệu hóa quyền truy cập của ${targetEmail}`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `allowedUsers/${targetEmail}`);
      onError('Không thể thay đổi trạng thái tài khoản');
    } finally {
      setIsUpdating(null);
    }
  };

  // Add new user to allowlist
  const handleAddAllowedUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);

    const emailTrimmed = newEmail.trim().toLowerCase();
    const nameTrimmed = newName.trim();

    // Valid email validation (allow any valid Google email, normalized lowercase, whitespace trimmed)
    if (!emailTrimmed || !emailTrimmed.includes('@') || emailTrimmed.indexOf('@') <= 0 || !emailTrimmed.includes('.')) {
      setAddError('Địa chỉ email không hợp lệ. Vui lòng nhập đúng địa chỉ email Google.');
      return;
    }

    if (newRole === 'requester' && newLocationIds.length === 0) {
      setAddError('Vui lòng chọn ít nhất một vị trí mà Người yêu cầu quản lý.');
      return;
    }

    try {
      setIsSubmitting(true);
      const docPayload: Record<string, any> = {
        email: emailTrimmed,
        name: nameTrimmed || emailTrimmed.split('@')[0],
        role: newRole,
        active: true,
        addedBy: currentAdmin?.email || 'admin',
        addedAt: new Date().toISOString(),
        lastLoginAt: null,
      };
      if (newRole === 'requester') {
        docPayload.locationIds = newLocationIds;
      }
      await setDoc(doc(db, 'allowedUsers', emailTrimmed), docPayload);

      // If user profile already exists in users, update role and enable it
      const targetUser = users.find((u) => u.email.toLowerCase() === emailTrimmed);
      if (targetUser) {
        await updateDoc(doc(db, 'users', targetUser.uid), {
          role: newRole,
          disabled: false,
        }).catch(() => {});
      }

      onSuccessToast(`Đã thêm ${emailTrimmed} vào danh sách cấp quyền thành công`);
      setIsAddModalOpen(false);
      setNewEmail('');
      setNewName('');
      setNewRole('technician');
      setNewLocationIds([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `allowedUsers/${emailTrimmed}`);
      setAddError('Lỗi khi thêm người dùng. Vui lòng kiểm tra quyền quản trị.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Requirement 8: Migration & Seed of default staff and disable unapproved users
  const handleMigrateOldUsers = async () => {
    try {
      setIsMigrating(true);

      // 1. Seed default technicians if not in allowedUsers yet
      const defaultStaff = [
        {
          email: 'kythuat1@goathgame.com.vn',
          name: 'Kỹ thuật viên 1',
          role: 'technician' as UserRole,
        },
        {
          email: 'kythuat2@goathgame.com.vn',
          name: 'Kỹ thuật viên 2',
          role: 'technician' as UserRole,
        },
      ];

      for (const staff of defaultStaff) {
        const staffRef = doc(db, 'allowedUsers', staff.email);
        const existing = allowedUsers.find((a) => a.email.toLowerCase() === staff.email);
        if (!existing) {
          await setDoc(staffRef, {
            email: staff.email,
            name: staff.name,
            role: staff.role,
            active: true,
            addedBy: currentAdmin?.email || 'system_migration',
            addedAt: new Date().toISOString(),
            lastLoginAt: null,
          });
        }
      }

      // 2. Scan users and disable any user not in allowlist and not root admin
      const validAllowedEmails = new Set(
        allowedUsers.filter((a) => a.active).map((a) => a.email.toLowerCase())
      );
      validAllowedEmails.add(ROOT_ADMIN_EMAIL.toLowerCase());
      defaultStaff.forEach((s) => validAllowedEmails.add(s.email));

      let disabledCount = 0;
      for (const u of users) {
        const uEmail = u.email.toLowerCase();
        if (!validAllowedEmails.has(uEmail) && !u.disabled) {
          await updateDoc(doc(db, 'users', u.uid), {
            disabled: true,
          }).catch(() => {});
          disabledCount++;
        }
      }

      onSuccessToast(
        `Đã hoàn tất đồng bộ: Cập nhật nhân viên mẫu và vô hiệu hóa ${disabledCount} tài khoản cũ ngoài danh sách (toàn bộ dữ liệu công việc được bảo lưu).`
      );
    } catch (err) {
      console.error(err);
      onError('Lỗi khi đồng bộ dữ liệu người dùng cũ');
    } finally {
      setIsMigrating(false);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Quản lý người dùng & Cấp quyền</span>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {combinedList.length} tài khoản
            </span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Mô hình đăng nhập Google kết hợp danh sách được cấp quyền (Allowlist) & Phê duyệt yêu cầu một chạm
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setAddError(null);
              setIsAddModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-xs font-bold shadow-md shadow-blue-600/20 transition-all active:scale-95 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Thêm người dùng</span>
          </button>
        </div>
      </div>

      {/* Sub Tabs: Danh sách cấp quyền & Yêu cầu chờ duyệt (Requirement 4) */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('allowlist')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'allowlist'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Danh sách cấp quyền</span>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
              activeSubTab === 'allowlist' ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            {combinedList.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('requests')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSubTab === 'requests'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Yêu cầu chờ duyệt</span>
          {pendingRequests.length > 0 ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
              {pendingRequests.length}
            </span>
          ) : (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                activeSubTab === 'requests' ? 'bg-amber-700 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {accessRequests?.length || 0}
            </span>
          )}
        </button>
      </div>

      {/* View Content depending on active sub-tab */}
      {activeSubTab === 'requests' ? (
        <div className="space-y-3 animate-in fade-in">
          {(!accessRequests || accessRequests.length === 0) ? (
            <div className="bg-white rounded-3xl p-8 border border-slate-200 text-center space-y-2">
              <Clock className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-700">Chưa có yêu cầu cấp quyền nào</p>
              <p className="text-xs text-slate-400">
                Khi nhân viên đăng nhập Google và bấm "Gửi yêu cầu cấp quyền", thông tin sẽ hiển thị ở đây để bạn phê duyệt một chạm.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {accessRequests.map((req) => {
                const isPending = req.status === 'pending';
                const isApproved = req.status === 'approved';
                const isRejected = req.status === 'rejected';
                const isThisUpdating = isUpdating === req.email.toLowerCase();

                return (
                  <div
                    key={req.email}
                    className={`bg-white rounded-2xl p-4 border transition-all ${
                      isPending
                        ? 'border-amber-300 ring-1 ring-amber-200 shadow-sm'
                        : isApproved
                        ? 'border-emerald-200 bg-emerald-50/20'
                        : 'border-slate-200 opacity-75'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* User Info */}
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        {req.photoURL ? (
                          <img
                            src={req.photoURL}
                            alt={req.name}
                            className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-slate-100 shadow-xs"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-black text-lg flex items-center justify-center shrink-0 shadow-xs">
                            {req.name.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-sm">{req.name}</span>
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                                isPending
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : isApproved
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-rose-100 text-rose-800 border border-rose-200'
                              }`}
                            >
                              {isPending ? 'Chờ duyệt' : isApproved ? 'Đã duyệt' : 'Đã từ chối'}
                            </span>
                            {req.assignedRole && <RoleBadge role={req.assignedRole} />}
                          </div>

                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-slate-500 font-mono truncate">{req.email}</span>
                            <button
                              type="button"
                              onClick={() => handleCopyEmail(req.email)}
                              className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700"
                              title="Sao chép email"
                            >
                              {copiedEmailMap[req.email] ? (
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>

                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5 flex-wrap">
                            <Clock className="w-3 h-3" />
                            <span>Gửi lúc: {formatDateTime(req.requestedAt)}</span>
                            {req.reviewedBy && (
                              <span className="text-slate-500">
                                • Xử lý bởi: {req.reviewedBy} ({req.reviewedAt ? formatDateTime(req.reviewedAt) : ''})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons (Requirement 4: Duyệt - Kỹ thuật viên, Duyệt - Người yêu cầu, Từ chối) */}
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
                        {isPending ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleApproveRequest(req, 'technician')}
                              disabled={isThisUpdating}
                              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              <HardHat className="w-3.5 h-3.5" />
                              <span>{isThisUpdating ? 'Đang duyệt...' : 'Duyệt – Kỹ thuật viên'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleApproveRequest(req, 'requester')}
                              disabled={isThisUpdating}
                              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              <UserCheck className="w-3.5 h-3.5" />
                              <span>{isThisUpdating ? 'Đang duyệt...' : 'Duyệt – Người yêu cầu'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRejectRequest(req)}
                              disabled={isThisUpdating}
                              className="px-3 py-2 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold inline-flex items-center gap-1 transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Từ chối</span>
                            </button>
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleApproveRequest(req, 'technician')}
                              disabled={isThisUpdating}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-lg text-[11px] font-bold"
                            >
                              Đổi sang KTV
                            </button>
                            <button
                              type="button"
                              onClick={() => handleApproveRequest(req, 'requester')}
                              disabled={isThisUpdating}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 rounded-lg text-[11px] font-bold"
                            >
                              Đổi sang Requester
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Allowlist view */
        <div className="space-y-4 animate-in fade-in">
          {/* Role explanation cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 text-xs">
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-2xl">
              <div className="flex items-center gap-1.5 font-bold text-purple-900 mb-1">
                <Shield className="w-4 h-4 text-purple-600" />
                <span>admin</span>
              </div>
              <p className="text-purple-700 text-[11px] leading-relaxed">
                Toàn quyền: duyệt công việc, gán việc, cấu hình thông tin công ty, quản lý người dùng & xuất báo cáo.
              </p>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl">
              <div className="flex items-center gap-1.5 font-bold text-blue-900 mb-1">
                <HardHat className="w-4 h-4 text-blue-600" />
                <span>technician</span>
              </div>
              <p className="text-blue-700 text-[11px] leading-relaxed">
                Kỹ thuật viên hiện trường: nhận việc, tự tạo việc, checklist bảo dưỡng, ảnh trước/sau.
              </p>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl">
              <div className="flex items-center gap-1.5 font-bold text-emerald-900 mb-1">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>requester</span>
              </div>
              <p className="text-emerald-700 text-[11px] leading-relaxed">
                Gửi yêu cầu sửa chữa cơ sở vật chất và chỉ theo dõi tiến độ các yêu cầu của bản thân.
              </p>
            </div>

            <div className="p-3 bg-slate-100 border border-slate-200 rounded-2xl">
              <div className="flex items-center gap-1.5 font-bold text-slate-900 mb-1">
                <Eye className="w-4 h-4 text-slate-600" />
                <span>viewer</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Chỉ xem bảng điều khiển tổng quan và báo cáo, không có quyền thay đổi dữ liệu.
              </p>
            </div>
          </div>

      {/* Search & Role Filter */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Tìm theo tên hoặc email công ty..."
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-500 shrink-0">Lọc vai trò:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="w-full sm:w-auto px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
          >
            <option value="all">Tất cả vai trò</option>
            <option value="admin">Quản trị viên (admin)</option>
            <option value="technician">Kỹ thuật viên (technician)</option>
            <option value="requester">Người yêu cầu (requester)</option>
            <option value="viewer">Người xem (viewer)</option>
          </select>
        </div>
      </div>

      {/* Allowed Users Table */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
              <tr>
                <th className="py-3.5 px-4 sm:px-6">Nhân sự & Email</th>
                <th className="py-3.5 px-4">Vai trò cấp quyền</th>
                <th className="py-3.5 px-4">Trạng thái</th>
                <th className="py-3.5 px-4">Lần đăng nhập cuối</th>
                <th className="py-3.5 px-4">Ngày cấp</th>
                <th className="py-3.5 px-4 sm:px-6 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Không tìm thấy nhân viên nào phù hợp với bộ lọc
                  </td>
                </tr>
              ) : (
                filteredList.map((u) => {
                  const isRoot = u.email.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase();
                  const isSelf = u.email.toLowerCase() === currentAdmin?.email.toLowerCase();
                  const busy = isUpdating === u.email.toLowerCase();

                  return (
                    <tr
                      key={u.email}
                      className={!u.active ? 'bg-slate-50/70 opacity-60' : 'hover:bg-slate-50/50'}
                    >
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          {u.photoURL ? (
                            <img
                              src={u.photoURL}
                              alt=""
                              className="w-9 h-9 rounded-full ring-1 ring-slate-200 object-cover"
                            />
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm">
                              {u.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {isRoot && (
                                <span className="text-[10px] bg-purple-100 text-purple-800 font-black px-1.5 py-0.5 rounded-full border border-purple-200">
                                  Root Admin
                                </span>
                              )}
                              {isSelf && !isRoot && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.2 rounded">
                                  Bạn
                                </span>
                              )}
                            </div>
                            <div className="text-slate-500 font-mono text-[11px] flex items-center gap-1">
                              <Mail className="w-3 h-3 text-slate-400" />
                              <span>{u.email}</span>
                            </div>
                            {u.role === 'requester' && (
                              <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                <span className="text-[10px] text-slate-400 font-semibold flex items-center gap-0.5">
                                  <MapPin className="w-3 h-3 text-purple-600" /> Vị trí:
                                </span>
                                {u.locationIds && u.locationIds.length > 0 ? (
                                  u.locationIds.map((locId) => {
                                    const loc = locations.find((l) => l.id === locId);
                                    return (
                                      <span
                                        key={locId}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200"
                                      >
                                        {loc?.name || locId}
                                      </span>
                                    );
                                  })
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    <AlertCircle className="w-3 h-3 text-amber-500" />
                                    Chưa gán vị trí
                                  </span>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditLocationTarget(u);
                                    setEditLocationIds(u.locationIds && u.locationIds.length > 0 ? u.locationIds : locations.length > 0 ? [locations[0].id] : []);
                                    setIsEditLocationModalOpen(true);
                                  }}
                                  className="text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer ml-1"
                                >
                                  [Sửa vị trí]
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        {isRoot ? (
                          <RoleBadge role="admin" />
                        ) : (
                          <select
                            disabled={busy || !u.active}
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.email, e.target.value as UserRole)}
                            className="px-2.5 py-1 rounded-xl border border-slate-200 font-semibold text-xs bg-white focus:ring-2 focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                          >
                            <option value="admin">Quản trị viên (admin)</option>
                            <option value="technician">Kỹ thuật viên (technician)</option>
                            <option value="requester">Người yêu cầu (requester)</option>
                            <option value="viewer">Người xem (viewer)</option>
                          </select>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {u.active ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Được phép truy cập
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                            <AlertCircle className="w-3 h-3" />
                            Đã vô hiệu hóa
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500">
                        {u.lastLoginAt ? (
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            <span title={formatDate(u.lastLoginAt)}>{formatRelativeTime(u.lastLoginAt)}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Chưa đăng nhập</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-slate-500">
                        {u.addedAt ? formatDate(u.addedAt) : '---'}
                      </td>

                      <td className="py-3.5 px-4 sm:px-6 text-right">
                        {isRoot ? (
                          <span className="text-[11px] text-slate-400 italic font-semibold">Cố định</span>
                        ) : isSelf ? (
                          <span className="text-[11px] text-slate-400 italic">Tài khoản của bạn</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleActive(u)}
                            disabled={busy}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold text-xs transition-all active:scale-95 ${
                              u.active
                                ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                            }`}
                          >
                            <Power className="w-3.5 h-3.5" />
                            <span>{u.active ? 'Khóa truy cập' : 'Kích hoạt lại'}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )}

      {/* Modal: Add User to Allowlist */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Thêm người dùng vào Allowlist</h3>
                  <p className="text-[11px] text-slate-500">Cấp quyền truy cập hệ thống trước khi nhân viên đăng nhập</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddAllowedUser} className="space-y-3.5">
              {addError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{addError}</span>
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email Google của nhân viên <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={newEmail}
                    onChange={(e) => {
                      setNewEmail(e.target.value);
                      setAddError(null);
                    }}
                    placeholder="nhanvien@gmail.com"
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Nhập tài khoản Google của nhân viên (hệ thống tự chuẩn hóa chữ thường và loại bỏ khoảng trắng thừa).
                </p>
              </div>

              {/* Full Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Họ và tên nhân viên</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
                />
              </div>

              {/* Role selection */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Vai trò phân quyền <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label
                    className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                      newRole === 'technician'
                        ? 'border-blue-500 bg-blue-50 text-blue-900 font-bold ring-1 ring-blue-400'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="technician"
                      checked={newRole === 'technician'}
                      onChange={() => setNewRole('technician')}
                      className="sr-only"
                    />
                    <HardHat className="w-4 h-4 text-blue-600 shrink-0" />
                    <span>Kỹ thuật viên</span>
                  </label>

                  <label
                    className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                      newRole === 'admin'
                        ? 'border-purple-500 bg-purple-50 text-purple-900 font-bold ring-1 ring-purple-400'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="admin"
                      checked={newRole === 'admin'}
                      onChange={() => setNewRole('admin')}
                      className="sr-only"
                    />
                    <Shield className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>Quản trị viên</span>
                  </label>

                  <label
                    className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                      newRole === 'requester'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold ring-1 ring-emerald-400'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="requester"
                      checked={newRole === 'requester'}
                      onChange={() => setNewRole('requester')}
                      className="sr-only"
                    />
                    <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Người yêu cầu</span>
                  </label>

                  <label
                    className={`p-2.5 rounded-xl border flex items-center gap-2 cursor-pointer transition-all ${
                      newRole === 'viewer'
                        ? 'border-slate-500 bg-slate-100 text-slate-900 font-bold ring-1 ring-slate-400'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value="viewer"
                      checked={newRole === 'viewer'}
                      onChange={() => setNewRole('viewer')}
                      className="sr-only"
                    />
                    <Eye className="w-4 h-4 text-slate-600 shrink-0" />
                    <span>Người xem</span>
                  </label>
                </div>
              </div>

              {/* Requirement: Location selection for Requester */}
              {newRole === 'requester' && (
                <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-2.5 animate-in fade-in">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-purple-600" />
                      <span>Vị trí quản lý <span className="text-rose-500">*</span></span>
                    </label>
                    <div className="flex items-center gap-2 text-[10px]">
                      <button
                        type="button"
                        onClick={() => setNewLocationIds(locations.map((l) => l.id))}
                        className="text-purple-700 hover:underline font-bold cursor-pointer"
                      >
                        Chọn tất cả
                      </button>
                      <span className="text-purple-300">•</span>
                      <button
                        type="button"
                        onClick={() => setNewLocationIds([])}
                        className="text-slate-500 hover:underline cursor-pointer"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-purple-700 leading-tight">
                    Người yêu cầu chỉ có thể xem và gửi yêu cầu sự cố cho các vị trí được chọn tại đây.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pt-1">
                    {locations.map((loc) => {
                      const isChecked = newLocationIds.includes(loc.id);
                      return (
                        <label
                          key={loc.id}
                          className={`p-2 rounded-xl border flex items-center gap-2 cursor-pointer text-xs transition-colors ${
                            isChecked
                              ? 'bg-purple-100/70 border-purple-400 text-purple-900 font-bold'
                              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setNewLocationIds((prev) =>
                                prev.includes(loc.id) ? prev.filter((id) => id !== loc.id) : [...prev, loc.id]
                              );
                            }}
                            className="rounded text-purple-600 focus:ring-purple-500"
                          />
                          <span className="truncate">{loc.name}</span>
                        </label>
                      );
                    })}
                  </div>
                  {newLocationIds.length === 0 && (
                    <p className="text-[10px] text-rose-600 font-semibold">
                      * Bắt buộc chọn ít nhất 1 vị trí
                    </p>
                  )}
                </div>
              )}

              {/* Form buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
                >
                  {isSubmitting ? 'Đang thêm...' : 'Cấp quyền truy cập'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 1: Phê duyệt Người yêu cầu & Phân công vị trí (Requirement 2) */}
      {isApproveModalOpen && approveRequesterTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Duyệt cấp quyền: Người yêu cầu</h3>
                  <p className="text-[11px] text-slate-500">{approveRequesterTarget.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsApproveModalOpen(false);
                  setApproveRequesterTarget(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Nhân viên: <strong>{approveRequesterTarget.name || approveRequesterTarget.email}</strong>
              </p>
              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-purple-600" />
                    <span>Chọn vị trí quản lý <span className="text-rose-500">*</span></span>
                  </span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setApproveLocationIds(locations.map((l) => l.id))}
                      className="text-purple-700 hover:underline font-bold cursor-pointer"
                    >
                      Tất cả
                    </button>
                    <span className="text-purple-300">•</span>
                    <button
                      type="button"
                      onClick={() => setApproveLocationIds([])}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>
                <p className="text-[11px] text-purple-700 leading-tight">
                  Bắt buộc chọn ít nhất một vị trí để người này xem và tạo yêu cầu cho các vị trí đó.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pt-1">
                  {locations.map((loc) => {
                    const isChecked = approveLocationIds.includes(loc.id);
                    return (
                      <label
                        key={loc.id}
                        className={`p-2 rounded-xl border flex items-center gap-2 cursor-pointer text-xs transition-colors ${
                          isChecked
                            ? 'bg-purple-100/70 border-purple-400 text-purple-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setApproveLocationIds((prev) =>
                              prev.includes(loc.id) ? prev.filter((id) => id !== loc.id) : [...prev, loc.id]
                            );
                          }}
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                        <span className="truncate">{loc.name}</span>
                      </label>
                    );
                  })}
                </div>
                {approveLocationIds.length === 0 && (
                  <p className="text-[10px] text-rose-600 font-bold">
                    * Bắt buộc chọn ít nhất 1 vị trí trước khi duyệt
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsApproveModalOpen(false);
                  setApproveRequesterTarget(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmApproveRequester}
                disabled={approveLocationIds.length === 0 || isUpdating === approveRequesterTarget.email.toLowerCase()}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs hover:shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isUpdating === approveRequesterTarget.email.toLowerCase() ? 'Đang duyệt...' : 'Xác nhận & Cấp quyền'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Chỉnh sửa vị trí quản lý cho Người yêu cầu đã có */}
      {isEditLocationModalOpen && editLocationTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm">Phân công vị trí quản lý</h3>
                  <p className="text-[11px] text-slate-500 font-mono">{editLocationTarget.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditLocationModalOpen(false);
                  setEditLocationTarget(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                Nhân sự: <strong>{editLocationTarget.name || editLocationTarget.email}</strong> (Người yêu cầu)
              </p>
              <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-2xl space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-purple-600" />
                    <span>Danh sách vị trí được phép quản lý</span>
                  </span>
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setEditLocationIds(locations.map((l) => l.id))}
                      className="text-purple-700 hover:underline font-bold cursor-pointer"
                    >
                      Chọn tất cả
                    </button>
                    <span className="text-purple-300">•</span>
                    <button
                      type="button"
                      onClick={() => setEditLocationIds([])}
                      className="text-slate-500 hover:underline cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pt-1">
                  {locations.map((loc) => {
                    const isChecked = editLocationIds.includes(loc.id);
                    return (
                      <label
                        key={loc.id}
                        className={`p-2 rounded-xl border flex items-center gap-2 cursor-pointer text-xs transition-colors ${
                          isChecked
                            ? 'bg-purple-100/70 border-purple-400 text-purple-900 font-bold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            setEditLocationIds((prev) =>
                              prev.includes(loc.id) ? prev.filter((id) => id !== loc.id) : [...prev, loc.id]
                            );
                          }}
                          className="rounded text-purple-600 focus:ring-purple-500"
                        />
                        <span className="truncate">{loc.name}</span>
                      </label>
                    );
                  })}
                </div>
                {editLocationIds.length === 0 && (
                  <p className="text-[10px] text-rose-600 font-bold">
                    * Cần chọn ít nhất 1 vị trí để Người yêu cầu có thể xem/gửi yêu cầu
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setIsEditLocationModalOpen(false);
                  setEditLocationTarget(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveRequesterLocations}
                disabled={isSavingLocations || editLocationIds.length === 0}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white shadow-xs hover:shadow-md transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSavingLocations ? 'Đang lưu...' : 'Lưu thay đổi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
