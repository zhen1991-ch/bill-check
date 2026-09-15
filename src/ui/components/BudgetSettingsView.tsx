
import React, { useState, useEffect } from 'react';
import { useAppContext } from '../context/AppContext';
import { Button } from './Button';

interface BudgetSettingsViewProps {
  onClose: () => void;
}

export const BudgetSettingsView: React.FC<BudgetSettingsViewProps> = ({ onClose }) => {
  const { budget, updateBudget, currency } = useAppContext();
  
  const [isEnabled, setIsEnabled] = useState(false);
  const [monthlyLimit, setMonthlyLimit] = useState<string>('');
  const [yearlyLimit, setYearlyLimit] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (budget) {
      setIsEnabled(budget.isEnabled);
      setMonthlyLimit(budget.monthlyLimit.toString());
      setYearlyLimit(budget.yearlyLimit.toString());
    }
  }, [budget]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateBudget({
        isEnabled,
        monthlyLimit: parseFloat(monthlyLimit) || 0,
        yearlyLimit: parseFloat(yearlyLimit) || 0
      });
      onClose();
    } catch (e) {
      alert("Failed to save budget settings.");
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900 flex items-center">
            <i className="fas fa-piggy-bank text-pink-500 mr-2"></i> Spending Limits
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        <div className="space-y-6">
          {/* Toggle Switch */}
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
            <div>
               <p className="font-bold text-slate-800">Enable Budgets</p>
               <p className="text-xs text-slate-500">Track spending limits</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={isEnabled} onChange={e => setIsEnabled(e.target.checked)} className="sr-only peer" />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          <div className={`space-y-4 transition-opacity ${isEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
             <div>
                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Monthly Limit ({currency})</label>
                <input 
                  type="number" 
                  value={monthlyLimit}
                  onChange={e => setMonthlyLimit(e.target.value)}
                  placeholder="e.g. 500"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
             </div>
             <div>
                <label className="text-xs font-bold text-slate-400 uppercase mb-1 block">Yearly Limit ({currency})</label>
                <input 
                  type="number" 
                  value={yearlyLimit}
                  onChange={e => setYearlyLimit(e.target.value)}
                  placeholder="e.g. 6000"
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
             </div>
          </div>

          <div className="pt-2">
             <Button fullWidth onClick={handleSave} loading={isSaving}>Save Goals</Button>
          </div>
        </div>
      </div>
    </div>
  );
};
