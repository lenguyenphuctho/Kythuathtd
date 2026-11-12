import ExcelJS from 'exceljs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CompanySettings,
  WorkOrder,
  WorkOrderMaterial,
  ChecklistResultItem,
  CostEntry,
  InventoryItem,
  InventoryTransaction,
  MaintenancePlan,
  MaintenanceLog,
  EquipmentItem,
  ElectricalAsset,
  MeterReading,
  ElectricalCheck,
  LocationItem,
  UserProfile,
  getWorkOrderOrigin,
  getWorkOrderAssigneeDisplay,
} from '../types';
import { loadAndRegisterVietnameseFonts } from './vietnameseFonts';
import { formatVND, formatDate, formatDateTime } from './formatters';

export interface ColumnDefinition {
  header: string;
  key: string;
  type?: 'text' | 'number' | 'currency' | 'date';
  width?: number;
}

export interface ExportReportOptions {
  fileName: string;
  reportTitle: string;
  startDate?: string;
  endDate?: string;
  companyProfile?: CompanySettings;
  headers: string[];
  rows: (string | number | Date | null | undefined)[][];
  summaryRow?: (string | number | null | undefined)[];
  currencyColIndices?: number[];
  dateColIndices?: number[];
}

export interface WorkOrderSlipOptions {
  workOrder: WorkOrder;
  companyProfile?: CompanySettings;
  locationName?: string;
  equipmentName?: string;
  materials?: WorkOrderMaterial[];
  checklist?: ChecklistResultItem[];
  technicianName?: string;
}

export interface FullBackupOptions {
  companyProfile?: CompanySettings;
  workOrders: WorkOrder[];
  costEntries: CostEntry[];
  inventoryItems: InventoryItem[];
  inventoryTransactions: InventoryTransaction[];
  maintenancePlans: MaintenancePlan[];
  maintenanceLogs: MaintenanceLog[];
  equipmentList: EquipmentItem[];
  electricalAssets: ElectricalAsset[];
  meterReadings: MeterReading[];
  electricalChecks: ElectricalCheck[];
  locations: LocationItem[];
  technicians: UserProfile[];
  workOrderMaterials?: WorkOrderMaterial[];
}

/**
 * Determine column letter for Excel formulas (1 -> A, 2 -> B, ..., 27 -> AA)
 */
function getColumnLetter(colIndex: number): string {
  let temp: number;
  let letter = '';
  while (colIndex > 0) {
    temp = (colIndex - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    colIndex = Math.floor((colIndex - temp - 1) / 26);
  }
  return letter;
}

/**
 * iOS & Mobile compatible file download / share helper:
 * - Uses navigator.share({ files: [file] }) on iOS or supported devices to trigger native Action Sheet
 * - Fallback for iOS: opens Blob URL in new window/tab for native preview and save
 * - Fallback for Desktop/Android: standard anchor download
 */
export async function downloadOrShareFile(
  blob: Blob,
  fileName: string,
  mimeType: string,
  title?: string
): Promise<void> {
  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '').toLowerCase() : '';
  const isIOS = /iphone|ipad|ipod/.test(ua) && !(window as any).MSStream;

  if (typeof navigator !== 'undefined' && 'canShare' in navigator && typeof (navigator as any).share === 'function') {
    try {
      const file = new File([blob], fileName, { type: mimeType });
      if ((navigator as any).canShare({ files: [file] })) {
        await (navigator as any).share({
          files: [file],
          title: title || fileName,
        });
        return;
      }
    } catch (shareErr: any) {
      if (shareErr.name === 'AbortError') {
        return;
      }
      console.warn('Web Share failed, using download fallback:', shareErr);
    }
  }

  const url = URL.createObjectURL(blob);

  if (isIOS) {
    const newWindow = window.open(url, '_blank');
    if (!newWindow) {
      window.location.href = url;
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }

  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

/**
 * Cleanly exports tabular data to a PDF file with:
 * - Real TTF "Be Vietnam Pro" font for flawless Vietnamese diacritics
 * - Landscape A4, 15mm margins
 * - Repeating headers on every page, avoiding row page splits
 * - "Trang x / y" page numbering in footer
 * - Right-aligned currency columns
 */
export async function buildReportPdfDoc(options: ExportReportOptions): Promise<jsPDF> {
  const {
    reportTitle,
    startDate,
    endDate,
    companyProfile,
    headers,
    rows,
    summaryRow,
    currencyColIndices = [],
  } = options;

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  // 1. Embed Vietnamese TTF Fonts
  await loadAndRegisterVietnameseFonts(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let startY = 15;

  // 2. Company Branding Header
  const compName = companyProfile?.companyName || 'HỆ THỐNG QUẢN LÝ BẢO TRÌ & KỸ THUẬT TÒA NHÀ';
  const compAddress = companyProfile?.address || 'Tòa nhà Văn phòng & Khu phức hợp Dịch vụ';
  const compPhone = companyProfile?.phone ? `Hotline: ${companyProfile.phone}` : '';
  const compEmail = companyProfile?.email ? `Email: ${companyProfile.email}` : '';
  const contactLine = [compPhone, compEmail].filter(Boolean).join(' • ');

  // Render Logo if available
  if (companyProfile?.logoUrl) {
    try {
      doc.addImage(companyProfile.logoUrl, 'JPEG', 15, startY, 18, 18);
      doc.setFont('BeVietnamPro', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(compName, 37, startY + 5);

      doc.setFont('BeVietnamPro', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      if (compAddress) doc.text(compAddress, 37, startY + 10);
      if (contactLine) doc.text(contactLine, 37, startY + 14);

      startY += 24;
    } catch {
      doc.setFont('BeVietnamPro', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(30, 41, 59);
      doc.text(compName, 15, startY + 4);

      doc.setFont('BeVietnamPro', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      if (compAddress) doc.text(compAddress, 15, startY + 9);
      startY += 18;
    }
  } else {
    doc.setFont('BeVietnamPro', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(compName, 15, startY + 4);

    doc.setFont('BeVietnamPro', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    if (compAddress) doc.text(compAddress, 15, startY + 9);
    if (contactLine) doc.text(contactLine, 15, startY + 13);

    startY += 18;
  }

  // Divider Rule
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(15, startY, pageWidth - 15, startY);
  startY += 6;

  // 3. Report Title & Date Subtitles
  doc.setFont('BeVietnamPro', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(reportTitle.toUpperCase(), 15, startY);
  startY += 5;

  const nowFormatted = formatDateTime(new Date());
  const periodText =
    startDate && endDate
      ? `Khoảng thời gian: ${formatDate(startDate)} đến ${formatDate(endDate)}`
      : 'Khoảng thời gian: Toàn bộ dữ liệu';
  const subText = `${periodText} • Xuất lúc ${nowFormatted}`;

  doc.setFont('BeVietnamPro', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(subText, 15, startY);
  startY += 6;

  // 4. Build Table Body
  // Detect currency columns by title if not passed
  const detectedCurrencyCols = new Set<number>(currencyColIndices);
  headers.forEach((h, idx) => {
    const lower = h.toLowerCase();
    if (
      lower.includes('chi phí') ||
      lower.includes('tiền') ||
      lower.includes('đơn giá') ||
      lower.includes('giá trị') ||
      lower.includes('vnđ') ||
      lower.includes('vnd')
    ) {
      detectedCurrencyCols.add(idx);
    }
  });

  const formattedRows = rows.map((r) =>
    r.map((cell, cIdx) => {
      if (cell === null || cell === undefined || cell === '') return '-';
      if (typeof cell === 'number' && detectedCurrencyCols.has(cIdx)) {
        return formatVND(cell);
      }
      return String(cell);
    })
  );

  const bodyData = [...formattedRows];
  if (summaryRow && summaryRow.length > 0) {
    const formattedSummary = summaryRow.map((cell, cIdx) => {
      if (cell === null || cell === undefined || cell === '') return '';
      if (typeof cell === 'number' && detectedCurrencyCols.has(cIdx)) {
        return formatVND(cell);
      }
      return String(cell);
    });
    bodyData.push(formattedSummary);
  }

  // 5. Define column styles for alignment
  const colStyles: Record<number, any> = {};
  headers.forEach((h, idx) => {
    const lower = h.toLowerCase();
    if (detectedCurrencyCols.has(idx)) {
      colStyles[idx] = { halign: 'right', minCellWidth: 28 };
    } else if (
      lower.includes('mã') ||
      lower.includes('ngày') ||
      lower.includes('hạn') ||
      lower.includes('ưu tiên') ||
      lower.includes('trạng thái')
    ) {
      colStyles[idx] = { halign: 'center' };
    }
  });

  // 6. AutoTable Render with Be Vietnam Pro font everywhere
  autoTable(doc, {
    startY,
    head: [headers],
    body: bodyData,
    theme: 'grid',
    showHead: 'everyPage',
    rowPageBreak: 'avoid',
    margin: { top: 15, left: 15, right: 15, bottom: 15 },
    styles: {
      font: 'BeVietnamPro',
      fontStyle: 'normal',
      fontSize: 8,
      cellPadding: 2.2,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.1,
      overflow: 'linebreak',
    },
    headStyles: {
      font: 'BeVietnamPro',
      fontStyle: 'bold',
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      halign: 'center',
      valign: 'middle',
    },
    bodyStyles: {
      font: 'BeVietnamPro',
      fontStyle: 'normal',
      valign: 'middle',
    },
    footStyles: {
      font: 'BeVietnamPro',
      fontStyle: 'bold',
    },
    columnStyles: colStyles,
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
    didParseCell: (data) => {
      if (summaryRow && data.section === 'body' && data.row.index === bodyData.length - 1) {
        data.cell.styles.font = 'BeVietnamPro';
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [241, 245, 249];
        data.cell.styles.textColor = [15, 23, 42];
      }
    },
  });

  // 7. Post-process Page Numbers "Trang x / y" across all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('BeVietnamPro', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);

    const pageStr = `Trang ${i} / ${totalPages}`;
    doc.text(pageStr, pageWidth - 15, pageHeight - 8, { align: 'right' });
    doc.text('Hệ thống Quản lý Kỹ thuật & Bảo trì Tòa nhà', 15, pageHeight - 8);
  }

  return doc;
}

export async function exportToPdf(options: ExportReportOptions): Promise<void> {
  const doc = await buildReportPdfDoc(options);
  const blob = doc.output('blob');
  await downloadOrShareFile(blob, `${options.fileName}.pdf`, 'application/pdf', options.reportTitle);
}

export async function generateReportPdfBlob(options: ExportReportOptions): Promise<Blob> {
  const doc = await buildReportPdfDoc(options);
  return doc.output('blob');
}

/**
 * Cleanly exports tabular data to an Excel (.xlsx) file using ExcelJS:
 * - Font Arial 11 for all cells
 * - Report Title bold size 14, date range and export timestamp
 * - Table header bold, white text on #2563EB background, frozen and autofiltered
 * - Real number formatting for currencies (#,##0 "₫")
 * - Real date formatting (dd/mm/yyyy)
 * - Real SUM formula for totals
 * - Landscape A4 print setup
 */
export async function exportToExcel(options: ExportReportOptions): Promise<void> {
  const {
    fileName,
    reportTitle,
    startDate,
    endDate,
    headers,
    rows,
    summaryRow,
    currencyColIndices = [],
    dateColIndices = [],
  } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hệ thống Quản lý Kỹ thuật & Bảo trì';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Báo cáo', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  });

  // 1. Report Title (Row 1)
  const titleRow = worksheet.addRow([reportTitle.toUpperCase()]);
  titleRow.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FF0F172A' } };
  titleRow.height = 24;

  // 2. Subtitle: Period (Row 2)
  const periodText =
    startDate && endDate
      ? `Khoảng thời gian: ${formatDate(startDate)} đến ${formatDate(endDate)}`
      : 'Khoảng thời gian: Toàn bộ dữ liệu';
  const periodRow = worksheet.addRow([periodText]);
  periodRow.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };

  // 3. Subtitle: Export Time (Row 3)
  const timeRow = worksheet.addRow([`Xuất lúc: ${formatDateTime(new Date())}`]);
  timeRow.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF64748B' } };

  // 4. Blank row (Row 4)
  worksheet.addRow([]);

  // 5. Column Headers (Row 5)
  const headerRow = worksheet.addRow(headers);
  const headerRowNumber = 5;
  headerRow.height = 28;
  headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2563EB' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  // Freeze Header Row & Autofilter
  worksheet.views = [{ state: 'frozen', ySplit: headerRowNumber }];
  worksheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: headers.length },
  };
  worksheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;

  // Detect currency and date columns
  const currencyCols = new Set<number>(currencyColIndices);
  const dateCols = new Set<number>(dateColIndices);
  headers.forEach((h, idx) => {
    const lower = h.toLowerCase();
    if (
      lower.includes('chi phí') ||
      lower.includes('tiền') ||
      lower.includes('đơn giá') ||
      lower.includes('giá trị') ||
      lower.includes('vnđ') ||
      lower.includes('vnd')
    ) {
      currencyCols.add(idx);
    }
    if (lower.includes('ngày') || lower.includes('hạn') || lower.includes('thời gian')) {
      dateCols.add(idx);
    }
  });

  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
  };

  // 6. Data Rows
  const startDataRow = 6;
  rows.forEach((row) => {
    const dataRowValues = row.map((cell, cIdx) => {
      if (cell === null || cell === undefined || cell === '') return '-';

      // Parse numerical currency
      if (currencyCols.has(cIdx)) {
        if (typeof cell === 'number') return cell;
        if (typeof cell === 'string') {
          const num = parseFloat(cell.replace(/[^\d.-]/g, ''));
          return isNaN(num) ? cell : num;
        }
      }

      // Format date if needed
      if (dateCols.has(cIdx)) {
        if (cell instanceof Date) return cell;
        if (typeof cell === 'string' && /^\d{4}-\d{2}-\d{2}/.test(cell)) {
          return formatDate(cell);
        }
      }
      return cell;
    });

    const addedRow = worksheet.addRow(dataRowValues);
    addedRow.height = 22;

    addedRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const cIdx = colNumber - 1;
      cell.font = { name: 'Arial', size: 11, color: { argb: 'FF0F172A' } };
      cell.border = thinBorder;

      if (currencyCols.has(cIdx) && typeof cell.value === 'number') {
        cell.numFmt = '#,##0 "₫"';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else if (cell.value instanceof Date) {
        cell.numFmt = 'dd/mm/yyyy';
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (cell.value === '-') {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else {
        const header = headers[cIdx]?.toLowerCase() || '';
        const isCentered =
          header.includes('mã') ||
          header.includes('ngày') ||
          header.includes('hạn') ||
          header.includes('ưu tiên') ||
          header.includes('trạng thái');

        cell.alignment = {
          vertical: 'middle',
          horizontal: isCentered ? 'center' : 'left',
          wrapText: true,
        };
      }
    });
  });

  const endDataRow = startDataRow + rows.length - 1;

  // 7. Summary Row with Real SUM Formulas
  if (summaryRow && summaryRow.length > 0 && rows.length > 0) {
    const summaryValues = summaryRow.map((cell, cIdx) => {
      if (currencyCols.has(cIdx)) {
        const colLetter = getColumnLetter(cIdx + 1);
        return { formula: `SUM(${colLetter}${startDataRow}:${colLetter}${endDataRow})` };
      }
      return cell;
    });

    const addedSummaryRow = worksheet.addRow(summaryValues);
    addedSummaryRow.height = 24;

    addedSummaryRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const cIdx = colNumber - 1;
      cell.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FF0F172A' } };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF1F5F9' },
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF94A3B8' } },
        bottom: { style: 'double', color: { argb: 'FF94A3B8' } },
        left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      };

      if (currencyCols.has(cIdx)) {
        cell.numFmt = '#,##0 "₫"';
        cell.alignment = { vertical: 'middle', horizontal: 'right' };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: cIdx === 0 ? 'left' : 'center' };
      }
    });
  }

  // 8. Auto calculate column widths (capped at 50 chars)
  worksheet.columns.forEach((column) => {
    let maxLength = 0;
    column.eachCell?.({ includeEmpty: true }, (cell) => {
      let cellLen = 0;
      if (cell.value) {
        if (typeof cell.value === 'object' && 'formula' in cell.value) {
          cellLen = 14;
        } else {
          cellLen = String(cell.value).length;
        }
      }
      maxLength = Math.max(maxLength, cellLen);
    });
    column.width = Math.min(Math.max(maxLength + 3, 13), 50);
  });

  // 9. Write buffer and download / share file
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  await downloadOrShareFile(
    blob,
    `${fileName}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    reportTitle
  );
}

/**
 * Exports a detailed, beautifully styled Work Order Slip in PDF format:
 * - A4 Portrait with 15mm margins
 * - Be Vietnam Pro Vietnamese font
 * - Corporate header & logo
 * - Work order metadata, assigned technician, equipment, location
 * - Materials used table with prices
 * - Maintenance checklist results
 * - Total cost breakdown
 * - 4 Sign-off signature boxes
 */
export async function buildWorkOrderSlipPdfDoc(options: WorkOrderSlipOptions): Promise<jsPDF> {
  const {
    workOrder,
    companyProfile,
    locationName = 'Chưa xác định',
    equipmentName = 'Chung tòa nhà',
    materials = [],
    checklist = [],
    technicianName = 'Chưa phân công',
  } = options;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  await loadAndRegisterVietnameseFonts(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  let startY = 15;

  // 1. Company Header
  const compName = companyProfile?.companyName || 'HỆ THỐNG QUẢN LÝ BẢO TRÌ & KỸ THUẬT';
  const compAddress = companyProfile?.address || 'Tòa nhà Văn phòng & Khu phức hợp Dịch vụ';
  const compPhone = companyProfile?.phone ? `Hotline: ${companyProfile.phone}` : '';

  if (companyProfile?.logoUrl) {
    try {
      doc.addImage(companyProfile.logoUrl, 'JPEG', 15, startY, 16, 16);
      doc.setFont('BeVietnamPro', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(30, 41, 59);
      doc.text(compName, 35, startY + 5);

      doc.setFont('BeVietnamPro', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      if (compAddress) doc.text(compAddress, 35, startY + 10);
      if (compPhone) doc.text(compPhone, 35, startY + 14);

      startY += 22;
    } catch {
      doc.setFont('BeVietnamPro', 'bold');
      doc.setFontSize(10);
      doc.text(compName, 15, startY + 5);
      startY += 16;
    }
  } else {
    doc.setFont('BeVietnamPro', 'bold');
    doc.setFontSize(10);
    doc.text(compName, 15, startY + 5);
    doc.setFont('BeVietnamPro', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    if (compAddress) doc.text(compAddress, 15, startY + 10);
    startY += 16;
  }

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.4);
  doc.line(15, startY, pageWidth - 15, startY);
  startY += 7;

  // 2. Slip Title
  const isMaintenance = workOrder.orderType === 'maintenance' || workOrder.planId;
  const slipTitle = isMaintenance
    ? 'PHIẾU BẢO DƯỠNG & KIỂM TRA ĐỊNH KỲ'
    : 'PHIẾU CÔNG VIỆC KỸ THUẬT & SỬA CHỮA';

  doc.setFont('BeVietnamPro', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text(slipTitle, pageWidth / 2, startY, { align: 'center' });
  startY += 5;

  doc.setFont('BeVietnamPro', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Mã số phiếu: ${workOrder.code} • Xuất lúc: ${formatDateTime(new Date())}`, pageWidth / 2, startY, {
    align: 'center',
  });
  startY += 8;

  // 3. Information Grid Table
  const priorityText =
    workOrder.priority === 'khan_cap'
      ? 'Khẩn cấp'
      : workOrder.priority === 'cao'
      ? 'Cao'
      : workOrder.priority === 'trung_binh'
      ? 'Trung bình'
      : 'Thấp';

  const infoRows = [
    [
      { content: 'Tiêu đề công việc:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      { content: workOrder.title, colSpan: 3 },
    ],
    [
      { content: 'Mã công việc:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      { content: workOrder.code },
      { content: 'Mức độ ưu tiên:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      { content: priorityText },
    ],
    [
      { content: 'Trạng thái hiện tại:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      { content: workOrder.status },
      { content: 'KTV phụ trách:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      { content: technicianName },
    ],
    [
      { content: 'Khu vực / Vị trí:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      { content: locationName },
      { content: 'Thiết bị liên quan:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      { content: equipmentName },
    ],
    [
      { content: 'Ngày lập phiếu:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      { content: formatDate(workOrder.createdAt) },
      { content: 'Hạn hoàn thành:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      { content: workOrder.dueDate ? formatDate(workOrder.dueDate) : '-' },
    ],
    [
      { content: 'Người yêu cầu / Báo sự cố:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      { content: workOrder.requesterName || 'Nội bộ kỹ thuật' },
      { content: 'Ngày hoàn tất:', styles: { fontStyle: 'bold', fillColor: [248, 250, 252] } },
      { content: workOrder.completedAt ? formatDate(workOrder.completedAt) : '-' },
    ],
  ];

  autoTable(doc, {
    startY,
    body: infoRows as any,
    theme: 'grid',
    margin: { left: 15, right: 15 },
    styles: {
      font: 'BeVietnamPro',
      fontStyle: 'normal',
      fontSize: 8.5,
      cellPadding: 2.2,
      lineColor: [203, 213, 225],
      lineWidth: 0.1,
    },
  });

  startY = (doc as any).lastAutoTable.finalY + 6;

  // 4. Description section
  if (workOrder.description) {
    doc.setFont('BeVietnamPro', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text('Mô tả chi tiết & Yêu cầu kỹ thuật:', 15, startY);
    startY += 4;

    autoTable(doc, {
      startY,
      body: [[workOrder.description]],
      theme: 'grid',
      margin: { left: 15, right: 15 },
      styles: {
        font: 'BeVietnamPro',
        fontStyle: 'normal',
        fontSize: 8,
        cellPadding: 3,
        fillColor: [248, 250, 252],
        lineColor: [226, 232, 240],
      },
    });

    startY = (doc as any).lastAutoTable.finalY + 6;
  }

  // 5. Checklist Table (for maintenance)
  if (checklist.length > 0) {
    doc.setFont('BeVietnamPro', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text('Nội dung kiểm tra & Checklist bảo dưỡng:', 15, startY);
    startY += 4;

    const checklistHeaders = ['STT', 'Hạng mục kiểm tra', 'Kết quả', 'Ghi chú kỹ thuật'];
    const checklistRows = checklist.map((item, idx) => [
      String(idx + 1),
      item.text,
      item.done ? 'ĐẠT' : 'CHƯA ĐẠT',
      item.note || '-',
    ]);

    autoTable(doc, {
      startY,
      head: [checklistHeaders],
      body: checklistRows,
      theme: 'grid',
      margin: { left: 15, right: 15 },
      styles: {
        font: 'BeVietnamPro',
        fontSize: 8,
        cellPadding: 2,
        lineColor: [226, 232, 240],
      },
      headStyles: {
        font: 'BeVietnamPro',
        fontStyle: 'bold',
        fillColor: [59, 130, 246],
        textColor: [255, 255, 255],
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 12 },
        2: { halign: 'center', cellWidth: 25 },
      },
    });

    startY = (doc as any).lastAutoTable.finalY + 6;
  }

  // 6. Materials Used Table
  let totalMaterialCost = 0;
  if (materials.length > 0) {
    doc.setFont('BeVietnamPro', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text('Vật tư, linh kiện xuất kho sử dụng:', 15, startY);
    startY += 4;

    const matHeaders = ['STT', 'Mã/Tên vật tư', 'ĐVT', 'Số lượng', 'Đơn giá', 'Thành tiền'];
    const matRows = materials.map((m, idx) => {
      const lineCost = m.qty * m.unitCost;
      totalMaterialCost += lineCost;
      return [
        String(idx + 1),
        m.itemName || m.itemId,
        m.unit || 'Cái',
        String(m.qty),
        formatVND(m.unitCost),
        formatVND(lineCost),
      ];
    });

    matRows.push([
      'TỔNG',
      '',
      '',
      '',
      'TỔNG VẬT TƯ:',
      formatVND(totalMaterialCost),
    ]);


    autoTable(doc, {
      startY,
      head: [matHeaders],
      body: matRows,
      theme: 'grid',
      margin: { left: 15, right: 15 },
      styles: {
        font: 'BeVietnamPro',
        fontSize: 8,
        cellPadding: 2,
        lineColor: [226, 232, 240],
      },
      headStyles: {
        font: 'BeVietnamPro',
        fontStyle: 'bold',
        fillColor: [37, 99, 235],
        textColor: [255, 255, 255],
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        1: { halign: 'center', cellWidth: 22 },
        3: { halign: 'center', cellWidth: 15 },
        4: { halign: 'right', cellWidth: 18 },
        5: { halign: 'right', cellWidth: 26 },
        6: { halign: 'right', cellWidth: 28 },
      },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === matRows.length - 1) {
          data.cell.styles.font = 'BeVietnamPro';
          data.cell.styles.fontStyle = 'bold';
          data.cell.styles.fillColor = [241, 245, 249];
        }
      },
    });

    startY = (doc as any).lastAutoTable.finalY + 6;
  }

  // 7. Cost Summary Box
  const labor = workOrder.laborCost || 0;
  const external = workOrder.externalCost || 0;
  const grandTotal = totalMaterialCost + labor + external;

  const costBoxRows = [
    [
      { content: 'Chi phí vật tư xuất kho:', styles: { fontStyle: 'bold' } },
      { content: formatVND(totalMaterialCost), styles: { halign: 'right' } },
    ],
    [
      { content: 'Chi phí nhân công nội bộ:', styles: { fontStyle: 'bold' } },
      { content: formatVND(labor), styles: { halign: 'right' } },
    ],
    [
      { content: 'Chi phí thuê ngoài / dịch vụ:', styles: { fontStyle: 'bold' } },
      { content: formatVND(external), styles: { halign: 'right' } },
    ],
    [
      { content: 'TỔNG CHI PHÍ THỰC HIỆN:', styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
      { content: formatVND(grandTotal), styles: { fontStyle: 'bold', halign: 'right', fillColor: [241, 245, 249] } },
    ],
  ];

  autoTable(doc, {
    startY,
    body: costBoxRows as any,
    theme: 'grid',
    margin: { left: pageWidth - 105, right: 15 },
    styles: {
      font: 'BeVietnamPro',
      fontSize: 8.5,
      cellPadding: 2,
      lineColor: [203, 213, 225],
    },
  });

  startY = (doc as any).lastAutoTable.finalY + 8;

  // 8. Sign-off Boxes (4 Columns)
  if (startY > pageHeight - 38) {
    doc.addPage();
    startY = 20;
  }

  const signColWidth = (pageWidth - 30) / 4;
  const signLabels = [
    { title: 'Người yêu cầu / Báo việc', sub: '(Ký, ghi rõ họ tên)' },
    { title: 'Kỹ thuật viên thực hiện', sub: '(Ký, ghi rõ họ tên)' },
    { title: 'Trưởng nhóm / Giám sát', sub: '(Ký, ghi rõ họ tên)' },
    { title: 'Ban Quản lý duyệt', sub: '(Ký, đóng dấu)' },
  ];

  signLabels.forEach((label, idx) => {
    const xPos = 15 + idx * signColWidth + signColWidth / 2;
    doc.setFont('BeVietnamPro', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(label.title, xPos, startY, { align: 'center' });

    doc.setFont('BeVietnamPro', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(label.sub, xPos, startY + 4, { align: 'center' });
  });

  // Page footer
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('BeVietnamPro', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Trang ${i} / ${totalPages}`, pageWidth - 15, pageHeight - 8, { align: 'right' });
    doc.text(`Phiếu công việc: ${workOrder.code}`, 15, pageHeight - 8);
  }

  return doc;
}

export async function exportWorkOrderSlipPdf(options: WorkOrderSlipOptions): Promise<void> {
  const doc = await buildWorkOrderSlipPdfDoc(options);
  const blob = doc.output('blob');
  await downloadOrShareFile(
    blob,
    `Phieu_cong_viec_${options.workOrder.code}.pdf`,
    'application/pdf',
    `Phiếu công việc ${options.workOrder.code}`
  );
}

export async function generateWorkOrderSlipPdfBlob(options: WorkOrderSlipOptions): Promise<Blob> {
  const doc = await buildWorkOrderSlipPdfDoc(options);
  return doc.output('blob');
}

/**
 * Exports complete backup of all system collections into a single Excel workbook:
 * Each collection gets its own styled worksheet with Arial 11, freeze pane, autofilter,
 * currency and date formatting, and sum formulas!
 */
export async function exportFullBackupExcel(options: FullBackupOptions): Promise<void> {
  const {
    workOrders,
    costEntries,
    inventoryItems,
    inventoryTransactions,
    maintenancePlans,
    maintenanceLogs,
    equipmentList,
    electricalAssets,
    meterReadings,
    electricalChecks,
    locations,
    technicians,
  } = options;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Hệ thống Quản lý Kỹ thuật & Bảo trì';
  workbook.created = new Date();

  const locationMap = new Map(locations.map((l) => [l.id, l.name]));

  const addStyledSheet = (
    sheetName: string,
    sheetTitle: string,
    headers: string[],
    dataRows: any[][],
    currencyIndices: number[] = [],
    dateIndices: number[] = []
  ) => {
    const ws = workbook.addWorksheet(sheetName, {
      pageSetup: {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
      },
    });

    const titleRow = ws.addRow([sheetTitle.toUpperCase()]);
    titleRow.font = { name: 'Arial', size: 13, bold: true, color: { argb: 'FF0F172A' } };
    titleRow.height = 22;

    const timeRow = ws.addRow([`Sao lưu toàn bộ hệ thống lúc: ${formatDateTime(new Date())}`]);
    timeRow.font = { name: 'Arial', size: 9.5, italic: true, color: { argb: 'FF64748B' } };
    ws.addRow([]);

    const headerRow = ws.addRow(headers);
    const headerRowNum = 4;
    headerRow.height = 26;
    headerRow.font = { name: 'Arial', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    ws.views = [{ state: 'frozen', ySplit: headerRowNum }];
    ws.autoFilter = {
      from: { row: headerRowNum, column: 1 },
      to: { row: headerRowNum, column: headers.length },
    };

    const curCols = new Set(currencyIndices);
    const dtCols = new Set(dateIndices);

    dataRows.forEach((r) => {
      const added = ws.addRow(
        r.map((cell, cIdx) => {
          if (cell === null || cell === undefined || cell === '') return '-';
          if (curCols.has(cIdx) && typeof cell === 'number') return cell;
          if (dtCols.has(cIdx) && typeof cell === 'string' && /^\d{4}-\d{2}-\d{2}/.test(cell)) {
            return formatDate(cell);
          }
          return cell;
        })
      );
      added.height = 20;

      added.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const cIdx = colNumber - 1;
        cell.font = { name: 'Arial', size: 10.5, color: { argb: 'FF0F172A' } };
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };

        if (curCols.has(cIdx) && typeof cell.value === 'number') {
          cell.numFmt = '#,##0 "₫"';
          cell.alignment = { vertical: 'middle', horizontal: 'right' };
        } else if (cell.value === '-') {
          cell.alignment = { vertical: 'middle', horizontal: 'center' };
        } else {
          cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
        }
      });
    });

    // Auto widths
    ws.columns.forEach((column) => {
      let maxLen = 0;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        maxLen = Math.max(maxLen, String(cell.value || '').length);
      });
      column.width = Math.min(Math.max(maxLen + 3, 12), 48);
    });
  };

  // 1. Công việc
  addStyledSheet(
    'Công việc',
    'Danh sách Công việc & Sự cố',
    ['Mã CV', 'Tiêu đề', 'Nguồn yêu cầu', 'Cửa hàng yêu cầu', 'Ưu tiên', 'Trạng thái', 'Vị trí', 'Người phụ trách', 'Người yêu cầu', 'Ngày tạo', 'Hạn', 'Ngày hoàn tất', 'Chi phí nhân công', 'Chi phí ngoài'],
    workOrders.map((wo) => [
      wo.code,
      wo.title,
      getWorkOrderOrigin(wo),
      wo.requestingStoreName || locationMap.get(wo.locationId) || 'Chưa gán',
      wo.priority,
      wo.status,
      locationMap.get(wo.locationId) || 'Chưa gán',
      getWorkOrderAssigneeDisplay(wo, technicians),
      wo.requesterName || '-',
      wo.createdAt,
      wo.dueDate || '-',
      wo.completedAt || '-',
      wo.laborCost || 0,
      wo.externalCost || 0,
    ]),
    [12, 13],
    [9, 10, 11]
  );

  // 2. Chi phí
  addStyledSheet(
    'Chi phí',
    'Danh sách Chi phí Kỹ thuật & Bảo trì',
    ['Ngày phát sinh', 'Nội dung chi phí', 'Phân loại', 'Số tiền (VNĐ)'],
    costEntries.map((c) => [c.date, c.description, c.category, c.amount]),
    [3],
    [0]
  );

  // 3. Kho vật tư
  addStyledSheet(
    'Kho vật tư',
    'Danh mục Kho & Tồn kho Vật tư',
    ['Mã SKU', 'Tên vật tư', 'Phân loại', 'Đơn vị tính', 'Số lượng tồn', 'Tồn an toàn', 'Đơn giá (VNĐ)', 'Tổng giá trị tồn (VNĐ)'],
    inventoryItems.map((i) => [i.sku, i.name, i.category, i.unit, i.qty, i.minQty, i.unitCost, i.qty * i.unitCost]),
    [6, 7]
  );

  // 4. Biến động kho
  addStyledSheet(
    'Biến động kho',
    'Lịch sử Nhập / Xuất kho Vật tư',
    ['Thời gian', 'Mã ID vật tư', 'Tên vật tư', 'Loại giao dịch', 'Số lượng', 'Đơn giá', 'Tổng tiền', 'Người thực hiện', 'Ghi chú'],
    inventoryTransactions.map((t) => [
      t.createdAt,
      t.itemId,
      t.itemName || '-',
      t.type === 'in' ? 'Nhập kho' : 'Xuất dùng',
      t.qty,
      t.unitCost,
      t.qty * t.unitCost,
      t.createdByName || t.createdBy,
      t.note || '-',
    ]),
    [5, 6],
    [0]
  );


  // 5. Kế hoạch bảo dưỡng
  addStyledSheet(
    'Kế hoạch bảo dưỡng',
    'Danh mục Kế hoạch Bảo dưỡng Định kỳ',
    ['Tên kế hoạch', 'Chu kỳ', 'Vị trí', 'Hạn kế tiếp', 'Trạng thái hoạt động'],
    maintenancePlans.map((p) => [
      p.title,
      `${p.frequencyValue} ${p.frequencyType}`,
      locationMap.get(p.locationId) || 'Chưa gán',
      p.nextDue,
      p.active ? 'Đang kích hoạt' : 'Tạm dừng',
    ]),
    [],
    [3]
  );

  // 6. Thiết bị & Tài sản
  addStyledSheet(
    'Thiết bị',
    'Hồ sơ Thiết bị & Tài sản Kỹ thuật',
    ['Mã thiết bị', 'Tên thiết bị', 'Phân loại', 'Vị trí', 'Trạng thái', 'Ngày mua / đưa vào SD', 'Ghi chú thông số'],
    equipmentList.map((e) => [
      e.code,
      e.name,
      e.category,
      locationMap.get(e.locationId) || 'Chưa gán',
      e.status,
      e.purchaseDate ? formatDate(e.purchaseDate) : '-',
      e.notes || '-',
    ]),
    [],
    [5]
  );


  // 7. Hệ thống điện
  addStyledSheet(
    'Hệ thống điện',
    'Danh mục Thiết bị Điện & Công tơ',
    ['Mã thiết bị', 'Tên thiết bị', 'Phân loại', 'Vị trí', 'Pha', 'Công suất / Định mức', 'Tình trạng'],
    electricalAssets.map((ea) => [
      ea.code,
      ea.name,
      ea.type,
      locationMap.get(ea.locationId) || 'Chưa gán',
      ea.phase,
      ea.rating || '-',
      ea.status,
    ])
  );

  // 8. Chỉ số công tơ
  addStyledSheet(
    'Chỉ số điện',
    'Lịch sử Ghi Chỉ số Công tơ Điện',
    ['Thời gian ghi', 'Thiết bị / Tủ điện', 'Chỉ số (kWh)', 'Người ghi', 'Ghi chú'],
    meterReadings.map((r) => [
      r.createdAt || r.date,
      r.assetName || r.assetCode || r.assetId,
      r.value,
      r.recordedByName || r.recordedBy,
      r.note || '-',
    ]),
    [],
    [0]
  );

  // 9. Vị trí khu vực
  addStyledSheet(
    'Vị trí khu vực',
    'Danh mục Khu vực & Vị trí Tòa nhà',
    ['Tên khu vực / Vị trí', 'Mô tả chi tiết', 'Ngày tạo'],
    locations.map((l) => [l.name, l.description || '-', formatDate(l.createdAt)]),
    [],
    [2]
  );


  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const dateStr = new Date().toISOString().split('T')[0];
  await downloadOrShareFile(
    blob,
    `Sao_luu_toan_bo_du_lieu_${dateStr}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Sao lưu dữ liệu hệ thống'
  );
}
