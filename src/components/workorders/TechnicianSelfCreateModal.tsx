import React from 'react';
import { WorkOrder, LocationItem, EquipmentItem } from '../../types';
import { UniversalWorkOrderModal } from './UniversalWorkOrderModal';

export interface TechnicianSelfCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  locations: LocationItem[];
  equipmentList: EquipmentItem[];
  onSuccess: (workOrder: WorkOrder) => void;
  onError: (msg: string) => void;
}

export const TechnicianSelfCreateModal: React.FC<TechnicianSelfCreateModalProps> = ({
  isOpen,
  onClose,
  locations,
  equipmentList,
  onSuccess,
  onError,
}) => {
  return (
    <UniversalWorkOrderModal
      isOpen={isOpen}
      onClose={onClose}
      initialMode="quick"
      defaultSource="internal"
      defaultOrigin="KTV tự tạo"
      locations={locations}
      equipmentList={equipmentList}
      technicians={[]}
      onSuccess={(wo) => onSuccess(wo)}
      onError={onError}
    />
  );
};
