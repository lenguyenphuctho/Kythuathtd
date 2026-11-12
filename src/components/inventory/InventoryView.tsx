import React, { useState, useMemo } from 'react';
import {
  Package,
  Plus,
  ArrowDownLeft,
  Search,
  Filter,
  History,
  AlertTriangle,
  CheckCircle2,
  Edit,
  Trash2,
  DollarSign,
  MapPin,
  Calendar,
  SlidersHorizontal,
  X,
  FileText,
  Power,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { InventoryItem, InventoryTransaction } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { ItemModal } from './ItemModal';
import { StockInModal } from './StockInModal';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { deleteDoc, doc, updateDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../services/firebase';

interface InventoryViewProps {
  inventoryItems: InventoryItem[];
  transactions: InventoryTransaction[];
  onSuccessToast: (msg: string) => void;
  onError: (msg: string) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  inventoryItems,
  transactions,
  onSuccessToast,
  onError,
}) => {
  const { isAdmin, isTechnician } = useAuth();

  const [activeTab, setActiveTab] = useState<'items' | 'transactions'>('items');

  // Search & filter for items
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'low' | 'active' | 'inactive'>('all');

  // Search & filter for transactions
  const [transSearch, setTransSearch] = useState('');
  const [transTypeFilter, setTransTypeFilter] = useState<'all' | 'in' | 'out'>('all');
  const [transItemFilter, setTransItemFilter] = useState('all');

  // Modals state
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isStockInModalOpen, setIsStockInModalOpen] = useState(false);
  const [stockInPreselectedId, setStockInPreselectedId] = useState<string | undefined>();
  const [deletingItem, setDeletingItem] = useState<InventoryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    inventoryItems.forEach((i) => {
      if (i.category) set.add(i.category);
    });
    return Array.from(set);
  }, [inventoryItems]);

  // Low stock items count
  const lowStockItems = useMemo(() => {
    return inventoryItems.filter((i) => i.active && i.qty <= i.minQty);
  }, [inventoryItems]);

  // Total inventory value
  const totalValue = useMemo(() => {
    return inventoryItems.reduce((acc, i) => acc + (i.qty * (i.unitCost || 0)), 0);
  }, [inventoryItems]);

  // Filtered Items
  const filteredItems = useMemo(() => {
    return inventoryItems.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (stockStatusFilter === 'low' && (!item.active || item.qty > item.minQty)) return false;
      if (stockStatusFilter === 'active' && !item.active) return false;
      if (stockStatusFilter === 'inactive' && item.active) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const skuMatch = item.sku.toLowerCase().includes(q);
        const nameMatch = item.name.toLowerCase().includes(q);
        const locMatch = item.location?.toLowerCase().includes(q) || false;
        return skuMatch || nameMatch || locMatch;
      }
      return true;
    });
  }, [inventoryItems, categoryFilter, stockStatusFilter, searchTerm]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (transTypeFilter !== 'all' && tx.type !== transTypeFilter) return false;
      if (transItemFilter !== 'all' && tx.itemId !== transItemFilter) return false;

      if (transSearch.trim()) {
        const q = transSearch.toLowerCase();
        const nameMatch = tx.itemName?.toLowerCase().includes(q) || false;
        const noteMatch = tx.note?.toLowerCase().includes(q) || false;
        const woMatch = tx.workOrderCode?.toLowerCase().includes(q) || false;
        const userMatch = tx.createdByName?.toLowerCase().includes(q) || false;
        return nameMatch || noteMatch || woMatch || userMatch;
      }
      return true;
    });
  }, [transactions, transTypeFilter, transItemFilter, transSearch]);

  const openAddItem = () => {
    setEditingItem(null);
    setIsItemModalOpen(true);
  };

  const openEditItem = (item: InventoryItem) => {
    setEditingItem(item);
    setIsItemModalOpen(true);
  };

  const openStockIn = (itemId?: string) => {
    setStockInPreselectedId(itemId);
    setIsStockInModalOpen(true);
  };

  const handleToggleActive = async (item: InventoryItem) => {
    try {
      await updateDoc(doc(db, 'inventoryItems', item.id), {
        active: !item.active,
      });
      onSuccessToast(
        !item.active ? `Đã kích hoạt lại ${item.sku}` : `Đã chuyển ${item.sku} sang ngừng sử dụng`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `inventoryItems/${item.id}`);
      onError('Không thể thay đổi trạng thái');
    }
  };

  // Check if item has transactions before deleting
  const handleAttemptDelete = (item: InventoryItem) => {
    const hasTransactions = transactions.some((t) => t.itemId === item.id);
    if (hasTransactions) {
      onError(
        `Vật tư "${item.sku} - ${item.name}" đã phát sinh giao dịch nhập/xuất kho! Không thể xóa để đảm bảo toàn vẹn sổ sách. Bạn có thể chọn "Ngừng sử dụng".`
      );
      return;
    }
    setDeletingItem(item);
  };

  const confirmDelete = async () => {
    if (!deletingItem) return;
    try {
      setIsDeleting(true);
      await deleteDoc(doc(db, 'inventoryItems', deletingItem.id));
      onSuccessToast(`Đã xóa vật tư ${deletingItem.sku}`);
      setDeletingItem(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `inventoryItems/${deletingItem.id}`);
      onError('Không thể xóa vật tư');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>Kho vật tư & Phụ tùng</span>
            {lowStockItems.length > 0 && (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                {lowStockItems.length} sắp hết
              </span>
            )}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Quản lý tồn kho linh kiện, phụ tùng thay thế và kiểm soát xuất nhập vật tư
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => openStockIn()}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-sm font-bold shadow-md shadow-emerald-500/20 active:scale-95 transition-all touch-manipulation"
            >
              <ArrowDownLeft className="w-5 h-5" />
              <span>Nhập kho</span>
            </button>
            <button
              onClick={openAddItem}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 active:scale-95 transition-all touch-manipulation"
            >
              <Plus className="w-5 h-5" />
              <span>Thêm vật tư mới</span>
            </button>
          </div>
        )}
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
            <span>Tổng mặt hàng</span>
            <Package className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{inventoryItems.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {inventoryItems.filter((i) => i.active).length} đang hoạt động
          </div>
        </div>

        <div className={`p-4 rounded-2xl border shadow-xs ${
          lowStockItems.length > 0 ? 'bg-rose-50/70 border-rose-200' : 'bg-white border-slate-200'
        }`}>
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
            <span className={lowStockItems.length > 0 ? 'text-rose-800 font-bold' : ''}>
              Cảnh báo sắp hết
            </span>
            <AlertTriangle className={`w-4 h-4 ${lowStockItems.length > 0 ? 'text-rose-600' : 'text-slate-400'}`} />
          </div>
          <div className={`text-2xl font-black ${lowStockItems.length > 0 ? 'text-rose-600' : 'text-slate-900'}`}>
            {lowStockItems.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Tồn kho dưới mức tối thiểu</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
            <span>Ước tính giá trị kho</span>
            <DollarSign className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-lg sm:text-xl font-black text-emerald-700 truncate">
            {formatCurrency(totalValue)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">Tính theo đơn giá hiện tại</div>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
            <span>Lịch sử giao dịch</span>
            <History className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black text-slate-900">{transactions.length}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Lượt nhập và xuất đã ghi</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 text-sm font-semibold bg-white rounded-2xl px-3 border shadow-2xs">
        <button
          onClick={() => setActiveTab('items')}
          className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'items'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Danh mục & Tồn kho ({filteredItems.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('transactions')}
          className={`py-3 px-4 border-b-2 transition-colors flex items-center gap-2 ${
            activeTab === 'transactions'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <History className="w-4 h-4" />
          <span>Lịch sử nhập / xuất kho ({filteredTransactions.length})</span>
        </button>
      </div>

      {/* Tab 1: Items List */}
      {activeTab === 'items' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Tìm theo mã SKU, tên vật tư, vị trí kệ..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Nhóm phân loại
                </label>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Tất cả nhóm</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Trạng thái tồn kho
                </label>
                <select
                  value={stockStatusFilter}
                  onChange={(e) => setStockStatusFilter(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Tất cả vật tư</option>
                  <option value="low">Sắp hết (Dưới mức tối thiểu)</option>
                  <option value="active">Đang sử dụng</option>
                  <option value="inactive">Ngừng sử dụng</option>
                </select>
              </div>
            </div>
          </div>

          {/* Items Table / Cards */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Desktop Table View */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4 sm:px-6">Mã & Tên vật tư</th>
                    <th className="py-3.5 px-4">Nhóm & Vị trí</th>
                    <th className="py-3.5 px-4 text-center">Tồn hiện tại</th>
                    <th className="py-3.5 px-4">Đơn giá</th>
                    <th className="py-3.5 px-4">Trạng thái</th>
                    {isAdmin && <th className="py-3.5 px-4 sm:px-6 text-right">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredItems.map((item) => {
                    const isLow = item.active && item.qty <= item.minQty;

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-slate-50/60 transition-colors ${
                          !item.active ? 'bg-slate-50/50 opacity-60' : isLow ? 'bg-rose-50/30' : ''
                        }`}
                      >
                        <td className="py-3.5 px-4 sm:px-6">
                          <div className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded inline-block mb-1 border border-blue-100">
                            {item.sku}
                          </div>
                          <div className="font-bold text-slate-900 text-sm">{item.name}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-700">{item.category}</div>
                          <div className="text-slate-400 flex items-center gap-1 mt-0.5 text-[11px]">
                            <MapPin className="w-3 h-3" />
                            <span>{item.location || 'Chưa gán'}</span>
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-center">
                          <div className="flex flex-col items-center justify-center">
                            <span className={`text-base font-black font-mono ${isLow ? 'text-rose-600' : 'text-slate-900'}`}>
                              {item.qty} {item.unit}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              (Min: {item.minQty} {item.unit})
                            </span>
                            {isLow && (
                              <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                Sắp hết
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="font-mono font-semibold text-slate-800">
                            {formatCurrency(item.unitCost)}
                          </div>
                          <div className="text-[10px] text-slate-400">/ {item.unit}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          {item.active ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3" />
                              Sử dụng
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-700">
                              Ngừng dùng
                            </span>
                          )}
                        </td>

                        {isAdmin && (
                          <td className="py-3.5 px-4 sm:px-6 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {item.active && (
                                <button
                                  onClick={() => openStockIn(item.id)}
                                  className="min-w-[36px] min-h-[36px] flex items-center justify-center text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors active:scale-95"
                                  title="Nhập kho nhanh"
                                >
                                  <ArrowDownLeft className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => openEditItem(item)}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors active:scale-95"
                                title="Sửa vật tư"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleToggleActive(item)}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors active:scale-95"
                                title={item.active ? 'Ngừng sử dụng' : 'Kích hoạt lại'}
                              >
                                <Power className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleAttemptDelete(item)}
                                className="min-w-[36px] min-h-[36px] flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors active:scale-95"
                                title="Xóa vật tư"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards View (Screen < 768px) */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredItems.map((item) => {
                const isLow = item.active && item.qty <= item.minQty;

                return (
                  <div
                    key={item.id}
                    className={`p-4 transition-colors space-y-3 ${
                      !item.active ? 'bg-slate-50/70 opacity-70' : isLow ? 'bg-rose-50/40' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                            {item.sku}
                          </span>
                          <span className="text-[11px] font-medium text-slate-500">
                            {item.category}
                          </span>
                        </div>
                        <h4 className="font-bold text-slate-900 text-sm mt-1">{item.name}</h4>
                      </div>

                      {item.active ? (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          Sử dụng
                        </span>
                      ) : (
                        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-200 text-slate-700">
                          Ngừng dùng
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Tồn kho:</span>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-base font-black font-mono ${isLow ? 'text-rose-600' : 'text-slate-900'}`}>
                            {item.qty} {item.unit}
                          </span>
                          {isLow && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              Sắp hết
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400">(Tối thiểu: {item.minQty} {item.unit})</span>
                      </div>

                      <div className="text-right">
                        <span className="text-slate-400 block text-[10px]">Đơn giá / Vị trí:</span>
                        <div className="font-mono font-bold text-slate-800">
                          {formatCurrency(item.unitCost)}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center justify-end gap-1 mt-0.5">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{item.location || 'Chưa gán'}</span>
                        </div>
                      </div>
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-2 pt-1 border-t border-slate-100 flex-wrap">
                        {item.active && (
                          <button
                            onClick={() => openStockIn(item.id)}
                            className="flex-1 min-h-[44px] px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 active:scale-95 touch-manipulation"
                          >
                            <ArrowDownLeft className="w-4 h-4" />
                            <span>Nhập kho</span>
                          </button>
                        )}
                        <button
                          onClick={() => openEditItem(item)}
                          className="min-h-[44px] px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1 active:scale-95 touch-manipulation"
                        >
                          <Edit className="w-4 h-4" />
                          <span>Sửa</span>
                        </button>
                        <button
                          onClick={() => handleToggleActive(item)}
                          className="min-h-[44px] px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1 active:scale-95 touch-manipulation"
                        >
                          <Power className="w-4 h-4" />
                          <span>{item.active ? 'Khóa' : 'Mở'}</span>
                        </button>
                        <button
                          onClick={() => handleAttemptDelete(item)}
                          className="min-h-[44px] px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-semibold inline-flex items-center justify-center gap-1 active:scale-95 touch-manipulation"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span>Xóa</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {filteredItems.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs">
                Không tìm thấy vật tư nào phù hợp với bộ lọc hiện tại.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Transactions History */}
      {activeTab === 'transactions' && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={transSearch}
                onChange={(e) => setTransSearch(e.target.value)}
                placeholder="Tìm theo tên vật tư, ghi chú, mã công việc, người lập..."
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-xs focus:ring-2 focus:ring-blue-500 bg-slate-50/50"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Loại giao dịch
                </label>
                <select
                  value={transTypeFilter}
                  onChange={(e) => setTransTypeFilter(e.target.value as any)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Tất cả giao dịch</option>
                  <option value="in">Nhập kho (+)</option>
                  <option value="out">Xuất cho công việc (-)</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Lọc theo vật tư
                </label>
                <select
                  value={transItemFilter}
                  onChange={(e) => setTransItemFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs bg-white focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Tất cả vật tư</option>
                  {inventoryItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      [{i.sku}] {i.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Transactions List */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
            {/* Desktop Transactions Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4 sm:px-6">Thời gian</th>
                    <th className="py-3.5 px-4">Loại giao dịch</th>
                    <th className="py-3.5 px-4">Vật tư</th>
                    <th className="py-3.5 px-4 text-center">Số lượng</th>
                    <th className="py-3.5 px-4">Đơn giá</th>
                    <th className="py-3.5 px-4">Ghi chú & Công việc</th>
                    <th className="py-3.5 px-4 sm:px-6">Người thực hiện</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTransactions.map((tx) => {
                    const isIn = tx.type === 'in';

                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/60">
                        <td className="py-3.5 px-4 sm:px-6 text-slate-500">
                          {formatDate(tx.createdAt)}
                        </td>

                        <td className="py-3.5 px-4">
                          {isIn ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <TrendingUp className="w-3.5 h-3.5" />
                              Nhập kho
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200">
                              <TrendingDown className="w-3.5 h-3.5" />
                              Xuất việc
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4">
                          <span className="font-bold text-slate-900">{tx.itemName}</span>
                        </td>

                        <td className="py-3.5 px-4 text-center font-mono font-bold text-sm">
                          <span className={isIn ? 'text-emerald-700' : 'text-amber-700'}>
                            {isIn ? `+${tx.qty}` : `-${tx.qty}`}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono">
                          {formatCurrency(tx.unitCost)}
                        </td>

                        <td className="py-3.5 px-4">
                          <div className="text-slate-700 font-medium">{tx.note || '-'}</div>
                          {tx.workOrderCode && (
                            <span className="inline-block mt-0.5 font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100">
                              Mã CV: {tx.workOrderCode}
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 sm:px-6 text-slate-600">
                          {tx.createdByName || 'Hệ thống'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Transactions Cards (Screen < 768px) */}
            <div className="md:hidden divide-y divide-slate-100">
              {filteredTransactions.map((tx) => {
                const isIn = tx.type === 'in';

                return (
                  <div key={tx.id} className="p-4 space-y-2 bg-white">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono text-slate-400">
                        {formatDate(tx.createdAt)}
                      </span>
                      {isIn ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                          <TrendingUp className="w-3 h-3" />
                          Nhập kho
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                          <TrendingDown className="w-3 h-3" />
                          Xuất việc
                        </span>
                      )}
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-slate-900 text-sm">{tx.itemName}</div>
                      <div className={`text-base font-black font-mono shrink-0 ${isIn ? 'text-emerald-700' : 'text-amber-700'}`}>
                        {isIn ? `+${tx.qty}` : `-${tx.qty}`}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Đơn giá:</span>
                        <span className="font-mono font-bold text-slate-700">{formatCurrency(tx.unitCost)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block">Người thực hiện:</span>
                        <span className="font-medium text-slate-700">{tx.createdByName || 'Hệ thống'}</span>
                      </div>
                    </div>

                    {(tx.note || tx.workOrderCode) && (
                      <div className="text-xs text-slate-600 bg-slate-50/50 p-2 rounded-lg">
                        {tx.workOrderCode && (
                          <span className="inline-block mr-1 font-mono text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100">
                            CV: {tx.workOrderCode}
                          </span>
                        )}
                        <span>{tx.note || '-'}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {filteredTransactions.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs">
                Chưa có giao dịch kho nào được ghi nhận.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Add / Edit Item Modal */}
      <ItemModal
        isOpen={isItemModalOpen}
        item={editingItem}
        categories={categories}
        onClose={() => {
          setIsItemModalOpen(false);
          setEditingItem(null);
        }}
        onSuccess={onSuccessToast}
        onError={onError}
      />

      {/* Stock In Modal */}
      <StockInModal
        isOpen={isStockInModalOpen}
        items={inventoryItems}
        preselectedItemId={stockInPreselectedId}
        onClose={() => {
          setIsStockInModalOpen(false);
          setStockInPreselectedId(undefined);
        }}
        onSuccess={onSuccessToast}
        onError={onError}
      />

      {/* Delete Item Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deletingItem)}
        title="Xóa vật tư này?"
        message={`Bạn có chắc muốn xóa vật tư "${deletingItem?.sku} - ${deletingItem?.name}"? Hành động này không thể hoàn tác.`}
        confirmText="Xác nhận xóa"
        isLoading={isDeleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeletingItem(null)}
      />
    </div>
  );
};
