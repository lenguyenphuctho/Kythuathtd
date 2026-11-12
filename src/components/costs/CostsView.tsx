import React, { useState, useMemo } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  Search,
  Calendar,
  BarChart3,
  PieChart as PieChartIcon,
  Edit,
  Trash2,
  Cpu,
  MapPin,
  Tag,
  ArrowUpRight,
  ArrowDownRight,
  ArrowUpDown,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  CostEntry,
  CostCategory,
  WorkOrder,
  WorkOrderMaterial,
  EquipmentItem,
  LocationItem,
} from '../../types';
import { formatCurrency, formatDateOnly } from '../../utils/formatters';
import { CostModal } from './CostModal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { deleteDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';

interface CostsViewProps {
  costEntries: CostEntry[];
  workOrders: WorkOrder[];
  workOrderMaterials?: WorkOrderMaterial[];
  equipmentList: EquipmentItem[];
  locations: LocationItem[];
  onSelectWorkOrder?: (wo: WorkOrder) => void;
  onSuccessToast: (msg: string) => void;
  onError: (msg: string) => void;
}

type SortField = 'date' | 'title' | 'category' | 'equipment' | 'amount';
type SortOrder = 'asc' | 'desc';

interface CombinedCostRow {
  id: string;
  type: 'work_order' | 'cost_entry';
  date: string;
  title: string;
  code?: string;
  category: CostCategory;
  categoryLabel: string;
  equipmentId?: string;
  equipmentName?: string;
  equipmentCode?: string;
  locationName?: string;
  amount: number;
  workOrder?: WorkOrder;
  costEntry?: CostEntry;
}

const CATEGORY_COLORS: Record<string, string> = {
  vat_tu: '#3b82f6',
  nhan_cong: '#8b5cf6',
  thue_ngoai: '#f59e0b',
  dien_nuoc: '#10b981',
  khac: '#64748b',
};

export const CostsView: React.FC<CostsViewProps> = ({
  costEntries,
  workOrders,
  workOrderMaterials = [],
  equipmentList,
  locations,
  onSelectWorkOrder,
  onSuccessToast,
  onError,
}) => {
  // Filter states
  const [periodPreset, setPeriodPreset] = useState<'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'custom'>('this_month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [selectedEquipmentId, setSelectedEquipmentId] = useState('all');
  const [selectedLocationId, setSelectedLocationId] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Sorting for details table
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<CostEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<CostEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Date range determination
  const { startDate, endDate, prevStartDate, prevEndDate } = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    let start = new Date(year, month, 1);
    let end = new Date(year, month + 1, 0);
    let pStart = new Date(year, month - 1, 1);
    let pEnd = new Date(year, month, 0);

    if (periodPreset === 'last_month') {
      start = new Date(year, month - 1, 1);
      end = new Date(year, month, 0);
      pStart = new Date(year, month - 2, 1);
      pEnd = new Date(year, month - 1, 0);
    } else if (periodPreset === 'this_quarter') {
      const q = Math.floor(month / 3);
      start = new Date(year, q * 3, 1);
      end = new Date(year, (q + 1) * 3, 0);
      pStart = new Date(year, (q - 1) * 3, 1);
      pEnd = new Date(year, q * 3, 0);
    } else if (periodPreset === 'this_year') {
      start = new Date(year, 0, 1);
      end = new Date(year, 11, 31);
      pStart = new Date(year - 1, 0, 1);
      pEnd = new Date(year - 1, 11, 31);
    } else if (periodPreset === 'custom') {
      if (customStartDate) start = new Date(customStartDate);
      if (customEndDate) {
        end = new Date(customEndDate);
        end.setHours(23, 59, 59, 999);
      }
      const diff = end.getTime() - start.getTime();
      pEnd = new Date(start.getTime() - 1);
      pStart = new Date(pEnd.getTime() - diff);
    }

    const toStr = (d: Date) => d.toISOString().split('T')[0];
    return {
      startDate: toStr(start),
      endDate: toStr(end),
      prevStartDate: toStr(pStart),
      prevEndDate: toStr(pEnd),
    };
  }, [periodPreset, customStartDate, customEndDate]);

  // Lookup maps
  const equipmentMap = useMemo(() => new Map(equipmentList.map((e) => [e.id, e])), [equipmentList]);
  const locationMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  // Materials cost grouped by workOrderId
  const materialsByOrder = useMemo(() => {
    const map = new Map<string, number>();
    workOrderMaterials.forEach((m) => {
      const current = map.get(m.workOrderId) || 0;
      map.set(m.workOrderId, current + m.qty * m.unitCost);
    });
    return map;
  }, [workOrderMaterials]);

  // Filter cost entries in current period
  const currentCostEntries = useMemo(() => {
    return costEntries.filter((item) => {
      if (item.date < startDate || item.date > endDate) return false;
      if (selectedEquipmentId !== 'all' && item.equipmentId !== selectedEquipmentId) return false;
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (selectedLocationId !== 'all') {
        const eq = item.equipmentId ? equipmentMap.get(item.equipmentId) : null;
        if (!eq || eq.locationId !== selectedLocationId) return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const descMatch = item.description.toLowerCase().includes(q);
        const eq = item.equipmentId ? equipmentMap.get(item.equipmentId) : null;
        const eqMatch = eq?.name.toLowerCase().includes(q) || eq?.code.toLowerCase().includes(q) || false;
        return descMatch || eqMatch;
      }
      return true;
    });
  }, [costEntries, startDate, endDate, selectedEquipmentId, selectedLocationId, selectedCategory, searchTerm, equipmentMap]);

  // Filter completed work orders with costs in period
  const completedWorkOrders = useMemo(() => {
    return workOrders.filter((wo) => {
      const orderDate = (wo.completedAt || wo.createdAt).split('T')[0];
      if (orderDate < startDate || orderDate > endDate) return false;
      if (selectedEquipmentId !== 'all' && wo.equipmentId !== selectedEquipmentId) return false;
      if (selectedLocationId !== 'all' && wo.locationId !== selectedLocationId) return false;

      const matCost = materialsByOrder.get(wo.id) || 0;
      const totalCost = matCost + (wo.laborCost || 0) + (wo.externalCost || 0);
      if (totalCost <= 0) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const titleMatch = wo.title.toLowerCase().includes(q);
        const codeMatch = wo.code.toLowerCase().includes(q);
        const eq = wo.equipmentId ? equipmentMap.get(wo.equipmentId) : null;
        const eqMatch = eq?.name.toLowerCase().includes(q) || eq?.code.toLowerCase().includes(q) || false;
        return titleMatch || codeMatch || eqMatch;
      }
      return true;
    });
  }, [workOrders, startDate, endDate, selectedEquipmentId, selectedLocationId, searchTerm, equipmentMap, materialsByOrder]);

  // Previous period cost entries & work orders for comparison
  const prevPeriodCostEntries = useMemo(() => {
    return costEntries.filter((item) => item.date >= prevStartDate && item.date <= prevEndDate);
  }, [costEntries, prevStartDate, prevEndDate]);

  const prevCompletedWorkOrders = useMemo(() => {
    return workOrders.filter((wo) => {
      const orderDate = (wo.completedAt || wo.createdAt).split('T')[0];
      if (orderDate < prevStartDate || orderDate > prevEndDate) return false;
      const matCost = materialsByOrder.get(wo.id) || 0;
      return matCost + (wo.laborCost || 0) + (wo.externalCost || 0) > 0;
    });
  }, [workOrders, prevStartDate, prevEndDate, materialsByOrder]);

  // Total sums
  const totalCostEntriesAmount = useMemo(
    () => currentCostEntries.reduce((acc, c) => acc + c.amount, 0),
    [currentCostEntries]
  );

  const totalWorkOrdersAmount = useMemo(
    () =>
      completedWorkOrders.reduce((acc, wo) => {
        const matCost = materialsByOrder.get(wo.id) || 0;
        return acc + matCost + (wo.laborCost || 0) + (wo.externalCost || 0);
      }, 0),
    [completedWorkOrders, materialsByOrder]
  );

  const grandTotalCost = totalCostEntriesAmount + totalWorkOrdersAmount;

  const prevGrandTotalCost = useMemo(() => {
    const cTotal = prevPeriodCostEntries.reduce((acc, c) => acc + c.amount, 0);
    const woTotal = prevCompletedWorkOrders.reduce((acc, wo) => {
      const matCost = materialsByOrder.get(wo.id) || 0;
      return acc + matCost + (wo.laborCost || 0) + (wo.externalCost || 0);
    }, 0);
    return cTotal + woTotal;
  }, [prevPeriodCostEntries, prevCompletedWorkOrders, materialsByOrder]);

  const diffPercent = useMemo(() => {
    if (prevGrandTotalCost === 0) return grandTotalCost > 0 ? 100 : 0;
    return Math.round(((grandTotalCost - prevGrandTotalCost) / prevGrandTotalCost) * 100);
  }, [grandTotalCost, prevGrandTotalCost]);

  // Categories totals
  const categoryTotals = useMemo(() => {
    let vatTu = 0;
    let nhanCong = 0;
    let thueNgoai = 0;
    let dienNuoc = 0;
    let khac = 0;

    completedWorkOrders.forEach((wo) => {
      vatTu += materialsByOrder.get(wo.id) || 0;
      nhanCong += wo.laborCost || 0;
      thueNgoai += wo.externalCost || 0;
    });

    currentCostEntries.forEach((c) => {
      if (c.category === 'vat_tu') vatTu += c.amount;
      else if (c.category === 'nhan_cong') nhanCong += c.amount;
      else if (c.category === 'thue_ngoai') thueNgoai += c.amount;
      else if (c.category === 'dien_nuoc') dienNuoc += c.amount;
      else khac += c.amount;
    });

    return { vatTu, nhanCong, thueNgoai, dienNuoc, khac };
  }, [completedWorkOrders, currentCostEntries, materialsByOrder]);

  // Data for Recharts Pie Chart
  const pieChartData = useMemo(() => {
    return [
      { name: 'Vật tư & Phụ tùng', value: categoryTotals.vatTu, key: 'vat_tu', color: CATEGORY_COLORS.vat_tu },
      { name: 'Nhân công', value: categoryTotals.nhanCong, key: 'nhan_cong', color: CATEGORY_COLORS.nhan_cong },
      { name: 'Thuê ngoài / Dịch vụ', value: categoryTotals.thueNgoai, key: 'thue_ngoai', color: CATEGORY_COLORS.thue_ngoai },
      { name: 'Điện nước & Năng lượng', value: categoryTotals.dienNuoc, key: 'dien_nuoc', color: CATEGORY_COLORS.dien_nuoc },
      { name: 'Chi phí khác', value: categoryTotals.khac, key: 'khac', color: CATEGORY_COLORS.khac },
    ].filter((item) => item.value > 0);
  }, [categoryTotals]);

  // Data for Recharts Bar Chart (6 or 12 months)
  const barChartData = useMemo(() => {
    const months: {
      name: string;
      key: string;
      'Vật tư': number;
      'Nhân công': number;
      'Thuê ngoài & Khác': number;
      total: number;
    }[] = [];

    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      months.push({
        name: `T${d.getMonth() + 1}/${d.getFullYear().toString().slice(2)}`,
        key,
        'Vật tư': 0,
        'Nhân công': 0,
        'Thuê ngoài & Khác': 0,
        total: 0,
      });
    }

    costEntries.forEach((c) => {
      const mKey = c.date.substring(0, 7);
      const target = months.find((m) => m.key === mKey);
      if (target) {
        if (c.category === 'vat_tu') target['Vật tư'] += c.amount;
        else if (c.category === 'nhan_cong') target['Nhân công'] += c.amount;
        else target['Thuê ngoài & Khác'] += c.amount;
        target.total += c.amount;
      }
    });

    workOrders.forEach((wo) => {
      const orderDate = (wo.completedAt || wo.createdAt).substring(0, 7);
      const target = months.find((m) => m.key === orderDate);
      if (target) {
        const mat = materialsByOrder.get(wo.id) || 0;
        const labor = wo.laborCost || 0;
        const ext = wo.externalCost || 0;
        target['Vật tư'] += mat;
        target['Nhân công'] += labor;
        target['Thuê ngoài & Khác'] += ext;
        target.total += mat + labor + ext;
      }
    });

    return months;
  }, [costEntries, workOrders, materialsByOrder]);

  // === TOP 5 MOST EXPENSIVE EQUIPMENT ===
  const topExpensiveEquipment = useMemo(() => {
    const eqCostMap = new Map<
      string,
      { equipment: EquipmentItem; totalCost: number; workOrderCount: number; matCost: number; serviceCost: number }
    >();

    equipmentList.forEach((eq) => {
      eqCostMap.set(eq.id, {
        equipment: eq,
        totalCost: 0,
        workOrderCount: 0,
        matCost: 0,
        serviceCost: 0,
      });
    });

    // Sum from completed work orders in period
    completedWorkOrders.forEach((wo) => {
      if (wo.equipmentId && eqCostMap.has(wo.equipmentId)) {
        const item = eqCostMap.get(wo.equipmentId)!;
        const mat = materialsByOrder.get(wo.id) || 0;
        const labor = wo.laborCost || 0;
        const ext = wo.externalCost || 0;
        const total = mat + labor + ext;

        item.totalCost += total;
        item.matCost += mat;
        item.serviceCost += labor + ext;
        item.workOrderCount += 1;
      }
    });

    // Sum from costEntries in period
    currentCostEntries.forEach((c) => {
      if (c.equipmentId && eqCostMap.has(c.equipmentId)) {
        const item = eqCostMap.get(c.equipmentId)!;
        item.totalCost += c.amount;
        if (c.category === 'vat_tu') item.matCost += c.amount;
        else item.serviceCost += c.amount;
      }
    });

    const list = Array.from(eqCostMap.values()).filter((i) => i.totalCost > 0);
    list.sort((a, b) => b.totalCost - a.totalCost);
    return list.slice(0, 5);
  }, [equipmentList, completedWorkOrders, currentCostEntries, materialsByOrder]);

  // === COMBINED SORTABLE DETAILED ROWS ===
  const combinedRows = useMemo(() => {
    const rows: CombinedCostRow[] = [];

    // From completed work orders
    completedWorkOrders.forEach((wo) => {
      const mat = materialsByOrder.get(wo.id) || 0;
      const labor = wo.laborCost || 0;
      const ext = wo.externalCost || 0;
      const total = mat + labor + ext;
      const eq = wo.equipmentId ? equipmentMap.get(wo.equipmentId) : undefined;
      const loc = wo.locationId ? locationMap.get(wo.locationId) : undefined;

      rows.push({
        id: `wo-${wo.id}`,
        type: 'work_order',
        date: (wo.completedAt || wo.createdAt).split('T')[0],
        title: wo.title,
        code: wo.code,
        category: 'thue_ngoai',
        categoryLabel: wo.orderType === 'maintenance' ? 'Bảo dưỡng định kỳ' : 'Sửa chữa sự cố',
        equipmentId: wo.equipmentId,
        equipmentName: eq?.name,
        equipmentCode: eq?.code,
        locationName: loc?.name,
        amount: total,
        workOrder: wo,
      });
    });

    // From costEntries
    currentCostEntries.forEach((c) => {
      const eq = c.equipmentId ? equipmentMap.get(c.equipmentId) : undefined;
      const loc = eq?.locationId ? locationMap.get(eq.locationId) : undefined;

      const categoryLabel =
        c.category === 'vat_tu'
          ? 'Vật tư'
          : c.category === 'nhan_cong'
          ? 'Nhân công'
          : c.category === 'thue_ngoai'
          ? 'Thuê ngoài'
          : c.category === 'dien_nuoc'
          ? 'Điện nước'
          : 'Khác';

      rows.push({
        id: `cost-${c.id}`,
        type: 'cost_entry',
        date: c.date,
        title: c.description,
        category: c.category,
        categoryLabel: `Chi phí ngoài: ${categoryLabel}`,
        equipmentId: c.equipmentId,
        equipmentName: eq?.name,
        equipmentCode: eq?.code,
        locationName: loc?.name,
        amount: c.amount,
        costEntry: c,
      });
    });

    // Sort
    rows.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'date') {
        comparison = a.date.localeCompare(b.date);
      } else if (sortField === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortField === 'category') {
        comparison = a.categoryLabel.localeCompare(b.categoryLabel);
      } else if (sortField === 'equipment') {
        comparison = (a.equipmentName || '').localeCompare(b.equipmentName || '');
      } else if (sortField === 'amount') {
        comparison = a.amount - b.amount;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return rows;
  }, [completedWorkOrders, currentCostEntries, equipmentMap, locationMap, materialsByOrder, sortField, sortOrder]);

  const handleToggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const handleDelete = async () => {
    if (!deletingEntry) return;
    try {
      setIsDeleting(true);
      await deleteDoc(doc(db, 'costEntries', deletingEntry.id));
      onSuccessToast('Đã xóa mục chi phí thành công');
      setDeletingEntry(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `costEntries/${deletingEntry.id}`);
      onError('Không thể xóa mục chi phí');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <DollarSign className="w-6 h-6 text-emerald-600" />
            <span>Quản lý Chi phí & Ngân sách Kỹ thuật</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Giám sát toàn diện chi phí sửa chữa, vật tư phụ tùng, nhân công và chi phí phát sinh
          </p>
        </div>

        <button
          onClick={() => {
            setEditingEntry(null);
            setIsModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs sm:text-sm font-bold shadow-md shadow-emerald-500/20 active:scale-95 transition-all touch-manipulation"
        >
          <Plus className="w-4 h-4" />
          <span>Ghi nhận chi phí phát sinh</span>
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-3xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-400 mr-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              Kỳ báo cáo:
            </span>
            {(
              [
                ['this_month', 'Tháng này'],
                ['last_month', 'Tháng trước'],
                ['this_quarter', 'Quý này'],
                ['this_year', 'Năm nay'],
                ['custom', 'Tùy chọn ngày'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setPeriodPreset(val)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  periodPreset === val
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="text-xs text-slate-500 font-mono font-bold bg-slate-50 px-3 py-1 rounded-lg border border-slate-200">
            {formatDateOnly(startDate)} ➔ {formatDateOnly(endDate)}
          </div>
        </div>

        {periodPreset === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100 text-xs">
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-semibold">Từ ngày:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500 font-semibold">Đến ngày:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-medium"
              />
            </div>
          </div>
        )}

        {/* Extended Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
          <div>
            <select
              value={selectedEquipmentId}
              onChange={(e) => setSelectedEquipmentId(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white"
            >
              <option value="all">Tất cả thiết bị</option>
              {equipmentList.map((eq) => (
                <option key={eq.id} value={eq.id}>
                  [{eq.code}] {eq.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white"
            >
              <option value="all">Tất cả vị trí / khu vực</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>
                  {loc.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium bg-white"
            >
              <option value="all">Tất cả khoản mục</option>
              <option value="vat_tu">Vật tư & Phụ tùng</option>
              <option value="nhan_cong">Nhân công</option>
              <option value="thue_ngoai">Thuê ngoài / Dịch vụ</option>
              <option value="dien_nuoc">Điện nước & Năng lượng</option>
              <option value="khac">Chi phí khác</option>
            </select>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Tìm mô tả, mã hiệu..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium"
            />
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cost with Comparison */}
        <div className="bg-gradient-to-br from-emerald-600 via-teal-700 to-emerald-800 text-white p-5 rounded-3xl shadow-lg shadow-emerald-600/15">
          <div className="text-xs font-bold uppercase tracking-wider text-emerald-100 flex items-center justify-between">
            <span>Tổng chi phí kỳ này</span>
            <DollarSign className="w-4 h-4" />
          </div>
          <div className="text-2xl sm:text-3xl font-black mt-2 font-mono tracking-tight">
            {formatCurrency(grandTotalCost)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold">
            {diffPercent >= 0 ? (
              <span className="flex items-center text-rose-200 bg-rose-900/40 px-2 py-0.5 rounded-lg border border-rose-400/20">
                <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" />
                +{diffPercent}% so với kỳ trước
              </span>
            ) : (
              <span className="flex items-center text-emerald-200 bg-emerald-900/40 px-2 py-0.5 rounded-lg border border-emerald-400/20">
                <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" />
                {diffPercent}% so với kỳ trước
              </span>
            )}
          </div>
        </div>

        {/* Materials */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Vật tư & Phụ tùng</span>
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-2 font-mono">
            {formatCurrency(categoryTotals.vatTu)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Xuất kho & mua sắm thay thế
          </div>
        </div>

        {/* Labor */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Nhân công sửa chữa</span>
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-2 font-mono">
            {formatCurrency(categoryTotals.nhanCong)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Chi phí giờ công kỹ thuật
          </div>
        </div>

        {/* External & Utility */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-xs">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Thuê ngoài & Khác</span>
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 mt-2 font-mono">
            {formatCurrency(categoryTotals.thueNgoai + categoryTotals.dienNuoc + categoryTotals.khac)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Dịch vụ đối tác, điện nước
          </div>
        </div>
      </div>

      {/* Charts Section: Recharts Bar Chart & Recharts Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recharts Bar Chart: Monthly Cost Trend */}
        <div className="lg:col-span-2 bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-blue-600" />
              <h3 className="text-base font-bold text-slate-900">
                Biểu đồ chi phí theo tháng (Recharts)
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">Đơn vị: VNĐ</span>
          </div>

          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis
                  tickFormatter={(val) =>
                    val >= 1000000 ? `${(val / 1000000).toFixed(1)}tr` : `${Math.round(val / 1000)}k`
                  }
                  tick={{ fontSize: 10 }}
                />
                <Tooltip
                  formatter={(value: any) => [formatCurrency(Number(value) || 0), '']}
                  labelStyle={{ fontWeight: 'bold', color: '#0f172a' }}
                  contentStyle={{ borderRadius: '1rem', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} />
                <Bar dataKey="Vật tư" stackId="a" fill="#3b82f6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Nhân công" stackId="a" fill="#8b5cf6" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Thuê ngoài & Khác" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Recharts Pie Chart: Cost Distribution by Category */}
        <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <PieChartIcon className="w-5 h-5 text-purple-600" />
            <h3 className="text-base font-bold text-slate-900">
              Cơ cấu chi phí (Recharts)
            </h3>
          </div>

          <div className="h-56 sm:h-64 w-full">
            {pieChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Chưa có số liệu chi phí trong kỳ
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => [formatCurrency(Number(value) || 0), '']} />
                  <Legend wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>

          <div className="text-[11px] text-slate-500 text-center border-t border-slate-100 pt-2">
            Tổng cộng: <strong className="font-mono text-slate-800">{formatCurrency(grandTotalCost)}</strong>
          </div>
        </div>
      </div>

      {/* Top 5 Most Expensive Equipment Table */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-indigo-600" />
            <h3 className="text-base font-bold text-slate-900">
              Top 5 Thiết bị tốn kém chi phí nhất trong kỳ
            </h3>
          </div>
          <span className="text-xs text-slate-400">Xếp hạng theo tổng chi phí</span>
        </div>

        {topExpensiveEquipment.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
            Không có thiết bị nào phát sinh chi phí trong kỳ được chọn.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 uppercase font-semibold text-[10px] border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 text-center w-12">Hạng</th>
                  <th className="px-4 py-3">Mã & Tên thiết bị</th>
                  <th className="px-4 py-3">Vị trí lắp đặt</th>
                  <th className="px-4 py-3 text-center">Số lượt sửa/bảo dưỡng</th>
                  <th className="px-4 py-3 text-right">Chi phí vật tư</th>
                  <th className="px-4 py-3 text-right">Chi phí dịch vụ/NC</th>
                  <th className="px-4 py-3 text-right">Tổng chi phí</th>
                  <th className="px-4 py-3 text-right w-20">Tỷ lệ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {topExpensiveEquipment.map((item, index) => {
                  const loc = locationMap.get(item.equipment.locationId);
                  const pct = grandTotalCost > 0 ? Math.round((item.totalCost / grandTotalCost) * 100) : 0;
                  return (
                    <tr key={item.equipment.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`w-6 h-6 rounded-full inline-flex items-center justify-center font-bold text-[11px] ${
                            index === 0
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : index === 1
                              ? 'bg-slate-200 text-slate-800'
                              : index === 2
                              ? 'bg-amber-50 text-amber-900'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {index + 1}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900">{item.equipment.name}</div>
                        <span className="font-mono text-[11px] text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded">
                          {item.equipment.code}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{loc?.name || 'Chưa gán'}</td>
                      <td className="px-4 py-3 text-center font-bold text-slate-800">
                        {item.workOrderCount}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {formatCurrency(item.matCost)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-700">
                        {formatCurrency(item.serviceCost)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700 text-sm">
                        {formatCurrency(item.totalCost)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg text-[10px]">
                          {pct}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sortable Details Table (Bảng chi tiết sắp xếp được) */}
      <div className="bg-white p-5 sm:p-6 rounded-3xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Bảng kê chi tiết chi phí ({combinedRows.length} mục)
            </h3>
            <p className="text-[11px] text-slate-500">
              Bấm vào tiêu đề cột để sắp xếp, bấm vào dòng để mở chi tiết công việc hoặc chỉnh sửa
            </p>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Tổng cộng: <strong className="text-emerald-700 font-bold">{formatCurrency(grandTotalCost)}</strong>
          </span>
        </div>

        {combinedRows.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 border border-dashed rounded-2xl">
            Không có dòng chi phí nào phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-bold text-[10px] border-b border-slate-200 select-none">
                <tr>
                  <th
                    onClick={() => handleToggleSort('date')}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors w-28"
                  >
                    <div className="flex items-center gap-1">
                      <span>Ngày</span>
                      {sortField === 'date' ? (
                        sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleSort('title')}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Nội dung / Phiếu</span>
                      {sortField === 'title' ? (
                        sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleSort('category')}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Phân loại</span>
                      {sortField === 'category' ? (
                        sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleSort('equipment')}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-center gap-1">
                      <span>Thiết bị / Vị trí</span>
                      {sortField === 'equipment' ? (
                        sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th
                    onClick={() => handleToggleSort('amount')}
                    className="px-4 py-3 cursor-pointer hover:bg-slate-100 transition-colors text-right w-36"
                  >
                    <div className="flex items-center justify-end gap-1">
                      <span>Thành tiền</span>
                      {sortField === 'amount' ? (
                        sortOrder === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                  <th className="px-4 py-3 text-center w-16">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {combinedRows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => {
                      if (row.type === 'work_order' && row.workOrder) {
                        onSelectWorkOrder?.(row.workOrder);
                      } else if (row.type === 'cost_entry' && row.costEntry) {
                        setEditingEntry(row.costEntry);
                        setIsModalOpen(true);
                      }
                    }}
                    className="hover:bg-blue-50/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3 font-mono text-slate-500 whitespace-nowrap">
                      {formatDateOnly(row.date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {row.code && (
                          <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded text-[11px]">
                            {row.code}
                          </span>
                        )}
                        <span className="font-semibold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {row.title}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                        {row.categoryLabel}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {row.equipmentName ? (
                        <div className="flex items-center gap-1.5 text-slate-800">
                          <Cpu className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          <span>[{row.equipmentCode}] {row.equipmentName}</span>
                        </div>
                      ) : row.locationName ? (
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{row.locationName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-900">
                      {formatCurrency(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                      {row.type === 'cost_entry' && row.costEntry ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => {
                              setEditingEntry(row.costEntry!);
                              setIsModalOpen(true);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-200/50"
                            title="Sửa"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingEntry(row.costEntry!)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-200/50"
                            title="Xóa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => row.workOrder && onSelectWorkOrder?.(row.workOrder)}
                          className="p-1 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-slate-200/50"
                          title="Xem chi tiết công việc"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <CostModal
        isOpen={isModalOpen}
        costEntry={editingEntry}
        equipmentList={equipmentList}
        onClose={() => {
          setIsModalOpen(false);
          setEditingEntry(null);
        }}
        onSuccess={(msg) => onSuccessToast(msg)}
        onError={(msg) => onError(msg)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(deletingEntry)}
        title="Xóa mục chi phí phát sinh?"
        message={`Bạn có chắc muốn xóa khoản chi "${deletingEntry?.description}" (${formatCurrency(
          deletingEntry?.amount || 0
        )})?`}
        confirmText="Xác nhận xóa"
        isLoading={isDeleting}
        onConfirm={handleDelete}
        onCancel={() => setDeletingEntry(null)}
      />
    </div>
  );
};
