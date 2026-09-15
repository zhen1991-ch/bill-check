import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { ChatAssistant } from './ChatAssistant';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { Category, TimeRange, Currency, UserPermissions } from '../types';
import { Button } from './Button';
import { getCategoryStyle } from './CategoryPicker';
import { RecurringManagerView } from './RecurringManagerView';
import { BudgetSettingsView } from './BudgetSettingsView';
import { WorkspaceManagerView } from './WorkspaceManagerView';
import { ProfileSettingsView } from './ProfileSettingsView';
import { CollectionManagerView } from './CollectionManagerView';
import { convertCurrency } from '../utils/currencyUtils';
import { CLOUD_EDITIONS_ENABLED } from '../services/cloudEditions';

// Map Tailwind colors to Hex for Recharts
const CATEGORY_HEX_COLORS: Record<Category, string> = {
  [Category.FoodAndDrinks]: '#ea580c', // orange-600
  [Category.OfficeSupplies]: '#9333ea', // purple-600
  [Category.LegalAndFees]: '#e11d48', // rose-600
  [Category.Vehicle]: '#2563eb', // blue-600
  [Category.Travel]: '#db2777', // pink-600
  [Category.Technology]: '#4f46e5', // indigo-600
  [Category.PhoneAndInternet]: '#0891b2', // cyan-600
  [Category.TaxesAndInsurances]: '#dc2626', // red-600
  [Category.GoodsAndMaterials]: '#d97706', // amber-600
  [Category.Workplace]: '#475569', // slate-600
  [Category.InterestAndBankCharges]: '#059669', // emerald-600
  [Category.TrainingAndLiterature]: '#0d9488', // teal-600
  [Category.Marketing]: '#c026d3', // fuchsia-600
  [Category.Investments]: '#16a34a', // green-600
  [Category.EmployeeCompensation]: '#65a30d', // lime-600
  [Category.MailingAndShipping]: '#ca8a04', // yellow-600
  [Category.Leasing]: '#7c3aed', // violet-600
  [Category.Other]: '#64748b' // slate-500
};

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  CNY: '¥',
  JPY: 'Yen'
};

export const DashboardView: React.FC = () => {
  const navigate = useNavigate();
  const {
    bills, collections, user, currency, setCurrency,
    activeWorkspace, availableWorkspaces, switchWorkspace,
    budget
  } = useAppContext();

  const [activeCollectionId, setActiveCollectionId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('this_month');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isWorkspaceManagerOpen, setIsWorkspaceManagerOpen] = useState(false);
  const [isProfileSettingsOpen, setIsProfileSettingsOpen] = useState(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isCollectionManagerOpen, setIsCollectionManagerOpen] = useState(false);

  // Expansion state for Breakdown Chart
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  // Filter bills based on collection AND Time Range
  const filteredBills = useMemo(() => {
    let result = bills;

    // 1. Collection Filter
    if (activeCollectionId) {
      result = result.filter(b => b.collectionIds.includes(activeCollectionId));
    }

    // 2. Time Range Filter
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    result = result.filter(b => {
      const d = new Date(b.date);
      if (isNaN(d.getTime())) return false; // Skip invalid dates

      switch (timeRange) {
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
        case 'all':
        default:
          return true;
      }
    });

    return result;
  }, [bills, activeCollectionId, timeRange]);

  // For Budget: Filter bills based ONLY on Time Range (Ignore Collection)
  const globalBillsForBudget = useMemo(() => {
    let result = bills;
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    result = result.filter(b => {
      const d = new Date(b.date);
      if (isNaN(d.getTime())) return false;

      switch (timeRange) {
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
        case 'all':
        default:
          return true;
      }
    });
    return result;
  }, [bills, timeRange]);

  // Calculate stats
  const totalSpent = filteredBills.reduce((sum, b) => sum + convertCurrency(b.amount, b.currency, currency), 0);
  const globalTotalSpent = globalBillsForBudget.reduce((sum, b) => sum + convertCurrency(b.amount, b.currency, currency), 0);

  const totalTaxRelevant = filteredBills
    .filter(b => b.isTaxRelevant)
    .reduce((sum, b) => sum + convertCurrency(b.amount, b.currency, currency), 0);

  // Budget Calculations
  const budgetInfo = useMemo(() => {
    if (!budget || !budget.isEnabled) return null;

    let limit = 0;
    let label = '';

    if (timeRange === 'this_month' || timeRange === 'last_month') {
      limit = budget.monthlyLimit;
      label = 'Monthly Cap';
    } else if (timeRange === 'this_year') {
      limit = budget.yearlyLimit;
      label = 'Yearly Cap';
    } else {
      return null;
    }

    if (limit <= 0) return null;

    const percent = Math.min((globalTotalSpent / limit) * 100, 100);
    const remaining = limit - globalTotalSpent;

    let statusMsg = "";
    let statusColor = "";
    let statusIcon = "";

    if (percent < 50) {
      statusMsg = "Living the dream! 🌴";
      statusColor = "text-emerald-500";
      statusIcon = "fas fa-cocktail";
    } else if (percent < 75) {
      statusMsg = "Smooth sailing ⛵";
      statusColor = "text-indigo-500";
      statusIcon = "fas fa-thumbs-up";
    } else if (percent < 90) {
      statusMsg = "Easy tiger... 🐅";
      statusColor = "text-orange-500";
      statusIcon = "fas fa-exclamation";
    } else if (percent < 100) {
      statusMsg = "Panic mode! 🚨";
      statusColor = "text-red-500";
      statusIcon = "fas fa-fire";
    } else {
      statusMsg = "Wallet crying 😭";
      statusColor = "text-red-600 font-black";
      statusIcon = "fas fa-skull";
    }

    return { limit, remaining, percent, label, statusMsg, statusColor, statusIcon };
  }, [budget, timeRange, globalTotalSpent]);

  // Prepare Pie Chart Data
  const categoryData = useMemo(() => {
    const map = new Map<string, number>();
    filteredBills.forEach(b => {
      const prev = map.get(b.category) || 0;
      map.set(b.category, prev + convertCurrency(b.amount, b.currency, currency));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({
        name,
        value,
        color: CATEGORY_HEX_COLORS[name as Category] || '#94a3b8'
      }))
      .sort((a, b) => b.value - a.value);
  }, [filteredBills]);

  // Prepare Bar Chart Data
  const trendData = useMemo(() => {
    const map = new Map<string, number>();

    filteredBills.forEach(b => {
      let key = b.date.substring(0, 7); // Default YYYY-MM

      if (timeRange === 'this_month' || timeRange === 'last_month') {
        key = b.date.substring(8, 10); // DD
      } else if (timeRange === 'this_year' || timeRange === 'last_3_years') {
        // YYYY-MM is fine
      } else if (timeRange === 'all') {
        key = b.date.substring(0, 4); // YYYY if all time
      }


      const prev = map.get(key) || 0;
      map.set(key, prev + convertCurrency(b.amount, b.currency, currency));
    });

    const sortedKeys = Array.from(map.keys()).sort();
    return sortedKeys.map(key => ({ name: key, amount: map.get(key) }));
  }, [filteredBills, timeRange]);

  const currencySymbol = CURRENCY_SYMBOLS[currency] || currency;

  if (!user) return null;

  // Guard clause against null activeWorkspace
  if (!activeWorkspace) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-50">
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mb-2"></div>
          <p className="text-xs text-slate-400">Loading Billspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 pb-24 font-sans selection:bg-indigo-100 relative">

      {/* Dynamic Background Blob */}
      <div className={`fixed top-0 left-0 w-full h-64 rounded-b-[40px] shadow-2xl z-0 transition-colors duration-500 bg-gradient-to-br ${activeWorkspace.type === 'personal' ? 'from-indigo-500 via-purple-500 to-pink-500' : 'from-emerald-500 via-teal-500 to-cyan-500'}`}></div>

      {/* Header */}
      <header className={`relative z-30 px-6 ${activeWorkspace.type === 'custom' ? 'pt-10' : 'pt-8'} pb-4`}>
        <div className="flex justify-between items-center mb-6">
          <div className="text-white">
            <p className="text-sm font-medium opacity-80">
              {activeWorkspace.type === 'personal' ? `Hello, ${user.name ? user.name.split(' ')[0] : 'Friend'}!` : 'Billspace'}
            </p>
            <div className="flex items-center">
              <h1 className="text-2xl font-bold tracking-tight mr-2">
                {activeWorkspace.name}
              </h1>
              <button aria-label="Manage Billspaces" onClick={() => setIsWorkspaceManagerOpen(true)} className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white/90">
                <i className="fas fa-chevron-down text-xs"></i>
              </button>
            </div>
          </div>

          <div className="relative">
            <button
              aria-label="Open user menu"
              aria-expanded={showUserMenu}
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="w-11 h-11 rounded-full p-0.5 bg-white/30 backdrop-blur-md border border-white/40 shadow-lg transition-transform active:scale-95"
            >
              <img src={user.avatarUrl} alt="User" className="w-full h-full object-cover rounded-full" />
              {activeWorkspace.type === 'custom' && (
                <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center border-2 border-white text-xs text-white">
                  <i className="fas fa-users"></i>
                </div>
              )}
            </button>

            {showUserMenu && (
              <div className="absolute right-0 mt-3 w-72 max-w-[calc(100vw-2rem)] bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 py-2 animate-in fade-in slide-in-from-top-4 origin-top-right overflow-hidden z-50">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50">
                  <p className="text-sm font-bold text-slate-900 truncate">{user.name}</p>
                  <p className="text-xs text-slate-500 truncate">{user.email}</p>
                </div>

                {/* Quick Workspace Switcher (Limited) */}
                <div className="px-5 py-3 border-b border-slate-100">
                  <div className="flex justify-between items-center mb-2">
                    <p className="text-xs font-bold text-slate-400 uppercase">Switch Billspace</p>
                    <button onClick={() => { setIsWorkspaceManagerOpen(true); setShowUserMenu(false); }} className="text-[10px] text-indigo-600 font-bold hover:underline">Manage All</button>
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {availableWorkspaces.slice(0, 5).map(ws => (
                      <button
                        key={ws.id}
                        onClick={() => { switchWorkspace(ws); setShowUserMenu(false); }}
                        className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg text-sm transition-colors ${activeWorkspace?.id === ws.id
                          ? 'bg-indigo-50 text-indigo-700 font-bold border border-indigo-100'
                          : 'hover:bg-slate-50 text-slate-600'
                          }`}
                      >
                        <div className="flex items-center truncate">
                          <i className={`mr-2 text-xs ${ws.type === 'personal' ? 'fas fa-user text-slate-400' : 'fas fa-layer-group text-emerald-500'}`}></i>
                          <span className="truncate">{ws.name}</span>
                        </div>
                        {activeWorkspace?.id === ws.id && <i className="fas fa-check text-indigo-500"></i>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="py-2 border-b border-slate-100">
                  <button
                    aria-label="Edit Profile"
                    onClick={() => {setIsProfileSettingsOpen(true);setShowUserMenu(false);}}
                    className="w-full text-left px-5 py-2.5 text-sm flex items-center transition-colors text-slate-700 hover:bg-slate-50"
                  >
                    <i className="fas fa-user-pen w-6 text-indigo-500"></i> Edit Profile
                  </button>
                  {CLOUD_EDITIONS_ENABLED && <button onClick={() => { navigate('/billing'); setShowUserMenu(false); }} className="w-full text-left px-5 py-2.5 text-sm text-indigo-700 hover:bg-slate-50">Plan and billing</button>}
                  <button
                    onClick={() => {
                      setIsCollectionManagerOpen(true);
                      setShowUserMenu(false);
                    }}
                    className="w-full text-left px-5 py-2.5 text-sm flex items-center transition-colors text-slate-700 hover:bg-slate-50"
                  >
                    <i className="fas fa-folder-open w-6 text-orange-500"></i> Manage Collections
                  </button>
                  <button
                    onClick={() => {
                      setIsBudgetModalOpen(true);
                      setShowUserMenu(false);
                    }}
                    className="w-full text-left px-5 py-2.5 text-sm flex items-center transition-colors text-slate-700 hover:bg-slate-50"
                  >
                    <i className="fas fa-bullseye w-6 text-pink-500"></i> Set Budget Limits
                  </button>
                  <button
                    onClick={() => {
                      setIsRecurringModalOpen(true);
                      setShowUserMenu(false);
                    }}
                    className="w-full text-left px-5 py-2.5 text-sm flex items-center transition-colors text-slate-700 hover:bg-slate-50"
                  >
                    <i className="fas fa-sync-alt w-6 text-indigo-500"></i> Recurring Expenses
                  </button>
                </div>

                <div className="px-5 py-3 flex items-start gap-3 text-slate-600">
                  <i className="fas fa-hard-drive w-5 mt-0.5 text-indigo-500"></i>
                  <div>
                    <p className="text-sm font-semibold text-slate-700">Local edition</p>
                    <p className="text-[11px] leading-relaxed text-slate-400">No login. Data stays in your SQLite database.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filters Container */}
        <div className="space-y-3">
          {/* Time Range Selector */}
          <div className="bg-white/20 backdrop-blur-md rounded-2xl p-1 flex items-center justify-between border border-white/20 overflow-x-auto scrollbar-hide">
            {[
              { id: 'this_month', label: 'This Month' },
              { id: 'last_month', label: 'Last Month' },
              { id: 'this_year', label: 'Year' },
              { id: 'all', label: 'All' }
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTimeRange(t.id as TimeRange)}
                className={`flex-1 whitespace-nowrap px-3 py-2 rounded-xl text-xs font-bold transition-all ${timeRange === t.id
                  ? 'bg-white text-indigo-600 shadow-md transform scale-105'
                  : 'text-white/80 hover:bg-white/10'
                  }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Collection Filter */}
          <div className="flex space-x-2 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setActiveCollectionId(null)}
              className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${activeCollectionId === null
                ? 'bg-slate-900 text-white border-slate-900 shadow-lg'
                : 'bg-white/80 backdrop-blur text-slate-600 border-white/40 hover:bg-white'
                }`}
            >
              All Data
            </button>
            {collections.map(col => (
              <button
                key={col.id}
                onClick={() => setActiveCollectionId(col.id)}
                className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold transition-all border ${activeCollectionId === col.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-500/30'
                  : 'bg-white/80 backdrop-blur text-slate-600 border-white/40 hover:bg-white'
                  }`}
              >
                {col.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Content Card - Floating Effect */}
      <main className="relative z-10 flex-1 px-4 space-y-5 animate-in slide-in-from-bottom-6 duration-700">

        {/* Budget Status Card */}
        {budgetInfo && (
          <div className="bg-white p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative overflow-hidden">
            <div className="flex justify-between items-end mb-2">
              <div>
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center">
                  <i className="fas fa-bullseye mr-1.5"></i> {budgetInfo.label}
                </h3>
                <p className={`text-lg font-bold mt-1 ${budgetInfo.statusColor}`}>
                  <i className={`${budgetInfo.statusIcon} mr-2`}></i>{budgetInfo.statusMsg}
                </p>
              </div>
              <div className="text-right">
                <span className="text-sm font-medium text-slate-500">Remaining</span>
                <p className="text-xl font-bold text-slate-900 leading-none mt-1">
                  {currencySymbol}{budgetInfo.remaining < 0 ? 0 : budgetInfo.remaining.toFixed(0)}
                </p>
              </div>
            </div>

            <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${budgetInfo.percent > 100 ? 'bg-red-500' : 'bg-gradient-to-r from-indigo-500 to-purple-500'
                  }`}
                style={{ width: `${budgetInfo.percent}%` }}
              ></div>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col justify-between h-32 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
            <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br rounded-bl-full -mr-4 -mt-4 opacity-50 group-hover:scale-110 transition-transform ${activeWorkspace.type === 'personal' ? 'from-indigo-100 to-purple-50' : 'from-emerald-100 to-green-50'}`}></div>
            <div className="relative z-10">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${activeWorkspace.type === 'personal' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                <i className="fas fa-wallet text-sm"></i>
              </div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Total Spent</p>
            </div>
            <div className="relative z-10">
              <p className="text-2xl font-black text-slate-800 tracking-tight">{currencySymbol}{totalSpent.toFixed(0)}</p>
              {filteredBills.length > 0 && (
                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{filteredBills.length} transactions</p>
              )}
            </div>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col justify-between h-32 relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-emerald-100 to-teal-50 rounded-bl-full -mr-4 -mt-4 opacity-50 group-hover:scale-110 transition-transform"></div>
            <div className="relative z-10">
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 mb-2">
                <i className="fas fa-file-invoice-dollar text-sm"></i>
              </div>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Deductible</p>
            </div>
            <div className="relative z-10">
              <p className="text-2xl font-black text-emerald-600 tracking-tight">{currencySymbol}{totalTaxRelevant.toFixed(0)}</p>
            </div>
          </div>
        </div>

        {/* Charts Section */}
        <div className="space-y-5">

          {/* Category Chart (OPTIMIZED) */}
          <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 transition-all duration-500 ease-in-out">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                <i className={`fas fa-chart-pie mr-2 ${activeWorkspace.type === 'personal' ? 'text-indigo-500' : 'text-emerald-500'}`}></i> Breakdown
              </h3>
            </div>

            {categoryData.length > 0 ? (
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
                {/* Chart Circle */}
                <div className="h-48 w-48 relative shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={categoryData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={4}
                        dataKey="value"
                        stroke="none"
                      >
                        {categoryData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value: number) => `${currencySymbol}${value.toFixed(2)}`}
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Center Text */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-xs text-slate-400 font-medium">Top</span>
                    <span className="text-sm font-bold text-slate-800 truncate max-w-[80%] text-center">
                      {categoryData[0]?.name.split(' ')[0]}
                    </span>
                  </div>
                </div>

                {/* Legend List */}
                <div className="flex-1 w-full min-w-0">
                  <div className={`space-y-3 ${showAllCategories ? '' : 'max-h-[240px]'} overflow-hidden transition-all duration-500`}>
                    {(showAllCategories ? categoryData : categoryData.slice(0, 5)).map((entry, index) => {
                      const style = getCategoryStyle(entry.name as Category);
                      const percent = totalSpent > 0 ? ((entry.value / totalSpent) * 100).toFixed(1) : '0.0';

                      return (
                        <div key={index}>
                          <button
                            onClick={() => setSelectedCategory(selectedCategory === entry.name ? null : (entry.name as Category))}
                            className="w-full flex items-center justify-between text-sm group hover:bg-slate-50 rounded-lg p-2 -m-2 transition-colors"
                          >
                            <div className="flex items-center min-w-0 flex-1 mr-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 shrink-0 transition-transform group-hover:scale-110 ${style.color}`}>
                                <i className={`${style.icon} text-xs`}></i>
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-slate-700 font-bold truncate leading-tight text-left" title={entry.name}>{entry.name}</p>
                                <p className="text-[10px] text-slate-400 font-medium text-left">{percent}%</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-slate-800 whitespace-nowrap">{currencySymbol}{entry.value.toFixed(0)}</span>
                              <i className={`fas fa-chevron-${selectedCategory === entry.name ? 'up' : 'down'} text-xs text-slate-400`}></i>
                            </div>
                          </button>

                          {selectedCategory === entry.name && (
                            <div className="mt-3 ml-11 space-y-2">
                              {filteredBills
                                .filter(bill => bill.category === entry.name)
                                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                                .map(bill => (
                                  <div key={bill.id} className="flex items-center justify-between text-xs py-2 px-3 bg-slate-50 rounded-lg">
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-slate-700 truncate">{bill.merchantName}</p>
                                      <p className="text-slate-400 text-[10px]">{bill.date}</p>
                                    </div>
                                    <span className="font-bold text-slate-600 ml-3">
                                      {currencySymbol}{bill.amount.toFixed(2)}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {categoryData.length > 5 && (
                    <button
                      onClick={() => setShowAllCategories(!showAllCategories)}
                      className="mt-4 w-full py-2 flex items-center justify-center text-xs font-bold text-slate-500 hover:text-indigo-600 hover:bg-slate-50 rounded-xl transition-colors border border-transparent hover:border-slate-100"
                    >
                      {showAllCategories ? (
                        <>Show Less <i className="fas fa-chevron-up ml-2"></i></>
                      ) : (
                        <>Show All ({categoryData.length}) <i className="fas fa-chevron-down ml-2"></i></>
                      )}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="h-40 flex flex-col items-center justify-center text-slate-300">
                <i className="far fa-chart-bar text-3xl mb-2 opacity-50"></i>
                <p className="text-xs">No spending data</p>
              </div>
            )}
          </div>

          {/* Trend Chart */}
          <div className="bg-white p-6 rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-800 flex items-center">
                <i className="fas fa-chart-line mr-2 text-pink-500"></i> Trends
              </h3>
            </div>
            {trendData.length > 0 ? (
              <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={trendData}>
                    <defs>
                      <linearGradient id="colorBar" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#ec4899" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="name"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fill: '#94a3b8', fontWeight: 500 }}
                      dy={10}
                      interval={timeRange === 'all' ? 'preserveStartEnd' : 0}
                    />
                    <Tooltip
                      cursor={{ fill: '#f1f5f9', radius: 4 }}
                      formatter={(value: number) => `${currencySymbol}${value.toFixed(0)}`}
                      contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                    />
                    <Bar
                      dataKey="amount"
                      fill="url(#colorBar)"
                      radius={[6, 6, 6, 6]}
                      barSize={timeRange === 'this_month' ? 8 : 20}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-40 flex flex-col items-center justify-center text-slate-300">
                <i className="fas fa-wave-square text-3xl mb-2 opacity-50"></i>
                <p className="text-xs">Not enough data for trends</p>
              </div>
            )}
          </div>

          {/* Legal Links Footer */}
          <div className="flex justify-center items-center space-x-4 text-[10px] text-slate-400 font-medium py-4 opacity-70 hover:opacity-100 transition-opacity relative z-50">
            <button onClick={() => navigate('/impressum')} className="hover:text-slate-600 transition-colors p-2 cursor-pointer">Impressum</button>
            <span className="text-slate-300">&bull;</span>
            <button onClick={() => navigate('/terms-of-service')} className="hover:text-slate-600 transition-colors p-2 cursor-pointer">Terms</button>
            <span className="text-slate-300">&bull;</span>
            <button onClick={() => navigate('/privacy-policy')} className="hover:text-slate-600 transition-colors p-2 cursor-pointer">Privacy</button>
          </div>
        </div>
      </main>

      {/* Floating AI Assistant */}
      <ChatAssistant activeCollectionId={activeCollectionId} />

      {/* Modals */}
      {isWorkspaceManagerOpen && (
        <WorkspaceManagerView onClose={() => setIsWorkspaceManagerOpen(false)} />
      )}

      {isProfileSettingsOpen && (
        <ProfileSettingsView onClose={() => setIsProfileSettingsOpen(false)} />
      )}

      {isRecurringModalOpen && (
        <RecurringManagerView onClose={() => setIsRecurringModalOpen(false)} />
      )}

      {isBudgetModalOpen && (
        <BudgetSettingsView onClose={() => setIsBudgetModalOpen(false)} />
      )}

      {isCollectionManagerOpen && (
        <CollectionManagerView onClose={() => setIsCollectionManagerOpen(false)} />
      )}

    </div>
  );
};
