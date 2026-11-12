import React, { useRef, useState, useEffect } from 'react';
import {
  Camera,
  Image as ImageIcon,
  Upload,
  Trash2,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { WorkOrderPhoto } from '../../types';
import { compressImage } from '../../utils/imageCompressor';
import { collection, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { formatRelativeTime } from '../../utils/formatters';
import { triggerPushNotification } from '../../services/pushNotificationService';

interface PhotoSectionProps {
  workOrderId: string;
  photos: WorkOrderPhoto[];
  canUpload: boolean;
  onPhotoAdded?: (msg?: string) => void;
  onPhotoDeleted?: () => void;
  onError: (msg: string) => void;
}

interface BatchProgress {
  current: number;
  total: number;
  fileName: string;
}

const MAX_PHOTOS_PER_KIND = 10;

export const PhotoSection: React.FC<PhotoSectionProps> = ({
  workOrderId,
  photos,
  canUpload,
  onPhotoAdded,
  onPhotoDeleted,
  onError,
}) => {
  const { userProfile, isAdmin } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeKind, setActiveKind] = useState<'before' | 'after'>('before');
  const [previewPhoto, setPreviewPhoto] = useState<WorkOrderPhoto | null>(null);
  const [photoToDelete, setPhotoToDelete] = useState<WorkOrderPhoto | null>(null);
  const [batchProgress, setBatchProgress] = useState<BatchProgress | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(false);

  // Hidden file inputs
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isTouch =
        'ontouchstart' in window ||
        (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
        /iphone|ipad|ipod|android/i.test(navigator.userAgent);
      setIsMobile(isTouch);
    }
  }, []);

  const beforePhotos = photos.filter((p) => p.kind === 'before');
  const afterPhotos = photos.filter((p) => p.kind === 'after');

  /**
   * Kích hoạt chụp ảnh trực tiếp từ Camera
   */
  const triggerCamera = (kind: 'before' | 'after') => {
    if (isProcessing || !canUpload) return;
    setActiveKind(kind);
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
      cameraInputRef.current.click();
    }
  };

  /**
   * Kích hoạt chọn ảnh từ Thư viện (cho phép chọn nhiều ảnh)
   */
  const triggerLibrary = (kind: 'before' | 'after') => {
    if (isProcessing || !canUpload) return;
    setActiveKind(kind);
    if (libraryInputRef.current) {
      libraryInputRef.current.value = '';
      libraryInputRef.current.click();
    }
  };

  /**
   * Xử lý tệp được chọn (hỗ trợ 1 hoặc nhiều ảnh đồng thời)
   */
  const handleFilesSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = e.target.files;
    if (!rawFiles || rawFiles.length === 0) return;

    if (!userProfile) {
      onError('Bạn cần đăng nhập để tải ảnh lên');
      return;
    }

    const currentPhotos = activeKind === 'before' ? beforePhotos : afterPhotos;
    const kindLabel = activeKind === 'before' ? 'TRƯỚC' : 'SAU';
    const remainingSlots = MAX_PHOTOS_PER_KIND - currentPhotos.length;

    if (remainingSlots <= 0) {
      onError(
        `Khu vực ảnh ${kindLabel} đã đủ tối đa ${MAX_PHOTOS_PER_KIND} ảnh. Vui lòng xóa bớt ảnh cũ nếu muốn thêm ảnh mới.`
      );
      return;
    }

    const fileList = Array.from(rawFiles);
    let filesToProcess = fileList;

    if (fileList.length > remainingSlots) {
      onError(
        `Bạn đã chọn ${fileList.length} ảnh nhưng chỉ còn trống ${remainingSlots} vị trí (tối đa ${MAX_PHOTOS_PER_KIND} ảnh). Hệ thống sẽ chỉ xử lý ${remainingSlots} ảnh đầu tiên.`
      );
      filesToProcess = fileList.slice(0, remainingSlots);
    }

    setIsProcessing(true);
    setBatchProgress({
      current: 0,
      total: filesToProcess.length,
      fileName: filesToProcess[0]?.name || '',
    });

    let successCount = 0;
    const failedFiles: { name: string; reason: string }[] = [];

    // Xử lý tuần tự từng ảnh
    for (let i = 0; i < filesToProcess.length; i++) {
      const file = filesToProcess[i];
      setBatchProgress({
        current: i + 1,
        total: filesToProcess.length,
        fileName: file.name,
      });

      try {
        // Nén ảnh, xoay EXIF và đổi HEIC -> JPEG < 150KB
        const result = await compressImage(file);

        // Lưu document riêng biệt vào Firestore workOrderPhotos
        const newPhotoData: Omit<WorkOrderPhoto, 'id'> = {
          workOrderId,
          kind: activeKind,
          dataUrl: result.dataUrl,
          takenBy: userProfile.uid,
          takenByName: userProfile.displayName || 'Kỹ thuật viên',
          takenAt: new Date().toISOString(),
        };

        await addDoc(collection(db, 'workOrderPhotos'), newPhotoData);
        successCount++;
      } catch (err: unknown) {
        console.error(`Lỗi xử lý ảnh [${file.name}]:`, err);
        const reason = err instanceof Error ? err.message : 'Lỗi xử lý hoặc kết nối';
        failedFiles.push({ name: file.name, reason });
      }
    }

    // Ghi nhật ký lịch sử công việc nếu có ảnh thành công
    if (successCount > 0) {
      try {
        await addDoc(collection(db, 'workOrderHistory'), {
          workOrderId,
          actorId: userProfile.uid,
          actorName: userProfile.displayName,
          action: activeKind === 'before' ? 'Thêm ảnh trước' : 'Thêm ảnh sau',
          details: `Đã thêm ${successCount} ảnh ${activeKind === 'before' ? 'trước' : 'sau'} (nén <150KB)`,
          timestamp: new Date().toISOString(),
        });
      } catch {
        // ignore history write errors
      }

      onPhotoAdded?.(
        `Đã lưu thành công ${successCount} ảnh ${activeKind === 'before' ? 'trước' : 'sau'}.`
      );

      triggerPushNotification('photo_added', workOrderId, {
        actorName: userProfile.displayName,
        changes: `đã thêm ${successCount} ảnh ${activeKind === 'before' ? 'hiện trạng (trước)' : 'nghiệm thu (sau)'}`,
      });
    }

    // Báo cáo nếu có tệp bị lỗi nhưng không làm hỏng cả lô
    if (failedFiles.length > 0) {
      const failNames = failedFiles.map((f) => f.name).join(', ');
      onError(
        `Không thể tải lên ${failedFiles.length} ảnh (${failNames}). Các ảnh hợp lệ còn lại đã được lưu thành công.`
      );
    }

    setIsProcessing(false);
    setBatchProgress(null);
  };

  /**
   * Xóa một ảnh cụ thể
   */
  const handleDeletePhoto = async (photoId: string) => {
    if (!canUpload || isProcessing) return;
    try {
      await deleteDoc(doc(db, 'workOrderPhotos', photoId));
      if (previewPhoto?.id === photoId) {
        setPreviewPhoto(null);
      }
      try {
        if (userProfile) {
          await addDoc(collection(db, 'workOrderHistory'), {
            workOrderId,
            actorId: userProfile.uid,
            actorName: userProfile.displayName,
            action: 'Xóa ảnh hiện trường',
            details: `${userProfile.displayName} đã xóa một ảnh hiện trường`,
            timestamp: new Date().toISOString(),
          });
        }
      } catch {
        // ignore history write errors
      }
      onPhotoDeleted?.();
    } catch (err: unknown) {
      handleFirestoreError(err, OperationType.DELETE, `workOrderPhotos/${photoId}`);
      onError('Không thể xóa ảnh. Vui lòng thử lại.');
    }
  };

  const isBeforeFull = beforePhotos.length >= MAX_PHOTOS_PER_KIND;
  const isAfterFull = afterPhotos.length >= MAX_PHOTOS_PER_KIND;

  return (
    <div className="space-y-5">
      {/* ẨN 2 Input riêng biệt: 1 Camera (capture) + 1 Thư viện (multiple) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFilesSelected}
        className="hidden"
        disabled={isProcessing || !canUpload}
      />
      <input
        ref={libraryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFilesSelected}
        className="hidden"
        disabled={isProcessing || !canUpload}
      />

      {/* THANH TIẾN ĐỘ XỬ LÝ LÔ ẢNH (Chống bấm hai lần & hiển thị trực quan) */}
      {isProcessing && batchProgress && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl shadow-sm space-y-2 animate-in fade-in">
          <div className="flex items-center justify-between text-xs text-blue-900 font-bold">
            <div className="flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              <span>
                Đang xử lý {batchProgress.current}/{batchProgress.total} ảnh:
              </span>
              <span className="font-normal font-mono text-[11px] truncate max-w-[180px] sm:max-w-xs text-blue-800">
                {batchProgress.fileName}
              </span>
            </div>
            <span className="font-mono text-blue-700">
              {Math.round((batchProgress.current / batchProgress.total) * 100)}%
            </span>
          </div>

          <div className="w-full bg-blue-200/80 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%`,
              }}
            />
          </div>

          <div className="text-[10px] text-blue-600/90 font-medium">
            Tự động xoay EXIF, chuyển sang JPEG và nén dung lượng &lt;150KB...
          </div>
        </div>
      )}

      {/* BANNER TIÊU CHÍ HOÀN THÀNH (Bắt buộc tối thiểu 1 ảnh trước và 1 ảnh sau) */}
      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs shadow-xs">
        <div className="font-semibold text-slate-800 mb-2 flex items-center justify-between">
          <span className="flex items-center gap-1.5 font-bold">
            <Info className="w-3.5 h-3.5 text-blue-600" />
            <span>Tiêu chí hoàn thành (Bắt buộc nghiệm thu):</span>
          </span>
          <span className="text-[11px] font-normal text-slate-500">
            Tối đa {MAX_PHOTOS_PER_KIND} ảnh / loại • Nén &lt;150KB
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div
            className={`flex items-center justify-between p-2.5 rounded-xl border ${
              beforePhotos.length > 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {beforePhotos.length > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span className="font-medium text-xs">
                Ảnh trước: {beforePhotos.length > 0 ? '(Đủ)' : '(Thiếu)'}
              </span>
            </div>
            <span className="font-bold text-xs font-mono">
              {beforePhotos.length}/{MAX_PHOTOS_PER_KIND}
            </span>
          </div>

          <div
            className={`flex items-center justify-between p-2.5 rounded-xl border ${
              afterPhotos.length > 0
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {afterPhotos.length > 0 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              )}
              <span className="font-medium text-xs">
                Ảnh sau: {afterPhotos.length > 0 ? '(Đủ)' : '(Thiếu)'}
              </span>
            </div>
            <span className="font-bold text-xs font-mono">
              {afterPhotos.length}/{MAX_PHOTOS_PER_KIND}
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* KHU VỰC 1: ẢNH TRƯỚC XỬ LÝ (Hiện trường tiếp nhận)        */}
      {/* ========================================================= */}
      <div className="p-4 rounded-3xl bg-amber-50/30 border border-amber-200/80 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-amber-100">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />
            <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-800">
              Ảnh trước xử lý
            </h4>
            <span
              className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-bold ${
                isBeforeFull
                  ? 'bg-amber-200 text-amber-900'
                  : beforePhotos.length > 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {beforePhotos.length}/{MAX_PHOTOS_PER_KIND}
            </span>
          </div>

          {/* Nút tác vụ cho ẢNH TRƯỚC */}
          {canUpload && (
            <div className="flex items-center gap-2">
              {isMobile ? (
                <>
                  <button
                    type="button"
                    onClick={() => triggerCamera('before')}
                    disabled={isProcessing || isBeforeFull}
                    className="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all touch-manipulation cursor-pointer"
                    title="Chụp ảnh trực tiếp từ camera"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Chụp ảnh</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerLibrary('before')}
                    disabled={isProcessing || isBeforeFull}
                    className="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 bg-white hover:bg-amber-50 active:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all touch-manipulation cursor-pointer"
                    title="Chọn nhiều ảnh từ thư viện"
                  >
                    <ImageIcon className="w-4 h-4 text-amber-700" />
                    <span>Chọn từ thư viện</span>
                  </button>
                </>
              ) : (
                /* Giao diện máy tính */
                <button
                  type="button"
                  onClick={() => triggerLibrary('before')}
                  disabled={isProcessing || isBeforeFull}
                  className="min-h-[40px] px-4 py-2 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
                  title="Tải ảnh lên (cho phép chọn nhiều ảnh)"
                >
                  <Upload className="w-4 h-4" />
                  <span>Tải ảnh lên (chọn nhiều)</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Lưới ảnh trước */}
        {beforePhotos.length === 0 ? (
          <div className="py-8 px-4 rounded-2xl border-2 border-dashed border-amber-200 text-center space-y-1">
            <Camera className="w-8 h-8 text-amber-400 mx-auto" />
            <div className="text-xs font-bold text-slate-700">Chưa có ảnh trước khi xử lý</div>
            <div className="text-[11px] text-slate-400">
              {canUpload
                ? 'Hãy chụp hoặc chọn ảnh hiện trường ban đầu (tối đa 10 ảnh)'
                : 'Công việc chưa có ảnh ghi nhận'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {beforePhotos.map((photo) => (
              <div
                key={photo.id}
                onClick={() => setPreviewPhoto(photo)}
                className="group relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-xs aspect-4/3 cursor-pointer active:scale-98 transition-all touch-manipulation"
              >
                <img
                  src={photo.dataUrl}
                  alt="Ảnh trước"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-2 text-white pointer-events-none">
                  <div className="text-[11px] font-bold truncate">{photo.takenByName}</div>
                  <div className="text-[10px] text-slate-300">{formatRelativeTime(photo.takenAt)}</div>
                </div>

                <div
                  className="absolute top-1.5 right-1.5 flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto(photo)}
                    className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-xl bg-black/60 hover:bg-black/80 text-white transition-colors"
                    title="Bấm để phóng to ảnh"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  {canUpload && (isAdmin || photo.takenBy === userProfile?.uid) && (
                    <button
                      type="button"
                      onClick={() => setPhotoToDelete(photo)}
                      disabled={isProcessing}
                      className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-xl bg-rose-600/90 hover:bg-rose-700 text-white transition-colors disabled:opacity-40"
                      title="Xóa ảnh này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================= */}
      {/* KHU VỰC 2: ẢNH SAU HOÀN THÀNH (Nghiệm thu kết quả)        */}
      {/* ========================================================= */}
      <div className="p-4 rounded-3xl bg-emerald-50/30 border border-emerald-200/80 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-emerald-100">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
            <h4 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-800">
              Ảnh sau hoàn thành
            </h4>
            <span
              className={`px-2 py-0.5 rounded-full font-mono text-[11px] font-bold ${
                isAfterFull
                  ? 'bg-emerald-200 text-emerald-900'
                  : afterPhotos.length > 0
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-700'
              }`}
            >
              {afterPhotos.length}/{MAX_PHOTOS_PER_KIND}
            </span>
          </div>

          {/* Nút tác vụ cho ẢNH SAU */}
          {canUpload && (
            <div className="flex items-center gap-2">
              {isMobile ? (
                <>
                  <button
                    type="button"
                    onClick={() => triggerCamera('after')}
                    disabled={isProcessing || isAfterFull}
                    className="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all touch-manipulation cursor-pointer"
                    title="Chụp ảnh trực tiếp từ camera"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Chụp ảnh</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => triggerLibrary('after')}
                    disabled={isProcessing || isAfterFull}
                    className="flex-1 sm:flex-initial min-h-[44px] px-3.5 py-2 bg-white hover:bg-emerald-50 active:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all touch-manipulation cursor-pointer"
                    title="Chọn nhiều ảnh từ thư viện"
                  >
                    <ImageIcon className="w-4 h-4 text-emerald-700" />
                    <span>Chọn từ thư viện</span>
                  </button>
                </>
              ) : (
                /* Giao diện máy tính */
                <button
                  type="button"
                  onClick={() => triggerLibrary('after')}
                  disabled={isProcessing || isAfterFull}
                  className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer"
                  title="Tải ảnh lên (cho phép chọn nhiều ảnh)"
                >
                  <Upload className="w-4 h-4" />
                  <span>Tải ảnh lên (chọn nhiều)</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Lưới ảnh sau */}
        {afterPhotos.length === 0 ? (
          <div className="py-8 px-4 rounded-2xl border-2 border-dashed border-emerald-200 text-center space-y-1">
            <Camera className="w-8 h-8 text-emerald-400 mx-auto" />
            <div className="text-xs font-bold text-slate-700">Chưa có ảnh nghiệm thu hoàn thành</div>
            <div className="text-[11px] text-slate-400">
              {canUpload
                ? 'Hãy chụp hoặc chọn ảnh sau khi xử lý xong (tối đa 10 ảnh)'
                : 'Công việc chưa có ảnh hoàn thành'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {afterPhotos.map((photo) => (
              <div
                key={photo.id}
                onClick={() => setPreviewPhoto(photo)}
                className="group relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-xs aspect-4/3 cursor-pointer active:scale-98 transition-all touch-manipulation"
              >
                <img
                  src={photo.dataUrl}
                  alt="Ảnh sau"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent flex flex-col justify-end p-2 text-white pointer-events-none">
                  <div className="text-[11px] font-bold truncate">{photo.takenByName}</div>
                  <div className="text-[10px] text-slate-300">{formatRelativeTime(photo.takenAt)}</div>
                </div>

                <div
                  className="absolute top-1.5 right-1.5 flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setPreviewPhoto(photo)}
                    className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-xl bg-black/60 hover:bg-black/80 text-white transition-colors"
                    title="Bấm để phóng to ảnh"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  {canUpload && (isAdmin || photo.takenBy === userProfile?.uid) && (
                    <button
                      type="button"
                      onClick={() => setPhotoToDelete(photo)}
                      disabled={isProcessing}
                      className="min-w-[34px] min-h-[34px] flex items-center justify-center rounded-xl bg-rose-600/90 hover:bg-rose-700 text-white transition-colors disabled:opacity-40"
                      title="Xóa ảnh này"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL PHÓNG TO ẢNH (Image Zoom Preview) */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="relative max-w-3xl w-full flex flex-col max-h-[92vh] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-700"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header modal */}
            <div className="p-3.5 bg-slate-800/90 border-b border-slate-700 flex items-center justify-between text-white text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    previewPhoto.kind === 'before' ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                />
                <span className="font-black tracking-wide">
                  {previewPhoto.kind === 'before' ? 'ẢNH TRƯỚC XỬ LÝ' : 'ẢNH SAU HOÀN THÀNH'}
                </span>
                <span className="text-slate-400 hidden sm:inline">
                  • {previewPhoto.takenByName} • {formatRelativeTime(previewPhoto.takenAt)}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {canUpload && (isAdmin || previewPhoto.takenBy === userProfile?.uid) && (
                  <button
                    type="button"
                    onClick={() => setPhotoToDelete(previewPhoto)}
                    disabled={isProcessing}
                    className="min-h-[36px] px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa ảnh</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewPhoto(null)}
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-300 hover:text-white rounded-xl hover:bg-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Ảnh lớn */}
            <div className="flex-1 bg-black flex items-center justify-center overflow-hidden p-1">
              <img
                src={previewPhoto.dataUrl}
                alt="Chi tiết ảnh"
                className="w-full h-auto max-h-[75vh] object-contain"
              />
            </div>

            {/* Footer modal */}
            <div className="p-3 bg-slate-800/90 border-t border-slate-700 flex items-center justify-between text-xs text-slate-300">
              <div className="sm:hidden text-[11px] truncate">
                {previewPhoto.takenByName} • {formatRelativeTime(previewPhoto.takenAt)}
              </div>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="ml-auto min-h-[36px] px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold text-xs"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
      {/* MODAL XÁC NHẬN XÓA ẢNH */}
      {photoToDelete && (
        <div className="fixed inset-0 z-60 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white max-w-sm w-full rounded-3xl p-5 shadow-2xl border border-rose-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 flex items-center justify-center text-rose-600 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900">Xác nhận xóa ảnh</h4>
                <p className="text-[11px] text-slate-500">
                  {photoToDelete.kind === 'before' ? 'Ảnh trước xử lý' : 'Ảnh sau hoàn thành'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa ảnh này khỏi công việc? Thao tác này không thể hoàn tác.
            </p>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPhotoToDelete(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={async () => {
                  const targetId = photoToDelete.id;
                  setPhotoToDelete(null);
                  await handleDeletePhoto(targetId);
                }}
                className="flex-1 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs shadow-md shadow-rose-600/20 active:scale-95 transition-all cursor-pointer"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
