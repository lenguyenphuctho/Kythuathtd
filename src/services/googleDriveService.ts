import { doc, getDoc, setDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { db, auth } from './firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  WorkOrder,
  CompanySettings,
  WorkOrderMaterial,
  ChecklistResultItem,
  WorkOrderPhoto,
} from '../types';
import { generateWorkOrderSlipPdfBlob } from '../utils/exportUtils';

// ============================================================================
// IN-MEMORY TOKEN STORAGE (STRICT REQUIREMENT 1)
// Token lives exclusively in browser JavaScript heap memory.
// NEVER saved to Firestore, localStorage, sessionStorage, or IndexedDB.
// NO refresh token is stored.
// ============================================================================
let inMemoryAccessToken: string | null = null;
let tokenExpiresAt = 0;

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_DRIVE_ROOT_FOLDER = 'KT-CSVC';

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: any) => void;
            error_callback?: (err: any) => void;
            prompt?: string;
          }) => {
            requestAccessToken: (overrides?: { prompt?: string }) => void;
          };
        };
      };
    };
  }
}

/**
 * Ensures Google Identity Services (GIS) client library is loaded in window
 */
function ensureGisLoaded(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existingScript = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve());
      existingScript.addEventListener('error', (e) => reject(e));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không thể tải Google Identity Services SDK'));
    document.head.appendChild(script);
  });
}

/**
 * Request short-lived OAuth access token with strictly https://www.googleapis.com/auth/drive.file
 * Held strictly in memory.
 */
export async function getGoogleDriveAccessToken(forcePrompt = false): Promise<string> {
  // If valid token in memory (with 30s buffer), reuse it
  if (!forcePrompt && inMemoryAccessToken && Date.now() < tokenExpiresAt - 30000) {
    return inMemoryAccessToken;
  }

  await ensureGisLoaded();

  const clientId = firebaseConfig.oAuthClientId;
  if (!clientId) {
    throw new Error('Chưa cấu hình Google OAuth Client ID cho ứng dụng.');
  }

  return new Promise<string>((resolve, reject) => {
    try {
      const tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GOOGLE_DRIVE_SCOPE,
        prompt: forcePrompt ? 'consent' : '',
        callback: (resp: any) => {
          if (resp.error) {
            if (resp.error === 'access_denied') {
              reject(new Error('Từ chối quyền truy cập Google Drive. Cần cấp quyền để lưu tài liệu.'));
            } else if (resp.error === 'popup_closed_by_user') {
              reject(new Error('Đã hủy cấp quyền Google Drive (cửa sổ xác thực bị đóng).'));
            } else {
              reject(new Error(`Lỗi cấp quyền Google: ${resp.error_description || resp.error}`));
            }
            return;
          }

          if (!resp.access_token) {
            reject(new Error('Không nhận được mã xác thực truy cập Google Drive.'));
            return;
          }

          inMemoryAccessToken = resp.access_token;
          const expiresInSec = Number(resp.expires_in) || 3590;
          tokenExpiresAt = Date.now() + expiresInSec * 1000;
          resolve(inMemoryAccessToken!);
        },
        error_callback: (err: any) => {
          if (err?.type === 'popup_closed') {
            reject(new Error('Đã hủy cấp quyền Google Drive.'));
          } else {
            reject(new Error(err?.message || 'Không thể mở cửa sổ ủy quyền Google.'));
          }
        },
      });

      tokenClient.requestAccessToken({ prompt: forcePrompt ? 'consent' : '' });
    } catch (err: any) {
      reject(new Error(err.message || 'Lỗi khởi tạo xác thực Google'));
    }
  });
}

/**
 * Drive API Fetch helper with auto 401 retry and friendly Vietnamese errors
 */
async function driveApiFetch(
  url: string,
  options: RequestInit = {},
  isRetry = false
): Promise<Response> {
  const token = await getGoogleDriveAccessToken();
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch {
    throw new Error('Lỗi kết nối mạng khi tải lên Drive. Vui lòng kiểm tra kết nối mạng và thử lại.');
  }

  // Token expired
  if (res.status === 401 && !isRetry) {
    inMemoryAccessToken = null;
    tokenExpiresAt = 0;
    return driveApiFetch(url, options, true);
  }

  if (!res.ok) {
    let errMessage = `Lỗi Drive API (${res.status})`;
    try {
      const errJson = await res.json();
      const code = errJson?.error?.code || res.status;
      const apiMessage = errJson?.error?.message || '';

      if (code === 403) {
        if (apiMessage.toLowerCase().includes('quota') || apiMessage.toLowerCase().includes('storage')) {
          errMessage = 'Dung lượng Google Drive của bạn đã đầy. Vui lòng giải phóng bộ nhớ Drive.';
        } else {
          errMessage = 'Tài khoản không đủ quyền ghi vào thư mục Google Drive này.';
        }
      } else if (code === 404) {
        errMessage = 'Không tìm thấy thư mục hoặc tệp trên Google Drive.';
      } else if (code === 413) {
        errMessage = 'Tệp tin quá lớn không thể tải lên Google Drive.';
      } else if (apiMessage) {
        errMessage = `Google Drive: ${apiMessage}`;
      }
    } catch {
      // Ignore json parse error
    }
    throw new Error(errMessage);
  }

  return res;
}

/**
 * Verify if folder ID exists and is not trashed in user's Drive
 */
export async function checkFolderExists(folderId: string): Promise<{ exists: boolean; webViewLink?: string }> {
  try {
    const res = await driveApiFetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,trashed,webViewLink`
    );
    const data = await res.json();
    if (data && !data.trashed) {
      return { exists: true, webViewLink: data.webViewLink };
    }
    return { exists: false };
  } catch {
    return { exists: false };
  }
}

/**
 * Search for an active folder by name and parent
 */
export async function findFolder(
  folderName: string,
  parentId?: string
): Promise<{ id: string; webViewLink: string } | null> {
  let q = `mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`;
  if (parentId) {
    q += ` and '${parentId}' in parents`;
  }

  const res = await driveApiFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink)`
  );
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return {
      id: data.files[0].id,
      webViewLink: data.files[0].webViewLink,
    };
  }
  return null;
}

/**
 * Create a new folder in Google Drive
 */
export async function createFolder(
  folderName: string,
  parentId?: string
): Promise<{ id: string; webViewLink: string }> {
  const metadata: Record<string, any> = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };
  if (parentId) {
    metadata.parents = [parentId];
  }

  const res = await driveApiFetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(metadata),
  });

  const data = await res.json();
  return {
    id: data.id,
    webViewLink: data.webViewLink,
  };
}

/**
 * Ensures or creates a subfolder under a parent folder
 */
export async function getOrCreateSubFolder(
  folderName: string,
  parentId: string
): Promise<{ id: string; webViewLink: string }> {
  const found = await findFolder(folderName, parentId);
  if (found) return found;
  return createFolder(folderName, parentId);
}

/**
 * Ensures Root Folder "KT-CSVC" exists.
 * Manages root folder ID in Firestore systemSettings/driveConfig.
 * If folder was deleted in Drive, recreates it and triggers onRecreated callback.
 */
export async function getOrCreateRootFolder(
  onRecreated?: (msg: string) => void
): Promise<{ id: string; webViewLink: string }> {
  let existingId: string | null = null;

  try {
    const configSnap = await getDoc(doc(db, 'systemSettings', 'driveConfig'));
    if (configSnap.exists()) {
      existingId = configSnap.data().rootFolderId;
    }
  } catch (err) {
    console.warn('Could not read systemSettings/driveConfig:', err);
  }

  if (existingId) {
    const check = await checkFolderExists(existingId);
    if (check.exists && check.webViewLink) {
      return { id: existingId, webViewLink: check.webViewLink };
    }
    // Folder was deleted on Drive
    if (onRecreated) {
      onRecreated('Thư mục gốc KT-CSVC trước đó trên Drive đã bị xóa. Hệ thống đang tự động tạo lại thư mục mới.');
    }
  }

  // Check if an existing "KT-CSVC" folder exists in Drive root
  const found = await findFolder(GOOGLE_DRIVE_ROOT_FOLDER);
  let rootFolder = found;
  if (!rootFolder) {
    rootFolder = await createFolder(GOOGLE_DRIVE_ROOT_FOLDER);
  }

  // Save new ID to Firestore
  try {
    await setDoc(
      doc(db, 'systemSettings', 'driveConfig'),
      {
        rootFolderId: rootFolder.id,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.currentUser?.email || 'admin',
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Could not save rootFolderId to Firestore:', err);
  }

  return rootFolder;
}

/**
 * Uploads a file (or updates existing file with same name to avoid duplicates)
 */
export async function uploadOrUpdateFile(
  folderId: string,
  fileName: string,
  mimeType: string,
  blob: Blob
): Promise<{ id: string; webViewLink: string }> {
  // 1. Check if file already exists in folder
  const searchQ = `'${folderId}' in parents and name = '${fileName}' and trashed = false`;
  const searchRes = await driveApiFetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQ)}&fields=files(id,name,webViewLink)`
  );
  const searchData = await searchRes.json();
  const existingFile = searchData.files && searchData.files.length > 0 ? searchData.files[0] : null;

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadata = existingFile ? { name: fileName } : { name: fileName, parents: [folderId] };

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata
  )}`;
  const mediaPartHeader = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

  const multipartBlob = new Blob(
    [metadataPart, mediaPartHeader, blob, closeDelimiter],
    { type: `multipart/related; boundary=${boundary}` }
  );

  let uploadUrl: string;
  let method: string;

  if (existingFile) {
    uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=multipart&fields=id,name,webViewLink`;
    method = 'PATCH';
  } else {
    uploadUrl = `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink`;
    method = 'POST';
  }

  const res = await driveApiFetch(uploadUrl, {
    method,
    headers: {
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartBlob,
  });

  const fileData = await res.json();
  return {
    id: fileData.id,
    webViewLink: fileData.webViewLink,
  };
}

/**
 * Convert dataUrl or URL to Blob
 */
async function dataUrlToBlob(dataUrl: string): Promise<{ blob: Blob; mimeType: string }> {
  if (dataUrl.startsWith('data:')) {
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return { blob: new Blob([u8arr], { type: mimeType }), mimeType };
  }

  // Fetch as blob if it's a regular http URL
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return { blob, mimeType: blob.type || 'image/jpeg' };
}

/**
 * Ensures folder hierarchy: KT-CSVC / Year / Month / Code
 */
export async function ensureWorkOrderFolder(
  code: string,
  dateStr?: string,
  onFolderRecreated?: (msg: string) => void
): Promise<{ folderId: string; folderUrl: string }> {
  const d = dateStr ? new Date(dateStr) : new Date();
  const yearStr = String(isNaN(d.getFullYear()) ? new Date().getFullYear() : d.getFullYear());
  const monthStr = String(isNaN(d.getMonth()) ? new Date().getMonth() + 1 : d.getMonth() + 1).padStart(2, '0');

  // 1. Root: KT-CSVC
  const root = await getOrCreateRootFolder(onFolderRecreated);

  // 2. Year: KT-CSVC/{year}
  const yearFolder = await getOrCreateSubFolder(yearStr, root.id);

  // 3. Month: KT-CSVC/{year}/{month}
  const monthFolder = await getOrCreateSubFolder(monthStr, yearFolder.id);

  // 4. Code: KT-CSVC/{year}/{month}/{code}
  const workOrderFolder = await getOrCreateSubFolder(code, monthFolder.id);

  return {
    folderId: workOrderFolder.id,
    folderUrl: workOrderFolder.webViewLink,
  };
}

/**
 * Ensures folder hierarchy: KT-CSVC / Báo cáo / Year / Month
 */
export async function ensureReportsFolder(
  dateStr?: string,
  onFolderRecreated?: (msg: string) => void
): Promise<{ folderId: string; folderUrl: string }> {
  const d = dateStr ? new Date(dateStr) : new Date();
  const yearStr = String(isNaN(d.getFullYear()) ? new Date().getFullYear() : d.getFullYear());
  const monthStr = String(isNaN(d.getMonth()) ? new Date().getMonth() + 1 : d.getMonth() + 1).padStart(2, '0');

  // 1. Root: KT-CSVC
  const root = await getOrCreateRootFolder(onFolderRecreated);

  // 2. Báo cáo: KT-CSVC/Báo cáo
  const reportsRoot = await getOrCreateSubFolder('Báo cáo', root.id);

  // 3. Year: KT-CSVC/Báo cáo/{year}
  const yearFolder = await getOrCreateSubFolder(yearStr, reportsRoot.id);

  // 4. Month: KT-CSVC/Báo cáo/{year}/{month}
  const monthFolder = await getOrCreateSubFolder(monthStr, yearFolder.id);

  return {
    folderId: monthFolder.id,
    folderUrl: monthFolder.webViewLink,
  };
}

export interface UploadWorkOrderToDriveOptions {
  workOrder: WorkOrder;
  companyProfile?: CompanySettings;
  locationName?: string;
  equipmentName?: string;
  materials?: WorkOrderMaterial[];
  checklist?: ChecklistResultItem[];
  technicianName?: string;
  onProgress?: (message: string, percent: number) => void;
  onFolderRecreated?: (message: string) => void;
}

/**
 * Complete workflow for saving Work Order to Google Drive:
 * 1. Generates PDF slip
 * 2. Fetches photos from Firestore (workOrderPhotos)
 * 3. Uploads PDF & photos into KT-CSVC / Year / Month / Code
 * 4. Updates Firestore workOrder doc with driveFolderUrl, driveSavedAt, driveSavedBy
 * 5. Replaces existing files to avoid duplicates
 */
export async function uploadWorkOrderToDrive(
  options: UploadWorkOrderToDriveOptions
): Promise<{ folderUrl: string; totalFiles: number }> {
  const {
    workOrder,
    companyProfile,
    locationName,
    equipmentName,
    materials = [],
    checklist = [],
    technicianName,
    onProgress,
    onFolderRecreated,
  } = options;

  onProgress?.('Đang kết nối Google Drive...', 5);
  await getGoogleDriveAccessToken();

  onProgress?.('Đang chuẩn bị cấu trúc thư mục lưu trữ...', 15);
  const { folderId, folderUrl } = await ensureWorkOrderFolder(
    workOrder.code,
    workOrder.createdAt,
    onFolderRecreated
  );

  onProgress?.('Đang tạo phiếu công việc định dạng PDF...', 25);
  const pdfBlob = await generateWorkOrderSlipPdfBlob({
    workOrder,
    companyProfile,
    locationName,
    equipmentName,
    materials,
    checklist,
    technicianName,
  });

  onProgress?.(`Đang tải phiếu ${workOrder.code}_phieu_cong_viec.pdf lên Drive...`, 40);
  await uploadOrUpdateFile(
    folderId,
    `${workOrder.code}_phieu_cong_viec.pdf`,
    'application/pdf',
    pdfBlob
  );

  // Query photos from Firestore
  onProgress?.('Đang kiểm tra ảnh chụp hiện trường...', 50);
  const photoQ = query(
    collection(db, 'workOrderPhotos'),
    where('workOrderId', '==', workOrder.id)
  );
  const photoSnap = await getDocs(photoQ);
  const photos = photoSnap.docs.map((d) => ({ id: d.id, ...d.data() } as WorkOrderPhoto));

  const beforePhotos = photos.filter((p) => p.kind === 'before');
  const afterPhotos = photos.filter((p) => p.kind === 'after');

  const totalPhotos = beforePhotos.length + afterPhotos.length;
  let uploadedPhotos = 0;

  // Upload before photos
  for (let i = 0; i < beforePhotos.length; i++) {
    const photo = beforePhotos[i];
    const fileName = `${workOrder.code}_truoc_${i + 1}.jpg`;
    onProgress?.(
      `Đang tải ảnh trước xử lý (${i + 1}/${beforePhotos.length}): ${fileName}...`,
      55 + Math.round((uploadedPhotos / Math.max(totalPhotos, 1)) * 35)
    );
    try {
      const { blob, mimeType } = await dataUrlToBlob(photo.dataUrl);
      await uploadOrUpdateFile(folderId, fileName, mimeType, blob);
    } catch (err) {
      console.warn(`Could not upload photo ${fileName}:`, err);
    }
    uploadedPhotos++;
  }

  // Upload after photos
  for (let i = 0; i < afterPhotos.length; i++) {
    const photo = afterPhotos[i];
    const fileName = `${workOrder.code}_sau_${i + 1}.jpg`;
    onProgress?.(
      `Đang tải ảnh sau hoàn thành (${i + 1}/${afterPhotos.length}): ${fileName}...`,
      55 + Math.round((uploadedPhotos / Math.max(totalPhotos, 1)) * 35)
    );
    try {
      const { blob, mimeType } = await dataUrlToBlob(photo.dataUrl);
      await uploadOrUpdateFile(folderId, fileName, mimeType, blob);
    } catch (err) {
      console.warn(`Could not upload photo ${fileName}:`, err);
    }
    uploadedPhotos++;
  }

  onProgress?.('Đang ghi nhận thông tin liên kết vào hệ thống...', 95);
  const savedAt = new Date().toISOString();
  const savedBy = auth.currentUser?.email || auth.currentUser?.displayName || 'Quản trị viên';

  // Save metadata to Firestore workOrder (Admin only)
  await updateDoc(doc(db, 'workOrders', workOrder.id), {
    driveFolderUrl: folderUrl,
    driveSavedAt: savedAt,
    driveSavedBy: savedBy,
  });

  onProgress?.('Hoàn tất lưu trữ vào Google Drive!', 100);

  return {
    folderUrl,
    totalFiles: 1 + totalPhotos,
  };
}

export interface UploadReportToDriveOptions {
  reportTitle: string;
  fileName: string;
  pdfBlob: Blob;
  onProgress?: (message: string, percent: number) => void;
  onFolderRecreated?: (message: string) => void;
}

/**
 * Saves a generated report PDF to Google Drive under KT-CSVC / Báo cáo / Year / Month
 */
export async function uploadReportToDrive(
  options: UploadReportToDriveOptions
): Promise<{ folderUrl: string; fileUrl: string }> {
  const { fileName, pdfBlob, onProgress, onFolderRecreated } = options;

  onProgress?.('Đang kết nối Google Drive...', 10);
  await getGoogleDriveAccessToken();

  onProgress?.('Đang chuẩn bị thư mục Báo cáo...', 30);
  const { folderId, folderUrl } = await ensureReportsFolder(undefined, onFolderRecreated);

  onProgress?.(`Đang tải tệp báo cáo ${fileName}.pdf lên Drive...`, 60);
  const uploaded = await uploadOrUpdateFile(folderId, `${fileName}.pdf`, 'application/pdf', pdfBlob);

  onProgress?.('Hoàn tất lưu báo cáo vào Google Drive!', 100);

  return {
    folderUrl,
    fileUrl: uploaded.webViewLink,
  };
}
