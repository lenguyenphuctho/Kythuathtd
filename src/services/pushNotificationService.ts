import { doc, setDoc, deleteDoc, getDoc } from 'firebase/firestore';
import { db, auth, FIRESTORE_DATABASE_ID } from './firebase';

export const VAPID_PUBLIC_KEY = 'BIBFp_9-vJjW03Km299epOIHSMPrLqIUVm2tYBQJObkpbm76W_Y5jRm6I64xSilA4LqNS9UbULBBwiBmUccjlXk';

export interface PushStatus {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  isIOS: boolean;
  isStandalone: boolean;
  needsIOSInstall: boolean;
  endpoint?: string;
  hasBrowserSubWithoutFirestore?: boolean;
  firestoreVerified?: boolean;
  firestoreError?: string;
  docId?: string;
}

/**
 * Convert a base64 string to a Uint8Array for Web Push applicationServerKey
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isIOS(): boolean {
  if (typeof window === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches || 
    Boolean((navigator as any).standalone);
}

export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Generate a deterministic ID for a subscription endpoint
 */
export function getSubscriptionDocId(uid: string, endpoint: string): string {
  let hash = 0;
  for (let i = 0; i < endpoint.length; i++) {
    hash = ((hash << 5) - hash + endpoint.charCodeAt(i)) | 0;
  }
  const cleanHash = Math.abs(hash).toString(36);
  return `sub_${uid}_${cleanHash}`;
}

/**
 * Check the current Web Push subscription status of the device.
 * Trạng thái isSubscribed CHỈ ĐƯỢC TRUE khi subscription đã lưu thành công trên Firestore.
 */
export async function getPushSubscriptionStatus(user?: { uid: string }): Promise<PushStatus> {
  const supported = isPushSupported();
  const ios = isIOS();
  const standalone = isStandalone();
  const needsIOSInstall = ios && !standalone;

  if (!supported) {
    return {
      isSupported: false,
      permission: typeof Notification !== 'undefined' ? Notification.permission : 'default',
      isSubscribed: false,
      isIOS: ios,
      isStandalone: standalone,
      needsIOSInstall,
    };
  }

  const permission = Notification.permission;
  let isSubscribed = false;
  let endpoint: string | undefined;
  let hasBrowserSubWithoutFirestore = false;
  let firestoreVerified = false;
  let firestoreError: string | undefined;
  let docId: string | undefined;

  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      endpoint = sub.endpoint;
      const uid = user?.uid || auth.currentUser?.uid;

      if (uid) {
        docId = getSubscriptionDocId(uid, endpoint);
        try {
          const docSnap = await getDoc(doc(db, 'pushSubscriptions', docId));
          if (docSnap.exists()) {
            isSubscribed = true;
            firestoreVerified = true;
          } else {
            // Browser has subscription, but Firestore document is missing
            isSubscribed = false;
            hasBrowserSubWithoutFirestore = true;
          }
        } catch (fErr: any) {
          console.warn('[Push] Firestore check error:', fErr);
          firestoreError = fErr?.code === 'permission-denied'
            ? 'Bị từ chối quyền truy cập (permission-denied) trên Firestore.'
            : (fErr.message || 'Lỗi kiểm tra dữ liệu trên Firestore.');
          isSubscribed = false;
        }
      } else {
        // Not logged in yet
        isSubscribed = false;
      }
    }
  } catch (err: any) {
    console.warn('[Push] Error checking subscription:', err);
  }

  return {
    isSupported: true,
    permission,
    isSubscribed,
    isIOS: ios,
    isStandalone: standalone,
    needsIOSInstall,
    endpoint,
    hasBrowserSubWithoutFirestore,
    firestoreVerified,
    firestoreError,
    docId,
  };
}

/**
 * Subscribe the current device to Web Push and save to Firestore
 */
export async function subscribeDeviceToPush(user: { uid: string; email?: string | null; role?: string }): Promise<{ success: boolean; error?: string; docId?: string }> {
  try {
    if (!isPushSupported()) {
      if (isIOS() && !isStandalone()) {
        return {
          success: false,
          error: 'Trên iPhone/iPad, bạn cần cài đặt ứng dụng vào Màn hình chính (Bấm nút Chia sẻ ⎋ > Thêm vào MH chính) để nhận thông báo.',
        };
      }
      return { success: false, error: 'Trình duyệt hiện tại không hỗ trợ Web Push Notification.' };
    }

    const currentAuthUser = auth.currentUser;
    if (!currentAuthUser) {
      return {
        success: false,
        error: 'Chưa xác thực người dùng. Vui lòng đăng nhập lại trước khi bật thông báo.',
      };
    }

    const effectiveUid = currentAuthUser.uid;
    const effectiveEmail = (currentAuthUser.email || user.email || '').toLowerCase();

    // 1. Request notification permission
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return {
        success: false,
        error: 'Quyền thông báo chưa được cấp. Vui lòng cho phép quyền thông báo trong cài đặt trình duyệt của bạn.',
      };
    }

    // 2. Ensure Service Worker is ready
    const reg = await navigator.serviceWorker.ready;

    // 3. Subscribe or retrieve existing subscription
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as unknown as BufferSource,
      });
    }

    if (!subscription) {
      return { success: false, error: 'Không thể khởi tạo đăng ký Web Push trên thiết bị.' };
    }

    // 4. Save subscription metadata to Firestore pushSubscriptions collection
    const subJson = subscription.toJSON();
    const docId = getSubscriptionDocId(effectiveUid, subscription.endpoint);

    try {
      await setDoc(doc(db, 'pushSubscriptions', docId), {
        id: docId,
        uid: effectiveUid,
        email: effectiveEmail,
        role: user.role || 'technician',
        endpoint: subscription.endpoint,
        subscription: JSON.stringify(subJson),
        userAgent: navigator.userAgent,
        platform: navigator.platform || '',
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      }, { merge: true });
    } catch (writeErr: any) {
      console.error('[Push] Firestore setDoc failed:', writeErr);
      if (writeErr?.code === 'permission-denied' || String(writeErr).includes('permission-denied')) {
        return {
          success: false,
          error: `Bị từ chối quyền ghi (permission-denied) vào collection pushSubscriptions trên database "${FIRESTORE_DATABASE_ID}". Vui lòng kiểm tra quyền đăng nhập hoặc Security Rules.`,
        };
      }
      return {
        success: false,
        error: `Lỗi ghi Firestore: ${writeErr?.message || 'Không thể lưu đăng ký'}`,
      };
    }

    // 5. Verification read-back
    try {
      const verifySnap = await getDoc(doc(db, 'pushSubscriptions', docId));
      if (!verifySnap.exists()) {
        return {
          success: false,
          error: 'Bản ghi đăng ký không thể xác minh trên Firestore sau khi lưu. Vui lòng bấm Thử lại.',
        };
      }
    } catch (readErr: any) {
      console.warn('[Push] Verification read-back error:', readErr);
    }

    return { success: true, docId };
  } catch (err: any) {
    console.error('[Push] Subscribe error:', err);
    let errMsg = err.message || 'Lỗi khi kích hoạt thông báo đẩy.';
    if (err?.code === 'permission-denied') {
      errMsg = `Bị từ chối quyền (permission-denied) vào cơ sở dữ liệu Firestore pushSubscriptions.`;
    }
    return { success: false, error: errMsg };
  }
}

/**
 * Unsubscribe the current device from Web Push
 */
export async function unsubscribeDeviceFromPush(user: { uid: string }): Promise<{ success: boolean; error?: string }> {
  try {
    if (!isPushSupported()) return { success: true };

    const reg = await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.getSubscription();
    if (subscription) {
      const docId = getSubscriptionDocId(user.uid, subscription.endpoint);
      await subscription.unsubscribe();
      try {
        await deleteDoc(doc(db, 'pushSubscriptions', docId));
      } catch (e) {
        console.warn('[Push] Could not delete subscription doc:', e);
      }
    }
    return { success: true };
  } catch (err: any) {
    console.error('[Push] Unsubscribe error:', err);
    return { success: false, error: err.message || 'Lỗi khi hủy thông báo đẩy.' };
  }
}

/**
 * Send a test push notification to this user's registered devices
 */
export async function sendTestPushNotification(currentEndpoint?: string): Promise<{ success: boolean; message?: string }> {
  try {
    const user = auth.currentUser;
    if (!user) {
      return { success: false, message: 'Bạn cần đăng nhập để gửi thông báo thử.' };
    }

    let endpoint = currentEndpoint;
    if (!endpoint && isPushSupported()) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          endpoint = sub.endpoint;
        }
      } catch (e) {
        // ignore
      }
    }

    const token = await user.getIdToken();
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ endpoint }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { success: false, message: data.error || 'Gửi thông báo thử thất bại.' };
    }

    return { success: true, message: data.message || `Đã gửi thông báo thử đến ${data.sentCount || 1} thiết bị.` };
  } catch (err: any) {
    return { success: false, message: err.message || 'Lỗi kết nối khi gửi thông báo thử.' };
  }
}

export type PushEventType =
  | 'new_request'
  | 'assigned'
  | 'status_changed'
  | 'comment'
  | 'pending_approval'
  | 'rework_requested'
  | 'approved'
  | 'photo_added'
  | 'material_added'
  | 'order_updated';

/**
 * Dispatch a push event after a Firestore mutation succeeds.
 * Non-blocking: failures will never interfere with the primary user flow.
 */
export function triggerPushNotification(
  event: PushEventType,
  workOrderId: string,
  extra?: {
    actorName?: string;
    comment?: string;
    reason?: string;
    newStatus?: string;
    changes?: string;
    materialName?: string;
    [key: string]: any;
  }
): void {
  // Run asynchronously without awaiting in callers
  (async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;
      const token = await user.getIdToken();

      const mergedExtra = {
        actorName: user.displayName || user.email?.split('@')[0] || 'Thành viên',
        ...extra,
      };

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const res = await fetch('/api/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          event,
          workOrderId,
          extra: mergedExtra,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.warn(`[Push] Event "${event}" dispatch warning (status ${res.status}):`, errorText);
      }
    } catch (err) {
      // Non-fatal, log as warning
      console.warn(`[Push] Non-blocking push event "${event}" failed:`, err);
    }
  })();
}
