import React, { useState, useMemo } from 'react';
import {
  Zap,
  Cpu,
  Plus,
  Search,
  Filter,
  ShieldAlert,
  ShieldCheck,
  Gauge,
  Calendar,
  ChevronRight,
  ChevronDown,
  Layers,
  MapPin,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BarChart3,
  ImageIcon,
  Wrench,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  ElectricalAsset,
  ElectricalAssetType,
  ElectricalAssetStatus,
  LocationItem,
  WorkOrder,
  MeterReading,
  ElectricalCheck,
  WorkOrderMaterial,
} from '../../types';
import { useAuth } from '../../context/AuthContext';
import { formatDateOnly, formatCurrency } from '../../utils/formatters';
import { ElectricalAssetModal } from './ElectricalAssetModal';
import { MeterReadingModal } from './MeterReadingModal';
import { ElectricalCheckModal } from './ElectricalCheckModal';
import { ElectricalDetailModal } from './ElectricalDetailModal';

interface ElectricalViewProps {
  assets: ElectricalAsset[];
  locations: LocationItem[];
  workOrders: WorkOrder[];
  workOrderMaterials?: WorkOrderMaterial[];
  meterReadings: MeterReading[];
  electricalChecks: ElectricalCheck[];
  onSelectWorkOrder: (wo: WorkOrder) => void;
  onOpenCreateWorkOrder: (source: 'internal' | 'request', electricalAssetId?: string) => void;
  onSuccessToast: (msg: string) => void;
  onError: (msg: string) => void;
}

export const ElectricalView: React.FC<ElectricalViewProps> = ({
  assets,
  locations,
  workOrders,
  workOrderMaterials = [],
  meterReadings,
  electricalChecks,
  onSelectWorkOrder,
  onOpenCreateWorkOrder,
  onSuccessToast,
  onError,
}) => {
  const { isAdmin, isTechnician } = useAuth();

  // Navigation tab
  const [activeTab, setActiveTab] = useState<'tree' | 'meters' | 'checks'>('tree');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  // Modals state
  const [isAssetModalOpen, setIsAssetModalOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<ElectricalAsset | null>(null);

  const [isMeterModalOpen, setIsMeterModalOpen] = useState(false);
  const [meterDefaultAssetId, setMeterDefaultAssetId] = useState<string | undefined>(undefined);

  const [isCheckModalOpen, setIsCheckModalOpen] = useState(false);
  const [checkDefaultAssetId, setCheckDefaultAssetId] = useState<string | undefined>(undefined);

  const [selectedDetailAsset, setSelectedDetailAsset] = useState<ElectricalAsset | null>(null);
  const [enlargedPhoto, setEnlargedPhoto] = useState<string | null>(null);

  const locationMap = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations]);

  // Meters assets list
  const meterAssets = useMemo(() => {
    return assets.filter((a) => a.type === 'cong_to' || a.type === 'tu_dien');
  }, [assets]);

  // Toggle node expansion in tree
  const toggleNode = (nodeId: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [nodeId]: prev[nodeId] === undefined ? false : !prev[nodeId],
    }));
  };

  // Filtered Assets list
  const filteredAssets = useMemo(() => {
    return assets.filter((item) => {
      if (selectedLocationId !== 'all' && item.locationId !== selectedLocationId) return false;
      if (selectedStatus !== 'all' && item.status !== selectedStatus) return false;
      if (selectedType !== 'all' && item.type !== selectedType) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const codeMatch = item.code.toLowerCase().includes(q);
        const nameMatch = item.name.toLowerCase().includes(q);
        const ratingMatch = (item.rating || '').toLowerCase().includes(q);
        return codeMatch || nameMatch || ratingMatch;
      }
      return true;
    });
  }, [assets, selectedLocationId, selectedStatus, selectedType, searchTerm]);

  // Build tree structure from root assets (parentId is null or parent doesn't exist)
  const rootAssets = useMemo(() => {
    const assetIdSet = new Set(assets.map((a) => a.id));
    return filteredAssets.filter((a) => !a.parentId || !assetIdSet.has(a.parentId));
  }, [filteredAssets, assets]);

  // Metrics
  const totalAssets = assets.length;
  const panelCount = assets.filter((a) => a.type === 'tu_dien').length;
  const needCheckCount = assets.filter((a) => a.status === 'can_kiem_tra' || a.status === 'hong').length;
  const meterCount = meterAssets.length;

  // Monthly electricity consumption data for Recharts
  const monthlyConsumptionData = useMemo(() => {
    const monthsMap = new Map<string, number>();
    const now = new Date();

    // Prepare last 6 months
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthsMap.set(key, 0);
    }

    // Sort readings by asset & date
    const readingsByAsset = new Map<string, MeterReading[]>();
    meterReadings.forEach((r) => {
      const list = readingsByAsset.get(r.assetId) || [];
      list.push(r);
      readingsByAsset.set(r.assetId, list);
    });

    readingsByAsset.forEach((list) => {
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      for (let i = 1; i < list.length; i++) {
        const cur = list[i];
        const prev = list[i - 1];
        const diff = Math.max(0, cur.value - prev.value);
        const mKey = cur.date.substring(0, 7);
        if (monthsMap.has(mKey)) {
          monthsMap.set(mKey, (monthsMap.get(mKey) || 0) + diff);
        }
      }
    });

    return Array.from(monthsMap.entries()).map(([key, value]) => {
      const [year, month] = key.split('-');
      return {
        month: `T${parseInt(month)}/${year.slice(2)}`,
        kwh: Math.round(value),
      };
    });
  }, [meterReadings]);

  // Consumption difference per reading
  const consumptionByReadingId = useMemo(() => {
    const map = new Map<string, number | null>();
    const byAsset = new Map<string, MeterReading[]>();
    meterReadings.forEach((r) => {
      const list = byAsset.get(r.assetId) || [];
      list.push(r);
      byAsset.set(r.assetId, list);
    });

    byAsset.forEach((list) => {
      list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      for (let i = 0; i < list.length; i++) {
        if (i === 0) {
          map.set(list[i].id, null);
        } else {
          map.set(list[i].id, Math.max(0, list[i].value - list[i - 1].value));
        }
      }
    });

    return map;
  }, [meterReadings]);

  const getTypeLabel = (t: ElectricalAssetType) => {
    switch (t) {
      case 'tu_dien':
        return 'Tủ điện';
      case 'aptomat':
        return 'Aptomat';
      case 'cong_to':
        return 'Công tơ';
      case 'den':
        return 'Đèn / CS';
      case 'o_cam':
        return 'Ổ cắm';
      default:
        return 'Khác';
    }
  };

  // Recursive Tree Node Renderer
  const renderTreeNode = (node: ElectricalAsset, level: number = 0) => {
    const children = assets.filter((a) => a.parentId === node.id);
    const isExpanded = expandedNodes[node.id] !== false; // Default expanded
    const hasChildren = children.length > 0;

    return (
      <div key={node.id} className="text-xs">
        <div
          onClick={() => setSelectedDetailAsset(node)}
          className={`group flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer ${
            level === 0
              ? 'bg-white border-slate-200 shadow-2xs hover:border-amber-300 hover:shadow-xs'
              : 'bg-slate-50/70 border-slate-200/80 hover:bg-amber-50/40 hover:border-amber-300'
          }`}
          style={{ marginLeft: `${Math.min(level * 20, 80)}px` }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {hasChildren ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleNode(node.id);
                }}
                className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            ) : (
              <span className="w-6 shrink-0" />
            )}

            <div
              className={`p-1.5 rounded-xl shrink-0 ${
                node.type === 'tu_dien'
                  ? 'bg-amber-500 text-white'
                  : node.type === 'cong_to'
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {node.type === 'cong_to' ? <Gauge className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-mono font-bold text-amber-800 bg-amber-50 px-1.5 py-0.2 rounded text-[11px] border border-amber-200">
                  {node.code}
                </span>
                <span className="font-bold text-slate-900 group-hover:text-amber-700 transition-colors truncate">
                  {node.name}
                </span>
                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                  {getTypeLabel(node.type)}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>Vị trí: {locationMap.get(node.locationId)?.name || 'Chưa gán'}</span>
                {node.rating && <span>• Định mức: {node.rating}</span>}
                <span>• {node.phase}</span>
                {hasChildren && <span>• {children.length} thiết bị trực thuộc</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                node.status === 'hoat_dong'
                  ? 'bg-emerald-100 text-emerald-800'
                  : node.status === 'can_kiem_tra'
                  ? 'bg-amber-100 text-amber-800 animate-pulse'
                  : 'bg-rose-100 text-rose-800 animate-pulse'
              }`}
            >
              {node.status === 'hoat_dong' ? 'Hoạt động' : node.status === 'can_kiem_tra' ? 'Cần kiểm tra' : 'Hỏng'}
            </span>
          </div>
        </div>

        {/* Children branch */}
        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1 relative pl-3 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
            {children.map((c) => renderTreeNode(c, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-amber-500 text-white rounded-2xl shadow-sm">
              <Zap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Quản lý Hệ thống điện
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Sơ đồ cây phân cấp tủ điện, ghi chỉ số công tơ và kiểm tra an toàn điện định kỳ
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setMeterDefaultAssetId(undefined);
              setIsMeterModalOpen(true);
            }}
            className="px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
          >
            <Gauge className="w-4 h-4" />
            <span>Ghi chỉ số công tơ</span>
          </button>

          <button
            onClick={() => {
              setCheckDefaultAssetId(undefined);
              setIsCheckModalOpen(true);
            }}
            className="px-3.5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 active:scale-95 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>Kiểm tra an toàn</span>
          </button>

          {isAdmin && (
            <button
              onClick={() => {
                setEditingAsset(null);
                setIsAssetModalOpen(true);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-black active:scale-95 text-white text-xs font-bold shadow-xs transition-all flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm thiết bị điện</span>
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Tổng thiết bị điện</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Zap className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 font-mono">{totalAssets}</div>
          <div className="text-[11px] text-slate-400 mt-1">Đã lập hồ sơ sơ đồ cây</div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Tủ điện MSB & DB</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-600">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-700 font-mono">{panelCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Tủ tổng & phân phối tầng</div>
        </div>

        <div
          onClick={() => {
            setSelectedStatus('can_kiem_tra');
            setActiveTab('tree');
          }}
          className={`p-4 sm:p-5 rounded-2xl border shadow-2xs transition-all cursor-pointer ${
            needCheckCount > 0
              ? 'bg-rose-50/60 border-rose-300 hover:border-rose-400'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-rose-800">Cần kiểm tra / Hỏng</span>
            <div className="p-2 rounded-xl bg-rose-100 text-rose-700">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-700 font-mono">{needCheckCount}</div>
          <div className="text-[11px] text-rose-600 mt-1 font-semibold">
            {needCheckCount > 0 ? 'Cảnh báo nguy cơ mất an toàn' : 'Tất cả đạt chuẩn'}
          </div>
        </div>

        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider">Công tơ điện</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
              <Gauge className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-700 font-mono">{meterCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">{meterReadings.length} lượt đã ghi chỉ số</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 text-xs font-bold gap-1 sm:gap-2">
        <button
          onClick={() => setActiveTab('tree')}
          className={`pb-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'tree'
              ? 'border-amber-500 text-amber-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Sơ đồ cây & Thiết bị ({filteredAssets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('meters')}
          className={`pb-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'meters'
              ? 'border-blue-600 text-blue-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Gauge className="w-4 h-4" />
          <span>Chỉ số công tơ & Tiêu thụ ({meterReadings.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('checks')}
          className={`pb-3 px-3 sm:px-4 border-b-2 transition-all flex items-center gap-1.5 ${
            activeTab === 'checks'
              ? 'border-amber-600 text-amber-700 font-black'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Phiếu kiểm tra an toàn ({electricalChecks.length})</span>
        </button>
      </div>

      {/* TAB 1: SƠ ĐỒ CÂY & DANH MỤC */}
      {activeTab === 'tree' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo mã tủ, tên thiết bị, công suất định mức..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-amber-500 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">Tất cả vị trí</option>
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>

              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">Tất cả chủng loại</option>
                <option value="tu_dien">Tủ điện (MSB/DB)</option>
                <option value="aptomat">Aptomat / Cầu dao</option>
                <option value="cong_to">Công tơ điện</option>
                <option value="den">Hệ thống đèn</option>
                <option value="o_cam">Ổ cắm</option>
                <option value="khac">Khác</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-bold focus:ring-2 focus:ring-amber-500"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="hoat_dong">Hoạt động tốt</option>
                <option value="can_kiem_tra">Cần kiểm tra an toàn</option>
                <option value="hong">Hỏng / Cần sửa</option>
              </select>
            </div>
          </div>

          {/* Tree View Content */}
          {rootAssets.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-dashed border-slate-300 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <Zap className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Không tìm thấy thiết bị điện nào</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Thử thay đổi bộ lọc tìm kiếm hoặc thêm thiết bị điện mới vào sơ đồ cây hệ thống.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {rootAssets.map((root) => renderTreeNode(root, 0))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CHỈ SỐ CÔNG TƠ & TIÊU THỤ */}
      {activeTab === 'meters' && (
        <div className="space-y-6">
          {/* Recharts Bar Chart: Monthly Consumption */}
          <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-blue-600" />
                  <span>Điện năng tiêu thụ theo tháng (kWh)</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Tự động tính từ mức tăng chỉ số giữa các kỳ đo
                </p>
              </div>
              <button
                onClick={() => setIsMeterModalOpen(true)}
                className="px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-xs flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ghi chỉ số mới</span>
              </button>
            </div>

            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyConsumptionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(val: any) => [`${Number(val || 0).toLocaleString('vi-VN')} kWh`, 'Điện năng tiêu thụ']}
                    contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                  />
                  <Bar dataKey="kwh" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Meter Readings List */}
          <div className="border border-slate-200 rounded-3xl overflow-hidden bg-white shadow-2xs">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Nhật ký chỉ số công tơ gần đây ({meterReadings.length})
              </span>
            </div>

            {meterReadings.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Chưa có chỉ số công tơ nào được ghi nhận. Bấm &quot;Ghi chỉ số mới&quot; để bắt đầu.
              </div>
            ) : (
              <>
                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-4">Ngày ghi</th>
                        <th className="py-2.5 px-4">Công tơ / Thiết bị</th>
                        <th className="py-2.5 px-3 text-right">Chỉ số (kWh)</th>
                        <th className="py-2.5 px-3 text-right">Tiêu thụ</th>
                        <th className="py-2.5 px-3 text-center">Ảnh đồng hồ</th>
                        <th className="py-2.5 px-4">Người ghi</th>
                        <th className="py-2.5 px-4">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {meterReadings.map((r) => {
                        const cons = consumptionByReadingId.get(r.id);
                        return (
                          <tr key={r.id} className="hover:bg-slate-50/50">
                            <td className="py-3 px-4 font-mono font-semibold text-slate-700">
                              {formatDateOnly(r.date)}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded text-[11px] mr-1.5">
                                {r.assetCode || 'CT'}
                              </span>
                              <span className="font-bold text-slate-900">{r.assetName || 'Công tơ'}</span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-black text-slate-900 text-sm">
                              {r.value.toLocaleString('vi-VN')} <span className="text-[10px] text-slate-400">kWh</span>
                            </td>
                            <td className="py-3 px-3 text-right font-mono font-bold text-blue-700">
                              {cons !== null && cons !== undefined ? (
                                <span>
                                  +{cons.toLocaleString('vi-VN')}{' '}
                                  <span className="text-[10px] text-slate-400">kWh</span>
                                </span>
                              ) : (
                                <span className="text-slate-400 font-normal italic text-[11px]">Kỳ đầu</span>
                              )}
                            </td>
                            <td className="py-3 px-3 text-center">
                              {r.photo ? (
                                <button
                                  onClick={() => setEnlargedPhoto(r.photo!)}
                                  className="min-h-[36px] px-2 py-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg inline-flex items-center gap-1 active:scale-95 touch-manipulation"
                                  title="Xem ảnh đồng hồ"
                                >
                                  <ImageIcon className="w-4 h-4" />
                                  <span className="text-[10px] font-bold">Xem</span>
                                </button>
                              ) : (
                                <span className="text-slate-300 text-[11px]">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              {r.recordedByName || 'Kỹ thuật viên'}
                            </td>
                            <td className="py-3 px-4 text-slate-500 italic text-[11px]">
                              {r.note || '-'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile Cards View (Screen < 768px) */}
                <div className="md:hidden divide-y divide-slate-100">
                  {meterReadings.map((r) => {
                    const cons = consumptionByReadingId.get(r.id);

                    return (
                      <div key={r.id} className="p-4 space-y-3 bg-white">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded text-[11px] border border-blue-100">
                                {r.assetCode || 'CT'}
                              </span>
                              <span className="font-bold text-slate-900 text-sm">{r.assetName || 'Công tơ'}</span>
                            </div>
                            <span className="text-[11px] font-mono text-slate-400 mt-0.5 block">
                              Ngày ghi: {formatDateOnly(r.date)}
                            </span>
                          </div>

                          {cons !== null && cons !== undefined ? (
                            <span className="shrink-0 px-2 py-0.5 rounded-lg text-xs font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
                              +{cons.toLocaleString('vi-VN')} kWh
                            </span>
                          ) : (
                            <span className="shrink-0 px-2 py-0.5 rounded-lg text-[11px] text-slate-400 bg-slate-100 italic">
                              Kỳ đầu
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between bg-slate-50 p-3 rounded-2xl border border-slate-100">
                          <div>
                            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">
                              Chỉ số hiện tại
                            </span>
                            <span className="text-lg font-black font-mono text-slate-900">
                              {r.value.toLocaleString('vi-VN')}{' '}
                              <span className="text-xs font-normal text-slate-500">kWh</span>
                            </span>
                          </div>

                          {r.photo && (
                            <button
                              onClick={() => setEnlargedPhoto(r.photo!)}
                              className="group relative w-16 h-12 rounded-xl overflow-hidden border border-slate-200 bg-slate-900 shrink-0 shadow-2xs active:scale-95 touch-manipulation"
                              title="Bấm để phóng to ảnh đồng hồ"
                            >
                              <img src={r.photo} alt="Đồng hồ" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                              <div className="absolute inset-0 bg-black/30 flex items-center justify-center text-white">
                                <ImageIcon className="w-4 h-4" />
                              </div>
                            </button>
                          )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                          <span className="text-[11px]">Người ghi: <strong className="text-slate-700">{r.recordedByName || 'Kỹ thuật viên'}</strong></span>
                          {r.note && <span className="text-[11px] italic truncate max-w-[160px] text-slate-400">Ghi chú: {r.note}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: PHIẾU KIỂM TRA AN TOÀN ĐIỆN */}
      {activeTab === 'checks' && (
        <div className="space-y-4">
          {/* Requirement 6: Safety Warning Reminder */}
          <div className="p-4 bg-amber-500 text-white rounded-3xl shadow-sm flex items-start gap-3">
            <Zap className="w-5 h-5 fill-white shrink-0 mt-0.5 animate-pulse" />
            <div className="text-xs leading-relaxed">
              <strong className="block text-sm font-black uppercase tracking-wider mb-0.5">
                QUY ĐỊNH AN TOÀN ĐIỆN
              </strong>
              Ngắt nguồn điện và đảm bảo an toàn tuyệt đối trước khi thao tác, kiểm tra hoặc bảo trì thiết bị điện! Luôn mang trang bị bảo hộ cá nhân (PPE) cách điện khi làm việc.
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Danh sách phiếu kiểm tra an toàn ({electricalChecks.length})
            </h3>
            <button
              onClick={() => setIsCheckModalOpen(true)}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Lập phiếu kiểm tra an toàn</span>
            </button>
          </div>

          {electricalChecks.length === 0 ? (
            <div className="bg-white p-12 text-center rounded-3xl border border-dashed border-slate-300 text-xs text-slate-400">
              Chưa có phiếu kiểm tra an toàn nào được lập. Bấm &quot;Lập phiếu kiểm tra an toàn&quot; để tạo phiếu đầu tiên.
            </div>
          ) : (
            <div className="space-y-3">
              {electricalChecks.map((chk) => (
                <div
                  key={chk.id}
                  className={`p-4 sm:p-5 rounded-3xl border text-xs space-y-3 transition-all ${
                    chk.result === 'dat'
                      ? 'bg-white border-slate-200 shadow-2xs'
                      : 'bg-rose-50/60 border-rose-300 shadow-sm'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`px-3 py-1 rounded-full font-bold text-xs flex items-center gap-1.5 ${
                          chk.result === 'dat'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-600 text-white'
                        }`}
                      >
                        {chk.result === 'dat' ? (
                          <>
                            <CheckCircle2 className="w-4 h-4" />
                            <span>ĐẠT TIÊU CHUẨN AN TOÀN</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-4 h-4" />
                            <span>KHÔNG ĐẠT TIÊU CHUẨN</span>
                          </>
                        )}
                      </span>

                      <div className="font-bold text-slate-900 text-sm">
                        [{chk.assetCode}] {chk.assetName}
                      </div>
                    </div>

                    <div className="text-slate-400 text-[11px] flex items-center gap-2">
                      <span>Ngày kiểm tra: {formatDateOnly(chk.date)}</span>
                      <span>•</span>
                      <span>KTV: {chk.checkedByName || 'Kỹ thuật viên'}</span>
                    </div>
                  </div>

                  {/* Checklist items */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50/80 p-3 rounded-2xl border border-slate-100 text-[11px]">
                    {chk.checklist.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        {item.passed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-600 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <span className={item.passed ? 'text-slate-700' : 'text-rose-900 font-bold'}>
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

                  {chk.workOrderId && (
                    <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-rose-200 text-rose-700 font-semibold text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Đã tự động khởi tạo phiếu sửa chữa khẩn cấp liên kết</span>
                      </div>
                      {(() => {
                        const linkedWo = workOrders.find((w) => w.id === chk.workOrderId);
                        return linkedWo ? (
                          <button
                            type="button"
                            onClick={() => onSelectWorkOrder(linkedWo)}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-[10px] font-bold shadow-2xs transition-all flex items-center gap-1 active:scale-95"
                          >
                            <span>Xem phiếu sửa chữa ({linkedWo.code}) →</span>
                          </button>
                        ) : null;
                      })()}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {isAssetModalOpen && (
        <ElectricalAssetModal
          isOpen={isAssetModalOpen}
          asset={editingAsset}
          locations={locations}
          allElectricalAssets={assets}
          onClose={() => setIsAssetModalOpen(false)}
          onSuccess={onSuccessToast}
          onError={onError}
        />
      )}

      {isMeterModalOpen && (
        <MeterReadingModal
          isOpen={isMeterModalOpen}
          meterAssets={meterAssets}
          pastReadings={meterReadings}
          defaultAssetId={meterDefaultAssetId}
          onClose={() => setIsMeterModalOpen(false)}
          onSuccess={onSuccessToast}
          onError={onError}
        />
      )}

      {isCheckModalOpen && (
        <ElectricalCheckModal
          isOpen={isCheckModalOpen}
          electricalAssets={assets}
          defaultAssetId={checkDefaultAssetId}
          onClose={() => setIsCheckModalOpen(false)}
          onSuccess={onSuccessToast}
          onError={onError}
          onWorkOrderCreated={(wo) => onSelectWorkOrder(wo)}
        />
      )}

      {selectedDetailAsset && (
        <ElectricalDetailModal
          asset={selectedDetailAsset}
          locations={locations}
          allAssets={assets}
          workOrders={workOrders}
          workOrderMaterials={workOrderMaterials}
          electricalChecks={electricalChecks}
          meterReadings={meterReadings}
          onClose={() => setSelectedDetailAsset(null)}
          onEdit={(a) => {
            setSelectedDetailAsset(null);
            setEditingAsset(a);
            setIsAssetModalOpen(true);
          }}
          onSelectWorkOrder={(wo) => onSelectWorkOrder(wo)}
          onOpenCheckModal={(assetId) => {
            setCheckDefaultAssetId(assetId);
            setIsCheckModalOpen(true);
          }}
          onOpenMeterModal={(assetId) => {
            setMeterDefaultAssetId(assetId);
            setIsMeterModalOpen(true);
          }}
          onOpenCreateWorkOrder={(assetId) => {
            onOpenCreateWorkOrder('internal', assetId);
          }}
          onSuccess={onSuccessToast}
          onError={onError}
        />
      )}

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
    </div>
  );
};
