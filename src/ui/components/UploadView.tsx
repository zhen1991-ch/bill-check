
/*
 * UploadView Component
 * Handles bill creation via manual entry or AI receipt scanning.
 * Input: onComplete callback, optional existingBill for editing
 * Output: Creates or updates bills in the global state/database
 * 
 * Features:
 * - Multi-image upload queue for AI analysis
 * - Sequential processing of receipt images
 * - Manual bill entry form
 * - Edit mode for existing bills
 */

import React, { useState, useRef, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { analyzeReceiptImage } from '../services/backendService';
import { Bill, Category, RecurringFrequency, BillItem } from '../types';
import { Button } from './Button';
import { CategoryPicker, getCategoryStyle } from './CategoryPicker';
import { generateRetroactiveBills, calculateNextDate } from '../services/recurringService';

interface UploadViewProps {
   onComplete: () => void;
   existingBill?: Bill; // Optional prop for Edit Mode
}

interface QueueItem {
   id: string;
   file: File;
   preview: string;
   status: 'pending' | 'analyzing' | 'review' | 'saved' | 'error';
   result?: Partial<Bill>;
   error?: string;
}

export const UploadView: React.FC<UploadViewProps> = ({ onComplete, existingBill }) => {
   const { addBill, updateBill, collections, currency: defaultCurrency } = useAppContext();
   const fileInputRef = useRef<HTMLInputElement>(null);

   const isEditMode = !!existingBill;

   // Tabs (Force 'manual' if editing)
   const [activeTab, setActiveTab] = useState<'scan' | 'manual'>(isEditMode ? 'manual' : 'scan');

   // Helper to get local date string in YYYY-MM-DD format
   const getLocalDateString = () => {
      const d = new Date();
      const offset = d.getTimezoneOffset() * 60000;
      const localISOTime = (new Date(d.getTime() - offset)).toISOString().slice(0, 10);
      return localISOTime;
   };

   // --- Scan / Queue State ---
   const [queue, setQueue] = useState<QueueItem[]>([]);
   const [isProcessing, setIsProcessing] = useState(false);
   const [isSaving, setIsSaving] = useState(false);
   const isSavingRef = useRef(false);
   const [receiptDataAttested, setReceiptDataAttested] = useState(false);
   const [activeReviewId, setActiveReviewId] = useState<string | null>(null);
   const [editingQueueId, setEditingQueueId] = useState<string | null>(null);

   // Selected Collections for Scan Mode (Global or per item? Let's make it per item conceptually, but UI might be global for simplicity. 
   // For now, let's keep the existing 'selectedCollections' state and apply it to the currently reviewed item)
   const [selectedCollections, setSelectedCollections] = useState<string[]>(existingBill?.collectionIds || []);

   // --- Manual Form State ---
   const [manualForm, setManualForm] = useState({
      amount: existingBill?.amount.toString() || '',
      currency: existingBill?.currency || defaultCurrency,
      merchantName: existingBill?.merchantName || '',
      date: existingBill?.date || getLocalDateString(),
      category: existingBill?.category || Category.Other,
      recurring: existingBill?.recurring || ('none' as RecurringFrequency),
      isTaxRelevant: existingBill?.isTaxRelevant || false
   });

   // Recurring Info Tooltip State
   const [showRecurringInfo, setShowRecurringInfo] = useState(false);

   const [manualAttachment, setManualAttachment] = useState<string | null>(existingBill?.imageUrl || null);

   // Line Items State - Allow string for amount during editing to support "12." and "12,2"
   const [lineItems, setLineItems] = useState<{ description: string; amount: string | number; category: Category }[]>(existingBill?.items || []);

   // Category Picker State
   const [isCategoryPickerOpen, setCategoryPickerOpen] = useState(false);
   const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);

   // Helper to compress image
   const compressImage = (base64Str: string, maxWidth = 800, quality = 0.7): Promise<string> => {
      return new Promise((resolve) => {
         const img = new Image();
         img.src = base64Str;
         img.onload = () => {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
               height = Math.round((height * maxWidth) / width);
               width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
         };
      });
   };

   // --- Queue Processing Logic ---
   useEffect(() => {
      const processNext = async () => {
         if (isProcessing) return;

         // Find first pending item
         const pendingIndex = queue.findIndex(i => i.status === 'pending');
         if (pendingIndex === -1) return;

         setIsProcessing(true);
         const item = queue[pendingIndex];

         // Update status to analyzing
         setQueue(prev => {
            const newQ = [...prev];
            newQ[pendingIndex] = { ...newQ[pendingIndex], status: 'analyzing' };
            return newQ;
         });

         try {
            // Convert file to base64 for API
            const base64 = await new Promise<string>((resolve) => {
               const reader = new FileReader();
               reader.onloadend = () => resolve(reader.result as string);
               reader.readAsDataURL(item.file);
            });

            const result = await analyzeReceiptImage(base64);

            setQueue(prev => {
               const newQ = [...prev];
               newQ[pendingIndex] = { ...newQ[pendingIndex], status: 'review', result };
               return newQ;
            });

            // If this is the first item, automatically open review? Maybe not, let user choose.
            // Or if we are waiting for this one, maybe auto-select? 
            // Let's auto-select if nothing is selected.
            // setActiveReviewId(prev => prev ? prev : item.id); 

         } catch (error: any) {
            setQueue(prev => {
               const newQ = [...prev];
               newQ[pendingIndex] = { ...newQ[pendingIndex], status: 'error', error: error.message };
               return newQ;
            });
         } finally {
            setIsProcessing(false);
         }
      };

      processNext();
   }, [queue, isProcessing]);


   // --- Item Management (Manual) ---
   const handleAddItem = () => {
      setLineItems([
         ...lineItems,
         { description: 'New Item', amount: '', category: manualForm.category as Category }
      ]);
   };

   const handleUpdateItem = (index: number, field: keyof BillItem, value: any) => {
      const updated = [...lineItems];
      updated[index] = { ...updated[index], [field]: value };
      setLineItems(updated);
   };

   const handleRemoveItem = (index: number) => {
      const updated = [...lineItems];
      updated.splice(index, 1);
      setLineItems(updated);
   };

   // --- Scan Handlers ---
   const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (!receiptDataAttested) {
         alert('Confirm that the receipt contains no protected health information or complete payment-card data before selecting it.');
         event.target.value = '';
         return;
      }
      if (event.target.files && event.target.files.length > 0) {
         const files = Array.from(event.target.files);
         const invalidFile = files.find(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024);
         if (invalidFile) {
            alert('Receipt images must be JPEG, PNG, or WebP and no larger than 8 MB.');
            event.target.value = '';
            return;
         }
         if (activeTab === 'manual') {
            // Manual mode - single file attachment
            const file = event.target.files[0];
            const reader = new FileReader();
            reader.onloadend = () => setManualAttachment(reader.result as string);
            reader.readAsDataURL(file);
         } else {
            // Scan mode - queue
            const newItems: QueueItem[] = Array.from(event.target.files).map(file => ({
               id: Math.random().toString(36).substr(2, 9),
               file,
               preview: URL.createObjectURL(file),
               status: 'pending'
            }));
            setQueue(prev => [...prev, ...newItems]);
         }
      }
      // Reset input
      if (fileInputRef.current) fileInputRef.current.value = '';
   };

   const handleScanSave = async (item: QueueItem) => {
      if (!item.result) return;

      try {
         let finalImage = item.preview; // This is a blob URL. We need base64 for storage if not uploading file directly.
         // Local storage accepts the original as an embedded Base64 file.
         // The existing logic uses base64 string in 'imageUrl'. 
         // We need to convert the file back to base64 or use the one we generated for API?
         // Let's re-read the file to base64 for saving to ensure we have the data.
         const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(item.file);
         });

         if (base64.length > 500000) {
            finalImage = await compressImage(base64);
         } else {
            finalImage = base64;
         }

         // Convert scanned items to BillItem[] if structured
         const finalItems: BillItem[] = (item.result.items || []).map(i => {
            if (typeof i === 'object') return i as BillItem;
            return { description: i as string, amount: 0, category: item.result!.category as Category };
         });

         let finalAmount = item.result.amount || 0;
         if (finalItems.length > 0) {
            const sum = finalItems.reduce((acc, item) => acc + (item.amount || 0), 0);
            if (sum > 0) finalAmount = sum;
         }

         const newBill: Bill = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            merchantName: item.result.merchantName || 'Unknown Merchant',
            date: item.result.date || getLocalDateString(),
            amount: finalAmount,
            currency: item.result.currency || 'USD',
            category: item.result.category || Category.Other,
            items: finalItems,
            isTaxRelevant: item.result.isTaxRelevant || false,
            taxReason: item.result.taxReason,
            taxDeductibleLineItems: item.result.taxDeductibleLineItems,
            collectionIds: selectedCollections,
            imageUrl: finalImage || undefined,
            createdAt: Date.now(),
            recurring: 'none'
         };

         await addBill(newBill);

         // Update status to saved
         setQueue(prev => prev.map(i => i.id === item.id ? { ...i, status: 'saved' } : i));

         // Close review if open
         if (activeReviewId === item.id) {
            setActiveReviewId(null);
         }

         // Check if all saved
         const remaining = queue.filter(i => i.id !== item.id && i.status !== 'saved');
         if (remaining.length === 0 && queue.length > 0) {
            // All done? stay here or close?
            // Let user close manually or add more.
         }

      } catch (error: any) {
         alert(`Failed to save bill: ${error.message}`);
      }
   };

   const handleSaveAll = async () => {
      const reviewItems = queue.filter(i => i.status === 'review');
      for (const item of reviewItems) {
         await handleScanSave(item);
      }
      if (queue.every(i => i.status === 'saved' || i.status === 'error')) {
         onComplete();
      }
   };

   // --- Edit Queue Logic ---
   const handleEditQueueItem = (item: QueueItem) => {
      if (!item.result) return;
      setEditingQueueId(item.id);

      setManualForm({
         amount: (item.result.amount || 0).toString(),
         currency: item.result.currency || defaultCurrency,
         merchantName: item.result.merchantName || '',
         date: item.result.date || getLocalDateString(),
         category: item.result.category || Category.Other,
         recurring: 'none' as RecurringFrequency,
         isTaxRelevant: item.result.isTaxRelevant || false
      });

      setLineItems(
         (item.result.items || []).map(i => {
            if (typeof i === 'object') return i as BillItem;
            return { description: i as string, amount: 0, category: item.result!.category as Category || Category.Other };
         })
      );

      setManualAttachment(item.preview);

      setActiveTab('manual');
      setActiveReviewId(null);
   };

   // --- Manual/Edit Handlers ---
   const handleManualSave = async () => {
      if (isSavingRef.current) return;

      if (!manualForm.merchantName) {
         alert("Please enter merchant name.");
         return;
      }

      isSavingRef.current = true;
      setIsSaving(true);
      try {
         let finalImage = undefined;
         if (manualAttachment) {
            finalImage = manualAttachment.startsWith('data:') && manualAttachment.length > 500000
               ? await compressImage(manualAttachment)
               : manualAttachment;
         } else if (existingBill?.imageUrl && !manualAttachment) {
            finalImage = null;
         }

         let finalAmount = parseFloat(manualForm.amount.toString().replace(',', '.')) || 0;
         if (lineItems.length > 0) {
            const sum = lineItems.reduce((acc, item) => {
               const val = typeof item.amount === 'string' ? parseFloat(item.amount.replace(',', '.')) : item.amount;
               return acc + (val || 0);
            }, 0);
            if (sum > 0) {
               finalAmount = sum;
            }
         }

         if (finalAmount <= 0) {
            alert("Total amount must be greater than 0.");
            return;
         }

         const billId = existingBill ? existingBill.id : Date.now().toString();
         const wasRecurring = existingBill && existingBill.recurring && existingBill.recurring !== 'none';
         const isRecurringNow = manualForm.recurring !== 'none';
         const isRecurrenceChange = existingBill && (existingBill.recurring !== manualForm.recurring);

         const billData: Bill = {
            id: billId,
            merchantName: manualForm.merchantName,
            date: manualForm.date,
            amount: finalAmount,
            currency: manualForm.currency,
            category: manualForm.category as Category,
            items: lineItems.map(i => ({
               ...i,
               amount: typeof i.amount === 'string' ? parseFloat(i.amount.replace(',', '.')) || 0 : i.amount
            })),
            isTaxRelevant: manualForm.isTaxRelevant,
            collectionIds: selectedCollections,
            imageUrl: finalImage,
            recurring: manualForm.recurring,
            createdAt: existingBill ? existingBill.createdAt : Date.now(),
            nextRecurringDate: (isRecurrenceChange || !isRecurringNow) ? null : (existingBill?.nextRecurringDate || null),
            parentBillId: existingBill?.parentBillId
         };

         let retroactiveBills: Bill[] = [];
         let retroactiveMsg = "";

         if (manualForm.recurring !== 'none') {
            if (!billData.nextRecurringDate) {
               const result = generateRetroactiveBills(billData, manualForm.recurring);
               if (result.retroactiveBills.length > 0) {
                  retroactiveBills = result.retroactiveBills;
                  retroactiveMsg = `System automatically generated ${retroactiveBills.length} past bills based on your new recurring setting.`;
               }
               billData.nextRecurringDate = result.nextDueDate;
            }
         } else {
            billData.nextRecurringDate = null;
         }

         if (isEditMode && !editingQueueId) {
            await updateBill(billData);
         } else {
            await addBill(billData);
         }

         if (retroactiveBills.length > 0) {
            await Promise.all(retroactiveBills.map(b => addBill(b)));
         }

         if (retroactiveMsg) {
            alert(retroactiveMsg);
         }

         if (editingQueueId) {
            setQueue(prev => prev.map(i => i.id === editingQueueId ? { ...i, status: 'saved', result: { ...i.result, ...billData } } : i));
            setEditingQueueId(null);
            setActiveTab('scan');

            setManualForm({ ...manualForm, merchantName: '', amount: '' });
            setManualAttachment(null);
            setLineItems([]);

            alert("Bill saved from queue.");
            return;
         }

         onComplete();
      } catch (error: any) {
         alert(`Failed to save: ${error.message}`);
      } finally {
         isSavingRef.current = false;
         setIsSaving(false);
      }
   };

   const toggleCollection = (id: string) => {
      setSelectedCollections(prev =>
         prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
      );
   };

   // --- Render ---

   // 1. Active Review View (Single Item Overlay)
   if (activeTab === 'scan' && activeReviewId) {
      const item = queue.find(i => i.id === activeReviewId);
      if (item && item.result) {
         return (
            <div className="flex flex-col h-screen bg-slate-50 overflow-y-auto pb-24 animate-in fade-in">
               <div className="relative h-64 bg-black shrink-0">
                  <img src={item.preview} alt="Receipt" className="w-full h-full object-contain opacity-80" />
                  <button onClick={() => setActiveReviewId(null)} className="absolute top-4 left-4 w-10 h-10 bg-white/20 backdrop-blur-md rounded-full text-white flex items-center justify-center"><i className="fas fa-arrow-left"></i></button>
               </div>
               <div className="flex-1 -mt-6 bg-white rounded-t-3xl p-6 shadow-lg relative z-10 flex flex-col">
                  <h2 className="text-2xl font-bold text-slate-900">{item.result.merchantName}</h2>
                  <div className="flex items-center text-slate-500 text-sm mb-2">
                     <i className="far fa-calendar-alt mr-2"></i>
                     <span>{item.result.date || getLocalDateString()}</span>
                  </div>
                  <div className="flex items-baseline justify-between mb-4 border-b border-slate-100 pb-4">
                     <p className="text-indigo-600 text-3xl font-bold">{item.result.currency}{item.result.amount?.toFixed(2)}</p>
                     <div className="flex items-center text-sm text-slate-500">
                        <div className={`w-3 h-3 rounded-full mr-1.5 ${getCategoryStyle(item.result.category as Category).color.split(' ')[0]}`}></div>
                        {item.result.category}
                     </div>
                  </div>

                  {/* Extracted Line Items */}
                  <div className="flex-1 overflow-y-auto mb-4">
                     <h3 className="text-xs font-bold text-slate-400 uppercase mb-3">Extracted Items</h3>
                     <div className="space-y-2">
                        {item.result.items && item.result.items.length > 0 ? (
                           item.result.items.map((lineItem, idx) => {
                              const isObj = typeof lineItem === 'object';
                              const name = isObj ? (lineItem as BillItem).description : (lineItem as string);
                              const amount = isObj ? (lineItem as BillItem).amount : null;
                              const cat = isObj ? (lineItem as BillItem).category : null;
                              const style = cat ? getCategoryStyle(cat) : { icon: 'fas fa-box', color: 'bg-slate-100 text-slate-500' };

                              return (
                                 <div key={idx} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="flex items-center overflow-hidden">
                                       <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs mr-3 shrink-0 ${style.color}`}>
                                          <i className={style.icon}></i>
                                       </div>
                                       <span className="text-sm font-medium text-slate-700 truncate">{name}</span>
                                    </div>
                                    {amount !== null && (
                                       <span className="text-sm font-bold text-slate-900 ml-2">{item.result?.currency}{amount.toFixed(2)}</span>
                                    )}
                                 </div>
                              );
                           })
                        ) : (
                           <p className="text-sm text-slate-400 italic">No specific line items found.</p>
                        )}
                     </div>
                  </div>

                  <div className="pt-2">
                     <p className="text-sm font-medium mb-2">Save to Collections:</p>
                     <div className="flex flex-wrap gap-2">
                        {collections.map(col => (
                           <button key={col.id} onClick={() => toggleCollection(col.id)} className={`text-xs px-3 py-1 rounded-full border ${selectedCollections.includes(col.id) ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600'}`}>{col.name}</button>
                        ))}
                     </div>
                  </div>
               </div>
               <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-slate-200 z-20 flex space-x-3 safe-area-bottom">
                  <Button variant="ghost" onClick={() => setActiveReviewId(null)} className="flex-1">Back</Button>
                  <Button variant="ghost" onClick={() => handleEditQueueItem(item)} className="flex-1 text-indigo-600 bg-indigo-50">Edit</Button>
                  <Button onClick={() => handleScanSave(item)} className="flex-[2]">Confirm & Save</Button>
               </div>
            </div>
         );
      }
   }

   // 2. Main View (Tabs: Scan / Manual) or Edit View
   return (
      <div className="flex flex-col min-h-screen bg-slate-50">
         <div className="p-4 pt-6 bg-white shadow-sm z-10 sticky top-0">
            <div className="flex items-center justify-between mb-4">
               <button onClick={onComplete} className="text-slate-400 hover:text-slate-600"><i className="fas fa-times text-xl"></i></button>
               <h1 className="text-lg font-bold text-slate-900">{isEditMode || editingQueueId ? 'Edit Bill' : 'Add Bill'}</h1>
               <div className="w-6"></div>
            </div>

            {!isEditMode && (
               <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button
                     onClick={() => { setActiveTab('scan'); setEditingQueueId(null); }}
                     className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'scan' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                     <i className="fas fa-camera mr-2"></i> Scan
                  </button>
                  <button
                     onClick={() => { setActiveTab('manual'); setEditingQueueId(null); }}
                     className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === 'manual' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                     <i className="fas fa-pen mr-2"></i> Manual
                  </button>
               </div>
            )}
         </div>

         <div className="flex-1 p-6 overflow-y-auto">
            {/* Hidden File Input */}
            <input
               type="file"
               accept="image/*"
               multiple={activeTab === 'scan'} // Allow multiple only in scan mode
               className="hidden"
               ref={fileInputRef}
               onChange={handleFileChange}
            />

            <label className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
               <input
                  type="checkbox"
                  checked={receiptDataAttested}
                  onChange={(event) => setReceiptDataAttested(event.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-amber-700"
               />
               <span>
                  I confirm any receipt image I select contains no protected health information, complete card number, CVV, or magnetic-track data. I will crop or redact those details first.
               </span>
            </label>

            {activeTab === 'scan' ? (
               <div className="space-y-6">
                  {/* Empty State or Add More */}
                  {queue.length === 0 ? (
                     <div className="text-center py-10 space-y-6">
                        <div className="w-24 h-24 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mx-auto shadow-inner">
                           <i className="fas fa-magic text-3xl"></i>
                        </div>
                        <div>
                           <h3 className="text-xl font-bold text-slate-900">AI Receipt Scanner</h3>
                           <p className="text-slate-500 text-sm mt-2 max-w-xs mx-auto">Upload multiple photos. AI will extract details sequentially.</p>
                        </div>
                        <div className="space-y-3 pt-4">
                            <Button disabled={!receiptDataAttested} onClick={() => fileInputRef.current?.click()} fullWidth size="lg" className="shadow-lg shadow-indigo-200">
                              <i className="fas fa-images mr-2"></i> Select Images
                           </Button>
                        </div>
                     </div>
                  ) : (
                     <div className="space-y-4 pb-24">
                        <div className="flex justify-between items-center">
                           <h3 className="text-sm font-bold text-slate-500 uppercase">Upload Queue ({queue.length})</h3>
                           <Button disabled={!receiptDataAttested} size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                              <i className="fas fa-plus mr-1"></i> Add
                           </Button>
                        </div>

                        <div className="space-y-3">
                           {queue.map(item => (
                              <div
                                 key={item.id}
                                 className={`flex items-center p-3 bg-white rounded-xl border shadow-sm transition-all ${item.status === 'saved' ? 'border-green-200 opacity-60' : 'border-slate-200'}`}
                              >
                                 <div className="w-12 h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0 mr-3 relative">
                                    <img src={item.preview} className="w-full h-full object-cover" alt="thumb" />
                                    {item.status === 'saved' && (
                                       <div className="absolute inset-0 bg-green-500/50 flex items-center justify-center text-white">
                                          <i className="fas fa-check"></i>
                                       </div>
                                    )}
                                 </div>

                                 <div className="flex-1 min-w-0">
                                    {item.status === 'pending' && <p className="text-sm font-medium text-slate-500">Waiting...</p>}
                                    {item.status === 'analyzing' && (
                                       <div className="flex items-center text-indigo-600">
                                          <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2"></div>
                                          <p className="text-sm font-bold">Analyzing...</p>
                                       </div>
                                    )}
                                    {item.status === 'error' && <p className="text-sm font-bold text-red-500 truncate">{item.error}</p>}
                                    {(item.status === 'review' || item.status === 'saved') && item.result && (
                                       <div>
                                          <p className="text-sm font-bold text-slate-900 truncate">{item.result.merchantName}</p>
                                          <p className="text-xs text-slate-500">{item.result.currency}{item.result.amount?.toFixed(2)}</p>
                                       </div>
                                    )}
                                 </div>

                                 <div className="ml-2">
                                    {item.status === 'review' && (
                                       <Button size="sm" onClick={() => setActiveReviewId(item.id)}>Review</Button>
                                    )}
                                    {item.status === 'saved' && (
                                       <span className="text-xs font-bold text-green-600 px-2 py-1 bg-green-50 rounded-md">Saved</span>
                                    )}
                                    {item.status === 'error' && (
                                       <button className="text-slate-400 hover:text-red-500" onClick={() => {
                                          setQueue(q => q.filter(i => i.id !== item.id));
                                       }}><i className="fas fa-times"></i></button>
                                    )}
                                 </div>
                              </div>
                           ))}
                        </div>

                        {/* Bulk Actions */}
                        {queue.some(i => i.status === 'review') && (
                           <div className="fixed bottom-4 left-4 right-4 z-30">
                              <Button fullWidth onClick={handleSaveAll} className="shadow-xl">
                                 Save All Verified ({queue.filter(i => i.status === 'review').length})
                              </Button>
                           </div>
                        )}
                     </div>
                  )}
               </div>
            ) : (
               <div className="space-y-5 animate-in slide-in-from-bottom-2">
                  {/* Manual Form */}
                  <div className="grid grid-cols-3 gap-3">
                     <div className="col-span-1">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Currency</label>
                        <select
                           className="w-full p-3 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                           value={manualForm.currency}
                           onChange={e => setManualForm({ ...manualForm, currency: e.target.value })}
                        >
                           {['USD', 'EUR', 'GBP', 'CNY', 'JPY'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                     </div>
                     <div className="col-span-2">
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">
                           Amount
                           {lineItems.length > 0 && <span className="ml-2 text-[10px] text-indigo-500 normal-case">(Auto-calculated from items on save)</span>}
                        </label>
                        <input
                           inputMode="decimal"
                           className={`w-full p-3 bg-white border rounded-xl text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 font-bold ${lineItems.length > 0 ? 'border-indigo-200 bg-indigo-50/30' : 'border-slate-200'}`}
                           placeholder="0.00"
                           value={manualForm.amount}
                           onChange={e => setManualForm({ ...manualForm, amount: e.target.value })}
                           disabled={lineItems.length > 0}
                        />
                     </div>
                  </div>

                  <div>
                     <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Merchant Name</label>
                     <input
                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="e.g. Starbucks"
                        value={manualForm.merchantName}
                        onChange={e => setManualForm({ ...manualForm, merchantName: e.target.value })}
                     />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                     <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Date</label>
                        <div className="relative">
                           <input
                              type="date"
                              lang="en-US"
                              className="w-full p-3 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                              value={manualForm.date ? manualForm.date.substring(0, 10) : ''}
                              onChange={e => setManualForm({ ...manualForm, date: e.target.value })}
                              onClick={(e) => {
                                 if ('showPicker' in HTMLInputElement.prototype) {
                                    try {
                                       (e.target as HTMLInputElement).showPicker();
                                    } catch (error) {
                                       // ignore
                                    }
                                 }
                              }}
                           />
                           <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                              <i className="fas fa-calendar-alt"></i>
                           </div>
                        </div>
                     </div>
                     <div>
                        <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Category</label>
                        <button
                           onClick={() => { setActiveItemIndex(null); setCategoryPickerOpen(true); }}
                           className="w-full flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl text-slate-900 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                           <div className="flex items-center overflow-hidden">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs mr-2 shrink-0 ${getCategoryStyle(manualForm.category as Category).color}`}>
                                 <i className={getCategoryStyle(manualForm.category as Category).icon}></i>
                              </div>
                              <span className="truncate text-sm">{manualForm.category}</span>
                           </div>
                           <i className="fas fa-chevron-down text-slate-400 text-xs ml-1"></i>
                        </button>
                     </div>
                  </div>

                  {/* Line Items Section */}
                  <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
                     <div className="flex justify-between items-center mb-3">
                        <h4 className="text-xs font-bold text-slate-500 uppercase">Line Items</h4>
                        <Button size="sm" variant="secondary" onClick={handleAddItem} className="py-1 text-xs">
                           <i className="fas fa-plus mr-1"></i> Add Item
                        </Button>
                     </div>

                     <div className="space-y-2">
                        {lineItems.length === 0 ? (
                           <p className="text-sm text-slate-400 text-center py-2">No items listed</p>
                        ) : (
                           lineItems.map((item, idx) => {
                              const itemCatStyle = getCategoryStyle(item.category);
                              return (
                                 <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm animate-in zoom-in-95">
                                    <div className="flex items-center space-x-2 mb-2">
                                       {/* Item Category Picker Trigger */}
                                       <button
                                          onClick={() => { setActiveItemIndex(idx); setCategoryPickerOpen(true); }}
                                          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${itemCatStyle.color}`}
                                       >
                                          <i className={itemCatStyle.icon}></i>
                                       </button>
                                       <input
                                          className="flex-1 border-b border-transparent focus:border-indigo-500 bg-transparent text-sm font-medium outline-none p-1"
                                          value={item.description}
                                          onChange={e => handleUpdateItem(idx, 'description', e.target.value)}
                                          placeholder="Item description"
                                       />
                                       <button onClick={() => handleRemoveItem(idx)} className="text-slate-300 hover:text-red-500 p-1">
                                          <i className="fas fa-times"></i>
                                       </button>
                                    </div>
                                    <div className="flex justify-end items-center space-x-2">
                                       <span className="text-xs text-slate-400 font-bold">{manualForm.currency}</span>
                                       <input
                                          inputMode="decimal"
                                          className="w-24 text-right bg-slate-50 rounded px-2 py-1 text-sm font-bold outline-none focus:ring-1 focus:ring-indigo-500"
                                          value={item.amount}
                                          onChange={e => handleUpdateItem(idx, 'amount', e.target.value)}
                                       />
                                    </div>
                                 </div>
                              );
                           })
                        )}
                     </div>

                     {/* Live Total */}
                     {lineItems.length > 0 && (
                        <div className="flex justify-end mt-3 pt-2 border-t border-slate-200">
                           <span className="text-xs font-bold text-slate-500 mr-2">Total:</span>
                           <span className="text-sm font-bold text-slate-900">
                              {manualForm.currency} {lineItems.reduce((a, b) => {
                                 const val = typeof b.amount === 'string' ? parseFloat(b.amount.replace(',', '.')) : b.amount;
                                 return a + (val || 0);
                              }, 0).toFixed(2)}
                           </span>
                        </div>
                     )}
                  </div>

                  {/* Recurring */}
                  <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 relative">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center text-indigo-800 font-bold text-sm">
                           <i className="fas fa-sync-alt mr-2"></i> Recurring Bill?
                           <button
                              onClick={() => setShowRecurringInfo(!showRecurringInfo)}
                              className="ml-2 w-5 h-5 rounded-full bg-indigo-200 text-indigo-600 flex items-center justify-center text-[10px] hover:bg-indigo-300"
                           >
                              <i className="fas fa-question"></i>
                           </button>
                        </div>
                        <select
                           className="bg-white border border-indigo-200 text-indigo-700 text-sm rounded-lg px-2 py-1 outline-none"
                           value={manualForm.recurring}
                           onChange={e => setManualForm({ ...manualForm, recurring: e.target.value as RecurringFrequency })}
                        >
                           <option value="none">No</option>
                           <option value="daily">Daily</option>
                           <option value="weekly">Weekly</option>
                           <option value="monthly">Monthly</option>
                           <option value="yearly">Yearly</option>
                        </select>
                     </div>

                     {/* Tooltip */}
                     {showRecurringInfo && (
                        <div className="absolute top-full left-0 right-0 mt-2 p-3 bg-indigo-800 text-white text-xs rounded-xl shadow-xl z-20 animate-in fade-in slide-in-from-top-1">
                           <p className="mb-1 font-bold">Retroactive Generation:</p>
                           <p>If you set a past date (e.g. Jan 1st) as recurring, the system will automatically generate all missing bills between then and today.</p>
                           <div className="absolute -top-1 left-8 w-2 h-2 bg-indigo-800 rotate-45"></div>
                        </div>
                     )}
                  </div>

                  {/* Collections */}
                  <div>
                     <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Add to Collections</label>
                     <div className="flex flex-wrap gap-2">
                        {collections.map(col => (
                           <button
                              key={col.id}
                              onClick={() => toggleCollection(col.id)}
                              className={`text-xs px-3 py-2 rounded-lg border transition-all ${selectedCollections.includes(col.id) ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200'}`}
                           >
                              {selectedCollections.includes(col.id) && <i className="fas fa-check mr-1"></i>}
                              {col.name}
                           </button>
                        ))}
                     </div>
                  </div>

                  {/* Attachment */}
                  <div>
                     <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Attachment (Optional)</label>
                     {manualAttachment ? (
                        <div className="relative h-32 w-full rounded-xl overflow-hidden border border-slate-200">
                           <img src={manualAttachment} className="w-full h-full object-cover" alt="attachment" />
                           <button
                              onClick={() => setManualAttachment(null)}
                              className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md"
                           >
                              <i className="fas fa-times"></i>
                           </button>
                        </div>
                     ) : (
                         <button
                            disabled={!receiptDataAttested}
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-6 border-2 border-dashed border-slate-300 rounded-xl text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors flex flex-col items-center disabled:cursor-not-allowed disabled:opacity-50"
                        >
                           <i className="fas fa-paperclip text-xl mb-1"></i>
                           <span className="text-xs font-medium">Add Receipt Image</span>
                        </button>
                     )}
                  </div>

                  <div className="pt-4 pb-20">
                     <Button fullWidth size="lg" onClick={handleManualSave} loading={isSaving}>
                        {isEditMode || editingQueueId ? 'Save Changes' : 'Save Manual Bill'}
                     </Button>
                  </div>
               </div>
            )}
         </div>

         {/* Category Picker */}
         {isCategoryPickerOpen && (
            <CategoryPicker
               selectedCategory={activeItemIndex !== null ? lineItems[activeItemIndex].category : manualForm.category as Category}
               onSelect={(c) => {
                  if (activeItemIndex !== null) {
                     handleUpdateItem(activeItemIndex, 'category', c);
                  } else {
                     setManualForm({ ...manualForm, category: c });
                  }
               }}
               onClose={() => setCategoryPickerOpen(false)}
            />
         )}
      </div>
   );
};
