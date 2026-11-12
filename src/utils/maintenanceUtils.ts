import { MaintenancePlan, FrequencyType, WorkOrder, UserProfile } from '../types';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { triggerPushNotification } from '../services/pushNotificationService';

export function calculateNextDueDate(fromIsoDateString: string, type: FrequencyType, value: number): string {
  const d = new Date(fromIsoDateString);
  if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];

  const val = Math.max(1, value);

  switch (type) {
    case 'ngay':
      d.setDate(d.getDate() + val);
      break;
    case 'tuan':
      d.setDate(d.getDate() + val * 7);
      break;
    case 'thang':
      d.setMonth(d.getMonth() + val);
      break;
    case 'quy':
      d.setMonth(d.getMonth() + val * 3);
      break;
    case 'nam':
      d.setFullYear(d.getFullYear() + val);
      break;
  }

  return d.toISOString().split('T')[0];
}

export function getMaintenanceDueStatus(nextDueStr: string): {
  status: 'overdue' | 'due_soon' | 'upcoming';
  label: string;
  badgeClass: string;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(nextDueStr);
  due.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return {
      status: 'overdue',
      label: `Quá hạn ${Math.abs(diffDays)} ngày`,
      badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 font-bold',
    };
  } else if (diffDays <= 7) {
    return {
      status: 'due_soon',
      label: diffDays === 0 ? 'Đến hạn hôm nay' : `Đến hạn trong ${diffDays} ngày`,
      badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 font-bold',
    };
  } else {
    return {
      status: 'upcoming',
      label: `Còn ${diffDays} ngày`,
      badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    };
  }
}

export function getFrequencyLabel(type: FrequencyType, value: number): string {
  const valStr = value > 1 ? `${value} ` : '';
  switch (type) {
    case 'ngay':
      return `${valStr}ngày/lần`;
    case 'tuan':
      return `${valStr}tuần/lần`;
    case 'thang':
      return `${valStr}tháng/lần`;
    case 'quy':
      return `${valStr}quý/lần`;
    case 'nam':
      return `${valStr}năm/lần`;
  }
}

/**
 * Checks all active maintenance plans and auto-generates workOrders
 * if nextDue is within today + 3 days, without duplicating.
 */
export async function checkAndGenerateMaintenanceWorkOrders(
  plans: MaintenancePlan[],
  workOrders: WorkOrder[],
  currentUser: UserProfile
): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const threshold = new Date(today);
  threshold.setDate(threshold.getDate() + 3);
  const thresholdStr = threshold.toISOString().split('T')[0];

  let generatedCount = 0;

  for (const plan of plans) {
    if (!plan.active) continue;

    // Check if nextDue <= today + 3 days
    if (plan.nextDue <= thresholdStr) {
      // Check if workOrder already exists for this plan that is active OR scheduled for this nextDue
      const existing = workOrders.some((wo) => {
        if (wo.planId !== plan.id) return false;
        // If not completed or closed, don't generate another duplicate
        if (wo.status !== 'Hoàn thành' && wo.status !== 'Đã đóng') return true;
        // If already completed for this specific due date
        const woDueDate = wo.dueDate ? wo.dueDate.split('T')[0] : '';
        if (woDueDate === plan.nextDue) return true;
        return false;
      });

      if (!existing) {
        // Auto-generate work order
        const year = new Date().getFullYear();
        const rand = Math.floor(1000 + Math.random() * 9000);
        const code = `BD-${year}-${rand}`;
        const now = new Date().toISOString();

        const checklistItems = (plan.checklist || []).map((text) => ({
          text,
          done: false,
          note: '',
        }));

        const newOrder: Record<string, any> = {
          code,
          source: 'internal',
          orderType: 'maintenance',
          title: `[Bảo dưỡng định kỳ] ${plan.title}`,
          description: `Công việc bảo dưỡng tự động theo kế hoạch định kỳ: ${plan.title}. Chu kỳ: ${getFrequencyLabel(plan.frequencyType, plan.frequencyValue)}.`,
          priority: 'trung_binh',
          status: 'Mới',
          locationId: plan.locationId,
          requesterId: currentUser.uid,
          requesterName: 'Hệ thống (Bảo dưỡng định kỳ)',
          requesterEmail: currentUser.email,
          dueDate: `${plan.nextDue}T17:00:00.000Z`,
          createdAt: now,
          planId: plan.id,
          checklistResults: checklistItems,
        };

        if (plan.equipmentId) newOrder.equipmentId = plan.equipmentId;
        if (plan.electricalAssetId) newOrder.electricalAssetId = plan.electricalAssetId;
        if (plan.assigneeId) newOrder.assigneeId = plan.assigneeId;
        if (plan.assigneeName) newOrder.assigneeName = plan.assigneeName;

        try {
          const docRef = await addDoc(collection(db, 'workOrders'), newOrder);
          // History log
          await addDoc(collection(db, 'workOrderHistory'), {
            workOrderId: docRef.id,
            actorId: currentUser.uid,
            actorName: 'Hệ thống',
            action: 'Tự động tạo phiếu bảo dưỡng',
            details: `Tạo từ kế hoạch "${plan.title}" (Hạn: ${plan.nextDue})`,
            timestamp: now,
          });

          // Non-blocking push notification for maintenance job
          triggerPushNotification('new_request', docRef.id, {
            actorName: 'Hệ thống bảo dưỡng',
            workOrderCode: newOrder.code,
            workOrderTitle: newOrder.title,
            locationName: newOrder.locationName || '',
            priority: newOrder.priority || 'trung_binh',
            changes: `tự động tạo từ kế hoạch bảo dưỡng định kỳ "${plan.title}"`,
          });

          generatedCount++;
        } catch (e) {
          console.error('Error generating maintenance workOrder:', e);
        }
      }
    }
  }

  return generatedCount;
}
