import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Button } from './Button';

interface ProfileSettingsViewProps { onClose: () => void }

export const ProfileSettingsView: React.FC<ProfileSettingsViewProps> = ({ onClose }) => {
  const { user, updateUserName } = useAppContext();
  const [name,setName]=useState(user?.name ?? 'Local User');
  const [isSaving,setIsSaving]=useState(false);
  const [error,setError]=useState<string|null>(null);

  const save=async(event:React.FormEvent)=>{
    event.preventDefault();const next=name.trim();if(!next||!user)return;
    setIsSaving(true);setError(null);
    try{await updateUserName(next);onClose();}
    catch(cause){setError(cause instanceof Error?cause.message:String(cause));}
    finally{setIsSaving(false);}
  };

  return <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-bold text-slate-900 flex items-center"><i className="fas fa-user-pen text-indigo-600 mr-2" /> Edit Profile</h3>
        <button type="button" aria-label="Close profile settings" onClick={onClose} className="text-slate-400 hover:text-slate-600"><i className="fas fa-times" /></button>
      </div>
      <form className="space-y-4" onSubmit={save}>
        <div>
          <label htmlFor="local-display-name" className="block text-xs font-bold text-slate-500 uppercase mb-1">Display Name</label>
          <input id="local-display-name" autoFocus value={name} maxLength={200} onChange={event=>setName(event.target.value)} className="w-full border border-slate-300 bg-white rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500" />
          <p className="text-[10px] text-slate-400 mt-1">This name is stored only in your local SQLite database.</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-900 flex items-start gap-3">
          <i className="fas fa-shield-halved mt-0.5 text-indigo-600" />
          <div><p className="font-bold">Local profile</p><p className="text-xs text-indigo-700 mt-1">No account or login is created.</p></div>
        </div>
        {error&&<p role="alert" className="text-xs text-red-600">{error}</p>}
        <Button type="submit" fullWidth loading={isSaving} disabled={!name.trim()||name.trim()===user?.name}>Save Changes</Button>
      </form>
    </div>
  </div>;
};
