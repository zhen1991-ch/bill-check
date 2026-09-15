
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Bill, Collection, Currency, Category, BillItem, TimeRange } from '../types';
import { Button } from './Button';
import JSZip from 'jszip';
import { CategoryPicker, getCategoryStyle } from './CategoryPicker';
import { UploadView } from './UploadView';
import { convertCurrency } from '../utils/currencyUtils';
import { CLOUD_EDITIONS_ENABLED, CloudApiError, downloadOriginals } from '../services/cloudEditions';

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
  JPY: 'Yen'
};

const TIME_RANGES: { id: TimeRange; label: string }[] = [
  { id: 'all', label: 'All Time' },
  { id: 'this_month', label: 'This Month' },
  { id: 'last_month', label: 'Last Month' },
  { id: 'this_year', label: 'This Year' },
  { id: 'last_3_years', label: 'Last 3 Years' },
];

export const BillsView: React.FC = () => {
  const { bills, collections, deleteBill, addCollection, deleteCollection, currency: appCurrency, activeWorkspace } = useAppContext();
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [filterCollectionId, setFilterCollectionId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string | null>(null);
  const [filterTimeRange, setFilterTimeRange] = useState<TimeRange>('all');

  // --- Modal States ---
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [collectionToDelete, setCollectionToDelete] = useState<string | null>(null);
  const [billToDelete, setBillToDelete] = useState<Bill | null>(null);

  // --- Custom Dropdown States ---
  const [isTimePickerOpen, setTimePickerOpen] = useState(false);
  const [isFilterCategoryPickerOpen, setFilterCategoryPickerOpen] = useState(false);

  // --- Bulk Download States ---
  const [collectionToDownload, setCollectionToDownload] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadNeedsPlus, setDownloadNeedsPlus] = useState(false);
  const [exportBatch, setExportBatch] = useState(0);
  useEffect(() => { setExportBatch(0); setDownloadError(null); setDownloadNeedsPlus(false); }, [collectionToDownload]);

  // --- Edit Mode States ---
  const [isEditing, setIsEditing] = useState(false);

  const filteredBills = useMemo(() => {
    let result = bills;

    if (filterCollectionId) {
      result = result.filter(bill => bill.collectionIds.includes(filterCollectionId));
    }

    if (filterCategory) {
      result = result.filter(bill => bill.category === filterCategory);
    }

    if (filterTimeRange !== 'all') {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();

      result = result.filter(b => {
        const d = new Date(b.date);
        if (isNaN(d.getTime())) return false;

        switch (filterTimeRange) {
          case 'this_month':
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
          case 'last_month':
            const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
            const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
            return d.getMonth() === lastMonth && d.getFullYear() === lastMonthYear;
          case 'this_year':
            return d.getFullYear() === currentYear;
          case 'last_3_years':
            return d.getFullYear() >= currentYear - 2;
          default:
            return true;
        }
      });
    }

    return result;
  }, [bills, filterCollectionId, filterCategory, filterTimeRange]);

  const sortedBills = useMemo(() => {
    return [...filteredBills].sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [filteredBills]);

  const groupedBills = useMemo(() => {
    const groups: Record<string, Bill[]> = {};
    sortedBills.forEach(bill => {
      const d = new Date(bill.date);
      const key = isNaN(d.getTime())
        ? 'Unknown Date'
        : d.toLocaleString('en-US', { month: 'long', year: 'numeric' });

      if (!groups[key]) groups[key] = [];
      groups[key].push(bill);
    });
    return groups;
  }, [sortedBills]);

  const groupKeys = Object.keys(groupedBills);

  // --- Handlers (Existing) ---
  const handleCreateSubmit = () => {
    if (newCollectionName.trim()) {
      const newCol: Collection = {
        id: `col_${Date.now()}`,
        name: newCollectionName.trim(),
        description: 'Custom collection'
      };
      addCollection(newCol);
      setFilterCollectionId(newCol.id);
      setCreateModalOpen(false);
      setNewCollectionName('');
    }
  };

  const handleDeleteConfirm = () => {
    if (collectionToDelete) {
      deleteCollection(collectionToDelete);
      if (filterCollectionId === collectionToDelete) setFilterCollectionId(null);
      setCollectionToDelete(null);
    }
  };

  const handleDeleteBillConfirm = async () => {
    if (billToDelete) {
      await deleteBill(billToDelete.id);
      setBillToDelete(null);
      setSelectedBill(null);
    }
  };

  const getCollectionName = (id: string) => collections.find(c => c.id === id)?.name || 'Collection';

  const handleBulkDownloadConfirm = async () => {
    if (!collectionToDownload) return;
    setIsDownloading(true);
    setDownloadError(null); setDownloadNeedsPlus(false);
    try {
      if (CLOUD_EDITIONS_ENABLED) {
        if (!activeWorkspace) throw new Error('Select a Billspace first.');
        await downloadOriginals(activeWorkspace.id, bills.filter(b => b.collectionIds.includes(collectionToDownload)).slice(exportBatch * 100, (exportBatch + 1) * 100).map(b => b.id));
        setCollectionToDownload(null);
        return;
      }
      const zip = new JSZip();
      const billsInCol = bills.filter(b => b.collectionIds.includes(collectionToDownload));
      const colName = getCollectionName(collectionToDownload);

      // Create a folder inside the zip with the same name as the collection
      const folder = zip.folder(colName);

      if (!folder) throw new Error("Failed to create folder");

      let count = 0;
      const usedNames: Record<string, number> = {};

      for (const bill of billsInCol) {
        if (bill.imageUrl) {
          // Extract base64 data (remove prefix data:image/jpeg;base64,)
          const parts = bill.imageUrl.split(',');
          const base64Data = parts.length > 1 ? parts[1] : parts[0];

          // Naming Rule: Category_Time_Name.png

          // 1. Clean Category: lowercase, remove spaces/special chars, keep &
          // e.g. "Food & Drinks" -> "food&drinks"
          const cleanCat = bill.category.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9&_]/g, '');

          // 2. Clean Date: YYYY-MM-DD -> YYYYMMDD
          // e.g. "2025-11-23" -> "20251123"
          const cleanDate = bill.date.replaceAll('-', '');

          // 3. Clean Merchant: lowercase, replace spaces with underscore
          // e.g. "Starbucks Coffee" -> "starbucks_coffee"
          const cleanMerchant = bill.merchantName.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

          let fileNameBase = `${cleanCat}_${cleanDate}_${cleanMerchant}`;

          // Handle Duplicates (same merchant, same day, same category)
          if (usedNames[fileNameBase]) {
            usedNames[fileNameBase]++;
            fileNameBase = `${fileNameBase}_${usedNames[fileNameBase]}`;
          } else {
            usedNames[fileNameBase] = 1;
          }

          // Enforce .png extension as requested
          const fileName = `${fileNameBase}.png`;

          folder.file(fileName, base64Data, { base64: true });
          count++;
        }
      }

      if (count === 0) {
        alert("No images found in this collection.");
        setIsDownloading(false);
        setCollectionToDownload(null);
        return;
      }

      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      // Zip folder name matches collection name
      a.download = `${colName}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : 'Failed to generate ZIP.');
      setDownloadNeedsPlus(e instanceof CloudApiError && e.code === 'upgrade_required');
    } finally {
      setIsDownloading(false);
      if (!CLOUD_EDITIONS_ENABLED) setCollectionToDownload(null);
    }
  };

  const handleSingleDownload = (bill: Bill) => {
    if (!bill.imageUrl) return;
    const a = document.createElement('a');
    a.href = bill.imageUrl;
    const cleanMerchant = bill.merchantName.replace(/[^a-z0-9]/gi, '_');
    a.download = `${bill.date}_${cleanMerchant}.jpg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const uniqueCategories = Array.from(new Set(bills.map(b => b.category)));

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-slate-200 pt-4 pb-0 shadow-sm">
        <div className="px-4 pb-3 flex justify-between items-end">
          <div>
            <h1 className="text-xl font-bold text-slate-900">My Bills</h1>
            <p className="text-xs text-slate-500">{filteredBills.length} receipts found</p>
          </div>
        </div>

        {/* Filters Row 1: Time & Category */}
        <div className="flex space-x-2 px-4 pb-3 items-center relative z-30">

          {/* Time Range - Custom Dropdown */}
          <div className="relative shrink-0">
            <button
              onClick={() => setTimePickerOpen(!isTimePickerOpen)}
              className={`flex items-center pl-3 pr-3 py-1.5 rounded-full border text-xs font-bold transition-all shadow-sm ${filterTimeRange !== 'all'
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 ring-2 ring-indigo-500/20'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
            >
              <i className={`far fa-calendar-alt mr-2 ${filterTimeRange !== 'all' ? 'text-indigo-500' : 'text-slate-400'}`}></i>
              <span>{TIME_RANGES.find(t => t.id === filterTimeRange)?.label}</span>
              <i className={`fas fa-chevron-down ml-2 text-[10px] transition-transform duration-200 ${isTimePickerOpen ? 'rotate-180 text-indigo-500' : 'text-slate-300'}`}></i>
            </button>

            {isTimePickerOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setTimePickerOpen(false)}></div>
                <div className="absolute top-full left-0 mt-2 w-48 bg-white rounded-2xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] border border-slate-100 py-2 z-40 animate-in zoom-in-95 origin-top-left overflow-hidden">
                  <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">Select Period</div>
                  {TIME_RANGES.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setFilterTimeRange(t.id); setTimePickerOpen(false); }}
                      className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center justify-between ${filterTimeRange === t.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-50'
                        }`}
                    >
                      <span>{t.label}</span>
                      {filterTimeRange === t.id && <i className="fas fa-check text-indigo-500"></i>}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Category - Custom Picker Trigger */}
          <button
            onClick={() => setFilterCategoryPickerOpen(true)}
            className={`flex items-center pl-1.5 pr-4 py-1.5 rounded-full border text-xs font-bold transition-colors shadow-sm shrink-0 h-[34px] ${filterCategory ? 'bg-white border-indigo-200 text-indigo-900 ring-2 ring-indigo-500/20' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {filterCategory ? (
              <>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] mr-2 ${getCategoryStyle(filterCategory as Category).color}`}>
                  <i className={getCategoryStyle(filterCategory as Category).icon}></i>
                </div>
                {filterCategory}
              </>
            ) : (
              <>
                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 mr-2 border border-slate-200">
                  <i className="fas fa-th-large text-[10px]"></i>
                </div>
                All Categories
              </>
            )}
            <i className="fas fa-chevron-down ml-2 text-[10px] text-slate-300"></i>
          </button>

          {/* Clear Filters */}
          {(filterCategory || filterTimeRange !== 'all') && (
            <button
              onClick={() => { setFilterCategory(null); setFilterTimeRange('all'); }}
              className="w-8 h-8 rounded-full bg-slate-100 text-slate-400 hover:text-slate-600 hover:bg-slate-200 flex items-center justify-center shrink-0 transition-colors"
              title="Clear Filters"
            >
              <i className="fas fa-times text-xs"></i>
            </button>
          )}
        </div>

        {/* Filters Row 2: Collections - Improved Scrolling */}
        <div className="w-full overflow-x-auto scrollbar-hide pb-3">
          <div className="flex space-x-2 px-4 items-center min-w-max">
            <button
              onClick={() => setFilterCollectionId(null)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors border shrink-0 ${filterCollectionId === null ? 'bg-slate-900 text-white border-slate-900 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              All Collections
            </button>
            {collections.map(col => (
              <div key={col.id} className="relative shrink-0 flex items-center">
                <button
                  onClick={() => setFilterCollectionId(col.id)}
                  className={`whitespace-nowrap pl-4 pr-4 py-1.5 rounded-full text-sm font-medium transition-colors border flex items-center space-x-2 ${filterCollectionId === col.id ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  <span>{col.name}</span>
                  {filterCollectionId === col.id && !col.isSystem && (
                    <span onClick={(e) => { e.stopPropagation(); setCollectionToDelete(col.id); }} className="w-5 h-5 -mr-1 ml-1 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center cursor-pointer">
                      <i className="fas fa-times text-[10px]"></i>
                    </span>
                  )}
                </button>
                {filterCollectionId === col.id && (
                  <button onClick={() => setCollectionToDownload(col.id)} className="ml-2 w-8 h-8 bg-white border border-slate-200 rounded-full text-slate-500 hover:text-indigo-600 shadow-sm" title="Download All"><i className="fas fa-download text-xs"></i></button>
                )}
              </div>
            ))}
            <button onClick={() => setCreateModalOpen(true)} className="whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors border border-dashed border-slate-300 text-slate-500 hover:bg-slate-100 hover:text-indigo-600 shrink-0"><i className="fas fa-plus"></i></button>
          </div>
        </div>
      </header>

      {/* List */}
      <main className="p-4 space-y-6">
        {sortedBills.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4"><i className="far fa-folder-open text-2xl text-slate-300"></i></div>
            <p className="font-medium">No bills found.</p>
          </div>
        ) : (
          groupKeys.map(monthKey => (
            <div key={monthKey} className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider sticky top-[150px] bg-slate-50/95 backdrop-blur-sm py-1 z-10 w-full">{monthKey}</h3>
              <div className="space-y-3">
                {groupedBills[monthKey].map(bill => {
                  const isForeign = bill.currency !== appCurrency;
                  const convertedVal = isForeign ? convertCurrency(bill.amount, bill.currency, appCurrency as Currency).toFixed(2) : null;
                  const catStyle = getCategoryStyle(bill.category);

                  return (
                    <div key={bill.id} onClick={() => { setSelectedBill(bill); setIsEditing(false); }} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center space-x-4 active:scale-98 transition-transform cursor-pointer relative overflow-hidden hover:shadow-md">
                      {bill.isTaxRelevant && <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500"></div>}
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg shrink-0 ${catStyle.color}`}>
                        <i className={catStyle.icon}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <h3 className="font-semibold text-slate-900 truncate">{bill.merchantName}</h3>
                          <div className="text-right">
                            <span className="font-bold text-slate-900 block leading-tight">{CURRENCY_SYMBOLS[bill.currency] || bill.currency}{bill.amount.toFixed(2)}</span>
                            {isForeign && <span className="text-[10px] text-slate-400 font-medium block mt-0.5">≈ {CURRENCY_SYMBOLS[appCurrency]}{convertedVal}</span>}
                          </div>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <div className="flex flex-col">
                            <p className="text-xs text-slate-500">{bill.date}</p>
                            {bill.createdByName && (
                              <p className="text-[10px] text-slate-400 italic mt-0.5">Added by {bill.createdByName}</p>
                            )}
                          </div>
                          {bill.recurring && bill.recurring !== 'none' && <span className="text-[10px] bg-purple-100 text-purple-600 px-1.5 rounded ml-2"><i className="fas fa-sync-alt mr-1"></i>{bill.recurring}</span>}
                          <div className="flex space-x-1 ml-auto">
                            {bill.collectionIds.slice(0, 2).map(cid => {
                              const colName = collections.find(c => c.id === cid)?.name;
                              if (!colName) return null;
                              return <span key={cid} className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded-md truncate max-w-[80px]">{colName}</span>;
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </main>

      {/* Bill Detail / Edit Modal */}
      {selectedBill && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 animate-in slide-in-from-bottom-10 duration-300">

          {/* Edit Mode: Render Reuseable UploadView */}
          {isEditing ? (
            <UploadView
              existingBill={selectedBill}
              onComplete={() => { setIsEditing(false); setSelectedBill(null); }}
            />
          ) : (
            <>
              {/* View Mode Header */}
              <div className="relative h-16 bg-white border-b border-slate-200 flex items-center px-4 shadow-sm shrink-0 z-20">
                <button onClick={() => setSelectedBill(null)} className="w-10 h-10 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100"><i className="fas fa-arrow-left"></i></button>
                <h2 className="ml-2 font-bold text-slate-900">Bill Details</h2>
                <div className="ml-auto flex space-x-2">
                  <button onClick={() => handleSingleDownload(selectedBill)} className="text-slate-500 w-10 h-10 flex items-center justify-center hover:bg-slate-50 rounded-full"><i className="fas fa-download"></i></button>
                  <button onClick={() => setIsEditing(true)} className="text-indigo-600 w-10 h-10 flex items-center justify-center hover:bg-indigo-50 rounded-full"><i className="fas fa-pen"></i></button>
                  <button onClick={() => setBillToDelete(selectedBill)} className="text-red-500 w-10 h-10 flex items-center justify-center hover:bg-red-50 rounded-full"><i className="far fa-trash-alt"></i></button>
                </div>
              </div>

              {/* View Mode Content */}
              <div className="flex-1 overflow-y-auto">
                <div className="bg-slate-900 py-8 px-4 flex items-center justify-center min-h-[300px] relative group">
                  {selectedBill.imageUrl ? <img src={selectedBill.imageUrl} className="max-h-[50vh] w-auto object-contain rounded-lg shadow-2xl" /> : <div className="text-white/50 text-sm">No image</div>}
                </div>

                <div className="p-6 space-y-6 bg-white min-h-[calc(50vh)] rounded-t-3xl -mt-6 relative z-10 shadow-lg">
                  <div className="w-12 h-1.5 bg-slate-200 rounded-full mx-auto mb-4"></div>
                  <div className="text-center mb-8 border-b border-slate-100 pb-6">
                    <h1 className="text-2xl font-bold text-slate-900">{selectedBill.merchantName}</h1>
                    <div className="text-4xl font-bold text-indigo-600 mt-2">{CURRENCY_SYMBOLS[selectedBill.currency] || selectedBill.currency}{selectedBill.amount.toFixed(2)}</div>

                    <div className="flex items-center justify-center space-x-3 mt-4 text-sm font-medium text-slate-500">
                      <span className="bg-slate-100 px-2 py-1 rounded-md">{selectedBill.date}</span>
                      <span>•</span>
                      <span className="flex items-center"><i className={`${getCategoryStyle(selectedBill.category).icon} mr-1.5 text-xs`}></i> {selectedBill.category}</span>
                    </div>
                    {selectedBill.recurring && selectedBill.recurring !== 'none' && (
                      <div className="mt-2 text-xs text-purple-600 font-bold uppercase"><i className="fas fa-sync-alt mr-1"></i> Recurring: {selectedBill.recurring}</div>
                    )}
                  </div>

                  <div className="space-y-6">
                    {/* Items List */}
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <div className="bg-slate-50 px-4 py-2 border-b border-slate-100 font-bold text-xs text-slate-500 uppercase">Items</div>
                      <div className="divide-y divide-slate-100">
                        {selectedBill.items && selectedBill.items.length > 0 ? (
                          selectedBill.items.map((item, idx) => {
                            const isObj = typeof item === 'object';
                            const name = isObj ? (item as BillItem).description : (item as string);
                            const amount = isObj ? (item as BillItem).amount : null;
                            const cat = isObj ? (item as BillItem).category : null;
                            const style = cat ? getCategoryStyle(cat) : null;

                            return (
                              <div key={idx} className="px-4 py-3 bg-white flex justify-between items-center text-sm">
                                <div className="flex items-center">
                                  {style && <i className={`${style.icon} mr-2 text-xs text-slate-400`}></i>}
                                  <span className="text-slate-700 font-medium">{name}</span>
                                </div>
                                {amount !== null && <span className="font-semibold text-slate-900">{selectedBill.currency}{amount.toFixed(2)}</span>}
                              </div>
                            );
                          })
                        ) : (
                          <div className="px-4 py-3 text-slate-400 italic text-sm">No items listed</div>
                        )}
                      </div>
                    </div>

                    {/* Collections */}
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase mb-3">Collections</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedBill.collectionIds.map(cid => { const c = collections.find(x => x.id === cid); return c ? <span key={cid} className="px-3 py-1 bg-indigo-50 text-indigo-700 text-sm rounded-full">{c.name}</span> : null })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Category Picker Modal - For Filtering */}
      {isFilterCategoryPickerOpen && (
        <CategoryPicker
          selectedCategory={filterCategory as Category || Category.Other}
          onSelect={(c) => setFilterCategory(c)}
          onClose={() => setFilterCategoryPickerOpen(false)}
        />
      )}

      {/* Bulk Download Confirmation Modal */}
      {collectionToDownload && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center mb-4 mx-auto text-indigo-500">
              <i className="fas fa-cloud-download-alt text-xl"></i>
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center mb-2">Download Collection?</h3>
            {CLOUD_EDITIONS_ENABLED && bills.filter(b => b.collectionIds.includes(collectionToDownload)).length > 100 && <label className="block text-sm mb-4">Receipt batch<select disabled={isDownloading} value={exportBatch} onChange={event => setExportBatch(Number(event.target.value))} className="block w-full mt-2 border rounded-lg p-2">{Array.from({ length: Math.ceil(bills.filter(b => b.collectionIds.includes(collectionToDownload)).length / 100) }, (_, index) => <option key={index} value={index}>Receipts {index * 100 + 1}–{Math.min((index + 1) * 100, bills.filter(b => b.collectionIds.includes(collectionToDownload)).length)}</option>)}</select></label>}
            {downloadError && <div role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{downloadError}{downloadNeedsPlus && <a href="/billing" className="mt-2 block underline font-semibold">View Plus plans</a>}</div>}
            <p className="text-sm text-slate-500 text-center mb-6">
              This will export saved originals in <strong>{getCollectionName(collectionToDownload)}</strong>, preserving their file formats. {CLOUD_EDITIONS_ENABLED && 'Requires your own Plus plan. Archives are limited to 100 receipts and 24 MiB each.'}
            </p>
            <div className="flex space-x-3">
              <Button variant="secondary" fullWidth onClick={() => setCollectionToDownload(null)} disabled={isDownloading}>
                Cancel
              </Button>
              <Button fullWidth onClick={handleBulkDownloadConfirm} loading={isDownloading}>
                Download
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ... Other Modals ... */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">New Collection</h3>
            <input className="w-full border border-slate-300 rounded-xl px-4 py-3 mb-4 mt-2 outline-none" placeholder="Name" value={newCollectionName} onChange={e => setNewCollectionName(e.target.value)} />
            <div className="flex space-x-2 justify-end"><Button variant="ghost" onClick={() => setCreateModalOpen(false)}>Cancel</Button><Button onClick={handleCreateSubmit} disabled={!newCollectionName.trim()}>Create</Button></div>
          </div>
        </div>
      )}
      {collectionToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl">
            <h3 className="text-lg font-bold mb-2">Delete Collection?</h3>
            <p className="text-sm text-slate-500 mb-4">Bills inside will not be deleted.</p>
            <div className="flex space-x-2"><Button variant="secondary" fullWidth onClick={() => setCollectionToDelete(null)}>Cancel</Button><Button variant="danger" fullWidth onClick={handleDeleteConfirm}>Delete</Button></div>
          </div>
        </div>
      )}
      {billToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl">
            <h3 className="text-lg font-bold mb-2">Delete Bill?</h3>
            <div className="flex space-x-2"><Button variant="secondary" fullWidth onClick={() => setBillToDelete(null)}>Cancel</Button><Button variant="danger" fullWidth onClick={handleDeleteBillConfirm}>Delete</Button></div>
          </div>
        </div>
      )}
    </div>
  );
};
