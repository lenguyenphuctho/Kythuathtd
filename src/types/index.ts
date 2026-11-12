export type UserRole = 'admin' | 'technician' | 'requester' | 'viewer';

export const ROOT_ADMIN_EMAIL = 'lenguyenphuctho@gmail.com';
export const ALLOWED_COMPANY_DOMAIN = '@goathgame.com.vn';

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected';

export interface AccessRequest {
  id: string; // lowercase email
  email: string;
  name: string;
  photoURL?: string | null;
  requestedAt: string;
  status: AccessRequestStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  assignedRole?: UserRole | null;
}

export interface AllowedUser {
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  addedBy: string;
  addedAt: string;
  lastLoginAt: string | null;
  locationIds?: string[];
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  role: UserRole;
  disabled?: boolean;
  createdAt: string;
}

export interface LocationItem {
  id: string;
  name: string;
  parentId?: string | null;
  description?: string;
  createdAt: string;
}

export type EquipmentStatus = 'active' | 'maintenance' | 'broken' | 'retired';

export interface EquipmentItem {
  id: string;
  code: string;
  name: string;
  category: string;
  locationId: string;
  status: EquipmentStatus;
  purchaseDate?: string;
  notes?: string;
  createdAt: string;
}

export type WorkOrderPriority = 'thap' | 'trung_binh' | 'cao' | 'khan_cap';

export type WorkOrderStatus =
  | 'Mới'
  | 'Đã duyệt'
  | 'Đang xử lý'
  | 'Chờ vật tư'
  | 'Chờ duyệt'
  | 'Hoàn thành'
  | 'Đã đóng';

export type WorkOrderSource = 'request' | 'internal';
export type WorkOrderType = 'repair' | 'maintenance' | 'electrical';

export interface ChecklistResultItem {
  text: string;
  done: boolean;
  note?: string;
}

export interface WorkOrderNotificationRecord {
  id: string;
  sentAt: string;
  sentBy: string;
  sentByName: string;
  type: 'assign' | 'remind';
  recipientName: string;
}

export type WorkOrderRequestOrigin = 'KTV tự tạo' | 'Cửa hàng yêu cầu' | 'Chưa phân loại';
export type WorkOrderAssigneeType = 'single' | 'multiple' | 'team';

export interface WorkOrder {
  id: string;
  code: string; // e.g. CV-2026-0001
  source: WorkOrderSource;
  orderType?: WorkOrderType;
  title: string;
  description: string;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  equipmentId?: string;
  electricalAssetId?: string;
  locationId: string;
  requesterId: string;
  requesterName: string;
  requesterEmail?: string;
  assigneeId?: string;
  assigneeName?: string;
  assignedAt?: string | null;
  acknowledged?: boolean;
  acknowledgedAt?: string | null;
  acknowledgedBy?: string | null;
  acknowledgedByName?: string | null;
  notificationHistory?: WorkOrderNotificationRecord[];
  dueDate?: string;
  createdAt: string;
  completedAt?: string;
  closedAt?: string;
  laborCost?: number;
  externalCost?: number;
  costNote?: string;
  planId?: string; // For preventive maintenance
  checklistResults?: ChecklistResultItem[];
  selfCreated?: boolean;
  createdBy?: string;
  canceledReason?: string;
  driveFolderUrl?: string;
  driveSavedAt?: string;
  driveSavedBy?: string;

  // New optional fields for Request Origin & Multi-assignee
  requestOrigin?: WorkOrderRequestOrigin;
  requestingStoreId?: string;
  requestingStoreName?: string;
  requesterNote?: string;
  assigneeType?: WorkOrderAssigneeType;
  assigneeIds?: string[];
}

/**
 * Xử lý nguồn công việc cho cả công việc mới và công việc cũ:
 * - Nếu có requestOrigin: trả về giá trị đó
 * - Nếu việc cũ: selfCreated = true -> 'KTV tự tạo'; source = 'request' -> 'Cửa hàng yêu cầu'; còn lại 'Chưa phân loại'
 */
export function getWorkOrderOrigin(wo: WorkOrder): WorkOrderRequestOrigin {
  if (wo.requestOrigin === 'KTV tự tạo' || wo.requestOrigin === 'Cửa hàng yêu cầu') {
    return wo.requestOrigin;
  }
  if (wo.selfCreated) {
    return 'KTV tự tạo';
  }
  if (wo.source === 'request') {
    return 'Cửa hàng yêu cầu';
  }
  return 'Chưa phân loại';
}

export interface AssignableStaff {
  uid?: string;
  email: string;
  displayName: string;
  photoURL?: string | null;
  role: UserRole;
  hasLoggedIn: boolean;
}

/**
 * Danh sách người có thể giao việc: Lấy từ người dùng active = true có vai trò technician hoặc admin
 * (admin cũng làm kỹ thuật).
 * Nếu có allowedUsers: kết hợp với users để phát hiện ai chưa đăng nhập lần nào (chưa có uid).
 */
export function getAssignableStaffList(
  users: UserProfile[],
  allowedUsers?: AllowedUser[]
): AssignableStaff[] {
  const result: AssignableStaff[] = [];
  const processedEmails = new Set<string>();

  if (allowedUsers && allowedUsers.length > 0) {
    const techOrAdminAllowed = allowedUsers.filter(
      (a) => (a.role === 'technician' || a.role === 'admin') && a.active !== false
    );

    for (const allowed of techOrAdminAllowed) {
      const emailLower = allowed.email.toLowerCase().trim();
      processedEmails.add(emailLower);
      const matchedUser = users.find(
        (u) => u.email.toLowerCase().trim() === emailLower && !u.disabled
      );

      if (matchedUser) {
        result.push({
          uid: matchedUser.uid,
          email: matchedUser.email,
          displayName: matchedUser.displayName || allowed.name || matchedUser.email,
          photoURL: matchedUser.photoURL,
          role: matchedUser.role || allowed.role,
          hasLoggedIn: true,
        });
      } else {
        result.push({
          uid: undefined,
          email: allowed.email,
          displayName: allowed.name || allowed.email,
          photoURL: undefined,
          role: allowed.role,
          hasLoggedIn: false,
        });
      }
    }
  }

  // Bổ sung những user trong users là technician hoặc admin mà chưa có trong allowedUsers (ví dụ root admin hoặc tài khoản tạo trực tiếp)
  for (const user of users) {
    const emailLower = user.email.toLowerCase().trim();
    if (!processedEmails.has(emailLower) && (user.role === 'technician' || user.role === 'admin') && !user.disabled) {
      processedEmails.add(emailLower);
      result.push({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email,
        photoURL: user.photoURL,
        role: user.role,
        hasLoggedIn: true,
      });
    }
  }

  // Sắp xếp: người đã đăng nhập lên trước, sau đó theo tên alphabet tiếng Việt
  return result.sort((a, b) => {
    if (a.hasLoggedIn !== b.hasLoggedIn) {
      return a.hasLoggedIn ? -1 : 1;
    }
    return a.displayName.localeCompare(b.displayName, 'vi');
  });
}

/**
 * Hiển thị tên người phụ trách cho mọi trường hợp (đơn lẻ, nhiều người, cả phòng kỹ thuật)
 */
export function getWorkOrderAssigneeDisplay(wo: WorkOrder, technicians?: UserProfile[]): string {
  if (wo.assigneeType === 'team') {
    return 'Phòng kỹ thuật';
  }
  if (wo.assigneeType === 'multiple') {
    if (technicians && technicians.length > 0 && wo.assigneeIds && wo.assigneeIds.length > 0) {
      const names = wo.assigneeIds
        .map((id) => technicians.find((t) => t.uid === id)?.displayName || '')
        .filter(Boolean);
      if (names.length > 0) {
        return names.join(', ');
      }
    }
    if (wo.assigneeName) {
      // Legacy "Sơn + Minh" hoặc "A + B" -> chuẩn hóa thành "A, B"
      return wo.assigneeName.replace(/\s*\+\s*/g, ', ');
    }
    return 'Nhiều người';
  }
  if (technicians && technicians.length > 0 && wo.assigneeId) {
    const tech = technicians.find((t) => t.uid === wo.assigneeId);
    if (tech?.displayName) return tech.displayName;
  }
  return wo.assigneeName || (wo.assigneeId ? 'Kỹ thuật viên' : 'Chưa phân công');
}

/**
 * Kiểm tra xem công việc có thuộc phân công của một kỹ thuật viên hay không
 */
export function isWorkOrderAssignedTo(wo: WorkOrder, uid?: string | null): boolean {
  if (!uid) return false;
  if (wo.assigneeType === 'team') return true;
  if (wo.assigneeIds && wo.assigneeIds.includes(uid)) return true;
  if (wo.assigneeId === uid) return true;
  return false;
}


export interface WorkOrderPhoto {
  id: string;
  workOrderId: string;
  kind: 'before' | 'after';
  dataUrl: string; // compressed base64 JPEG < 150KB
  takenBy: string;
  takenByName: string;
  takenAt: string;
}

export interface WorkOrderComment {
  id: string;
  workOrderId: string;
  authorId: string;
  authorName: string;
  authorRole: UserRole;
  content: string;
  createdAt: string;
}

export interface WorkOrderHistory {
  id: string;
  workOrderId: string;
  actorId: string;
  actorName: string;
  action: string;
  details: string;
  timestamp: string;
}

export interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  qty: number;
  minQty: number;
  unitCost: number;
  location: string;
  active: boolean;
  createdAt: string;
}

export interface InventoryTransaction {
  id: string;
  itemId: string;
  itemName?: string;
  type: 'in' | 'out';
  qty: number;
  unitCost: number;
  workOrderId?: string;
  workOrderCode?: string;
  note?: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

export interface WorkOrderMaterial {
  id: string;
  workOrderId: string;
  itemId: string;
  itemName?: string;
  unit?: string;
  qty: number;
  unitCost: number;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

// === MODULE (A): BẢO DƯỠNG ĐỊNH KỲ ===
export type FrequencyType = 'ngay' | 'tuan' | 'thang' | 'quy' | 'nam';

export interface MaintenancePlan {
  id: string;
  title: string;
  equipmentId?: string;
  electricalAssetId?: string;
  locationId: string;
  frequencyType: FrequencyType;
  frequencyValue: number;
  nextDue: string; // YYYY-MM-DD
  assigneeId?: string;
  assigneeName?: string;
  checklist: string[];
  active: boolean;
  createdAt: string;
}

export interface MaintenanceLog {
  id: string;
  planId: string;
  planTitle?: string;
  workOrderId: string;
  workOrderCode?: string;
  equipmentId?: string;
  electricalAssetId?: string;
  doneAt: string; // ISO
  doneBy: string;
  doneByName?: string;
  checklistResult: ChecklistResultItem[];
  result: 'dat' | 'khong_dat' | 'can_theo_doi';
  createdAt: string;
}

// === MODULE (B): CHI PHÍ ===
export type CostCategory = 'vat_tu' | 'nhan_cong' | 'thue_ngoai' | 'dien_nuoc' | 'khac';

export interface CostEntry {
  id: string;
  date: string; // YYYY-MM-DD
  category: CostCategory;
  amount: number;
  equipmentId?: string;
  description: string;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
}

// === MODULE (C): HỆ THỐNG ĐIỆN ===
export type ElectricalAssetType = 'tu_dien' | 'aptomat' | 'cong_to' | 'den' | 'o_cam' | 'khac';
export type ElectricalAssetStatus = 'hoat_dong' | 'can_kiem_tra' | 'hong';

export interface ElectricalAsset {
  id: string;
  code: string;
  name: string;
  type: ElectricalAssetType;
  parentId?: string | null;
  locationId: string;
  rating?: string;
  phase?: string;
  status: ElectricalAssetStatus;
  lastCheckAt?: string;
  notes?: string;
  createdAt: string;
}

export interface MeterReading {
  id: string;
  assetId: string;
  assetCode?: string;
  assetName?: string;
  date: string; // YYYY-MM-DD
  value: number; // kWh
  recordedBy: string;
  recordedByName?: string;
  note?: string;
  photo?: string; // base64
  createdAt: string;
}

export interface ElectricalCheckItem {
  item: string;
  passed: boolean;
  note?: string;
}

export interface ElectricalCheck {
  id: string;
  assetId: string;
  assetCode?: string;
  assetName?: string;
  date: string; // YYYY-MM-DD
  checklist: ElectricalCheckItem[];
  result: 'dat' | 'khong_dat';
  nextCheckDue?: string;
  checkedBy: string;
  checkedByName?: string;
  notes?: string;
  workOrderId?: string;
  createdAt: string;
}

// === MODULE (D): CÀI ĐẶT DOANH NGHIỆP ===
export const DEFAULT_PUBLIC_BASE_URL = 'https://ais-pre-dykxi5q6uvygtz237axudv-748751659390.asia-northeast1.run.app';

export interface CompanySettings {
  companyName: string;
  logoUrl?: string | null; // base64
  address?: string;
  phone?: string;
  email?: string;
  taxCode?: string;
  publicBaseUrl?: string; // Địa chỉ chính thức của ứng dụng cho link chia sẻ
}
