import React, { useState, useMemo } from 'react';
import {
  X,
  Zap,
  MapPin,
  Cpu,
  Calendar,
  DollarSign,
  Wrench,
  ShieldCheck,
  Gauge,
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  ImageIcon,
} from 'lucide-react';
import {
  ElectricalAsset,
  LocationItem,
  WorkOrder,
  ElectricalCheck,
  MeterReading,
  WorkOrderMaterial,
} from '../../types';
import { formatCurrency, formatDate, formatDateOnly } from '../../utils/formatters';
import { StatusBadge, PriorityBadge } from '../common/Badge';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { doc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';

interface ElectricalDetailModalProps {
  asset: ElectricalAsset | null;
  locations: LocationItem[];
  allAssets: ElectricalAsset[];
  workOrders: WorkOrder[];
  workOrderMaterials: WorkOrderMaterial[];
  electricalChecks: ElectricalCheck[];
  meterReadings: MeterReading[];
  onClose: () => void;
  onEdit: (asset: ElectricalAsset) => void;
  onSelectWorkOrder: (wo: WorkOrder) => void;
  onOpenCheckModal: (assetId: string) => void;
  onOpenMeterModal: (assetId: string) => void;
  onOpenCreateWorkOrder: (assetId: string) => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const ElectricalDetailModal: React.FC<ElectricalDetailModalProps> = ({
  asset,
  locations,
  allAssets,
  workOrders,
  workOrderMaterials,
  electricalChecks,
  meterReadings,
  onClose,
  onEdit,
  onSelectWorkOrder,
  onOpenCheckModal,
  onOpenMeterModal,
  onOpenCreateWorkOrder,
  onSuccess,
  onError,
}) => {
  if (!asset) return null;

  const { isAdmin, isTechnician } = useAuth();
  const [activeTab, setActiveTab] = useState<'workorders' | 'checks' | 'meters' | 'children'>('workorders');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);

  const location = locations.find((l) => l.id === asset.locationId);
  const parentAsset = allAssets.find((a) => a.id === asset.parentId);
  const childAssets = allAssets.filter((a) => a.parentId === asset.id);

  // Materials cost mapping
  const materialsByOrder = useMemo(() => {
    const map = new Map<string, number>();
    workOrderMaterials.forEach((m) => {
      const cur = map.get(m.workOrderId) || 0;
      map.set(m.workOrderId, cur + m.qty * m.unitCost);
    });
    return map;
  }, [workOrderMaterials]);

  // Work orders for this electrical asset
  const relatedWorkOrders = useMemo(() => {
    return workOrders.filter((wo) => wo.electricalAssetId === asset.id);
  }, [workOrders, asset.id]);

  // Total accumulated cost for this electrical asset
  const totalCost = useMemo(() => {
    return relatedWorkOrders.reduce((acc, wo) => {
      const mat = materialsByOrder.get(wo.id) || 0;
      const labor = wo.laborCost || 0;
      const ext = wo.externalCost || 0;
      return acc + mat + labor + ext;
    }, 0);
  }, [relatedWorkOrders, materialsByOrder]);

  // Checks for this asset
  const relatedChecks = useMemo(() => {
    return electricalChecks
      .filter((c) => c.assetId === asset.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [electricalChecks, asset.id]);

  // Meter readings for this asset
  const relatedReadings = useMemo(() => {
    return meterReadings
      .filter((r) => r.assetId === asset.id)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [meterReadings, asset.id]);

  const handleDelete = async () => {
    if (childAssets.length > 0) {
      onError(`Thiết bị "${asset.name}" đang có ${childAssets.length} thiết bị/mạch con phụ thuộc! Vui lòng xóa hoặc di chuyển các thiết bị con trước.`);
      setShowDeleteConfirm(false);
      return;
    }
    if (relatedWorkOrders.length > 0) {
      onError(`Thiết bị "${asset.name}" đang có ${relatedWorkOrders.length} phiếu công việc kỹ thuật liên kết! Không thể xóa để bảo toàn dữ liệu.`);
      setShowDeleteConfirm(false);
      return;
    }

    try {
      setIsDeleting(true);
      await deleteDoc(doc(db, 'electricalAssets', asset.id));
      onSuccess(`Đã xóa thiết bị điện "${asset.name}"`);
      setShowDeleteConfirm(false);
      onClose();
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.DELETE, `electricalAssets/${asset.id}`);
      onError('Không thể xóa thiết bị điện');
    } finally {
      setIsDeleting(false);
    }
  };

  const getTypeLabel = (t: string) => {
    switch (t) {
      case 'tu_dien':
        return 'Tủ điện';
      case 'aptomat':
        return 'Aptomat / Cầu dao';
      case 'cong_to':
        return 'Công tơ điện';
      case 'den':
        return 'Hệ thống đèn';
      case 'o_cam':
        return 'Ổ cắm nguồn';
      default:
        return 'Thiết bị khác';
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
        <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh]">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-amber-50/40">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500 text-white rounded-2xl shadow-xs">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-black text-amber-800 bg-amber-100 px-2 py-0.5 rounded-md border border-amber-200">
                    {asset.code}
                  </span>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    {getTypeLabel(asset.type)}
                  </span>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      asset.status === 'hoat_dong'
                        ? 'bg-emerald-100 text-emerald-800'
                        : asset.status === 'can_kiem_tra'
                        ? 'bg-amber-100 text-amber-800 animate-pulse'
                        : 'bg-rose-100 text-rose-800 animate-pulse'
                    }`}
                  >
                    {asset.status === 'hoat_dong'
                      ? 'Hoạt động tốt'
                      : asset.status === 'can_kiem_tra'
                      ? 'Cần kiểm tra'
                      : 'Hỏng / Sự cố'}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                  {asset.name}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {isAdmin && (
                <>
                  <button
                    onClick={() => onEdit(asset)}
                    className="p-2 text-slate-500 hover:text-blue-600 rounded-xl hover:bg-slate-100 transition-colors"
                    title="Chỉnh sửa thiết bị"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="p-2 text-slate-500 hover:text-rose-600 rounded-xl hover:bg-rose-50 transition-colors"
                    title="Xóa thiết bị"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
              <button
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Quick Actions Bar */}
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 overflow-x-auto text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenCreateWorkOrder(asset.id)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
              >
                <Wrench className="w-3.5 h-3.5" />
                <span>Tạo việc sửa chữa</span>
              </button>
              <button
                onClick={() => onOpenCheckModal(asset.id)}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Kiểm tra an toàn</span>
              </button>
              {(asset.type === 'cong_to' || asset.type === 'tu_dien') && (
                <button
                  onClick={() => onOpenMeterModal(asset.id)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-2xs transition-all active:scale-95"
                >
                  <Gauge className="w-3.5 h-3.5" />
                  <span>Ghi chỉ số</span>
                </button>
              )}
            </div>

            <div className="font-mono text-xs font-bold text-slate-700">
              Tổng chi phí tích lũy: <strong className="text-emerald-700">{formatCurrency(totalCost)}</strong>
            </div>
          </div>

          {/* Body Content */}
          <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
            {/* Specs Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-400 block mb-0.5">Vị trí</span>
                <span className="font-bold text-slate-800">{location?.name || 'Chưa gán'}</span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Tủ điện nguồn (Cấp trên)</span>
                <span className="font-bold text-slate-800">
                  {parentAsset ? `[${parentAsset.code}] ${parentAsset.name}` : '(Tủ tổng)'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Định mức / Số pha</span>
                <span className="font-mono font-bold text-slate-800">
                  {asset.rating || 'N/A'} • {asset.phase || '3 pha'}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block mb-0.5">Kiểm tra gần nhất</span>
                <span className="font-bold text-slate-800">
                  {asset.lastCheckAt ? formatDateOnly(asset.lastCheckAt) : 'Chưa kiểm tra'}
                </span>
              </div>
            </div>

            {asset.notes && (
              <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200 text-xs text-amber-950">
                <span className="font-bold block mb-0.5">Ghi chú kỹ thuật:</span>
                {asset.notes}
              </div>
            )}

            {/* Tab navigation */}
            <div className="flex border-b border-slate-200 text-xs font-bold">
              <button
                onClick={() => setActiveTab('workorders')}
                className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'workorders'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Wrench className="w-4 h-4" />
                <span>Công việc & Chi phí ({relatedWorkOrders.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('checks')}
                className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'checks'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Kiểm tra an toàn ({relatedChecks.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('meters')}
                className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'meters'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Gauge className="w-4 h-4" />
                <span>Chỉ số công tơ ({relatedReadings.length})</span>
              </button>

              <button
                onClick={() => setActiveTab('children')}
                className={`pb-2.5 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === 'children'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <Cpu className="w-4 h-4" />
                <span>Thiết bị trực thuộc ({childAssets.length})</span>
              </button>
            </div>

            {/* Tab 1: Work Orders & Costs */}
            {activeTab === 'workorders' && (
              <div className="space-y-3">
                {relatedWorkOrders.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                    Chưa có phiếu công việc bảo dưỡng hay sửa chữa nào gắn với thiết bị điện này.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                    {relatedWorkOrders.map((wo) => {
                      const mat = materialsByOrder.get(wo.id) || 0;
                      const labor = wo.laborCost || 0;
                      const ext = wo.externalCost || 0;
                      const totalWoCost = mat + labor + ext;

                      return (
                        <div
                          key={wo.id}
                          onClick={() => {
                            onClose();
                            onSelectWorkOrder(wo);
                          }}
                          className="p-3.5 hover:bg-blue-50/40 transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                {wo.code}
                              </span>
                              <StatusBadge status={wo.status} />
                              <PriorityBadge priority={wo.priority} />
                            </div>
                            <div className="font-bold text-slate-900">{wo.title}</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              KTV: {wo.assigneeName || 'Chưa phân công'} • Tạo: {formatDateOnly(wo.createdAt)}
                            </div>
                          </div>

                          <div className="text-right sm:shrink-0">
                            <span className="text-[11px] text-slate-400 block">Tổng chi phí phiếu:</span>
                            <span className="font-mono font-bold text-sm text-emerald-700">
                              {formatCurrency(totalWoCost)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Safety Checks */}
            {activeTab === 'checks' && (
              <div className="space-y-3">
                {relatedChecks.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                    Chưa có lịch sử kiểm tra an toàn điện nào cho thiết bị này.
                  </div>
                ) : (
                  relatedChecks.map((chk) => (
                    <div
                      key={chk.id}
                      className={`p-4 rounded-2xl border text-xs space-y-2.5 ${
                        chk.result === 'dat'
                          ? 'bg-white border-slate-200'
                          : 'bg-rose-50/50 border-rose-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded-full font-bold text-[11px] flex items-center gap-1 ${
                              chk.result === 'dat'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-600 text-white'
                            }`}
                          >
                            {chk.result === 'dat' ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>ĐẠT TIÊU CHUẨN AN TOÀN</span>
                              </>
                            ) : (
                              <>
                                <XCircle className="w-3.5 h-3.5" />
                                <span>KHÔNG ĐẠT - CẦN XỬ LÝ</span>
                              </>
                            )}
                          </span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 font-semibold">
                            Ngày kiểm tra: {formatDateOnly(chk.date)}
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500">
                          Người kiểm tra: <strong>{chk.checkedByName || 'Kỹ thuật viên'}</strong>
                        </span>
                      </div>

                      {/* Checklist breakdown */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[11px]">
                        {chk.checklist.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-1.5">
                            {item.passed ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className={item.passed ? 'text-slate-700' : 'text-rose-800 font-bold'}>
                                {item.item}
                              </span>
                              {item.note && (
                                <span className="block text-[10px] text-amber-700 italic">
                                  Ghi chú: {item.note}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>

                      {chk.notes && (
                        <div className="text-[11px] text-slate-600 italic">
                          Ý kiến chuyên môn: {chk.notes}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab 3: Meter Readings */}
            {activeTab === 'meters' && (
              <div className="space-y-3">
                {relatedReadings.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                    Chưa có nhật ký ghi chỉ số công tơ nào cho thiết bị này.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-4">Ngày ghi</th>
                          <th className="py-2.5 px-3 text-right">Chỉ số (kWh)</th>
                          <th className="py-2.5 px-3 text-right">Mức tiêu thụ</th>
                          <th className="py-2.5 px-3 text-center">Ảnh đồng hồ</th>
                          <th className="py-2.5 px-4">Người ghi</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {relatedReadings.map((r, idx) => {
                          const nextInList = relatedReadings[idx + 1];
                          const consumption = nextInList ? r.value - nextInList.value : null;

                          return (
                            <tr key={r.id} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-4 font-mono text-slate-600">
                                {formatDateOnly(r.date)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                                {r.value.toLocaleString('vi-VN')}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono font-bold">
                                {consumption !== null ? (
                                  <span className={consumption >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                                    {consumption >= 0 ? '+' : ''}{consumption.toLocaleString('vi-VN')} kWh
                                  </span>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center">
                                {r.photo ? (
                                  <button
                                    onClick={() => setEnlargedPhoto(r.photo!)}
                                    className="p-1 hover:bg-blue-50 text-blue-600 rounded-md transition-colors"
                                    title="Xem ảnh công tơ"
                                  >
                                    <ImageIcon className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )}
                              </td>
                              <td className="py-2.5 px-4 text-slate-600">
                                {r.recordedByName || 'Kỹ thuật viên'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Tab 4: Child Assets */}
            {activeTab === 'children' && (
              <div className="space-y-3">
                {childAssets.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
                    Chưa có thiết bị hay mạch nhánh nào trực thuộc tủ điện này.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {childAssets.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 bg-white rounded-2xl border border-slate-200 hover:border-amber-300 transition-all flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded text-[10px]">
                              {c.code}
                            </span>
                            <span className="text-[10px] text-slate-400">({getTypeLabel(c.type)})</span>
                          </div>
                          <span className="font-semibold text-slate-800">{c.name}</span>
                          <span className="block text-[10px] text-slate-500 font-mono">
                            Định mức: {c.rating || 'N/A'} • {c.phase}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            c.status === 'hoat_dong'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {c.status === 'hoat_dong' ? 'Tốt' : 'Kiểm tra'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Xóa thiết bị điện này?"
        message={`Bạn có chắc muốn xóa thiết bị điện "${asset.name}" (${asset.code}) khỏi sơ đồ cây hệ thống điện?`}
        confirmText="Xác nhận xóa"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Enlarged Photo Modal */}
      {enlargedPhoto && (
        <div
          className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4 backdrop-blur-xs"
          onClick={() => setEnlargedPhoto(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] overflow-hidden rounded-2xl bg-black">
            <img src={enlargedPhoto} alt="Ảnh công tơ phóng to" className="max-w-full max-h-[85vh] object-contain" />
            <button
              onClick={() => setEnlargedPhoto(null)}
              className="absolute top-3 right-3 p-2 bg-black/60 hover:bg-black text-white rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </>
  );
};
