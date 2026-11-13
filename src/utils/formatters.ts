import { WorkOrderPriority, WorkOrderStatus, EquipmentStatus, UserRole } from '../types';

/**
 * Format currency strictly as "55.000 ₫" or "0 ₫"
 * Unified across PDF, Excel and UI screens
 */
export function formatVND(amount?: number | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) return '0 ₫';
  const rounded = Math.round(amount);
  return `${rounded.toLocaleString('vi-VN')} ₫`;
}

/**
 * Format date strictly as dd/mm/yyyy
 * Example: 31/10/2026
 */
export function formatDate(dateInput?: string | Date | null): string {
  if (!dateInput) return '-';
  try {
    if (typeof dateInput === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateInput.trim())) {
      const [y, m, d] = dateInput.trim().split('-');
      return `${d.padStart(2, '0')}/${m.padStart(2, '0')}/${y}`;
    }
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Format date and time as HH:mm, dd/mm/yyyy
 * Example: 17:43, 06/11/2026
 */
export function formatDateTime(dateInput?: string | Date | null): string {
  if (!dateInput) return '-';
  try {
    const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(d.getTime())) return String(dateInput);
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${hours}:${minutes}, ${day}/${month}/${year}`;
  } catch {
    return String(dateInput);
  }
}

/**
 * Alias for formatDate to preserve backward compatibility
 */
export function formatDateOnly(dateString?: string): string {
  return formatDate(dateString);
}


/**
 * Remove Vietnamese diacritics for flexible fuzzy searching (e.g. "may bom" matches "máy bơm")
 */
export function normalizeVietnamese(str?: string): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

/**
 * Translates Firebase / network errors into user-friendly Vietnamese messages
 */
export function getFriendlyErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  if (
    lower.includes('offline') ||
    lower.includes('unavailable') ||
    lower.includes('failed to fetch') ||
    lower.includes('network') ||
    lower.includes('client is offline') ||
    lower.includes('timeout')
  ) {
    return 'Mất kết nối mạng hoặc đường truyền không ổn định. Dữ liệu của bạn vẫn được lưu giữ an toàn trên biểu mẫu, vui lòng kiểm tra kết nối mạng và bấm gửi lại.';
  }

  if (lower.includes('permission') || lower.includes('insufficient')) {
    return 'Bạn không có quyền thực hiện thao tác này. Vui lòng liên hệ Trưởng nhóm/Quản trị viên.';
  }

  if (lower.includes('not found') || lower.includes('không tồn tại')) {
    return 'Dữ liệu liên quan không tồn tại hoặc đã bị xóa bởi người dùng khác.';
  }

  return fallback;
}

export function formatRelativeTime(dateString?: string): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);

    if (diffSec < 60) return 'Vừa xong';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} ngày trước`;
    return formatDateOnly(dateString);
  } catch {
    return dateString;
  }
}

export function formatCurrency(amount?: number | null): string {
  return formatVND(amount);
}


export function getPriorityMeta(priority: WorkOrderPriority): {
  label: string;
  badgeClass: string;
  dotColor: string;
} {
  switch (priority) {
    case 'khan_cap':
      return {
        label: 'Khẩn cấp',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
        dotColor: 'bg-rose-500',
      };
    case 'cao':
      return {
        label: 'Cao',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
        dotColor: 'bg-amber-500',
      };
    case 'trung_binh':
      return {
        label: 'Trung bình',
        badgeClass: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
        dotColor: 'bg-blue-500',
      };
    case 'thap':
    default:
      return {
        label: 'Thấp',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
        dotColor: 'bg-slate-400',
      };
  }
}

export function getStatusMeta(status: WorkOrderStatus | string): {
  label: string;
  badgeClass: string;
  bgLight: string;
} {
  switch (status) {
    case 'Mới':
      return {
        label: 'Mới tạo',
        badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
        bgLight: 'bg-sky-50',
      };
    case 'Đã duyệt':
      return {
        label: 'Đã duyệt',
        badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
        bgLight: 'bg-indigo-50',
      };
    case 'Đang xử lý':
      return {
        label: 'Đang xử lý',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
        bgLight: 'bg-amber-50',
      };
    case 'Chờ vật tư':
      return {
        label: 'Chờ vật tư',
        badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
        bgLight: 'bg-purple-50',
      };
    case 'Chờ duyệt':
      return {
        label: 'Chờ duyệt',
        badgeClass: 'bg-orange-100 text-orange-800 border-orange-300',
        bgLight: 'bg-orange-50',
      };
    case 'Hoàn thành':
    case 'Đã đóng':
      return {
        label: 'Hoàn thành',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
        bgLight: 'bg-emerald-50',
      };
    default:
      return {
        label: status,
        badgeClass: 'bg-gray-100 text-gray-800 border-gray-300',
        bgLight: 'bg-gray-50',
      };
  }
}

export function getEquipmentStatusMeta(status: EquipmentStatus): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case 'active':
      return {
        label: 'Hoạt động tốt',
        badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200',
      };
    case 'maintenance':
      return {
        label: 'Đang bảo dưỡng',
        badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
      };
    case 'broken':
      return {
        label: 'Hỏng hóc',
        badgeClass: 'bg-rose-100 text-rose-800 border-rose-200',
      };
    case 'retired':
      return {
        label: 'Ngừng sử dụng',
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
      };
  }
}

export function getRoleName(role?: UserRole): string {
  switch (role) {
    case 'admin':
      return 'Quản trị viên (Trưởng nhóm)';
    case 'technician':
      return 'Kỹ thuật viên';
    case 'requester':
      return 'Người yêu cầu';
    case 'viewer':
      return 'Người xem';
    default:
      return 'Chưa xác định';
  }
}

export function getRoleBadgeClass(role?: UserRole): string {
  switch (role) {
    case 'admin':
      return 'bg-purple-100 text-purple-800 border-purple-200';
    case 'technician':
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'requester':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'viewer':
      return 'bg-slate-100 text-slate-800 border-slate-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}
