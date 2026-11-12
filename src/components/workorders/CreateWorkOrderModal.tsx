import React from 'react';
import {
  WorkOrder,
  WorkOrderSource,
  LocationItem,
  EquipmentItem,
  ElectricalAsset,
  WorkOrderType,
  UserProfile,
  AllowedUser,
} from '../../types';
import { UniversalWorkOrderModal } from './UniversalWorkOrderModal';

export interface CreateWorkOrderModalProps {
  isOpen: boolean;
  initialMode?: 'quick' | 'standard';
  defaultSource?: WorkOrderSource;
  locations: LocationItem[];
  equipmentList: EquipmentItem[];
  technicians?: UserProfile[];
  allowedUsers?: AllowedUser[];
  electricalAssets?: ElectricalAsset[];
  defaultElectricalAssetId?: string;
  defaultOrderType?: WorkOrderType;
  onClose: () => void;
  onSuccess: (wo: WorkOrder) => void;
  onError: (msg: string) => void;
}

export const CreateWorkOrderModal: React.FC<CreateWorkOrderModalProps> = ({
  isOpen,
  initialMode = 'standard',
  defaultSource = 'request',
  locations,
  equipmentList,
  technicians = [],
  allowedUsers = [],
  electricalAssets = [],
  defaultElectricalAssetId = '',
  defaultOrderType,
  onClose,
  onSuccess,
  onError,
}) => {
  return (
    <UniversalWorkOrderModal
      isOpen={isOpen}
      onClose={onClose}
      initialMode={initialMode}
      defaultSource={defaultSource}
      locations={locations}
      equipmentList={equipmentList}
      technicians={technicians}
      allowedUsers={allowedUsers}
      electricalAssets={electricalAssets}
      defaultElectricalAssetId={defaultElectricalAssetId}
      defaultOrderType={defaultOrderType}
      onSuccess={(wo) => onSuccess(wo)}
      onError={onError}
    />
  );
};
