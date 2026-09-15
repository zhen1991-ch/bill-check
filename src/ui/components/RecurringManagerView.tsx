import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Bill, Category, RecurringFrequency } from '../types';
import { getCategoryStyle } from './CategoryPicker';
import { Button } from './Button';

interface RecurringManagerProps {
  onClose: () => void;
}

export const RecurringManagerView: React.FC<RecurringManagerProps> = ({ onClose }) => {
  const { bills, updateBill } = useAppContext();
  const [billToStop, setBillToStop] = useState<Bill | null>(null);
  const [billToEdit, setBillToEdit] = useState<Bill | null>(null);
  
  // Edit Form State
  const [editForm, setEditForm] = useState<{
    merchantName: string;
    amount: string;
    recurring: RecurringFrequency;
    nextDate: string;
  }>({
    merchantName: '',
    amount: '',
    recurring: 'monthly',
    nextDate: ''
  });

  const [isProcessing, setIsProcessing] = useState(false);

  // Filter only master recurring bills (recurring != none AND is not a child copy)
  const recurringBills = bills.filter(
    b => b.recurring && b.recurring !== 'none' && !b.parentBillId
  );

  // Helper to calculate display date if DB field is missing
  const calculateNextDate = (bill: Bill): string => {
    if (bill.nextRecurringDate) return bill.nextRecurringDate;
    
    // Fallback calculation
    const d = new Date(bill.date);
    if (bill.recurring === 'monthly') {
      d.setMonth(d.getMonth() + 1);
    } else if (bill.recurring === 'yearly') {
      d.setFullYear(d.getFullYear() + 1);
    }
    return d.toISOString().split('T')[0];
  };

  // Initialize edit form when billToEdit changes
  useEffect(() => {
    if (billToEdit) {
      setEditForm({
        merchantName: billToEdit.merchantName,
        amount: billToEdit.amount.toString(),
        recurring: billToEdit.recurring || 'monthly',
        nextDate: calculateNextDate(billToEdit)
      });
    }
  }, [billToEdit]);

  const confirmStopRecurring = async () => {
    if (!billToStop) return;
    setIsProcessing(true);
    try {
      await updateBill({
        ...billToStop,
        recurring: 'none',
        nextRecurringDate: null // Use null to clear the stored field.
      });
      setBillToStop(null);
    } catch (e) {
      console.error(e);
      alert("Failed to update bill.");
    } finally {
      setIsProcessing(false);
    }
  };

  const saveEdit = async () => {
    if (!billToEdit) return;
    setIsProcessing(true);
    try {
      await updateBill({
        ...billToEdit,
        merchantName: editForm.merchantName,
        amount: parseFloat(editForm.amount) || 0,
        recurring: editForm.recurring,
        nextRecurringDate: editForm.nextDate
      });
      setBillToEdit(null);
    } catch (e) {
      console.error(e);
      alert("Failed to update bill.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-50 animate-in slide-in-from-right-10 duration-200">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center justify-between border-b border-slate-200 shadow-sm shrink-0">
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
          <i className="fas fa-arrow-left text-lg"></i>
        </button>
        <h2 className="text-lg font-bold text-slate-900">Recurring Expenses</h2>
        <div className="w-10"></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {recurringBills.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-400">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
               <i className="fas fa-sync-alt text-2xl text-slate-300"></i>
            </div>
            <p>No active recurring expenses.</p>
          </div>
        ) : (
          recurringBills.map(bill => {
            const style = getCategoryStyle(bill.category);
            const nextDue = calculateNextDate(bill);
            
            return (
              <div key={bill.id} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-3">
                <div className="flex items-center justify-between">
                   <div className="flex items-center flex-1 min-w-0 mr-2">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm mr-3 shrink-0 ${style.color}`}>
                         <i className={style.icon}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                         <h3 className="font-bold text-slate-900 truncate">{bill.merchantName}</h3>
                         <p className="text-xs text-slate-500 capitalize truncate">{bill.recurring} • {bill.category}</p>
                      </div>
                   </div>
                   <div className="text-right shrink-0">
                      <div className="font-bold text-slate-900 text-lg">{bill.currency} {bill.amount.toFixed(2)}</div>
                   </div>
                </div>
                
                <div className="bg-indigo-50 px-3 py-2 rounded-lg flex justify-between items-center text-xs">
                   <span className="text-indigo-800 font-medium">Next payment due:</span>
                   <span className="font-bold text-indigo-900">{nextDue}</span>
                </div>

                <div className="flex space-x-2">
                  <Button 
                     variant="secondary" 
                     size="sm" 
                     fullWidth
                     onClick={() => setBillToEdit(bill)}
                     className="text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border-indigo-100"
                  >
                     <i className="fas fa-edit mr-2"></i> Edit
                  </Button>
                  <Button 
                     variant="secondary" 
                     size="sm" 
                     onClick={() => setBillToStop(bill)}
                     className="text-red-500 hover:text-red-700 hover:bg-red-50 border-red-100 px-3"
                     title="Stop Recurring"
                  >
                     <i className="fas fa-stop-circle"></i>
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Edit Modal */}
      {billToEdit && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-900 mb-4">Edit Recurring Bill</h3>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Merchant Name</label>
                <input 
                  type="text"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none"
                  value={editForm.merchantName}
                  onChange={e => setEditForm({...editForm, merchantName: e.target.value})}
                />
              </div>
              
              <div className="flex space-x-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Amount</label>
                  <input 
                    type="number"
                    step="0.01"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none"
                    value={editForm.amount}
                    onChange={e => setEditForm({...editForm, amount: e.target.value})}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Frequency</label>
                  <select 
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none bg-white"
                    value={editForm.recurring}
                    onChange={e => setEditForm({...editForm, recurring: e.target.value as RecurringFrequency})}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Next Payment Date</label>
                <input 
                  type="date"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:border-indigo-500 outline-none"
                  value={editForm.nextDate}
                  onChange={e => setEditForm({...editForm, nextDate: e.target.value})}
                />
              </div>
            </div>

            <div className="flex space-x-3">
               <Button variant="secondary" fullWidth onClick={() => setBillToEdit(null)}>Cancel</Button>
               <Button variant="primary" fullWidth onClick={saveEdit} loading={isProcessing}>Save</Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {billToStop && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xs shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-500 mx-auto">
               <i className="fas fa-ban text-xl"></i>
            </div>
            <h3 className="text-lg font-bold text-slate-900 text-center mb-2">Stop Subscription?</h3>
            <p className="text-sm text-slate-500 text-center mb-6">
              Automatic bills for <strong>{billToStop.merchantName}</strong> will no longer be generated.
            </p>
            <div className="flex space-x-3">
               <Button variant="secondary" fullWidth onClick={() => setBillToStop(null)}>Cancel</Button>
               <Button variant="danger" fullWidth onClick={confirmStopRecurring} loading={isProcessing}>Confirm</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
