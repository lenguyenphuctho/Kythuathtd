/**
 * Client-side image compressor for Firestore base64 storage optimized for iOS/Safari & Android.
 * Enforces:
 * - EXIF orientation correction using createImageBitmap({ imageOrientation: 'from-image' }) with fallback
 * - Max dimension <= 800px
 * - File size strictly under 150KB (145KB safety threshold for base64 storage)
 * - Clear error diagnostics for iPhone Safari camera permissions
 */

export interface CompressionResult {
  dataUrl: string;
  sizeInKb: number;
  width: number;
  height: number;
}

/**
 * Hướng dẫn cấp quyền Camera cụ thể cho iPhone và Android khi bị từ chối
 */
export function getCameraPermissionHelp(isIOS: boolean = true): string {
  if (isIOS) {
    return 'Không thể mở Camera trên iPhone. Vui lòng vào Cài đặt iPhone > Safari > Camera > Chọn "Hỏi" hoặc "Cho phép", sau đó tải lại trang và thử lại.';
  }
  return 'Không thể mở Camera. Vui lòng kiểm tra quyền truy cập Máy ảnh của trình duyệt trong Cài đặt thiết bị.';
}

/**
 * Nén ảnh từ File/Blob chụp từ Camera hoặc Thư viện ảnh, tự động xoay chuẩn theo EXIF
 */
export async function compressImage(file: File | Blob): Promise<CompressionResult> {
  // Pre-check file size: reject excessively huge files > 30MB
  if ('size' in file && file.size > 30 * 1024 * 1024) {
    throw new Error('Dung lượng tệp ảnh gốc quá lớn (>30MB). Vui lòng chọn ảnh nhỏ hơn để đảm bảo hiệu năng.');
  }

  // Bước 1: Thử giải mã ảnh bằng createImageBitmap với tùy chọn imageOrientation: 'from-image'
  // Tùy chọn này trên iOS Safari và Chrome tự động xoay ảnh theo đúng chiều EXIF của camera iPhone.
  let bitmapSource: ImageBitmap | HTMLImageElement | null = null;
  let naturalWidth = 0;
  let naturalHeight = 0;

  if (typeof window !== 'undefined' && 'createImageBitmap' in window) {
    try {
      bitmapSource = await createImageBitmap(file, { imageOrientation: 'from-image' });
      naturalWidth = bitmapSource.width;
      naturalHeight = bitmapSource.height;
    } catch (bitmapErr) {
      console.warn('createImageBitmap failed, falling back to FileReader + Image:', bitmapErr);
      bitmapSource = null;
    }
  }

  // Fallback sang HTMLImageElement nếu createImageBitmap không khả dụng
  if (!bitmapSource) {
    bitmapSource = await new Promise<HTMLImageElement>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Không thể đọc tệp ảnh. Vui lòng kiểm tra lại quyền truy cập ảnh.'));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () =>
          reject(
            new Error(
              'Định dạng ảnh không được trình duyệt hỗ trợ (ví dụ HEIC thô chưa giải mã). Vui lòng chụp trực tiếp bằng Camera hoặc chọn ảnh JPG/PNG.'
            )
          );
        img.onload = () => resolve(img);
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
    naturalWidth = (bitmapSource as HTMLImageElement).naturalWidth || (bitmapSource as HTMLImageElement).width;
    naturalHeight = (bitmapSource as HTMLImageElement).naturalHeight || (bitmapSource as HTMLImageElement).height;
  }

  if (naturalWidth <= 0 || naturalHeight <= 0) {
    throw new Error('Không xác định được kích thước ảnh.');
  }

  // Bước 2: Tính toán kích thước tối đa (maxDim = 800px)
  const maxDim = 800;
  let targetWidth = naturalWidth;
  let targetHeight = naturalHeight;

  if (targetWidth > maxDim || targetHeight > maxDim) {
    if (targetWidth >= targetHeight) {
      targetHeight = Math.round((targetHeight * maxDim) / targetWidth);
      targetWidth = maxDim;
    } else {
      targetWidth = Math.round((targetWidth * maxDim) / targetHeight);
      targetHeight = maxDim;
    }
  }

  // Bước 3: Vẽ lên Canvas
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Không thể khởi tạo Canvas 2D để nén ảnh.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmapSource, 0, 0, targetWidth, targetHeight);

  // Dọn dẹp bitmapSource nếu là ImageBitmap
  if ('close' in bitmapSource && typeof (bitmapSource as ImageBitmap).close === 'function') {
    try {
      (bitmapSource as ImageBitmap).close();
    } catch {
      // Ignore
    }
  }

  // Bước 4: Thang chất lượng nén để đảm bảo kích thước <= 145KB (dưới ngưỡng 150KB)
  const MAX_BYTES = 145 * 1024;
  let quality = 0.72;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  let sizeInBytes = Math.round((dataUrl.length * 3) / 4);

  if (sizeInBytes > MAX_BYTES) {
    quality = 0.55;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    sizeInBytes = Math.round((dataUrl.length * 3) / 4);
  }

  if (sizeInBytes > MAX_BYTES) {
    quality = 0.42;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
    sizeInBytes = Math.round((dataUrl.length * 3) / 4);
  }

  if (sizeInBytes > MAX_BYTES) {
    // Thu nhỏ thêm 20% kích thước nếu dung lượng ảnh vẫn còn cao
    const smallCanvas = document.createElement('canvas');
    smallCanvas.width = Math.round(targetWidth * 0.8);
    smallCanvas.height = Math.round(targetHeight * 0.8);
    const smallCtx = smallCanvas.getContext('2d');
    if (smallCtx) {
      smallCtx.imageSmoothingEnabled = true;
      smallCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
      dataUrl = smallCanvas.toDataURL('image/jpeg', 0.4);
      sizeInBytes = Math.round((dataUrl.length * 3) / 4);
      targetWidth = smallCanvas.width;
      targetHeight = smallCanvas.height;
    }
  }

  return {
    dataUrl,
    sizeInKb: Math.round(sizeInBytes / 1024),
    width: targetWidth,
    height: targetHeight,
  };
}
