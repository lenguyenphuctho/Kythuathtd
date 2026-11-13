import React from 'react';
import {
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrder,
  EquipmentStatus,
  UserRole,
  getWorkOrderApproverInfo,
} from '../../types';
import { getPriorityMeta, getStatusMeta, getEquipmentStatusMeta, getRoleName, getRoleBadgeClass } from '../../utils/formatters';

export const PriorityBadge: React.FC<{ priority: WorkOrderPriority; showDot?: boolean }> = ({ priority, showDot = true }) => {
  const meta = getPriorityMeta(priority);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${meta.badgeClass}`}>
      {showDot && <span className={`w-1.5 h-1.5 rounded-full ${meta.dotColor}`} />}
      {meta.label}
    </span>
  );
};

export const StatusBadge: React.FC<{ status: WorkOrderStatus | string; workOrder?: WorkOrder }> = ({
  status,
  workOrder,
}) => {
  const meta = getStatusMeta(status);
  const label =
    status === 'Chờ duyệt' && workOrder
      ? getWorkOrderApproverInfo(workOrder).badgeText
      : meta.label;
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${meta.badgeClass}`}>
      {label}
    </span>
  );
};

export const EquipmentStatusBadge: React.FC<{ status: EquipmentStatus }> = ({ status }) => {
  const meta = getEquipmentStatusMeta(status);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${meta.badgeClass}`}>
      {meta.label}
    </span>
  );
};

export const RoleBadge: React.FC<{ role?: UserRole }> = ({ role }) => {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getRoleBadgeClass(role)}`}>
      {getRoleName(role)}
    </span>
  );
};

export const AcknowledgmentBadge: React.FC<{
  workOrder: {
    assigneeId?: string;
    acknowledged?: boolean;
    assignedAt?: string | null;
    acknowledgedAt?: string | null;
    status?: WorkOrderStatus;
  };
  compact?: boolean;
}> = ({ workOrder, compact = false }) => {
  // Only display badge if assigned to someone
  if (!workOrder.assigneeId) return null;

  // Legacy work orders (acknowledged is undefined) are treated as acknowledged without warning
  if (workOrder.acknowledged === undefined) {
    return null;
  }

  if (workOrder.acknowledged === false) {
    const isOverdue4Hours = Boolean(
      workOrder.assignedAt &&
      Date.now() - new Date(workOrder.assignedAt).getTime() > 4 * 60 * 60 * 1000
    );

    if (isOverdue4Hours) {
      return (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-50 text-rose-700 border border-rose-300 animate-pulse`}
          title={`Đã giao hơn 4 giờ nhưng kỹ thuật viên chưa bấm nhận việc!`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-rose-600" />
          {compact ? 'Chưa nhận >4h' : 'Chưa nhận việc (>4h)'}
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-300`}
        title="Kỹ thuật viên chưa bấm xác nhận nhận việc"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        <span>Chưa nhận</span>
      </span>
    );
  }

  if (workOrder.acknowledged === true) {
    let timeLabel = '';
    if (workOrder.acknowledgedAt) {
      try {
        const d = new Date(workOrder.acknowledgedAt);
        const timePart = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        const datePart = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        timeLabel = `${timePart} ${datePart}`;
      } catch {
        timeLabel = '';
      }
    }

    return (
      <span
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-300`}
        title={workOrder.acknowledgedAt ? `Đã nhận lúc: ${workOrder.acknowledgedAt}` : 'Đã nhận việc'}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        <span>{timeLabel ? `Đã nhận lúc ${timeLabel}` : 'Đã nhận việc'}</span>
      </span>
    );
  }

  return null;
};

