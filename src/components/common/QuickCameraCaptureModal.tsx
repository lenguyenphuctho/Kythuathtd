import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, CheckCircle2, AlertCircle, X, Image as ImageIcon, Eye, Loader2 } from 'lucide-react';
import { WorkOrder, WorkOrderPhoto, isWorkOrderCompleted } from '../../types';
import { compressImage } from '../../utils/imageCompressor';
import { collection, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { getFriendlyErrorMessage } from '../../utils/networkUtils';
import { triggerPushNotification } from '../../services/pushNotificationService';

interface QuickCameraCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  workOrders: WorkOrder[];
  defaultWorkOrderId?: string;
  defaultKind?: 'before' | 'after';
  onPhotoSaved: (workOrderId: string, kind: 'before' | 'after') => void;
  onError: (msg: string) => void;
}

export const QuickCameraCaptureModal: React.FC<QuickCameraCaptureModalProps> = ({
  isOpen,
  onClose,
  workOrders,
  defaultWorkOrderId,
  defaultKind = 'before',
  onPhotoSaved,
  onError,
}) => {
  const { userProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedOrderId, setSelectedOrderId] = useState<string>(
    defaultWorkOrderId || workOrders[0]?.id || ''
  );
  const [kind, setKind] = useState<'before' | 'after'>(defaultKind);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [photoSizeKb, setPhotoSizeKb] = useState<number>(0);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isZooming, setIsZooming] = useState(false);

  useEffect(() => {
    if (defaultWorkOrderId) {
      setSelectedOrderId(defaultWorkOrderId);
    } else if (workOrders.length > 0 && !selectedOrderId) {
      setSelectedOrderId(workOrders[0].id);
    }
    setKind(defaultKind);
    setPhotoDataUrl(null);
    setSaveError(null);
  }, [isOpen, defaultWorkOrderId, defaultKind, workOrders]);

  if (!isOpen) return null;

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSaveError(null);
    try {
      setIsCompressing(true);
      const res = await compressImage(file);
      setPhotoDataUrl(res.dataUrl);
      setPhotoSizeKb(res.sizeInKb);
    } catch (err: unknown) {
      console.error(err);
      const errText = err instanceof Error ? err.message : 'Không thể nén ảnh từ camera. Vui lòng bấm chụp lại.';
      setSaveError(errText);
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSave = async () => {
    if (!photoDataUrl) {
      setSaveError('Vui lòng chụp ảnh hiện trường trước khi lưu');
      return;
    }
    if (!selectedOrderId) {
      setSaveError('Vui lòng chọn công việc để lưu ảnh');
      return;
    }
    if (!userProfile) return;

    try {
      setIsSaving(true);
      setSaveError(null);

      const newPhotoData: Omit<WorkOrderPhoto, 'id'> = {
        workOrderId: selectedOrderId,
        kind,
        dataUrl: photoDataUrl,
        takenBy: userProfile.uid,
        takenByName: userProfile.displayName || 'Kỹ thuật viên',
        takenAt: new Date().toISOString(),
      };

      await addDoc(collection(db, 'workOrderPhotos'), newPhotoData);

      // Record in history
      try {
        await addDoc(collection(db, 'workOrderHistory'), {
          workOrderId: selectedOrderId,
          actorId: userProfile.uid,
          actorName: userProfile.displayName,
          action: kind === 'before' ? 'Thêm ảnh trước xử lý' : 'Thêm ảnh sau nghiệm thu',
          details: `Chụp từ Camera sau PWA (Nén ${photoSizeKb}KB)`,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // ignore history write errors
      }

      onPhotoSaved(selectedOrderId, kind);
      triggerPushNotification('photo_added', selectedOrderId, {
        actorName: userProfile.displayName,
        changes: `đã chụp ảnh ${kind === 'before' ? 'hiện trạng' : 'nghiệm thu'} qua camera`,
      });
      onClose();
    } catch (err: unknown) {
      console.error(err);
      handleFirestoreError(err, OperationType.CREATE, 'workOrderPhotos');
      const friendlyMsg = getFriendlyErrorMessage(err, 'Lỗi kết nối khi lưu ảnh. Dữ liệu ảnh được giữ nguyên, vui lòng bấm [Thử lại ngay].');
      setSaveError(friendlyMsg);
      onError(friendlyMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const activeWorkOrders = workOrders.filter((w) => !isWorkOrderCompleted(w) && w.status !== 'Chờ duyệt');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Chụp ảnh hiện trường</h3>
              <p className="text-[11px] text-slate-500">Mở camera sau điện thoại & nén chuẩn &lt;150KB</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-600 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Hidden Camera Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleCapture}
          className="hidden"
        />

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Target Work Order Selection */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Gắn vào công việc *
            </label>
            <select
              value={selectedOrderId}
              onChange={(e) => setSelectedOrderId(e.target.value)}
              className="w-full min-h-[48px] px-3.5 py-2.5 rounded-2xl border border-slate-200 text-xs font-semibold bg-white focus:ring-2 focus:ring-blue-500"
            >
              {activeWorkOrders.map((w) => (
                <option key={w.id} value={w.id}>
                  [{w.code}] {w.title} ({w.status})
                </option>
              ))}
            </select>
          </div>

          {/* Photo Kind Toggle: Before vs After */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setKind('before')}
              className={`min-h-[44px] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 touch-manipulation ${
                kind === 'before'
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-white" />
              <span>Ảnh TRƯỚC xử lý</span>
            </button>
            <button
              type="button"
              onClick={() => setKind('after')}
              className={`min-h-[44px] rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 touch-manipulation ${
                kind === 'after'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-white" />
              <span>Ảnh SAU hoàn thành</span>
            </button>
          </div>

          {/* Camera Viewfinder / Preview */}
          {photoDataUrl ? (
            <div className="space-y-2">
              <div
                onClick={() => setIsZooming(true)}
                className="group relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 aspect-4/3 flex items-center justify-center cursor-pointer shadow-xs active:scale-98 transition-all touch-manipulation"
                title="Chạm để phóng to xem rõ ảnh"
              >
                <img
                  src={photoDataUrl}
                  alt="Hiện trường"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                />
                <div className="absolute inset-0 bg-black/25 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-xs font-bold bg-black/70 px-3 py-1.5 rounded-xl">Chạm để phóng to</span>
                </div>
                <div className="absolute top-2 right-2">
                  <span className="text-[10px] bg-black/70 text-white px-2 py-1 rounded-md">
                    Nén: {photoSizeKb} KB
                  </span>
                </div>
              </div>

              {/* Action Buttons underneath preview */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 min-h-[48px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 active:scale-95 touch-manipulation"
                >
                  <RefreshCw className="w-4 h-4 text-slate-500" />
                  <span>Chụp lại ảnh khác</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsZooming(true)}
                  className="min-h-[48px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 active:scale-95 touch-manipulation"
                >
                  <Eye className="w-4 h-4 text-slate-500" />
                  <span>Xem to</span>
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isCompressing}
              className="w-full min-h-[160px] py-6 border-2 border-dashed border-blue-300 hover:border-blue-500 rounded-2xl flex flex-col items-center justify-center gap-2 bg-blue-50/40 hover:bg-blue-50 text-blue-700 transition-all active:scale-98 touch-manipulation"
            >
              {isCompressing ? (
                <div className="flex items-center gap-2 text-xs font-bold text-blue-700">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Đang nén ảnh dưới 150KB...</span>
                </div>
              ) : (
                <>
                  <div className="w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
                    <Camera className="w-7 h-7" />
                  </div>
                  <span className="text-sm font-black">Bấm mở Camera sau</span>
                  <span className="text-[11px] text-slate-500">Chụp hiện trường thiết bị hoặc vật tư</span>
                </>
              )}
            </button>
          )}

          {/* Network Failure / Save Error Notice with Retry */}
          {saveError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-rose-800 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">
                <span className="font-bold block">Không thể lưu ảnh:</span>
                <span>{saveError}</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-100 flex gap-2.5 bg-slate-50/50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 min-h-[48px] px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold active:scale-95 touch-manipulation"
          >
            Đóng
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !photoDataUrl}
            className="flex-1 min-h-[48px] px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-xs font-black shadow-md shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-2 touch-manipulation"
          >
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang lưu lên máy chủ...</span>
              </>
            ) : saveError ? (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Thử lại ngay</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Lưu ảnh vào việc</span>
              </>
            )}
          </button>
        </div>

        {/* Fullscreen Lightbox Zoom Modal */}
        {isZooming && photoDataUrl && (
          <div
            className="fixed inset-0 z-60 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setIsZooming(false)}
          >
            <div className="relative max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
              <img
                src={photoDataUrl}
                alt="Enlarged"
                className="w-full max-h-[80vh] object-contain bg-black rounded-2xl border border-slate-700"
              />
              <button
                type="button"
                onClick={() => setIsZooming(false)}
                className="mt-3 w-full min-h-[48px] py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold active:scale-95 touch-manipulation"
              >
                Đóng xem ảnh
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
