import React, { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  FileSpreadsheet,
  Download,
  Calendar,
  Filter,
  Search,
  Lock,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  Wrench,
  DollarSign,
  Package,
  CalendarCheck,
  Zap,
  Info,
  Printer,
  Database,
  Cpu,
  CloudUpload,
  ExternalLink,
} from 'lucide-react';
import {
  WorkOrder,
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
  WorkOrderMaterial,
  CompanySettings,
  getWorkOrderOrigin,
  getWorkOrderAssigneeDisplay,
  isWorkOrderAssignedTo,
  WorkOrderRequestOrigin,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { formatVND, formatDate, formatDateTime } from '../../utils/formatters';
import {
  exportToExcel,
  exportToPdf,
  generateReportPdfBlob,
  exportFullBackupExcel,
} from '../../utils/exportUtils';
import { uploadReportToDrive } from '../../services/googleDriveService';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db, reportDatabaseError } from '../../services/firebase';

interface ReportsViewProps {
  workOrders: WorkOrder[];
  costEntries: CostEntry[];
  inventoryItems: InventoryItem[];
  inventoryTransactions: InventoryTransaction[];
  maintenancePlans: MaintenancePlan[];
  maintenanceLogs: MaintenanceLog[];
  equipmentList?: EquipmentItem[];
  electricalAssets: ElectricalAsset[];
  meterReadings: MeterReading[];
  electricalChecks: ElectricalCheck[];
  locations: LocationItem[];
  technicians: UserProfile[];
  workOrderMaterials?: WorkOrderMaterial[];
  onSuccessToast: (msg: string) => void;
  onError: (msg: string) => void;
}

type ReportType = 'workorders' | 'costs' | 'inventory' | 'maintenance' | 'electrical' | 'equipment';

export const ReportsView: React.FC<ReportsViewProps> = ({
  workOrders,
  costEntries,
  inventoryItems,
  inventoryTransactions,
  maintenancePlans,
  maintenanceLogs,
  equipmentList = [],
  electricalAssets,
  meterReadings,
  electricalChecks,
  locations,
  technicians,
  workOrderMaterials = [],
  onSuccessToast,
  onError,
}) => {
  const { isAdmin } = useAuth();

  const [activeReport, setActiveReport] = useState<ReportType>('workorders');
  const [datePreset, setDatePreset] = useState<'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all'>('this_month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('all');
  const [selectedOrigin, setSelectedOrigin] = useState<'all' | WorkOrderRequestOrigin>('all');
  const [selectedTechId, setSelectedTechId] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingBackup, setIsExportingBackup] = useState(false);

  // Google Drive state (Admin only)
  const [isSavingReportToDrive, setIsSavingReportToDrive] = useState(false);
  const [driveProgressMessage, setDriveProgressMessage] = useState('');
  const [driveProgressPercent, setDriveProgressPercent] = useState(0);
  const [driveFolderNotice, setDriveFolderNotice] = useState<string | null>(null);
  const [lastSavedDriveUrl, setLastSavedDriveUrl] = useState<string | null>(null);

  // Company Profile loaded for PDF export header with realtime sync and offline resilience
  const [companyProfile, setCompanyProfile] = useState<CompanySettings | undefined>(undefined);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'systemSettings', 'companyProfile'),
      (snap) => {
        if (snap.exists()) {
          setCompanyProfile(snap.data() as CompanySettings);
        }
      },
      (err) => {
        reportDatabaseError(err, 'Tải hồ sơ doanh nghiệp (Reports)');
      }
    );
    return () => unsub();
  }, []);

  // Set date ranges according to preset
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const toStr = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    if (datePreset === 'this_month') {
      setStartDate(toStr(new Date(year, month, 1)));
      setEndDate(toStr(new Date(year, month + 1, 0)));
    } else if (datePreset === 'last_month') {
      setStartDate(toStr(new Date(year, month - 1, 1)));
      setEndDate(toStr(new Date(year, month, 0)));
    } else if (datePreset === 'this_quarter') {
      const q = Math.floor(month / 3);
      setStartDate(toStr(new Date(year, q * 3, 1)));
      setEndDate(toStr(new Date(year, (q + 1) * 3, 0)));
    } else if (datePreset === 'this_year') {
      setStartDate(toStr(new Date(year, 0, 1)));
      setEndDate(toStr(new Date(year, 11, 31)));
    } else if (datePreset === 'all') {
      setStartDate('2020-01-01');
      setEndDate('2030-12-31');
    }
  }, [datePreset]);

  // Maps
  const locationMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);
  const materialsByOrder = useMemo(() => {
    const map = new Map<string, number>();
    workOrderMaterials.forEach((m) => {
      const cur = map.get(m.workOrderId) || 0;
      map.set(m.workOrderId, cur + m.qty * m.unitCost);
    });
    return map;
  }, [workOrderMaterials]);

  // ==========================================
  // 1. WORK ORDERS REPORT
  // ==========================================
  const filteredWorkOrders = useMemo(() => {
    const filtered = workOrders.filter((wo) => {
      const date = (wo.completedAt || wo.createdAt).split('T')[0];
      if (startDate && date < startDate) return false;
      if (endDate && date > endDate) return false;
      if (selectedLocationId !== 'all' && wo.locationId !== selectedLocationId) return false;

      // Filter by origin
      const origin = getWorkOrderOrigin(wo);
      if (selectedOrigin !== 'all' && origin !== selectedOrigin) return false;

      // Filter by assignee
      if (selectedTechId !== 'all') {
        if (selectedTechId === 'multiple') {
          if (wo.assigneeType !== 'multiple') return false;
        } else if (selectedTechId === 'team') {
          if (wo.assigneeType !== 'team') return false;
        } else {
          if (!isWorkOrderAssignedTo(wo, selectedTechId)) return false;
        }
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const store = (wo.requestingStoreName || '').toLowerCase();
        const assigneeDisp = getWorkOrderAssigneeDisplay(wo, technicians).toLowerCase();
        return (
          wo.code.toLowerCase().includes(q) ||
          wo.title.toLowerCase().includes(q) ||
          assigneeDisp.includes(q) ||
          store.includes(q) ||
          origin.toLowerCase().includes(q)
        );
      }
      return true;
    });
    return filtered;
  }, [workOrders, startDate, endDate, selectedLocationId, selectedOrigin, selectedTechId, searchTerm, technicians]);

  const workOrdersData = useMemo(() => {
    const filtered = filteredWorkOrders;

    const headers = [
      'Mã CV',
      'Tiêu đề công việc',
      'Nguồn yêu cầu',
      'Cửa hàng yêu cầu',
      'Độ ưu tiên',
      'Trạng thái',
      'Vị trí',
      'Người phụ trách',
      'Người yêu cầu',
      'Ngày tạo',
      'Ngày hoàn thành',
      'Tổng chi phí (VNĐ)',
    ];

    let totalCostSum = 0;
    const rows = filtered.map((wo) => {
      const mat = materialsByOrder.get(wo.id) || 0;
      const labor = wo.laborCost || 0;
      const ext = wo.externalCost || 0;
      const totalCost = mat + labor + ext;
      totalCostSum += totalCost;

      const loc = locationMap.get(wo.locationId);
      const priorityLabel =
        wo.priority === 'khan_cap'
          ? 'Khẩn cấp'
          : wo.priority === 'cao'
          ? 'Cao'
          : wo.priority === 'trung_binh'
          ? 'Trung bình'
          : 'Thấp';

      const origin = getWorkOrderOrigin(wo);
      const storeDisplay = wo.requestingStoreName || (origin === 'Cửa hàng yêu cầu' && loc?.name ? loc.name : '-');
      const assigneeDisplay = getWorkOrderAssigneeDisplay(wo, technicians);

      return [
        wo.code,
        wo.title,
        origin,
        storeDisplay,
        priorityLabel,
        wo.status,
        loc?.name || 'Chưa gán',
        assigneeDisplay,
        wo.requesterName || '-',
        formatDate(wo.createdAt),
        wo.completedAt ? formatDate(wo.completedAt) : '-',
        totalCost > 0 ? formatVND(totalCost) : '0 ₫',
      ];
    });

    const summaryRow = [
      'TỔNG CỘNG',
      `${filtered.length} công việc`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'TỔNG CHI PHÍ:',
      formatVND(totalCostSum),
    ];

    return {
      headers,
      rows,
      summaryRow,
      count: filtered.length,
      totalCost: totalCostSum,
      currencyColIndices: [11],
      dateColIndices: [9, 10],
    };
  }, [filteredWorkOrders, locationMap, materialsByOrder, technicians]);

  // Monthly breakdowns: 1. By Origin, 2. By Store, 3. By Assignee (Strict 1 bucket per work order, no double counting!)
  const workOrderBreakdowns = useMemo(() => {
    // 1. By Origin
    const originMap = new Map<string, { count: number; cost: number }>();
    ['Cửa hàng yêu cầu', 'KTV tự tạo', 'Chưa phân loại'].forEach((k) => {
      originMap.set(k, { count: 0, cost: 0 });
    });

    // 2. By Store
    const storeMap = new Map<string, { count: number; cost: number }>();

    // 3. By Assignee
    const assigneeMap = new Map<string, { count: number; cost: number }>();
    technicians.forEach((t) => {
      assigneeMap.set(t.displayName, { count: 0, cost: 0 });
    });
    assigneeMap.set('Nhiều người', { count: 0, cost: 0 });
    assigneeMap.set('Phòng kỹ thuật', { count: 0, cost: 0 });
    assigneeMap.set('Chưa phân công', { count: 0, cost: 0 });

    let grandTotalCost = 0;

    filteredWorkOrders.forEach((wo) => {
      const mat = materialsByOrder.get(wo.id) || 0;
      const labor = wo.laborCost || 0;
      const ext = wo.externalCost || 0;
      const total = mat + labor + ext;
      grandTotalCost += total;

      // Origin
      const origin = getWorkOrderOrigin(wo);
      const o = originMap.get(origin) || { count: 0, cost: 0 };
      originMap.set(origin, { count: o.count + 1, cost: o.cost + total });

      // Store
      const loc = locationMap.get(wo.locationId);
      const storeName =
        wo.requestingStoreName ||
        (origin === 'Cửa hàng yêu cầu' && loc?.name ? loc.name : loc?.name || 'Vị trí khác / Chưa gán');
      const s = storeMap.get(storeName) || { count: 0, cost: 0 };
      storeMap.set(storeName, { count: s.count + 1, cost: s.cost + total });

      // Assignee (Exactly 1 bucket per work order - NEVER multiply or duplicate count/cost)
      let assigneeBucket = 'Chưa phân công';
      if (wo.assigneeType === 'team') {
        assigneeBucket = 'Phòng kỹ thuật';
      } else if (wo.assigneeType === 'multiple') {
        assigneeBucket = 'Nhiều người';
      } else if (wo.assigneeType === 'single' || wo.assigneeId) {
        const tech = technicians.find((t) => t.uid === (wo.assigneeIds?.[0] || wo.assigneeId));
        assigneeBucket = tech?.displayName || wo.assigneeName || 'Kỹ thuật viên';
      }
      const a = assigneeMap.get(assigneeBucket) || { count: 0, cost: 0 };
      assigneeMap.set(assigneeBucket, { count: a.count + 1, cost: a.cost + total });
    });

    const totalOrders = filteredWorkOrders.length;

    return {
      totalOrders,
      grandTotalCost,
      originList: Array.from(originMap.entries()).map(([name, data]) => ({
        name,
        count: data.count,
        percent: totalOrders > 0 ? (data.count / totalOrders) * 100 : 0,
        cost: data.cost,
      })),
      storeList: Array.from(storeMap.entries())
        .filter(([_, d]) => d.count > 0)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, data]) => ({
          name,
          count: data.count,
          percent: totalOrders > 0 ? (data.count / totalOrders) * 100 : 0,
          cost: data.cost,
        })),
      assigneeList: Array.from(assigneeMap.entries())
        .filter(([_, d]) => d.count > 0)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([name, data]) => ({
          name,
          count: data.count,
          percent: totalOrders > 0 ? (data.count / totalOrders) * 100 : 0,
          cost: data.cost,
        })),
    };
  }, [filteredWorkOrders, materialsByOrder, locationMap, technicians]);

  // ==========================================
  // 2. COSTS REPORT
  // ==========================================
  const costsData = useMemo(() => {
    const list: {
      date: string;
      title: string;
      category: string;
      equipment: string;
      amount: number;
    }[] = [];

    // From completed work orders
    workOrders.forEach((wo) => {
      const date = (wo.completedAt || wo.createdAt).split('T')[0];
      if (startDate && date < startDate) return;
      if (endDate && date > endDate) return;
      if (selectedLocationId !== 'all' && wo.locationId !== selectedLocationId) return;

      const mat = materialsByOrder.get(wo.id) || 0;
      const labor = wo.laborCost || 0;
      const ext = wo.externalCost || 0;
      const total = mat + labor + ext;

      if (total > 0) {
        list.push({
          date,
          title: `[${wo.code}] ${wo.title}`,
          category: wo.orderType === 'maintenance' ? 'Bảo dưỡng định kỳ' : 'Sửa chữa sự cố',
          equipment: wo.equipmentId || wo.electricalAssetId ? 'Thiết bị' : 'Chung tòa nhà',
          amount: total,
        });
      }
    });

    // From costEntries
    costEntries.forEach((c) => {
      if (startDate && c.date < startDate) return;
      if (endDate && c.date > endDate) return;

      const catLabel =
        c.category === 'vat_tu'
          ? 'Vật tư kho'
          : c.category === 'nhan_cong'
          ? 'Nhân công'
          : c.category === 'thue_ngoai'
          ? 'Thuê ngoài'
          : c.category === 'dien_nuoc'
          ? 'Điện nước'
          : 'Chi phí khác';

      list.push({
        date: c.date,
        title: c.description,
        category: catLabel,
        equipment: c.equipmentId ? 'Thiết bị' : 'Phát sinh chung',
        amount: c.amount,
      });
    });

    list.sort((a, b) => b.date.localeCompare(a.date));

    const headers = ['Ngày phát sinh', 'Nội dung chi phí', 'Phân loại', 'Hạng mục / Thiết bị', 'Số tiền (VNĐ)'];
    let grandTotal = 0;

    const rows = list.map((item) => {
      grandTotal += item.amount;
      return [
        formatDate(item.date),
        item.title,
        item.category,
        item.equipment,
        formatVND(item.amount),
      ];
    });

    const summaryRow = ['TỔNG CỘNG', `${list.length} khoản chi phí`, '', 'TỔNG CHI PHÍ KỲ NÀY:', formatVND(grandTotal)];

    return {
      headers,
      rows,
      summaryRow,
      count: list.length,
      grandTotal,
      currencyColIndices: [4],
      dateColIndices: [0],
    };
  }, [workOrders, costEntries, startDate, endDate, selectedLocationId, materialsByOrder]);

  // ==========================================
  // 3. INVENTORY REPORT
  // ==========================================
  const inventoryData = useMemo(() => {
    const headers = [
      'Mã SKU',
      'Tên vật tư',
      'Phân loại',
      'ĐVT',
      'Tồn kho',
      'Tồn an toàn',
      'Cảnh báo kho',
      'Đơn giá (VNĐ)',
      'Giá trị tồn kho (VNĐ)',
      'Nhập trong kỳ',
      'Xuất trong kỳ',
    ];

    let totalStockValue = 0;
    let totalLowStockCount = 0;

    const rows = inventoryItems.map((item) => {
      const isLow = item.qty <= item.minQty;
      if (isLow) totalLowStockCount += 1;
      const stockVal = item.qty * item.unitCost;
      totalStockValue += stockVal;

      // Calculate transactions in period
      const inQty = inventoryTransactions
        .filter((t) => t.itemId === item.id && t.type === 'in' && t.createdAt.split('T')[0] >= (startDate || '2000-01-01') && t.createdAt.split('T')[0] <= (endDate || '2099-12-31'))
        .reduce((acc, t) => acc + t.qty, 0);

      const outQty = inventoryTransactions
        .filter((t) => t.itemId === item.id && t.type === 'out' && t.createdAt.split('T')[0] >= (startDate || '2000-01-01') && t.createdAt.split('T')[0] <= (endDate || '2099-12-31'))
        .reduce((acc, t) => acc + t.qty, 0);

      return [
        item.sku,
        item.name,
        item.category,
        item.unit,
        item.qty,
        item.minQty,
        isLow ? 'SẮP HẾT' : 'An toàn',
        formatVND(item.unitCost),
        formatVND(stockVal),
        `${inQty} ${item.unit}`,
        `${outQty} ${item.unit}`,
      ];
    });

    const summaryRow = [
      'TỔNG CỘNG',
      `${inventoryItems.length} mặt hàng`,
      '',
      '',
      '',
      '',
      `Cảnh báo: ${totalLowStockCount} mã`,
      'TỔNG GIÁ TRỊ TỒN KHO:',
      formatVND(totalStockValue),
      '',
      '',
    ];

    return {
      headers,
      rows,
      summaryRow,
      count: inventoryItems.length,
      totalStockValue,
      totalLowStockCount,
      currencyColIndices: [7, 8],
      dateColIndices: [],
    };
  }, [inventoryItems, inventoryTransactions, startDate, endDate]);

  // ==========================================
  // 4. MAINTENANCE REPORT
  // ==========================================
  const maintenanceData = useMemo(() => {
    const headers = [
      'Kế hoạch bảo dưỡng',
      'Chu kỳ',
      'Vị trí',
      'Hạn kế tiếp',
      'Trạng thái kế hoạch',
      'Số lần đã làm',
      'Tỷ lệ đúng hạn (%)',
      'Kiểm tra gần nhất',
    ];

    let totalDoneCount = 0;

    const rows = maintenancePlans.map((p) => {
      const logs = maintenanceLogs.filter((l) => l.planId === p.id);
      totalDoneCount += logs.length;
      const lastLog = logs[0];
      const loc = locationMap.get(p.locationId);

      const onTimeRatio = logs.length > 0 ? 100 : 0;

      return [
        p.title,
        `${p.frequencyValue} ${p.frequencyType}`,
        loc?.name || 'Chưa gán',
        formatDate(p.nextDue),
        p.active ? 'Đang thực hiện' : 'Tạm dừng',
        `${logs.length} lượt`,
        `${onTimeRatio}%`,
        lastLog ? `${formatDate(lastLog.doneAt)} (${lastLog.result === 'dat' ? 'Đạt' : 'Cần theo dõi'})` : 'Chưa thực hiện',
      ];
    });

    const summaryRow = [
      'TỔNG HỢP',
      `${maintenancePlans.length} kế hoạch`,
      '',
      '',
      '',
      `Tổng lượt làm: ${totalDoneCount}`,
      'ĐÚNG HẠN: 100%',
      '',
    ];

    return {
      headers,
      rows,
      summaryRow,
      count: maintenancePlans.length,
      totalDoneCount,
      currencyColIndices: [],
      dateColIndices: [3],
    };
  }, [maintenancePlans, maintenanceLogs, locationMap]);

  // ==========================================
  // 5. ELECTRICAL SYSTEM REPORT
  // ==========================================
  const electricalData = useMemo(() => {
    const headers = [
      'Mã thiết bị',
      'Tên thiết bị điện',
      'Phân loại',
      'Vị trí',
      'Định mức / Pha',
      'Tình trạng an toàn',
      'Kiểm tra gần nhất',
      'Chỉ số công tơ gần nhất',
      'Tổng kiểm tra an toàn',
    ];

    let needCheckCount = 0;

    const rows = electricalAssets.map((ea) => {
      if (ea.status !== 'hoat_dong') needCheckCount += 1;
      const loc = locationMap.get(ea.locationId);
      const readings = meterReadings.filter((r) => r.assetId === ea.id);
      const latestReading = readings[0];
      const checks = electricalChecks.filter((c) => c.assetId === ea.id);

      return [
        ea.code,
        ea.name,
        ea.type === 'tu_dien' ? 'Tủ điện' : ea.type === 'cong_to' ? 'Công tơ' : ea.type === 'aptomat' ? 'Aptomat' : 'Khác',
        loc?.name || 'Chưa gán',
        `${ea.rating || 'N/A'} • ${ea.phase}`,
        ea.status === 'hoat_dong' ? 'Hoạt động tốt' : 'CẦN KIỂM TRA',
        ea.lastCheckAt ? formatDate(ea.lastCheckAt) : 'Chưa kiểm tra',
        latestReading ? `${latestReading.value.toLocaleString('vi-VN')} kWh` : '-',
        `${checks.length} lượt`,
      ];
    });

    const summaryRow = [
      'TỔNG HỢP',
      `${electricalAssets.length} thiết bị`,
      '',
      '',
      '',
      `Cần kiểm tra: ${needCheckCount} thiết bị`,
      '',
      '',
      '',
    ];

    return {
      headers,
      rows,
      summaryRow,
      count: electricalAssets.length,
      needCheckCount,
      currencyColIndices: [],
      dateColIndices: [6],
    };
  }, [electricalAssets, locationMap, meterReadings, electricalChecks]);

  // ==========================================
  // 6. EQUIPMENT & ASSET REPORT (6th Report)
  // ==========================================
  const equipmentData = useMemo(() => {
    const headers = [
      'Mã thiết bị',
      'Tên thiết bị',
      'Phân loại',
      'Vị trí',
      'Tình trạng',
      'Ngày mua / đưa vào SD',
      'Ghi chú thông số',
      'Số lần bảo trì / SC',
      'Tổng chi phí SC (VNĐ)',
    ];

    let totalRepairCost = 0;

    const rows = equipmentList.map((eq) => {
      const loc = locationMap.get(eq.locationId);

      const relatedWo = workOrders.filter((w) => w.equipmentId === eq.id);
      let eqCost = 0;
      relatedWo.forEach((w) => {
        const mat = materialsByOrder.get(w.id) || 0;
        const labor = w.laborCost || 0;
        const ext = w.externalCost || 0;
        eqCost += mat + labor + ext;
      });
      totalRepairCost += eqCost;

      const statusLabel =
        eq.status === 'active'
          ? 'Đang hoạt động'
          : eq.status === 'maintenance'
          ? 'Đang bảo trì'
          : eq.status === 'broken'
          ? 'HỎNG HÓC'
          : 'Ngừng sử dụng';

      return [
        eq.code,
        eq.name,
        eq.category || 'Thiết bị kỹ thuật',
        loc?.name || 'Chưa gán',
        statusLabel,
        eq.purchaseDate ? formatDate(eq.purchaseDate) : '-',
        eq.notes || '-',
        `${relatedWo.length} lần`,
        eqCost > 0 ? formatVND(eqCost) : '0 ₫',
      ];
    });

    const summaryRow = [
      'TỔNG CỘNG',
      `${equipmentList.length} thiết bị`,
      '',
      '',
      '',
      '',
      '',
      'TỔNG CHI PHÍ SC:',
      formatVND(totalRepairCost),
    ];

    return {
      headers,
      rows,
      summaryRow,
      count: equipmentList.length,
      currencyColIndices: [8],
      dateColIndices: [5],
    };
  }, [equipmentList, locationMap, workOrders, materialsByOrder]);


  // Active Report Package selection (6 Types)
  const currentReport = useMemo(() => {
    switch (activeReport) {
      case 'workorders':
        return {
          title: 'Báo cáo Tổng hợp Quản lý Công việc & Sự cố',
          fileName: `Bao_cao_Cong_viec_${new Date().toISOString().split('T')[0]}`,
          ...workOrdersData,
        };
      case 'costs':
        return {
          title: 'Báo cáo Tổng hợp Chi phí Kỹ thuật & Bảo trì',
          fileName: `Bao_cao_Chi_phi_${new Date().toISOString().split('T')[0]}`,
          ...costsData,
        };
      case 'inventory':
        return {
          title: 'Báo cáo Tồn kho & Biến động Vật tư',
          fileName: `Bao_cao_Kho_vat_tu_${new Date().toISOString().split('T')[0]}`,
          ...inventoryData,
        };
      case 'maintenance':
        return {
          title: 'Báo cáo Kế hoạch Bảo dưỡng Định kỳ & Checklist',
          fileName: `Bao_cao_Bao_duong_${new Date().toISOString().split('T')[0]}`,
          ...maintenanceData,
        };
      case 'electrical':
        return {
          title: 'Báo cáo Hệ thống Điện, Công tơ & An toàn',
          fileName: `Bao_cao_He_thong_dien_${new Date().toISOString().split('T')[0]}`,
          ...electricalData,
        };
      case 'equipment':
        return {
          title: 'Báo cáo Hồ sơ Thiết bị & Tài sản Kỹ thuật',
          fileName: `Bao_cao_Thiet_bi_${new Date().toISOString().split('T')[0]}`,
          ...equipmentData,
        };
    }
  }, [activeReport, workOrdersData, costsData, inventoryData, maintenanceData, electricalData, equipmentData]);

  // Handle Export Excel
  const handleExportExcel = async () => {
    if (!isAdmin) {
      onError('Chỉ Quản trị viên mới được xuất báo cáo Excel.');
      return;
    }

    try {
      setIsExportingExcel(true);
      await exportToExcel({
        fileName: currentReport.fileName,
        reportTitle: currentReport.title,
        startDate,
        endDate,
        companyProfile,
        headers: currentReport.headers,
        rows: currentReport.rows,
        summaryRow: currentReport.summaryRow,
        currencyColIndices: currentReport.currencyColIndices,
        dateColIndices: currentReport.dateColIndices,
      });
      onSuccessToast(`Đã xuất file Excel: ${currentReport.fileName}.xlsx`);
    } catch (err) {
      console.error('Error exporting Excel:', err);
      onError('Không thể xuất file Excel. Vui lòng thử lại.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  // Handle Export PDF
  const handleExportPdf = async () => {
    if (!isAdmin) {
      onError('Chỉ Quản trị viên mới được xuất báo cáo PDF.');
      return;
    }

    try {
      setIsExportingPdf(true);
      await exportToPdf({
        fileName: currentReport.fileName,
        reportTitle: currentReport.title,
        startDate,
        endDate,
        companyProfile,
        headers: currentReport.headers,
        rows: currentReport.rows,
        summaryRow: currentReport.summaryRow,
        currencyColIndices: currentReport.currencyColIndices,
        dateColIndices: currentReport.dateColIndices,
      });
      onSuccessToast(`Đã xuất file PDF: ${currentReport.fileName}.pdf`);
    } catch (err) {
      console.error('Error exporting PDF:', err);
      onError('Không thể xuất file PDF. Vui lòng thử lại.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Handle Save Report to Google Drive (Admin Only)
  const handleSaveReportToDrive = async () => {
    if (!isAdmin) {
      onError('Chỉ Quản trị viên mới được lưu báo cáo vào Google Drive.');
      return;
    }

    try {
      setIsSavingReportToDrive(true);
      setDriveProgressMessage('Đang kết nối Google Drive...');
      setDriveProgressPercent(10);
      setDriveFolderNotice(null);

      const pdfBlob = await generateReportPdfBlob({
        fileName: currentReport.fileName,
        reportTitle: currentReport.title,
        startDate,
        endDate,
        companyProfile,
        headers: currentReport.headers,
        rows: currentReport.rows,
        summaryRow: currentReport.summaryRow,
        currencyColIndices: currentReport.currencyColIndices,
        dateColIndices: currentReport.dateColIndices,
      });

      const result = await uploadReportToDrive({
        reportTitle: currentReport.title,
        fileName: currentReport.fileName,
        pdfBlob,
        onProgress: (msg, percent) => {
          setDriveProgressMessage(msg);
          setDriveProgressPercent(percent);
        },
        onFolderRecreated: (msg) => {
          setDriveFolderNotice(msg);
        },
      });

      setLastSavedDriveUrl(result.folderUrl);
      onSuccessToast(`Đã lưu tệp báo cáo "${currentReport.fileName}.pdf" vào Google Drive!`);
    } catch (err: any) {
      console.error('Error saving report to Google Drive:', err);
      onError(err.message || 'Lỗi khi lưu báo cáo vào Google Drive');
    } finally {
      setIsSavingReportToDrive(false);
    }
  };

  // Handle Export Full Backup Excel
  const handleExportFullBackup = async () => {
    if (!isAdmin) {
      onError('Chỉ Quản trị viên mới được xuất sao lưu toàn bộ dữ liệu.');
      return;
    }

    try {
      setIsExportingBackup(true);
      await exportFullBackupExcel({
        companyProfile,
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
        workOrderMaterials,
      });
      onSuccessToast('Đã xuất file sao lưu toàn bộ dữ liệu hệ thống (.xlsx)');
    } catch (err) {
      console.error('Error exporting full backup:', err);
      onError('Không thể xuất sao lưu dữ liệu. Vui lòng thử lại.');
    } finally {
      setIsExportingBackup(false);
    }
  };

  // Handle Print A4
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 print-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-600 text-white rounded-2xl shadow-sm">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Báo cáo & Xuất file Dữ liệu
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Định dạng chuẩn tiếng Việt (Be Vietnam Pro TTF), Excel định dạng ô, và sao lưu toàn bộ hệ thống
              </p>
            </div>
          </div>
        </div>

        {/* Export Buttons: Enabled for Admin, Disabled with tooltip for Viewer/Tech */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Print A4 Button */}
          <button
            onClick={handlePrint}
            className="min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 active:scale-95 text-white touch-manipulation cursor-pointer"
            title="In khổ giấy A4 hoặc Lưu thành PDF từ trình duyệt"
          >
            <Printer className="w-4 h-4" />
            <span>In A4</span>
          </button>

          {/* Full Backup Excel Button */}
          <button
            onClick={handleExportFullBackup}
            disabled={!isAdmin || isExportingBackup}
            className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 touch-manipulation cursor-pointer ${
              isAdmin
                ? 'bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
            title="Sao lưu toàn bộ dữ liệu 9 danh mục sang file Excel (.xlsx)"
          >
            <Database className="w-4 h-4" />
            <span>{isExportingBackup ? 'Đang xuất...' : 'Sao lưu toàn bộ (.xlsx)'}</span>
            {!isAdmin && <Lock className="w-3.5 h-3.5 text-slate-400" />}
          </button>

          {/* Export Excel Button */}
          <div className="relative group">
            <button
              onClick={handleExportExcel}
              disabled={!isAdmin || isExportingExcel}
              className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 touch-manipulation cursor-pointer ${
                isAdmin
                  ? 'bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isExportingExcel ? 'Đang xuất...' : 'Xuất Excel'}</span>
              {!isAdmin && <Lock className="w-3.5 h-3.5 text-slate-400" />}
            </button>
            {!isAdmin && (
              <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block z-20 w-48 p-2 bg-slate-900 text-white text-[11px] rounded-xl shadow-lg text-center">
                Chỉ Quản trị viên được xuất báo cáo
              </div>
            )}
          </div>

          {/* Export PDF Button */}
          <div className="relative group">
            <button
              onClick={handleExportPdf}
              disabled={!isAdmin || isExportingPdf}
              className={`min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 touch-manipulation cursor-pointer ${
                isAdmin
                  ? 'bg-rose-600 hover:bg-rose-700 active:scale-95 text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Download className="w-4 h-4" />
              <span>{isExportingPdf ? 'Đang tạo...' : 'Tải PDF'}</span>
              {!isAdmin && <Lock className="w-3.5 h-3.5 text-slate-400" />}
            </button>
            {!isAdmin && (
              <div className="absolute right-0 top-full mt-1.5 hidden group-hover:block z-20 w-48 p-2 bg-slate-900 text-white text-[11px] rounded-xl shadow-lg text-center">
                Chỉ Quản trị viên được xuất báo cáo
              </div>
            )}
          </div>

          {/* Save to Google Drive Button (Admin Only) */}
          {isAdmin && (
            <div className="relative group">
              <button
                type="button"
                onClick={handleSaveReportToDrive}
                disabled={isSavingReportToDrive}
                className="min-h-[44px] px-3.5 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-2 touch-manipulation cursor-pointer bg-blue-600 hover:bg-blue-700 active:scale-95 text-white disabled:opacity-50"
                title="Lưu file PDF báo cáo này vào Google Drive (KT-CSVC/Báo cáo/Năm/Tháng)"
              >
                <CloudUpload className="w-4 h-4" />
                <span>
                  {isSavingReportToDrive ? `${driveProgressPercent}%` : 'Xuất và lưu vào Drive'}
                </span>
              </button>
            </div>
          )}

          {/* Direct link to Google Drive folder if saved */}
          {isAdmin && lastSavedDriveUrl && (
            <a
              href={lastSavedDriveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[44px] px-3 py-2.5 rounded-xl text-xs font-bold shadow-xs transition-all flex items-center justify-center gap-1.5 touch-manipulation cursor-pointer bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200"
              title="Mở thư mục Báo cáo trên Google Drive"
            >
              <span>Thư mục Drive</span>
              <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
            </a>
          )}
        </div>
      </div>

      {/* 6 Report Types Tabs */}
      <div className="flex border-b border-slate-200 text-xs font-bold overflow-x-auto gap-1 sm:gap-2">
        <button
          onClick={() => setActiveReport('workorders')}
          className={`pb-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeReport === 'workorders'
              ? 'border-blue-600 text-blue-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>1. Báo cáo Công việc</span>
        </button>

        <button
          onClick={() => setActiveReport('costs')}
          className={`pb-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeReport === 'costs'
              ? 'border-blue-600 text-blue-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          <span>2. Báo cáo Chi phí</span>
        </button>

        <button
          onClick={() => setActiveReport('inventory')}
          className={`pb-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeReport === 'inventory'
              ? 'border-blue-600 text-blue-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>3. Báo cáo Kho vật tư</span>
        </button>

        <button
          onClick={() => setActiveReport('maintenance')}
          className={`pb-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeReport === 'maintenance'
              ? 'border-blue-600 text-blue-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <CalendarCheck className="w-4 h-4" />
          <span>4. Bảo dưỡng định kỳ</span>
        </button>

        <button
          onClick={() => setActiveReport('electrical')}
          className={`pb-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeReport === 'electrical'
              ? 'border-blue-600 text-blue-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Zap className="w-4 h-4" />
          <span>5. Hệ thống điện</span>
        </button>

        <button
          onClick={() => setActiveReport('equipment')}
          className={`pb-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
            activeReport === 'equipment'
              ? 'border-blue-600 text-blue-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>6. Hồ sơ Thiết bị ({equipmentList.length})</span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3 text-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-600 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-blue-600" />
              <span>Khoảng thời gian:</span>
            </span>

            <select
              value={datePreset}
              onChange={(e) => setDatePreset(e.target.value as any)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-semibold focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="this_month">Tháng này</option>
              <option value="last_month">Tháng trước</option>
              <option value="this_quarter">Quý này</option>
              <option value="this_year">Năm nay</option>
              <option value="all">Toàn bộ thời gian</option>
            </select>

            <div className="flex items-center gap-1">
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setDatePreset('all');
                }}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-mono"
              />
              <span className="text-slate-400">đến</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setDatePreset('all');
                }}
                className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {locations.length > 0 && (
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                <option value="all">Tất cả vị trí / khu vực</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            )}

            {activeReport === 'workorders' && (
              <>
                <select
                  value={selectedOrigin}
                  onChange={(e) => setSelectedOrigin(e.target.value as any)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="all">Tất cả nguồn yêu cầu</option>
                  <option value="Cửa hàng yêu cầu">Cửa hàng yêu cầu</option>
                  <option value="KTV tự tạo">KTV tự tạo</option>
                  <option value="Chưa phân loại">Chưa phân loại</option>
                </select>

                <select
                  value={selectedTechId}
                  onChange={(e) => setSelectedTechId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  <option value="all">Tất cả người phụ trách</option>
                  <option value="multiple">Nhiều người</option>
                  <option value="team">Phòng kỹ thuật</option>
                  {technicians.map((t) => (
                    <option key={t.uid} value={t.uid}>
                      {t.displayName}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>

        {/* Company Header Notice in Preview */}
        {companyProfile?.companyName && (
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Tiêu đề doanh nghiệp trên PDF: <strong>{companyProfile.companyName}</strong></span>
            </span>
            <span>{companyProfile.phone ? `Hotline: ${companyProfile.phone}` : ''}</span>
          </div>
        )}
      </div>

      {/* Work Orders Monthly Aggregated Breakdown Cards (Origin, Store, Assignee) */}
      {activeReport === 'workorders' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Table 1: Summary by Request Origin */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  <span>1. Theo nguồn yêu cầu</span>
                </span>
                <span className="text-[11px] font-mono text-slate-500 font-bold">
                  {workOrderBreakdowns.totalOrders} việc
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-400 font-bold uppercase border-b border-slate-100">
                      <th className="pb-1.5">Nguồn</th>
                      <th className="pb-1.5 text-right">Số việc</th>
                      <th className="pb-1.5 text-right">Tỉ lệ</th>
                      <th className="pb-1.5 text-right">Chi phí</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {workOrderBreakdowns.originList.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="py-1.5 font-medium text-slate-700">{item.name}</td>
                        <td className="py-1.5 text-right font-bold text-slate-800">{item.count}</td>
                        <td className="py-1.5 text-right text-slate-500 text-[11px] font-mono">
                          {item.percent.toFixed(0)}%
                        </td>
                        <td className="py-1.5 text-right font-mono text-slate-700">
                          {item.cost > 0 ? formatVND(item.cost) : '0 ₫'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 2: Summary by Store */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>2. Theo cửa hàng yêu cầu</span>
                </span>
                <span className="text-[11px] font-mono text-slate-500 font-bold">
                  {workOrderBreakdowns.storeList.length} vị trí
                </span>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-400 font-bold uppercase border-b border-slate-100">
                      <th className="pb-1.5">Cửa hàng</th>
                      <th className="pb-1.5 text-right">Số việc</th>
                      <th className="pb-1.5 text-right">Tỉ lệ</th>
                      <th className="pb-1.5 text-right">Chi phí</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {workOrderBreakdowns.storeList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-3 text-center text-slate-400 text-[11px]">
                          Không có dữ liệu
                        </td>
                      </tr>
                    ) : (
                      workOrderBreakdowns.storeList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-1.5 font-medium text-slate-700 truncate max-w-[120px]" title={item.name}>
                            {item.name}
                          </td>
                          <td className="py-1.5 text-right font-bold text-slate-800">{item.count}</td>
                          <td className="py-1.5 text-right text-slate-500 text-[11px] font-mono">
                            {item.percent.toFixed(0)}%
                          </td>
                          <td className="py-1.5 text-right font-mono text-slate-700">
                            {item.cost > 0 ? formatVND(item.cost) : '0 ₫'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table 3: Summary by Assignee (Single bucket, no double counting!) */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                  <span>3. Theo người phụ trách</span>
                </span>
                <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full font-bold">
                  Không tính trùng
                </span>
              </div>
              <div className="overflow-x-auto max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-400 font-bold uppercase border-b border-slate-100">
                      <th className="pb-1.5">Người / Nhóm</th>
                      <th className="pb-1.5 text-right">Số việc</th>
                      <th className="pb-1.5 text-right">Tỉ lệ</th>
                      <th className="pb-1.5 text-right">Chi phí</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {workOrderBreakdowns.assigneeList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-3 text-center text-slate-400 text-[11px]">
                          Không có dữ liệu
                        </td>
                      </tr>
                    ) : (
                      workOrderBreakdowns.assigneeList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-1.5 font-medium text-slate-700">{item.name}</td>
                          <td className="py-1.5 text-right font-bold text-slate-800">{item.count}</td>
                          <td className="py-1.5 text-right text-slate-500 text-[11px] font-mono">
                            {item.percent.toFixed(0)}%
                          </td>
                          <td className="py-1.5 text-right font-mono text-slate-700">
                            {item.cost > 0 ? formatVND(item.cost) : '0 ₫'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Explanatory Note Banner */}
          <div className="px-3.5 py-2.5 bg-blue-50/70 border border-blue-100 rounded-xl flex items-start gap-2 text-xs text-blue-900">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Lưu ý về cách tính báo cáo:</strong> Công việc giao cho nhiều kỹ thuật viên hoặc cả phòng kỹ thuật được thống kê thành dòng riêng (<em>&quot;Nhiều người&quot;</em> / <em>&quot;Phòng kỹ thuật&quot;</em>), không nhân đôi số lượng công việc hay chi phí cho từng cá nhân để đảm bảo tổng số việc và chi phí luôn khớp chính xác.
            </p>
          </div>
        </div>
      )}

      {/* LIVE PREVIEW CONTAINER */}
      <div className="border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-xs">
        {/* Preview Title Banner */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-900">{currentReport.title}</h3>
            <p className="text-xs text-slate-500">
              Khoảng thời gian: <strong>{formatDate(startDate)}</strong> đến <strong>{formatDate(endDate)}</strong> • Tổng số: <strong>{currentReport.rows.length}</strong> dòng
            </p>
          </div>

          <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
            {currentReport.rows.length} bản ghi
          </span>
        </div>

        {/* Mobile Swipe Guidance Banner */}
        <div className="md:hidden flex items-center justify-between px-4 py-2 bg-blue-50/70 border-b border-blue-100 text-[11px] text-blue-700 font-medium">
          <span>Vuốt ngang bảng để xem tất cả cột</span>
          <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">Cuộn ⇄</span>
        </div>

        {/* PRINT ONLY: Standard A4 Header with Company Details */}
        <div className="hidden print:block p-6 mb-4 text-slate-900 border-b border-slate-300">
          <div className="flex justify-between items-start mb-4">
            <div>
              <div className="text-base font-bold uppercase tracking-wider">{companyProfile?.companyName || 'CÔNG TY QUẢN LÝ KỸ THUẬT & CSVC'}</div>
              <div className="text-xs text-slate-600">{companyProfile?.address || 'Địa chỉ: Tòa nhà Văn phòng & Khu phức hợp'}</div>
              {companyProfile?.phone && <div className="text-xs text-slate-600">Hotline: {companyProfile.phone}</div>}
              {companyProfile?.taxCode && <div className="text-xs text-slate-600">Mã số thuế: {companyProfile.taxCode}</div>}
            </div>
            <div className="text-right text-xs text-slate-500">
              <div>Ngày in: {formatDate(new Date())}</div>
              <div>Giờ in: {formatDateTime(new Date())}</div>
            </div>
          </div>
          <div className="text-center my-3">
            <h2 className="text-lg font-black uppercase tracking-tight">{currentReport.title}</h2>
            <p className="text-xs italic text-slate-600 mt-1">
              Thời gian: {formatDate(startDate)} đến {formatDate(endDate)}
            </p>
          </div>
        </div>

        {/* Table Content */}
        {currentReport.rows.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <FileText className="w-8 h-8 mx-auto text-slate-300" />
            <p>Không có dữ liệu nào phù hợp với bộ lọc thời gian và tiêu chí đã chọn.</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/80 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  {currentReport.headers.map((h, idx) => (
                    <th key={idx} className="py-3 px-4 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {currentReport.rows.map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-blue-50/30 transition-colors">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="py-2.5 px-4 font-medium text-slate-800 whitespace-nowrap">
                        {String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {currentReport.summaryRow && (
                <tfoot className="bg-slate-50 border-t-2 border-slate-300 sticky bottom-0 z-10 font-bold text-xs text-slate-900">
                  <tr>
                    {currentReport.summaryRow.map((cell, idx) => (
                      <td key={idx} className="py-3 px-4 whitespace-nowrap">
                        {String(cell)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {/* PRINT ONLY: Signature Section */}
        <div className="hidden print:grid grid-cols-2 mt-8 p-6 text-center text-xs">
          <div>
            <div className="font-bold">Người lập báo cáo</div>
            <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký và ghi rõ họ tên)</div>
            <div className="h-16" />
          </div>
          <div>
            <div className="font-bold">Quản trị viên / Ban giám đốc</div>
            <div className="text-[10px] text-slate-500 italic mt-0.5">(Ký, đóng dấu)</div>
            <div className="h-16" />
          </div>
        </div>
      </div>

      {/* Google Drive Uploading Progress Modal */}
      {isSavingReportToDrive && (
        <div className="fixed inset-0 z-70 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0">
                <CloudUpload className="w-6 h-6 animate-bounce" />
              </div>
              <div className="min-w-0">
                <h4 className="text-sm font-black text-slate-900">Lưu vào Google Drive</h4>
                <p className="text-xs text-slate-500 truncate">{currentReport.title}</p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-slate-700">
                <span className="truncate pr-2">{driveProgressMessage || 'Đang xử lý...'}</span>
                <span className="shrink-0">{driveProgressPercent}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full transition-all duration-300"
                  style={{ width: `${driveProgressPercent}%` }}
                />
              </div>
            </div>

            {driveFolderNotice && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{driveFolderNotice}</span>
              </div>
            )}

            <p className="text-[11px] text-slate-400 text-center italic">
              Vui lòng giữ kết nối mạng trong quá trình sao lưu tài liệu lên Drive...
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
