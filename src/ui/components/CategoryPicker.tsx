import React, { useState } from 'react';
import { Category } from '../types';

interface CategoryPickerProps {
  selectedCategory: Category;
  onSelect: (category: Category) => void;
  onClose: () => void;
}

export const getCategoryStyle = (cat: Category) => {
  switch (cat) {
    case Category.FoodAndDrinks: return { icon: 'fas fa-utensils', color: 'bg-orange-100 text-orange-600' };
    case Category.OfficeSupplies: return { icon: 'fas fa-paperclip', color: 'bg-purple-100 text-purple-600' };
    case Category.LegalAndFees: return { icon: 'fas fa-gavel', color: 'bg-rose-100 text-rose-600' };
    case Category.Vehicle: return { icon: 'fas fa-car', color: 'bg-blue-100 text-blue-600' };
    case Category.Travel: return { icon: 'fas fa-plane', color: 'bg-pink-100 text-pink-600' };
    case Category.Technology: return { icon: 'fas fa-laptop', color: 'bg-indigo-100 text-indigo-600' };
    case Category.PhoneAndInternet: return { icon: 'fas fa-wifi', color: 'bg-cyan-100 text-cyan-600' };
    case Category.TaxesAndInsurances: return { icon: 'fas fa-file-invoice-dollar', color: 'bg-red-100 text-red-600' };
    case Category.GoodsAndMaterials: return { icon: 'fas fa-boxes', color: 'bg-amber-100 text-amber-600' };
    case Category.Workplace: return { icon: 'fas fa-building', color: 'bg-slate-200 text-slate-600' };
    case Category.InterestAndBankCharges: return { icon: 'fas fa-percent', color: 'bg-emerald-100 text-emerald-600' };
    case Category.TrainingAndLiterature: return { icon: 'fas fa-graduation-cap', color: 'bg-teal-100 text-teal-600' };
    case Category.Marketing: return { icon: 'fas fa-bullhorn', color: 'bg-fuchsia-100 text-fuchsia-600' };
    case Category.Investments: return { icon: 'fas fa-chart-line', color: 'bg-green-100 text-green-600' };
    case Category.EmployeeCompensation: return { icon: 'fas fa-users', color: 'bg-lime-100 text-lime-600' };
    case Category.MailingAndShipping: return { icon: 'fas fa-envelope', color: 'bg-yellow-100 text-yellow-600' };
    case Category.Leasing: return { icon: 'fas fa-key', color: 'bg-violet-100 text-violet-600' };
    default: return { icon: 'fas fa-receipt', color: 'bg-slate-100 text-slate-600' };
  }
};

export const CategoryPicker: React.FC<CategoryPickerProps> = ({ selectedCategory, onSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const categories = Object.values(Category).filter(c => 
    c.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-50 animate-in slide-in-from-bottom-10 duration-200">
      {/* Header */}
      <div className="bg-white px-4 py-4 flex items-center justify-between border-b border-slate-200 shadow-sm shrink-0">
        <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full text-slate-500 hover:bg-slate-100">
          <i className="fas fa-arrow-left text-lg"></i>
        </button>
        <h2 className="text-lg font-bold text-slate-900">Choose Category</h2>
        <div className="w-10"></div> {/* Spacer */}
      </div>

      {/* Search */}
      <div className="p-4 bg-white border-b border-slate-100">
        <div className="relative">
          <i className="fas fa-search absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input 
            type="text"
            placeholder="Search categories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-2xl py-3 pl-12 pr-4 text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
            autoFocus
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2 pb-safe">
        {categories.map(cat => {
          const style = getCategoryStyle(cat);
          const isSelected = selectedCategory === cat;

          return (
            <button
              key={cat}
              onClick={() => { onSelect(cat); onClose(); }}
              className={`w-full flex items-center p-3 rounded-2xl transition-all ${
                isSelected ? 'bg-indigo-50 border border-indigo-200 ring-1 ring-indigo-200' : 'bg-white border border-slate-100 hover:bg-slate-50'
              }`}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg shrink-0 ${style.color}`}>
                <i className={style.icon}></i>
              </div>
              <div className="ml-4 flex-1 text-left">
                <span className={`block font-bold text-base ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                  {cat}
                </span>
              </div>
              <div className="text-slate-300">
                {isSelected ? <i className="fas fa-check-circle text-indigo-600 text-xl"></i> : <i className="fas fa-chevron-right text-sm"></i>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};