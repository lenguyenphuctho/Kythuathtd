import React, { useState, useRef, useMemo } from 'react';
import { X, Gauge, Camera, AlertTriangle, CheckCircle2, TrendingUp, Info } from 'lucide-react';
import { ElectricalAsset, MeterReading } from '../../types';
import { collection, addDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';
import { useAuth } from '../../context/AuthContext';
import { compressImage } from '../../utils/imageCompressor';
import { formatDateOnly } from '../../utils/formatters';

interface MeterReadingModalProps {
  isOpen: boolean;
  meterAssets: ElectricalAsset[];
  pastReadings: MeterReading[];
  defaultAssetId?: string;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const MeterReadingModal: React.FC<MeterReadingModalProps> = ({
  isOpen,
  meterAssets,
  pastReadings,
  defaultAssetId,
  onClose,
  onSuccess,
  onError,
}) => {
  if (!isOpen) return null;

  const { userProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().split('T')[0];

  const [selectedAssetId, setSelectedAssetId] = useState<string>(
    defaultAssetId || meterAssets[0]?.id || ''
  );
  const [date, setDate] = useState(today);
  const [value, setValue] = useState<string>('');
  const [note, setNote] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [isCompressingPhoto, setIsCompressingPhoto] = useState(false);
  const [isZoomingPhoto, setIsZoomingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedAsset = meterAssets.find((a) => a.id === selectedAssetId);

  // Find most recent previous reading for selected meter
  const prevReading = useMemo(() => {
    if (!selectedAssetId) return null;
    const readingsForAsset = pastReadings
      .filter((r) => r.assetId === selectedAssetId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return readingsForAsset[0] || null;
  }, [pastReadings, selectedAssetId]);

  const numValue = Number(value);
  const hasValue = value.trim() !== '' && !isNaN(numValue);
  const isLowerThanPrev = prevReading && hasValue && numValue < prevReading.value;
  const consumption = prevReading && hasValue ? numValue - prevReading.value : null;

  const handleCapturePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsCompressingPhoto(true);
      const res = await compressImage(file);
      setPhotoDataUrl(res.dataUrl);
    } catch (err) {
      console.error(err);
      onError('Không thể nén ảnh công tơ. Vui lòng thử lại.');
    } finally {
      setIsCompressingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedAssetId) {
      onError('Vui lòng chọn công tơ đo điện');
      return;
    }

    if (!hasValue || numValue < 0) {
      onError('Chỉ số công tơ điện phải là số dương hợp lệ');
      return;
    }

    if (!userProfile) return;

    try {
      setIsSubmitting(true);
      const now = new Date().toISOString();

      const newReading: Record<string, any> = {
        assetId: selectedAssetId,
        assetCode: selectedAsset?.code,
        assetName: selectedAsset?.name,
        date,
        value: numValue,
        recordedBy: userProfile.uid,
        recordedByName: userProfile.displayName,
        note: note.trim(),
        createdAt: now,
      };
      if (photoDataUrl) {
        newReading.photo = photoDataUrl;
      }

      await addDoc(collection(db, 'meterReadings'), newReading);

      const diffMsg =
        consumption !== null
          ? ` (Tiêu thụ: ${consumption >= 0 ? '+' : ''}${consumption.toLocaleString('vi-VN')} kWh)`
          : '';
      onSuccess(`Đã ghi chỉ số công tơ ${selectedAsset?.code}: ${numValue.toLocaleString('vi-VN')} kWh${diffMsg}`);
      onClose();
    } catch (err) {
      console.error(err);
      handleFirestoreError(err, OperationType.CREATE, 'meterReadings');
      onError('Không thể lưu chỉ số công tơ');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <Gauge className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Ghi chỉ số công tơ điện nhanh
              </h3>
              <p className="text-[11px] text-slate-500">
                Hỗ trợ chụp ảnh đồng hồ và tự động tính toán điện năng tiêu thụ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Select Meter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Chọn công tơ / Đồng hồ đo điện *
            </label>
            <select
              required
              value={selectedAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold focus:ring-2 focus:ring-blue-500 bg-white"
            >
              {meterAssets.length === 0 ? (
                <option value="">Chưa có công tơ nào trong danh mục</option>
              ) : (
                meterAssets.map((m) => (
                  <option key={m.id} value={m.id}>
                    [{m.code}] {m.name} {m.rating ? `(${m.rating})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ngày ghi chỉ số *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Previous Reading Info */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col justify-center">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Chỉ số kỳ trước
              </span>
              {prevReading ? (
                <div className="flex items-baseline justify-between mt-0.5">
                  <span className="text-sm font-black font-mono text-slate-800">
                    {prevReading.value.toLocaleString('vi-VN')} <span className="text-[10px] text-slate-500">kWh</span>
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({formatDateOnly(prevReading.date)})
                  </span>
                </div>
              ) : (
                <span className="text-xs text-slate-400 italic mt-0.5">Lần đầu ghi chỉ số</span>
              )}
            </div>
          </div>

          {/* New Reading Input */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
              <span>Chỉ số mới trên mặt đồng hồ (kWh) *</span>
              {consumption !== null && (
                <span
                  className={`text-[11px] font-bold font-mono px-2 py-0.5 rounded-md ${
                    consumption >= 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  Tiêu thụ: {consumption >= 0 ? '+' : ''}
                  {consumption.toLocaleString('vi-VN')} kWh
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                step="0.1"
                min="0"
                required
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="VD: 15420.5"
                className={`w-full min-h-[48px] px-4 py-3 rounded-2xl border text-base font-black font-mono tracking-wide focus:ring-2 ${
                  isLowerThanPrev
                    ? 'border-rose-400 bg-rose-50/30 text-rose-900 focus:ring-rose-500'
                    : 'border-slate-200 bg-white text-slate-900 focus:ring-blue-500'
                }`}
              />
              <span className="absolute right-4 top-3.5 text-xs font-bold text-slate-400">
                kWh
              </span>
            </div>
          </div>

          {/* Warning if new reading < previous reading */}
          {isLowerThanPrev && (
            <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-300 text-rose-900 flex items-start gap-2.5 animate-in fade-in">
              <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <span className="font-bold block text-rose-800">
                  Cảnh báo: Chỉ số mới ({numValue} kWh) nhỏ hơn kỳ trước ({prevReading?.value} kWh)!
                </span>
                Vui lòng kiểm tra lại mặt đồng hồ. Nếu công tơ đã được thay mới hoặc reset về 0, bạn vẫn có thể xác nhận lưu.
              </div>
            </div>
          )}

          {/* Meter Photo Capture */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Ảnh chụp mặt đồng hồ công tơ (Tùy chọn)
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              capture="environment"
              onChange={handleCapturePhoto}
              className="hidden"
            />

            {photoDataUrl ? (
              <>
                <div
                  onClick={() => setIsZoomingPhoto(true)}
                  className="group relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 aspect-video max-h-48 flex items-center justify-center cursor-pointer active:scale-98 transition-all touch-manipulation"
                  title="Chạm để phóng to xem rõ số đồng hồ"
                >
                  <img
                    src={photoDataUrl}
                    alt="Ảnh đồng hồ"
                    className="w-full h-full object-contain group-hover:scale-105 transition-transform"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-xs font-bold bg-black/60 px-3 py-1.5 rounded-xl">Chạm để phóng to</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setPhotoDataUrl(null);
                    }}
                    className="absolute top-2 right-2 min-w-[36px] min-h-[36px] flex items-center justify-center bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-md transition-all"
                    title="Xóa ảnh chụp"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Meter Photo Zoom Modal */}
                {isZoomingPhoto && (
                  <div
                    className="fixed inset-0 z-60 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setIsZoomingPhoto(false)}
                  >
                    <div className="relative max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
                      <img
                        src={photoDataUrl}
                        alt="Zoomed Meter"
                        className="w-full max-h-[80vh] object-contain bg-black rounded-2xl border border-slate-700"
                      />
                      <button
                        type="button"
                        onClick={() => setIsZoomingPhoto(false)}
                        className="mt-3 w-full min-h-[44px] py-2.5 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm font-semibold transition-colors active:scale-95 touch-manipulation"
                      >
                        Đóng xem ảnh
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isCompressingPhoto}
                className="w-full min-h-[80px] py-4 border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-2xl flex flex-col items-center justify-center text-slate-500 hover:text-blue-600 transition-all bg-slate-50/50 hover:bg-blue-50/30 active:scale-98 touch-manipulation"
              >
                {isCompressingPhoto ? (
                  <div className="flex items-center gap-2 text-xs font-medium">
                    <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    Đang nén ảnh công tơ...
                  </div>
                ) : (
                  <>
                    <Camera className="w-6 h-6 mb-1 text-slate-400 group-hover:text-blue-500" />
                    <span className="text-xs font-bold">Chụp bằng camera sau hoặc chọn ảnh</span>
                    <span className="text-[11px] text-slate-400 mt-0.5">
                      Lưu bằng chứng chỉ số thực tế trên đồng hồ (&lt;150KB)
                    </span>
                  </>
                )}
              </button>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Ghi chú thêm
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="VD: Chỉ số chốt ngày 20 hàng tháng..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !hasValue}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Đang lưu...' : 'Lưu chỉ số công tơ'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
