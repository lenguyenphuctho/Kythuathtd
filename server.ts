import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import * as webpushModule from 'web-push';
import path from 'path';
import dotenv from 'dotenv';

const webpush: any = (webpushModule as any).default || webpushModule;

dotenv.config();

const app = express();
app.use(express.json());

// Configuration & Constants
export const PROJECT_ID = 'essential-celerity-vvr20';
export const FIRESTORE_DATABASE_ID = 'ai-studio-aedcfd46-36e6-4dd9-acca-0bc7e1b4637a';
export const ROOT_ADMIN_EMAIL = 'lenguyenphuctho@gmail.com';

export const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  'BIBFp_9-vJjW03Km299epOIHSMPrLqIUVm2tYBQJObkpbm76W_Y5jRm6I64xSilA4LqNS9UbULBBwiBmUccjlXk';

export const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY ||
  'IldCeKSUwCqKAjhqrPki0wpk5KJHCVFmBucVXfiCa4A';

export const VAPID_SUBJECT =
  process.env.VAPID_SUBJECT ||
  'mailto:lenguyenphuctho@gmail.com';

// Configure web-push
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents`;

// Helper: Parse Firestore REST API document into a plain JS object
function parseFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return val;
  if ('stringValue' in val) return val.stringValue;
  if ('integerValue' in val) return parseInt(val.integerValue, 10);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('mapValue' in val) {
    const res: Record<string, any> = {};
    const fields = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      res[k] = parseFirestoreValue(v);
    }
    return res;
  }
  if ('arrayValue' in val) {
    const vals = val.arrayValue?.values || [];
    return vals.map(parseFirestoreValue);
  }
  return null;
}

function parseFirestoreDoc(doc: any): any {
  if (!doc || !doc.fields) return null;
  const id = doc.name ? doc.name.split('/').pop() : '';
  const data: Record<string, any> = { id };
  for (const [k, v] of Object.entries(doc.fields)) {
    data[k] = parseFirestoreValue(v);
  }
  return data;
}

// Helper: Decode and validate Firebase ID token without requiring service account keys
interface DecodedToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
}

function decodeAndValidateIdToken(authHeader: string | undefined): DecodedToken | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authHeader.substring(7).trim();
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));

    // Check standard Firebase claims
    if (payload.aud !== PROJECT_ID) {
      console.warn('[Push Auth] Token audience mismatch:', payload.aud);
      return null;
    }
    const expectedIss = `https://securetoken.google.com/${PROJECT_ID}`;
    if (payload.iss !== expectedIss) {
      console.warn('[Push Auth] Token issuer mismatch:', payload.iss);
      return null;
    }
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      console.warn('[Push Auth] Token has expired');
      return null;
    }

    const uid = payload.sub || payload.user_id;
    if (!uid) return null;

    return {
      uid,
      email: payload.email,
      email_verified: payload.email_verified,
    };
  } catch (err) {
    console.warn('[Push Auth] Token parse error:', err);
    return null;
  }
}

// Helper: Fetch a single work order document via Firestore REST API
async function fetchWorkOrder(workOrderId: string, idToken: string) {
  const url = `${FIRESTORE_BASE}/workOrders/${encodeURIComponent(workOrderId)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    console.warn(`[Firestore REST] Fetch work order ${workOrderId} failed (${res.status}):`, errText);
    return null;
  }
  const json = await res.json();
  return parseFirestoreDoc(json);
}

// Helper: Fetch users to determine active technicians and admins
async function fetchActiveStaff(idToken: string) {
  const url = `${FIRESTORE_BASE}/users?pageSize=100`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${idToken}`,
    },
  });
  if (!res.ok) {
    const errText = await res.text();
    console.warn('[Firestore REST] Fetch users failed:', errText);
    return [];
  }
  const json = await res.json();
  const docs = json.documents || [];
  return docs
    .map(parseFirestoreDoc)
    .filter((u: any) => u && u.disabled !== true && (u.role === 'admin' || u.role === 'technician'));
}

const FIRESTORE_RUN_QUERY_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${FIRESTORE_DATABASE_ID}/documents:runQuery`;

interface QueryResult {
  docs: any[];
  error?: string;
  statusCode?: number;
}

// Helper: Format client platform string cleanly for reporting
function formatPlatform(platform?: string, userAgent?: string): string {
  const p = (platform || '').toLowerCase();
  const ua = (userAgent || '').toLowerCase();

  if (p.includes('android') || ua.includes('android')) return 'Android';
  if (p.includes('iphone') || ua.includes('iphone')) return 'iPhone (iOS)';
  if (p.includes('ipad') || ua.includes('ipad')) return 'iPad (iPadOS)';
  if (p.includes('win') || ua.includes('windows')) return 'Windows PC';
  if (p.includes('mac') || ua.includes('macintosh')) return 'macOS';
  if (p.includes('linux') || ua.includes('linux')) return 'Linux';

  if (platform && platform.trim()) return platform.trim();
  return 'Thiết bị Web';
}

// Helper: Execute Firestore REST structuredQuery (never swallow errors)
async function runStructuredQuery(structuredQuery: any, idToken: string): Promise<QueryResult> {
  try {
    const res = await fetch(FIRESTORE_RUN_QUERY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ structuredQuery }),
    });

    const text = await res.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      return {
        docs: [],
        error: `HTTP ${res.status}: ${text.slice(0, 150)}`,
        statusCode: res.status,
      };
    }

    if (!res.ok) {
      const errMsg = data?.error?.message || data?.error?.status || text.slice(0, 150);
      return {
        docs: [],
        error: `HTTP ${res.status}: ${errMsg}`,
        statusCode: res.status,
      };
    }

    if (Array.isArray(data)) {
      const docs: any[] = [];
      for (const item of data) {
        if (item.error) {
          return {
            docs,
            error: `Lỗi Firestore [${item.error.code || res.status}]: ${item.error.message || item.error.status}`,
            statusCode: item.error.code || res.status,
          };
        }
        if (item.document) {
          const parsed = parseFirestoreDoc(item.document);
          if (parsed) docs.push(parsed);
        }
      }
      return { docs };
    }

    if (data?.error) {
      return {
        docs: [],
        error: `HTTP ${res.status}: ${data.error.message || data.error.status}`,
        statusCode: res.status,
      };
    }

    return { docs: [] };
  } catch (err: any) {
    return {
      docs: [],
      error: `Lỗi kết nối Firestore: ${err.message || String(err)}`,
      statusCode: 500,
    };
  }
}

// Helper: Fetch push subscriptions using runStructuredQuery
async function fetchPushSubscriptions(idToken: string): Promise<{ docs: any[]; error?: string }> {
  const result = await runStructuredQuery({ from: [{ collectionId: 'pushSubscriptions' }] }, idToken);
  if (result.error && result.docs.length === 0) {
    // If runQuery failed, also attempt GET as fallback
    try {
      const url = `${FIRESTORE_BASE}/pushSubscriptions?pageSize=300`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const json = await res.json();
        const docs = (json.documents || []).map(parseFirestoreDoc).filter(Boolean);
        return { docs };
      }
    } catch {
      // Non-fatal fallback
    }
    return { docs: [], error: result.error };
  }
  return { docs: result.docs, error: result.error };
}

// Helper: Delete dead subscription (404/410) with exact status response
async function deleteDeadSubscription(subId: string, idToken: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  try {
    const url = `${FIRESTORE_BASE}/pushSubscriptions/${encodeURIComponent(subId)}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    if (res.ok || res.status === 200 || res.status === 204) {
      console.log(`[Push] Cleaned up dead subscription: ${subId}`);
      return { success: true, statusCode: res.status };
    }
    const errText = await res.text();
    console.warn(`[Push] Failed to delete dead subscription ${subId} (${res.status}):`, errText);
    return { success: false, statusCode: res.status, error: errText };
  } catch (e: any) {
    console.warn(`[Push] Error deleting dead subscription ${subId}:`, e);
    return { success: false, statusCode: 500, error: e?.message || String(e) };
  }
}

// In-memory tracking of expired subscriptions needing Admin cleanup
interface ExpiredSubscriptionItem {
  id: string;
  uid?: string;
  email: string;
  role: string;
  platform: string;
  endpoint?: string;
  statusCode: number;
  detectedAt: string;
  detectedByEvent?: string;
}

let pendingExpiredSubscriptions: ExpiredSubscriptionItem[] = [];

function markSubscriptionAsExpired(item: ExpiredSubscriptionItem) {
  if (!pendingExpiredSubscriptions.some((p) => p.id === item.id)) {
    pendingExpiredSubscriptions.push(item);
  }
}

function removePendingExpiredSubscriptions(ids: string[]) {
  const set = new Set(ids);
  pendingExpiredSubscriptions = pendingExpiredSubscriptions.filter((p) => !set.has(p.id));
}

// Helper: Fetch all active admin UIDs using ONLY 'users' and 'pushSubscriptions' (strictly no allowedUsers)
async function fetchAdminUids(idToken: string): Promise<Set<string>> {
  const adminUids = new Set<string>();

  // 1. Fetch from 'users' collection (allowed by isAuthorizedUser)
  try {
    const res = await fetch(`${FIRESTORE_BASE}/users?pageSize=100`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.ok) {
      const json = await res.json();
      const docs = json.documents || [];
      for (const d of docs) {
        const u = parseFirestoreDoc(d);
        if (!u) continue;
        const isAdm =
          u.role === 'admin' ||
          (u.email && u.email.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase());
        if (isAdm && u.disabled !== true) {
          adminUids.add(u.id);
        }
      }
    }
  } catch (err) {
    console.warn('[Push] Error fetching users for admin lookup:', err);
  }

  // 2. Also check 'pushSubscriptions' collection (allowed by isAuthorizedUser)
  try {
    const res = await fetch(`${FIRESTORE_BASE}/pushSubscriptions?pageSize=300`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (res.ok) {
      const json = await res.json();
      const docs = json.documents || [];
      for (const d of docs) {
        const s = parseFirestoreDoc(d);
        if (!s) continue;
        const isAdm =
          s.role === 'admin' ||
          (s.email && s.email.toLowerCase() === ROOT_ADMIN_EMAIL.toLowerCase());
        if (isAdm && s.uid) {
          adminUids.add(s.uid);
        }
      }
    }
  } catch (err) {
    console.warn('[Push] Error fetching pushSubscriptions for admin lookup:', err);
  }

  return adminUids;
}

// Helper: Deterministic subscription doc ID matching client logic
function getSubscriptionDocId(uid: string, endpoint: string): string {
  let hash = 0;
  for (let i = 0; i < endpoint.length; i++) {
    hash = ((hash << 5) - hash + endpoint.charCodeAt(i)) | 0;
  }
  const cleanHash = Math.abs(hash).toString(36);
  return `sub_${uid}_${cleanHash}`;
}

// Helper: Fetch a single push subscription document directly
async function fetchSingleSubscription(subId: string, idToken: string) {
  try {
    const url = `${FIRESTORE_BASE}/pushSubscriptions/${encodeURIComponent(subId)}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${idToken}`,
      },
    });
    if (!res.ok) {
      if (res.status === 404) return null;
      const errText = await res.text();
      console.warn(`[Firestore REST] Fetch subscription ${subId} failed (${res.status}):`, errText);
      return null;
    }
    const json = await res.json();
    return parseFirestoreDoc(json);
  } catch (e) {
    console.warn(`[Firestore REST] Error fetching subscription ${subId}:`, e);
    return null;
  }
}

// -------------------------------------------------------------
// API ROUTES
// -------------------------------------------------------------

// 1. Get VAPID Public Key
app.get('/api/push/public-key', (_req: Request, res: Response) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

// 2. Send Test Notification to caller's registered device(s)
app.post('/api/push/test', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const decoded = decodeAndValidateIdToken(authHeader);
  if (!decoded) {
    res.status(401).json({ error: 'Xác thực không hợp lệ. Vui lòng đăng nhập lại.' });
    return;
  }

  const idToken = authHeader!.substring(7).trim();
  const callerUid = decoded.uid;
  const { endpoint } = req.body || {};

  try {
    const candidateSubs: any[] = [];
    const seenIds = new Set<string>();

    // 1. Direct document lookup if endpoint provided (exact ID matching how client saves it)
    let expectedDocId = '';
    if (endpoint && typeof endpoint === 'string') {
      expectedDocId = getSubscriptionDocId(callerUid, endpoint);
      const directDoc = await fetchSingleSubscription(expectedDocId, idToken);
      if (directDoc && directDoc.subscription) {
        candidateSubs.push(directDoc);
        seenIds.add(directDoc.id);
      }
    }

    // 2. Collection scan for subscriptions belonging to this caller or matching endpoint
    const subResult = await fetchPushSubscriptions(idToken);
    for (const s of subResult.docs) {
      if (!s) continue;
      const matchesUid = s.uid === callerUid;
      const matchesEndpoint = endpoint && s.endpoint === endpoint;
      if ((matchesUid || matchesEndpoint) && !seenIds.has(s.id)) {
        candidateSubs.push(s);
        seenIds.add(s.id);
      }
    }

    if (candidateSubs.length === 0) {
      const errMsg = subResult.error
        ? `Lỗi tra cứu Firestore (${subResult.error}). Không thể đọc danh sách subscription.`
        : `Chưa tìm thấy đăng ký thông báo đẩy cho thiết bị này trên cơ sở dữ liệu Firestore (ID kiểm tra: ${expectedDocId || 'N/A'}). Vui lòng bấm "Đồng bộ / Thử lại" hoặc "Bật thông báo" để lưu thiết bị.`;
      res.status(404).json({
        error: errMsg,
        docId: expectedDocId,
        uid: callerUid,
      });
      return;
    }

    const payload = JSON.stringify({
      title: '🔔 Kiểm tra thông báo thành công!',
      body: 'Thiết bị của bạn đã được kết nối với Hệ thống Quản lý KT & CSVC. Bạn sẽ nhận được thông báo công việc ngay cả khi đóng app.',
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      url: '/',
      tag: `test-push-${Date.now()}`,
    });

    let sentCount = 0;
    let failedCount = 0;

    await Promise.all(
      candidateSubs.map(async (subDoc: any) => {
        try {
          const parsedSub = typeof subDoc.subscription === 'string'
            ? JSON.parse(subDoc.subscription)
            : subDoc.subscription;
          await webpush.sendNotification(parsedSub, payload);
          sentCount++;
        } catch (err: any) {
          failedCount++;
          console.warn('[Push Test] Send error:', err?.statusCode || err?.message);
          if (err?.statusCode === 404 || err?.statusCode === 410) {
            await deleteDeadSubscription(subDoc.id, idToken);
          }
        }
      })
    );

    res.json({
      success: true,
      message: `Đã gửi thông báo thử thành công tới ${sentCount} thiết bị.`,
      sentCount,
      failedCount,
    });
  } catch (err: any) {
    console.error('[Push Test] Internal error:', err);
    res.status(500).json({ error: err.message || 'Lỗi gửi thông báo thử' });
  }
});

// Push Dispatch Log Interface & in-memory history
interface PushDispatchLog {
  id: string;
  timestamp: string;
  timeFormatted: string;
  event: string;
  eventLabel: string;
  workOrderId: string;
  workOrderCode?: string;
  workOrderTitle?: string;
  locationName?: string;
  callerUid: string;
  callerEmail?: string;
  callerName?: string;
  totalSubscriptionsEvaluated: number;
  matchedRecipientsCount: number;
  sentCount: number;
  failedCount: number;
  deviceResults: Array<{
    id?: string;
    uid?: string;
    email: string;
    role: string;
    platform: string;
    endpointHash?: string;
    status: 'sent' | 'failed' | 'skipped';
    resultMessage?: string;
    reason?: string;
    error?: string;
    isExpired?: boolean;
    isCleaned?: boolean;
  }>;
  skippedList: Array<{
    email: string;
    role: string;
    platform?: string;
    reason: string;
  }>;
  targetList: Array<{
    email: string;
    role: string;
    platform?: string;
    uid: string;
    id: string;
    reason: string;
  }>;
  error?: string;
  queryError?: string;
  pendingExpiredCount?: number;
  pendingExpiredList?: ExpiredSubscriptionItem[];
}

let latestPushDispatch: PushDispatchLog | null = null;
let pushDispatchHistory: PushDispatchLog[] = [];

function getEventLabel(event: string): string {
  switch (event) {
    case 'new_request':
      return 'Yêu cầu sửa chữa mới';
    case 'assigned':
      return 'Phân công / Giao việc';
    case 'status_changed':
      return 'Đổi trạng thái công việc';
    case 'pending_approval':
      return 'Gửi duyệt nghiệm thu';
    case 'comment':
      return 'Bình luận / Trao đổi';
    case 'photo_added':
      return 'Thêm ảnh mới';
    case 'material_added':
      return 'Xuất vật tư mới';
    case 'order_updated':
      return 'Cập nhật thông tin việc';
    default:
      return event;
  }
}

// 3. Dispatch Push Notification for Work Order Events
app.post('/api/push', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const decoded = decodeAndValidateIdToken(authHeader);
  if (!decoded) {
    res.status(401).json({ error: 'Xác thực không hợp lệ. Vui lòng đăng nhập lại.' });
    return;
  }

  const idToken = authHeader!.substring(7).trim();
  const callerUid = decoded.uid;
  const callerEmail = (decoded.email || '').toLowerCase();
  const { event, workOrderId, extra } = req.body || {};

  if (!event || !workOrderId) {
    res.status(400).json({ error: 'Thiếu tham số bắt buộc: event và workOrderId.' });
    return;
  }

  const callerName = extra?.actorName || callerEmail.split('@')[0] || 'Thành viên';

  try {
    // 1. Fetch work order details via Firestore REST API (with robust fallback to extra)
    const fetchedWorkOrder = await fetchWorkOrder(workOrderId, idToken);
    const workOrder = fetchedWorkOrder || {
      id: workOrderId,
      code: extra?.workOrderCode || '',
      title: extra?.workOrderTitle || 'Công việc',
      locationName: extra?.locationName || 'Vị trí',
      priority: extra?.priority || 'trung_binh',
      status: extra?.status || (event === 'new_request' ? 'Mới' : ''),
      requesterId: callerUid,
      assigneeId: extra?.assigneeId,
      assigneeName: extra?.assigneeName,
      assigneeType: extra?.assigneeType,
      assigneeIds: extra?.assigneeIds,
    };

    // 2. Fetch pushSubscriptions using structured queries via caller's idToken (runQuery POST)
    const docsMap = new Map<string, any>();
    const queryErrors: string[] = [];

    // Query 1: Admin documents (role == 'admin') - Admin receives all events on all work orders
    const adminQuery = {
      from: [{ collectionId: 'pushSubscriptions' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'role' },
          op: 'EQUAL',
          value: { stringValue: 'admin' },
        },
      },
    };
    const adminRes = await runStructuredQuery(adminQuery, idToken);
    if (adminRes.error) queryErrors.push(`Admin: ${adminRes.error}`);
    for (const d of adminRes.docs) {
      if (d && d.id) docsMap.set(d.id, d);
    }

    // Query 2: Root Admin document (email == ROOT_ADMIN_EMAIL)
    const rootAdminQuery = {
      from: [{ collectionId: 'pushSubscriptions' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'email' },
          op: 'EQUAL',
          value: { stringValue: ROOT_ADMIN_EMAIL.toLowerCase() },
        },
      },
    };
    const rootAdminRes = await runStructuredQuery(rootAdminQuery, idToken);
    if (rootAdminRes.error) queryErrors.push(`Root Admin: ${rootAdminRes.error}`);
    for (const d of rootAdminRes.docs) {
      if (d && d.id) docsMap.set(d.id, d);
    }

    // Query 3: Technicians (role == 'technician') when event === 'new_request' or workOrder.assigneeType === 'team'
    if (event === 'new_request' || workOrder.assigneeType === 'team') {
      const techQuery = {
        from: [{ collectionId: 'pushSubscriptions' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'role' },
            op: 'EQUAL',
            value: { stringValue: 'technician' },
          },
        },
      };
      const techRes = await runStructuredQuery(techQuery, idToken);
      if (techRes.error) queryErrors.push(`Technician: ${techRes.error}`);
      for (const d of techRes.docs) {
        if (d && d.id) docsMap.set(d.id, d);
      }
    }

    // Query 4: Related UIDs (requesterId, createdBy, assigneeId, assigneeIds)
    const relatedUids = new Set<string>();
    if (workOrder.requesterId) relatedUids.add(workOrder.requesterId);
    if (workOrder.createdBy) relatedUids.add(workOrder.createdBy);
    if (workOrder.assigneeId) relatedUids.add(workOrder.assigneeId);
    if (Array.isArray(workOrder.assigneeIds)) {
      for (const u of workOrder.assigneeIds) {
        if (u) relatedUids.add(u);
      }
    }
    // Caller is excluded from recipients
    relatedUids.delete(callerUid);

    if (relatedUids.size > 0) {
      const uidsArray = Array.from(relatedUids);
      if (uidsArray.length === 1) {
        const uidQuery = {
          from: [{ collectionId: 'pushSubscriptions' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'uid' },
              op: 'EQUAL',
              value: { stringValue: uidsArray[0] },
            },
          },
        };
        const uidRes = await runStructuredQuery(uidQuery, idToken);
        if (uidRes.error) queryErrors.push(`Related UID: ${uidRes.error}`);
        for (const d of uidRes.docs) {
          if (d && d.id) docsMap.set(d.id, d);
        }
      } else {
        const uidsQuery = {
          from: [{ collectionId: 'pushSubscriptions' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'uid' },
              op: 'IN',
              value: {
                arrayValue: {
                  values: uidsArray.slice(0, 10).map((u) => ({ stringValue: u })),
                },
              },
            },
          },
        };
        const uidsRes = await runStructuredQuery(uidsQuery, idToken);
        if (uidsRes.error) queryErrors.push(`Related UIDs: ${uidsRes.error}`);
        for (const d of uidsRes.docs) {
          if (d && d.id) docsMap.set(d.id, d);
        }
      }
    }

    // Query 5: Full collection query (allows complete evaluation of all registered devices)
    const allQuery = { from: [{ collectionId: 'pushSubscriptions' }] };
    const allRes = await runStructuredQuery(allQuery, idToken);
    if (allRes.error) {
      queryErrors.push(`All subscriptions query: ${allRes.error}`);
    } else {
      for (const d of allRes.docs) {
        if (d && d.id) docsMap.set(d.id, d);
      }
    }

    const allSubscriptions = Array.from(docsMap.values());

    // 3. Evaluate target recipients strictly from pushSubscriptions
    const targetSubs: any[] = [];
    const skippedList: Array<{ email: string; role: string; platform?: string; reason: string }> = [];
    const targetList: Array<{ email: string; role: string; platform?: string; uid: string; id: string; reason: string }> = [];
    const deviceResults: PushDispatchLog['deviceResults'] = [];

    for (const subDoc of allSubscriptions) {
      if (!subDoc || !subDoc.subscription) continue;

      const subUid = subDoc.uid;
      const subEmail = (subDoc.email || subDoc.uid || '').toLowerCase();
      const subRole = subDoc.role || 'technician';
      const subPlatform = formatPlatform(subDoc.platform, subDoc.userAgent);

      // Rule: Loại người vừa thao tác (Caller is excluded)
      if (subUid === callerUid) {
        const reason = 'Người vừa trực tiếp thao tác (Caller)';
        skippedList.push({
          email: subEmail,
          role: subRole,
          platform: subPlatform,
          reason,
        });
        deviceResults.push({
          id: subDoc.id,
          uid: subUid,
          email: subEmail,
          role: subRole,
          platform: subPlatform,
          endpointHash: subDoc.id,
          status: 'skipped',
          resultMessage: 'Bỏ qua (Người vừa thao tác)',
          reason,
        });
        continue;
      }

      // Determine Admin vs Technician
      const isAdmin =
        subRole === 'admin' ||
        subEmail === ROOT_ADMIN_EMAIL.toLowerCase();
      const isTechnician = subRole === 'technician' && !isAdmin;

      let shouldSend = false;
      let reason = '';

      if (isAdmin) {
        // Admin nhận mọi sự kiện của mọi việc
        shouldSend = true;
        reason = 'Admin hệ thống (Nhận tất cả sự kiện)';
      } else if (isTechnician) {
        // Kỹ thuật viên nhận:
        // - Việc mới (new_request)
        // - Việc được giao (assigneeId == subUid, hoặc subUid nằm trong assigneeIds, hoặc assigneeType == 'team')
        if (event === 'new_request') {
          shouldSend = true;
          reason = 'Kỹ thuật viên (Yêu cầu mới phát sinh)';
        } else {
          const isAssigned =
            workOrder.assigneeType === 'team' ||
            workOrder.assigneeId === subUid ||
            (Array.isArray(workOrder.assigneeIds) && workOrder.assigneeIds.includes(subUid));

          if (isAssigned) {
            shouldSend = true;
            reason = `Kỹ thuật viên phụ trách việc (${workOrder.assigneeType === 'team' ? 'Cả đội' : 'Được giao việc'})`;
          } else {
            const skipReason = 'Kỹ thuật viên không được phân công việc này';
            skippedList.push({
              email: subEmail,
              role: subRole,
              platform: subPlatform,
              reason: skipReason,
            });
            deviceResults.push({
              id: subDoc.id,
              uid: subUid,
              email: subEmail,
              role: subRole,
              platform: subPlatform,
              endpointHash: subDoc.id,
              status: 'skipped',
              resultMessage: 'Bỏ qua (KTV không được giao việc)',
              reason: skipReason,
            });
          }
        }
      } else {
        // Requester hoặc vai trò khác: nhận thông báo sự kiện trên việc do chính họ gửi
        const isOwner =
          (workOrder.requesterId && workOrder.requesterId === subUid) ||
          (workOrder.createdBy && workOrder.createdBy === subUid);

        if (isOwner && event !== 'new_request') {
          shouldSend = true;
          reason = 'Người tạo / Người yêu cầu công việc';
        } else {
          const skipReason = event === 'new_request'
            ? 'Người yêu cầu không nhận việc mới của cơ sở khác'
            : 'Không liên quan đến công việc này';
          skippedList.push({
            email: subEmail,
            role: subRole,
            platform: subPlatform,
            reason: skipReason,
          });
          deviceResults.push({
            id: subDoc.id,
            uid: subUid,
            email: subEmail,
            role: subRole,
            platform: subPlatform,
            endpointHash: subDoc.id,
            status: 'skipped',
            resultMessage: `Bỏ qua (${skipReason})`,
            reason: skipReason,
          });
        }
      }

      if (shouldSend) {
        targetSubs.push(subDoc);
        targetList.push({
          email: subEmail,
          role: subRole,
          platform: subPlatform,
          uid: subUid,
          id: subDoc.id,
          reason,
        });
      }
    }

    // Prepare push payload
    const code = workOrder.code || extra?.workOrderCode || '';
    const woTitle = workOrder.title || extra?.workOrderTitle || 'Công việc';
    const location = workOrder.locationName || workOrder.requestingStoreName || extra?.locationName || 'Vị trí';

    const priorityRaw = String(workOrder.priority || extra?.priority || '').toLowerCase();
    const isUrgent =
      priorityRaw === 'cao' ||
      priorityRaw === 'khan_cap' ||
      priorityRaw.includes('cao') ||
      priorityRaw.includes('khan');

    const prefix = isUrgent ? '🚨 KHẨN - ' : '';

    let title = 'Hệ thống Quản lý KT & CSVC';
    let body = `${callerName} cập nhật việc ${code ? `${code}: ` : ''}${woTitle} tại ${location}`;

    switch (event) {
      case 'new_request':
        title = `${prefix}🔔 Việc mới: ${code ? `${code} - ` : ''}${woTitle}`;
        body = `${callerName} tạo việc mới: ${woTitle} tại ${location}`;
        break;

      case 'assigned':
        title = `${prefix}📋 Phân công: ${code ? `${code} - ` : ''}${woTitle}`;
        body = `${callerName} ${extra?.changes || `giao việc ${code} cho ${workOrder.assigneeName || 'kỹ thuật viên'}`} tại ${location}`;
        break;

      case 'status_changed':
        title = `${prefix}🔄 Đổi trạng thái: ${code ? `${code} - ` : ''}${extra?.newStatus || workOrder.status}`;
        body = `${callerName} chuyển ${code} sang "${extra?.newStatus || workOrder.status}" tại ${location}${extra?.changes ? ` (${extra.changes})` : ''}`;
        break;

      case 'pending_approval':
        title = `${prefix}⏳ Chờ duyệt: ${code ? `${code} - ` : ''}${woTitle}`;
        body = `${callerName} báo hoàn thành ${code}, gửi chờ duyệt nghiệm thu tại ${location}`;
        break;

      case 'comment':
        title = `${prefix}💬 Bình luận: ${code ? `${code} - ` : ''}${woTitle}`;
        body = `${callerName} bình luận tại ${code}: "${(extra?.comment || 'Có phản hồi mới').slice(0, 80)}" (${location})`;
        break;

      case 'photo_added':
        title = `${prefix}📷 Thêm ảnh: ${code ? `${code} - ` : ''}${woTitle}`;
        body = `${callerName} ${extra?.changes || 'đã thêm ảnh mới'} cho ${code} tại ${location}`;
        break;

      case 'material_added':
        title = `${prefix}📦 Thêm vật tư: ${code ? `${code} - ` : ''}${woTitle}`;
        body = `${callerName} ${extra?.changes || 'đã xuất vật tư mới'} cho ${code} tại ${location}`;
        break;

      case 'order_updated':
        title = `${prefix}✏️ Sửa việc: ${code ? `${code} - ` : ''}${woTitle}`;
        body = `${callerName} ${extra?.changes || 'sửa thông tin'} việc ${code} tại ${location}`;
        break;

      default:
        res.status(400).json({ error: `Sự kiện không hỗ trợ: ${event}` });
        return;
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      url: code ? `/?cv=${encodeURIComponent(code)}` : `/?orderId=${encodeURIComponent(workOrderId)}`,
      workOrderId,
      code,
      tag: `wo-${workOrderId}`,
    });

    // 4. Send to matched devices & track results
    let sentCount = 0;
    let failedCount = 0;

    if (targetSubs.length > 0) {
      await Promise.all(
        targetSubs.map(async (subDoc: any) => {
          const subEmail = subDoc.email || subDoc.uid;
          const subRole = subDoc.role || 'technician';
          const subPlatform = formatPlatform(subDoc.platform, subDoc.userAgent);
          const endpointHash = subDoc.id || 'N/A';
          const targetInfo = targetList.find((t) => t.id === subDoc.id);

          try {
            const parsedSub =
              typeof subDoc.subscription === 'string'
                ? JSON.parse(subDoc.subscription)
                : subDoc.subscription;

            await webpush.sendNotification(parsedSub, payload);
            sentCount++;
            deviceResults.push({
              id: subDoc.id,
              uid: subDoc.uid,
              email: subEmail,
              role: subRole,
              platform: subPlatform,
              endpointHash,
              status: 'sent',
              resultMessage: 'Thành công',
              reason: targetInfo?.reason || 'Người nhận phù hợp',
            });
          } catch (err: any) {
            failedCount++;
            const isDead = err?.statusCode === 404 || err?.statusCode === 410;
            const errMsg = err?.statusCode ? `HTTP ${err.statusCode}: ${err.message}` : (err?.message || 'Lỗi gửi webpush');
            let resultMessage = `Lỗi: ${errMsg}`;
            let isCleaned = false;

            if (isDead) {
              const delRes = await deleteDeadSubscription(subDoc.id, idToken);
              if (delRes.success) {
                isCleaned = true;
                resultMessage = 'đã dọn đăng ký hết hạn';
                removePendingExpiredSubscriptions([subDoc.id]);
              } else {
                // If caller could not delete (Rules restricted caller from deleting other's doc)
                // Mark for admin to clean via "Dọn đăng ký hết hạn"
                markSubscriptionAsExpired({
                  id: subDoc.id,
                  uid: subDoc.uid,
                  email: subEmail,
                  role: subRole,
                  platform: subPlatform,
                  endpoint: subDoc.endpoint,
                  statusCode: err.statusCode,
                  detectedAt: new Date().toISOString(),
                  detectedByEvent: event,
                });
                resultMessage = `Đăng ký hết hạn (HTTP ${err.statusCode}) - Cần dọn (chờ Admin)`;
              }
            }

            deviceResults.push({
              id: subDoc.id,
              uid: subDoc.uid,
              email: subEmail,
              role: subRole,
              platform: subPlatform,
              endpointHash,
              status: 'failed',
              resultMessage,
              error: errMsg,
              reason: targetInfo?.reason || 'Người nhận phù hợp',
              isExpired: isDead,
              isCleaned,
            });
          }
        })
      );
    }

    // 5. Construct & record dispatch log
    let finalError: string | undefined = undefined;
    if (allSubscriptions.length === 0) {
      if (queryErrors.length > 0) {
        finalError = `Lỗi đọc subscription: ${queryErrors.join(' | ')}`;
      } else {
        finalError = 'Không tìm thấy đăng ký nào trong cơ sở dữ liệu (chưa thiết bị nào bật thông báo)';
      }
    } else if (targetSubs.length === 0) {
      finalError = 'Không tìm thấy thiết bị người nhận phù hợp (hoặc chưa bật thông báo)';
    }

    const dispatchLog: PushDispatchLog = {
      id: `push_log_${Date.now()}`,
      timestamp: new Date().toISOString(),
      timeFormatted: new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }),
      event,
      eventLabel: getEventLabel(event),
      workOrderId,
      workOrderCode: code,
      workOrderTitle: woTitle,
      locationName: location,
      callerUid,
      callerEmail,
      callerName,
      totalSubscriptionsEvaluated: allSubscriptions.length,
      matchedRecipientsCount: targetSubs.length,
      sentCount,
      failedCount,
      deviceResults,
      skippedList,
      targetList,
      error: finalError,
      queryError: queryErrors.length > 0 ? queryErrors.join(' | ') : undefined,
      pendingExpiredCount: pendingExpiredSubscriptions.length,
      pendingExpiredList: [...pendingExpiredSubscriptions],
    };

    latestPushDispatch = dispatchLog;
    pushDispatchHistory = [dispatchLog, ...pushDispatchHistory.slice(0, 19)];

    // 6. Detailed server console logging (Requirement 3)
    console.log(`\n=================== [PUSH DISPATCH LOG] ===================`);
    console.log(`[Push] Thời gian: ${dispatchLog.timeFormatted}`);
    console.log(`[Push] Sự kiện: "${event}" (${dispatchLog.eventLabel}) | WorkOrder: ${workOrderId} [${code || 'N/A'}]`);
    console.log(`[Push] Người gọi (Caller): ${callerName} <${callerEmail}> (UID: ${callerUid})`);
    console.log(`[Push] Tổng số subscriptions trong DB: ${allSubscriptions.length}`);
    console.log(`[Push] Số người nhận tìm được: ${targetSubs.length}`);
    if (targetList.length > 0) {
      console.log(`[Push] Danh sách nhận:`);
      targetList.forEach((t, i) => {
        console.log(`   ${i + 1}. ${t.email} (${t.role}) -> ${t.reason}`);
      });
    }
    if (skippedList.length > 0) {
      console.log(`[Push] Danh sách bỏ qua (${skippedList.length}):`);
      skippedList.forEach((s, i) => {
        console.log(`   ${i + 1}. ${s.email} (${s.role}) -> ${s.reason}`);
      });
    }
    console.log(`[Push] Kết quả gửi: Thành công ${sentCount} / Thất bại ${failedCount}`);
    console.log(`===========================================================\n`);

    res.json({
      success: true,
      sentCount,
      failedCount,
      recipientCount: targetSubs.length,
      log: dispatchLog,
    });
  } catch (err: any) {
    console.error('[Push Dispatch] Internal error:', err);
    res.status(500).json({ error: err.message || 'Lỗi xử lý gửi thông báo đẩy' });
  }
});

// 4. Get Latest Push Dispatch Log (For Admin in Notification Settings Modal)
app.get('/api/push/last-dispatch', (_req: Request, res: Response) => {
  res.json({
    latest: latestPushDispatch ? {
      ...latestPushDispatch,
      pendingExpiredCount: pendingExpiredSubscriptions.length,
      pendingExpiredList: pendingExpiredSubscriptions,
    } : null,
    recent: pushDispatchHistory.slice(0, 10),
    pendingExpiredCount: pendingExpiredSubscriptions.length,
    pendingExpiredSubscriptions,
  });
});

// 5. Clean Expired Subscriptions (Admin only, runs with admin privileges)
app.post('/api/push/clean-expired', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const decoded = decodeAndValidateIdToken(authHeader);
  if (!decoded) {
    res.status(401).json({ error: 'Xác thực không hợp lệ. Vui lòng đăng nhập lại.' });
    return;
  }

  const idToken = authHeader!.substring(7).trim();
  const callerEmail = (decoded.email || '').toLowerCase();

  // Admin verification: root admin or allowlisted admin
  const isRootAdm = callerEmail === ROOT_ADMIN_EMAIL.toLowerCase();
  let isAdminCaller = isRootAdm;

  if (!isAdminCaller) {
    try {
      const uRes = await fetch(`${FIRESTORE_BASE}/users/${encodeURIComponent(decoded.uid)}`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (uRes.ok) {
        const uDoc = parseFirestoreDoc(await uRes.json());
        if (uDoc && uDoc.role === 'admin') isAdminCaller = true;
      }
    } catch {
      // Fallback
    }
  }

  if (!isAdminCaller) {
    res.status(403).json({ error: 'Chỉ Quản trị viên (Admin) mới có quyền dọn dẹp các đăng ký hết hạn của hệ thống.' });
    return;
  }

  const { subIds } = req.body || {};
  let targetIds: string[] = [];

  if (Array.isArray(subIds) && subIds.length > 0) {
    targetIds = subIds;
  } else {
    targetIds = pendingExpiredSubscriptions.map((p) => p.id);
  }

  if (targetIds.length === 0) {
    res.json({
      success: true,
      cleanedCount: 0,
      cleanedList: [],
      message: 'Không có đăng ký hết hạn nào cần dọn dẹp.',
    });
    return;
  }

  const cleanedList: string[] = [];
  const failedList: Array<{ id: string; error?: string }> = [];

  for (const subId of targetIds) {
    const delRes = await deleteDeadSubscription(subId, idToken);
    if (delRes.success) {
      cleanedList.push(subId);
    } else {
      failedList.push({ id: subId, error: delRes.error });
    }
  }

  removePendingExpiredSubscriptions(cleanedList);

  // Update latestPushDispatch deviceResults in memory if any matched
  if (latestPushDispatch && latestPushDispatch.deviceResults) {
    latestPushDispatch.deviceResults = latestPushDispatch.deviceResults.map((dev) => {
      if (dev.id && cleanedList.includes(dev.id)) {
        return {
          ...dev,
          isCleaned: true,
          resultMessage: 'đã dọn đăng ký hết hạn (Admin đã dọn)',
        };
      }
      return dev;
    });
    latestPushDispatch.pendingExpiredCount = pendingExpiredSubscriptions.length;
    latestPushDispatch.pendingExpiredList = pendingExpiredSubscriptions;
  }

  console.log(`[Push Clean] Admin ${callerEmail} dọn dẹp: Thành công ${cleanedList.length}, Thất bại ${failedList.length}`);

  res.json({
    success: true,
    cleanedCount: cleanedList.length,
    cleanedList,
    failedCount: failedList.length,
    failedList,
    remainingCount: pendingExpiredSubscriptions.length,
    message: `Đã dọn dẹp thành công ${cleanedList.length} đăng ký hết hạn khỏi hệ thống.`,
  });
});

// -------------------------------------------------------------
// VITE DEV SERVER / STATIC CLIENT SERVING
// -------------------------------------------------------------

async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const port = 3000;

  if (isProduction) {
    const distPath = path.resolve('dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // Mount Vite middleware in development
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`[Server] KT & CSVC server running at http://0.0.0.0:${port} (mode: ${isProduction ? 'prod' : 'dev'})`);
  });
}

startServer().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
