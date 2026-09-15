import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Button } from './Button';

interface WorkspaceManagerViewProps { onClose: () => void }

export const WorkspaceManagerView: React.FC<WorkspaceManagerViewProps> = ({ onClose }) => {
  const { activeWorkspace, currency, setCurrency, updateWorkspaceDetails } = useAppContext();
  const [showDetails, setShowDetails] = useState(false);
  const [spaceName, setSpaceName] = useState(activeWorkspace?.name ?? 'Local Billspace');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveName = async (event: React.FormEvent) => {
    event.preventDefault();
    const name=spaceName.trim();
    if(!activeWorkspace||!name)return;
    setIsSaving(true);setError(null);
    try{await updateWorkspaceDetails(activeWorkspace.id,activeWorkspace.type,{name});onClose();}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
    finally{setIsSaving(false);}
  };

  if (showDetails) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
        <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-900">Billspace Details</h3>
            <button type="button" aria-label="Back to Billspaces" onClick={() => setShowDetails(false)} className="text-slate-400 hover:text-slate-600"><i className="fas fa-arrow-left" /></button>
          </div>
          <form className="space-y-4" onSubmit={saveName}>
            <div>
              <label htmlFor="local-billspace-name" className="block text-xs font-bold text-slate-500 uppercase mb-1">Billspace Name</label>
              <input id="local-billspace-name" value={spaceName} maxLength={200} onChange={event=>setSpaceName(event.target.value)} className="w-full border border-slate-300 bg-white rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Display Currency</label>
              <select value={currency} onChange={event => setCurrency(event.target.value as typeof currency)} className="w-full border border-slate-300 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                {['USD', 'EUR', 'GBP', 'CNY', 'JPY'].map(value => <option key={value} value={value}>{value}</option>)}
              </select>
              <p className="text-[10px] text-slate-400 mt-1">This changes totals shown in this browser session. Saved receipts keep their original currency.</p>
            </div>
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-900">
              <div className="flex items-start gap-3">
                <i className="fas fa-hard-drive mt-0.5 text-indigo-600" />
                <div><p className="font-bold">Private local storage</p><p className="text-xs text-indigo-700 mt-1">No login, remote members, or cloud database. Local agents connect through MCP.</p></div>
              </div>
            </div>
            {error&&<p role="alert" className="text-xs text-red-600">{error}</p>}
            <Button type="submit" fullWidth loading={isSaving} disabled={!spaceName.trim()||spaceName.trim()===activeWorkspace?.name}>Save Changes</Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl animate-in zoom-in-95 max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center mb-6 shrink-0">
          <h3 className="text-xl font-bold text-slate-900 flex items-center"><i className="fas fa-layer-group text-indigo-600 mr-2" /> Manage Billspaces</h3>
          <button type="button" aria-label="Close Billspace manager" onClick={onClose} className="text-slate-400 hover:text-slate-600"><i className="fas fa-times text-lg" /></button>
        </div>
        <div className="p-4 rounded-xl border border-indigo-500 bg-indigo-50/50">
          <div className="flex justify-between items-start">
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="font-bold text-slate-900">{activeWorkspace?.name ?? 'Local Billspace'}</h4>
                <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Personal</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded flex items-center"><i className="fas fa-star mr-1 text-[8px]" /> Default</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Currency: {currency} • Owner</p>
            </div>
            <button type="button" aria-label="View local Billspace" onClick={() => setShowDetails(true)} className="text-slate-400 hover:text-indigo-600 p-1.5" title="View local Billspace"><i className="fas fa-pen" /></button>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-4 text-xs text-slate-500">
          The open-source edition intentionally has one Personal Billspace on this device.
        </div>
      </div>
    </div>
  );
};
