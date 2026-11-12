import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const FIREBASE_PROJECT_ID: string = (firebaseConfig as any).projectId || '';
export const FIRESTORE_DATABASE_ID: string = (firebaseConfig as any).firestoreDatabaseId || '';

// Requirement 1: BỎ hoàn toàn phần tự rơi về '(default)'
if (!FIRESTORE_DATABASE_ID || FIRESTORE_DATABASE_ID.trim() === '' || FIRESTORE_DATABASE_ID === '(default)') {
  const errText = `[Lỗi cấu hình Firestore] firestoreDatabaseId không hợp lệ: "${FIRESTORE_DATABASE_ID}". Hệ thống không cho phép tự rơi về '(default)'. Vui lòng cấu hình đúng Database ID (ví dụ: "ai-studio-aedcfd46-36e6-4dd9-acca-0bc7e1b4637a").`;
  console.error(errText);
  throw new Error(errText);
}

// Khởi tạo Firestore với Database ID tường minh
export const db = initializeFirestore(
  app,
  {
    ignoreUndefinedProperties: true,
    experimentalForceLongPolling: true,
  },
  FIRESTORE_DATABASE_ID
);
export const auth = getAuth(app);

// Keep login session across app reopens
if (typeof window !== 'undefined') {
  setPersistence(auth, browserLocalPersistence).catch((err) => {
    console.warn('Firebase auth persistence warning:', err);
  });
}

export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

// Requirement 2 & 3: Global Database Error & Lock State
type ConnectionErrorListener = (err: string | null) => void;
const connectionErrorListeners: Set<ConnectionErrorListener> = new Set();
let currentConnectionError: string | null = null;
let isDbLockedState: boolean = false;

export function reportDatabaseError(err: unknown, context?: string) {
  const errMsg = err instanceof Error ? err.message : String(err);
  const code = (err as any)?.code;

  let userFriendly = errMsg;
  if (errMsg.includes('not found') || errMsg.includes('Database') || code === 'not-found') {
    userFriendly = `Cơ sở dữ liệu "${FIRESTORE_DATABASE_ID}" không tìm thấy hoặc chưa sẵn sàng trên project "${FIREBASE_PROJECT_ID}".`;
  } else if (code === 'permission-denied' || errMsg.includes('permission-denied') || errMsg.includes('Missing or insufficient permissions')) {
    userFriendly = `Quyền truy cập bị từ chối (permission-denied). Vui lòng cập nhật Firestore Security Rules cho database "${FIRESTORE_DATABASE_ID}".`;
  } else if (code === 'unavailable' || errMsg.includes('offline') || errMsg.includes('Could not reach Cloud Firestore')) {
    userFriendly = `Không thể kết nối với Cloud Firestore "${FIRESTORE_DATABASE_ID}" (Ngoại tuyến / Mất kết nối mạng).`;
  }

  const fullMsg = context ? `${userFriendly} [${context}]` : userFriendly;
  currentConnectionError = fullMsg;
  isDbLockedState = true;
  connectionErrorListeners.forEach((fn) => fn(fullMsg));
  console.error('[Firestore Error]', fullMsg, err);
}

export function clearDatabaseError() {
  currentConnectionError = null;
  isDbLockedState = false;
  connectionErrorListeners.forEach((fn) => fn(null));
}

export function subscribeDatabaseError(listener: ConnectionErrorListener) {
  connectionErrorListeners.add(listener);
  listener(currentConnectionError);
  return () => {
    connectionErrorListeners.delete(listener);
  };
}

export function isDatabaseLocked(): boolean {
  return isDbLockedState;
}

export function getDatabaseError(): string | null {
  return currentConnectionError;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errCode = (error as any)?.code;
  const errMsg = error instanceof Error ? error.message : String(error);

  // Requirement 2: Không ẩn lỗi offline/not found/permission-denied
  reportDatabaseError(error, `Đường dẫn: ${path || 'toàn cục'}, thao tác: ${operationType}`);

  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Requirement 3: Kiểm tra đọc được một tài liệu cấu hình từ máy chủ khi khởi động
export async function verifyServerConnection(): Promise<{ success: boolean; error?: string }> {
  try {
    // Đọc trực tiếp từ server để xác nhận kết nối thật
    try {
      await getDocFromServer(doc(db, 'systemSettings', 'companyProfile'));
    } catch (innerErr: any) {
      const errCode = innerErr?.code;
      const errMsg = innerErr?.message || String(innerErr);
      // Nếu server trả về kết quả hoặc lỗi document không tồn tại thì DB vẫn kết nối tốt
      if (
        errCode === 'unavailable' ||
        errCode === 'not-found' ||
        errMsg.includes('not found') ||
        errMsg.includes('Database') ||
        errMsg.includes('offline') ||
        errMsg.includes('Could not reach Cloud Firestore')
      ) {
        throw innerErr;
      }
    }
    clearDatabaseError();
    return { success: true };
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    reportDatabaseError(error, 'Kiểm tra đọc cấu hình máy chủ');
    return { success: false, error: errMsg };
  }
}

// Test connection on boot
export async function testConnection(): Promise<boolean> {
  const res = await verifyServerConnection();
  return res.success;
}

export function loginWithGoogleDirect() {
  googleProvider.setCustomParameters({ prompt: 'select_account' });
  return signInWithPopup(auth, googleProvider);
}

export function formatAuthError(err: unknown): { message: string; isPopupBlocked: boolean } {
  const code = (err as any)?.code || '';
  const rawMsg = err instanceof Error ? err.message : String(err);

  if (code === 'auth/popup-blocked') {
    return {
      message:
        'Cửa sổ đăng nhập đã bị trình duyệt chặn (Pop-up blocked). Trên iPhone: Vào Cài đặt > Safari > Tắt mục "Chặn cửa sổ bật lên" (Block Pop-ups), sau đó bấm thử lại.',
      isPopupBlocked: true,
    };
  }
  if (code === 'auth/popup-closed-by-user') {
    return {
      message: 'Bạn đã đóng cửa sổ đăng nhập Google trước khi hoàn tất. Vui lòng bấm đăng nhập lại.',
      isPopupBlocked: false,
    };
  }
  if (code === 'auth/cancelled-popup-request') {
    return {
      message: 'Yêu cầu đăng nhập trước đó đã bị hủy. Vui lòng thử lại.',
      isPopupBlocked: false,
    };
  }
  if (code === 'auth/network-request-failed' || rawMsg.includes('network')) {
    return {
      message: 'Lỗi mạng khi kết nối với máy chủ Google. Vui lòng kiểm tra lại kết nối Wi-Fi/4G của bạn.',
      isPopupBlocked: false,
    };
  }
  return {
    message: rawMsg || 'Đăng nhập Google thất bại. Vui lòng thử lại.',
    isPopupBlocked: false,
  };
}

export async function loginWithGoogle() {
  try {
    const result = await loginWithGoogleDirect();
    return result.user;
  } catch (err) {
    console.error('Google Sign-in failed:', err);
    throw err;
  }
}

export async function logoutUser() {
  await signOut(auth);
}
