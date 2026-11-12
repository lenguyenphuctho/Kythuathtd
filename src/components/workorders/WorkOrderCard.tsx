import React from 'react';
import {
  WorkOrder,
  LocationItem,
  EquipmentItem,
  UserProfile,
  getWorkOrderOrigin,
  getWorkOrderAssigneeDisplay,
} from '../../types';
import { PriorityBadge, StatusBadge, AcknowledgmentBadge } from '../common/Badge';
import { formatDateOnly, formatRelativeTime } from '../../utils/formatters';
import { MapPin, Cpu, Clock, User, AlertCircle, FileText, Wrench, Store, Users, Building } from 'lucide-react';

interface WorkOrderCardProps {
  workOrder: WorkOrder;
  location?: LocationItem;
  equipment?: EquipmentItem;
  technicians?: UserProfile[];
  onClick: () => void;
}

export const WorkOrderCard: React.FC<WorkOrderCardProps> = ({
  workOrder,
  location,
  equipment,
  technicians,
  onClick,
}) => {
  const isOverdue =
    workOrder.dueDate &&
    workOrder.status !== 'Hoàn thành' &&
    workOrder.status !== 'Đã đóng' &&
    new Date(workOrder.dueDate).getTime() < Date.now();

  const origin = getWorkOrderOrigin(workOrder);
  const assigneeDisplay = getWorkOrderAssigneeDisplay(workOrder, technicians);

  return (
    <div
      onClick={onClick}
      className={`relative bg-white rounded-2xl p-4 sm:p-5 border transition-all duration-200 hover:shadow-md active:scale-[0.99] cursor-pointer touch-manipulation ${
        isOverdue ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200 hover:border-blue-300'
      }`}
    >
      {/* Top Header: Code, Origin Badge, Priority & Status */}
      <div className="flex items-start justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
            {workOrder.code}
          </span>
          {origin === 'KTV tự tạo' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
              <Wrench className="w-3 h-3" />
              <span>KTV tự tạo</span>
            </span>
          ) : origin === 'Cửa hàng yêu cầu' ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 border border-purple-200">
              <Store className="w-3 h-3" />
              <span className="max-w-[120px] truncate">{workOrder.requestingStoreName || 'Cửa hàng yêu cầu'}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
              <span>Chưa phân loại</span>
            </span>
          )}
          <PriorityBadge priority={workOrder.priority} />
        </div>
        <StatusBadge status={workOrder.status} />
      </div>

      {/* Title */}
      <h3 className="font-semibold text-slate-900 text-base leading-snug line-clamp-2 mb-2 break-words">
        {workOrder.title}
      </h3>

      {/* Description Snippet */}
      {workOrder.description && (
        <p className="text-xs text-slate-500 line-clamp-2 mb-3 leading-relaxed break-words">
          {workOrder.description}
        </p>
      )}

      {/* Meta tags: Location & Equipment */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-600 mb-3 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-1.5 truncate max-w-[200px]" title={location?.name}>
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">{location?.name || (workOrder.locationId ? 'Vị trí cũ' : 'Vị trí chung')}</span>
        </div>

        {equipment ? (
          <div className="flex items-center gap-1.5 truncate max-w-[200px]" title={equipment.name}>
            <Cpu className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="truncate font-medium text-slate-700">
              {equipment.name} {equipment.status === 'retired' && '(Ngừng SD)'}
            </span>
          </div>
        ) : workOrder.equipmentId ? (
          <div className="flex items-center gap-1.5 truncate max-w-[200px] text-slate-400" title="Thiết bị cũ đã gỡ bỏ hoặc ngừng theo dõi">
            <Cpu className="w-3.5 h-3.5 text-slate-300 shrink-0" />
            <span className="truncate italic">Thiết bị cũ</span>
          </div>
        ) : null}
      </div>

      {/* Bottom Row: Assignee & Due Date */}
      <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 flex-wrap gap-2">
        <div className="flex items-center gap-2 text-slate-600 flex-wrap">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${
            workOrder.assigneeType === 'team'
              ? 'bg-indigo-100 text-indigo-700'
              : workOrder.assigneeType === 'multiple'
              ? 'bg-blue-100 text-blue-700'
              : 'bg-slate-100 text-slate-500'
          }`}>
            {workOrder.assigneeType === 'team' ? (
              <Building className="w-3.5 h-3.5" />
            ) : workOrder.assigneeType === 'multiple' ? (
              <Users className="w-3.5 h-3.5" />
            ) : assigneeDisplay && assigneeDisplay !== 'Chưa phân công' ? (
              assigneeDisplay.charAt(0).toUpperCase()
            ) : (
              <User className="w-3 h-3" />
            )}
          </div>
          <span className="font-medium text-slate-700 truncate max-w-[150px]" title={assigneeDisplay}>
            {assigneeDisplay}
          </span>
          <AcknowledgmentBadge workOrder={workOrder} compact />
        </div>

        <div className="flex items-center gap-2">
          {isOverdue ? (
            <span className="inline-flex items-center gap-1 text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
              <AlertCircle className="w-3 h-3" />
              Quá hạn ({formatDateOnly(workOrder.dueDate)})
            </span>
          ) : workOrder.dueDate ? (
            <span className="inline-flex items-center gap-1 text-slate-500">
              <Clock className="w-3 h-3" />
              Hạn: {formatDateOnly(workOrder.dueDate)}
            </span>
          ) : (
            <span className="text-slate-400 text-[11px]">{formatRelativeTime(workOrder.createdAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
};
