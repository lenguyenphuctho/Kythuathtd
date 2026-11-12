/**
 * Utilities for network handling, offline resilience, and friendly error messages
 */

export function isOnline(): boolean {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine;
  }
  return true;
}

export function getFriendlyErrorMessage(err: unknown, fallback = 'Có lỗi xảy ra khi kết nối máy chủ. Vui lòng thử lại.'): string {
  if (!err) return fallback;

  if (!isOnline()) {
    return 'Thiết bị hiện đang mất kết nối Internet. Dữ liệu đã nhập được lưu giữ an toàn, vui lòng kiểm tra mạng và thử lại.';
  }

  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();

  if (message.includes('offline') || message.includes('failed to fetch') || message.includes('network') || message.includes('timeout')) {
    return 'Mạng yếu hoặc mất kết nối. Dữ liệu của bạn không bị mất, vui lòng bấm [Thử lại ngay].';
  }

  if (message.includes('permission') || message.includes('insufficient permissions')) {
    return 'Bạn không có quyền thực hiện thao tác này. Vui lòng liên hệ Trưởng nhóm quản trị.';
  }

  if (message.includes('quota') || message.includes('resource-exhausted')) {
    return 'Hệ thống đang quá tải hoặc vượt giới hạn truy vấn. Vui lòng đợi giây lát rồi thử lại.';
  }

  return (err instanceof Error ? err.message : String(err)) || fallback;
}

export async function retryOperation<T>(
  fn: () => Promise<T>,
  retries = 2,
  delayMs = 800
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, delayMs * Math.pow(1.5, attempt)));
      }
    }
  }
  throw lastError;
}
