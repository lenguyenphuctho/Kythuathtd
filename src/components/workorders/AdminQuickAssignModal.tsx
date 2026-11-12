import React from 'react';
import { WorkOrder, LocationItem, EquipmentItem, UserProfile, AllowedUser } from '../../types';
import { UniversalWorkOrderModal } from './UniversalWorkOrderModal';

export interface AdminQuickAssignModalProps {
  isOpen: boolean;
  onClose: () => void;
  locations: LocationItem[];
  equipmentList: EquipmentItem[];
  technicians: UserProfile[];
  allowedUsers?: AllowedUser[];
  workOrders: WorkOrder[];
  targetWorkOrder?: WorkOrder | null;
  onSuccess: (workOrder: WorkOrder, assignedTech: UserProfile | null) => void;
  onError: (msg: string) => void;
}

export const AdminQuickAssignModal: React.FC<AdminQuickAssignModalProps> = ({
  isOpen,
  onClose,
  locations,
  equipmentList,
  technicians,
  allowedUsers = [],
  workOrders,
  targetWorkOrder,
  onSuccess,
  onError,
}) => {
  return (
    <UniversalWorkOrderModal
      isOpen={isOpen}
      onClose={onClose}
      initialMode="quick"
      locations={locations}
      equipmentList={equipmentList}
      technicians={technicians}
      allowedUsers={allowedUsers}
      workOrders={workOrders}
      targetWorkOrder={targetWorkOrder}
      onSuccess={onSuccess}
      onError={onError}
    />
  );
};
