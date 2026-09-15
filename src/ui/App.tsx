import React, { useState } from 'react';
import { AppProvider, useAppContext } from './context/AppContext';
import { DashboardView } from './components/DashboardView';
import { UploadView } from './components/UploadView';
import { BillsView } from './components/BillsView';
import { ViewState } from './types';
import { BrowserRouter } from 'react-router-dom';

const LoadingScreen: React.FC = () => (
  <div className="flex items-center justify-center h-screen bg-slate-50">
    <div className="flex flex-col items-center animate-pulse">
      <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
      <h1 className="text-xl font-bold text-slate-900">BillCheck</h1>
      <p className="text-sm text-slate-400 mt-2">Connecting to your local database...</p>
    </div>
  </div>
);

const MainLayout: React.FC = () => {
  const { dbError, isLoading } = useAppContext();
  const [view, setView] = useState<ViewState>('dashboard');

  if (isLoading) return <LoadingScreen />;

  return (
    <div className="relative min-h-screen bg-slate-50 font-sans text-slate-900">
      {view === 'dashboard' && <DashboardView />}
      {view === 'upload' && <UploadView onComplete={() => setView('dashboard')} />}
      {view === 'bills' && <BillsView />}
      {dbError && (
        <div role="alert" className="fixed top-3 left-1/2 -translate-x-1/2 z-[80] max-w-lg w-[90%] border border-red-200 bg-white rounded-lg p-4 text-sm text-red-700 shadow-lg">
          {dbError}
        </div>
      )}

      {view !== 'upload' && (
        <nav className="fixed bottom-0 w-full bg-white border-t border-slate-200 z-30 pb-safe safe-area-bottom">
          <div className="flex justify-around items-center h-16 max-w-md mx-auto">
            <button onClick={() => setView('dashboard')} className={`flex flex-col items-center justify-center w-16 transition-colors ${view === 'dashboard' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <i className="fas fa-chart-pie text-xl mb-1" />
              <span className="text-[10px] font-medium">Stats</span>
            </button>
            <div className="relative -top-6">
              <button aria-label="Add receipt" onClick={() => setView('upload')} className="w-14 h-14 bg-indigo-600 rounded-full shadow-lg shadow-indigo-300 flex items-center justify-center text-white hover:bg-indigo-700 transition-transform active:scale-95 ring-4 ring-slate-50">
                <i className="fas fa-camera text-xl" />
              </button>
            </div>
            <button onClick={() => setView('bills')} className={`flex flex-col items-center justify-center w-16 transition-colors ${view === 'bills' ? 'text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <i className="fas fa-list text-xl mb-1" />
              <span className="text-[10px] font-medium">Bills</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <MainLayout />
      </BrowserRouter>
    </AppProvider>
  );
}
