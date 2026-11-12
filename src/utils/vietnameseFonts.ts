import jsPDF from 'jspdf';

let cachedRegularBase64: string | null = null;
let cachedBoldBase64: string | null = null;

/**
 * Converts ArrayBuffer to Base64 string in browser or Node environment
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

/**
 * Loads "Be Vietnam Pro" Regular and Bold TTF fonts from public directory
 * and registers them into the jsPDF instance.
 */
export async function loadAndRegisterVietnameseFonts(doc: jsPDF): Promise<boolean> {
  try {
    if (!cachedRegularBase64 || !cachedBoldBase64) {
      const [resReg, resBold] = await Promise.all([
        fetch('/fonts/BeVietnamPro_400Regular.ttf'),
        fetch('/fonts/BeVietnamPro_700Bold.ttf'),
      ]);

      if (!resReg.ok || !resBold.ok) {
        throw new Error(`Failed to fetch font files: HTTP ${resReg.status} / ${resBold.status}`);
      }

      const [bufReg, bufBold] = await Promise.all([
        resReg.arrayBuffer(),
        resBold.arrayBuffer(),
      ]);

      cachedRegularBase64 = arrayBufferToBase64(bufReg);
      cachedBoldBase64 = arrayBufferToBase64(bufBold);
    }

    // Register into jsPDF virtual file system
    doc.addFileToVFS('BeVietnamPro-Regular.ttf', cachedRegularBase64);
    doc.addFont('BeVietnamPro-Regular.ttf', 'BeVietnamPro', 'normal');

    doc.addFileToVFS('BeVietnamPro-Bold.ttf', cachedBoldBase64);
    doc.addFont('BeVietnamPro-Bold.ttf', 'BeVietnamPro', 'bold');

    // Set as active font immediately
    doc.setFont('BeVietnamPro', 'normal');
    return true;
  } catch (err) {
    console.error('Error loading Vietnamese TTF fonts for jsPDF:', err);
    throw err;
  }
}
