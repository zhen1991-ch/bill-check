
import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Collection } from '../types';
import { Button } from './Button';

interface CollectionManagerProps {
  onClose: () => void;
}

export const CollectionManagerView: React.FC<CollectionManagerProps> = ({ onClose }) => {
  const { collections, addCollection, updateCollection, deleteCollection, activeWorkspace, bills } = useAppContext();
  
  const [newColName, setNewColName] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  
  // Delete Strategy Modal
  const [deleteTarget, setDeleteTarget] = useState<Collection | null>(null);

  const handleAdd = async () => {
    if (!newColName.trim()) return;
    setIsProcessing(true);
    try {
      const newCol: Collection = {
        id: `col_${Date.now()}`,
        name: newColName.trim(),
        description: 'Custom collection'
      };
      await addCollection(newCol);
      setNewColName('');
    } catch (e) {
      alert("Failed to create collection");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartEdit = (col: Collection) => {
    setEditId(col.id);
    setEditName(col.name);
  };

  const handleSaveEdit = async () => {
    if (!editId || !editName.trim()) return;
    const col = collections.find(c => c.id === editId);
    if (!col) return;
    
    setIsProcessing(true);
    try {
      await updateCollection({ ...col, name: editName.trim() });
      setEditId(null);
    } catch (e) {
      alert("Failed to rename collection");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDelete = async (deleteBills: boolean) => {
    if (!deleteTarget) return;
    setIsProcessing(true);
    try {
      await deleteCollection(deleteTarget.id, deleteBills);
      setDeleteTarget(null);
    } catch (e) {
      alert("Failed to delete collection");
    } finally {
      setIsProcessing(false);
    }
  };

  const getBillCount = (colId: string) => {
    return bills.filter(b => b.collectionIds.includes(colId)).length;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl animate-in zoom-in-95 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 shrink-0">
          <div>
             <h3 className="text-xl font-bold text-slate-900 flex items-center">
                <i className="fas fa-folder-open text-indigo-500 mr-2"></i> Manage Collections
             </h3>
             <p className="text-xs text-slate-500 mt-1">Managing: <strong>{activeWorkspace.name}</strong></p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <i className="fas fa-times text-lg"></i>
          </button>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 mb-4">
           {collections.map(col => (
             <div key={col.id} className="bg-slate-50 p-3 rounded-xl border border-slate-100 flex items-center justify-between group">
                {editId === col.id ? (
                   <div className="flex items-center flex-1 gap-2">
                      <input 
                         value={editName}
                         onChange={e => setEditName(e.target.value)}
                         className="flex-1 bg-white border border-indigo-200 rounded-lg px-2 py-1 text-sm outline-none focus:ring-1 focus:ring-indigo-500"
                         autoFocus
                         onKeyDown={e => e.key === 'Enter' && handleSaveEdit()}
                      />
                      <button onClick={handleSaveEdit} className="text-indigo-600 px-2"><i className="fas fa-check"></i></button>
                      <button onClick={() => setEditId(null)} className="text-slate-400 px-2"><i className="fas fa-times"></i></button>
                   </div>
                ) : (
                   <div className="flex-1 min-w-0 mr-2">
                      <div className="font-bold text-slate-800 text-sm truncate">{col.name}</div>
                      <div className="text-[10px] text-slate-400">{getBillCount(col.id)} items</div>
                   </div>
                )}
                
                {editId !== col.id && (
                  <div className="flex items-center space-x-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                     <button onClick={() => handleStartEdit(col)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg"><i className="fas fa-pen text-xs"></i></button>
                     <button onClick={() => setDeleteTarget(col)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-white rounded-lg"><i className="fas fa-trash text-xs"></i></button>
                  </div>
                )}
             </div>
           ))}
           {collections.length === 0 && (
             <p className="text-center text-slate-400 text-sm py-4 italic">No collections yet.</p>
           )}
        </div>

        {/* Add Section */}
        <div className="pt-4 border-t border-slate-100 shrink-0">
           <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Create New</label>
           <div className="flex gap-2">
              <input 
                 value={newColName}
                 onChange={e => setNewColName(e.target.value)}
                 className="flex-1 border border-slate-300 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500"
                 placeholder="Collection Name"
                 onKeyDown={e => e.key === 'Enter' && handleAdd()}
              />
              <Button onClick={handleAdd} disabled={!newColName.trim() || isProcessing}>Add</Button>
           </div>
        </div>
      </div>

      {/* Delete Strategy Modal */}
      {deleteTarget && (
         <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-in zoom-in-95">
               <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 mx-auto text-red-500">
                  <i className="fas fa-trash-alt text-xl"></i>
               </div>
               <h3 className="text-lg font-bold text-slate-900 text-center mb-2">Delete "{deleteTarget.name}"?</h3>
               <p className="text-sm text-slate-500 text-center mb-6">
                  There are <strong>{getBillCount(deleteTarget.id)}</strong> bills in this collection.
               </p>
               
               <div className="space-y-3">
                  <Button fullWidth onClick={() => handleDelete(true)} variant="danger" loading={isProcessing} className="justify-center">
                     Delete Collection & Data
                  </Button>
                  <Button fullWidth onClick={() => handleDelete(false)} variant="secondary" loading={isProcessing} className="justify-center text-slate-700">
                     Delete Collection Only (Keep Data)
                  </Button>
                  <button onClick={() => setDeleteTarget(null)} className="w-full text-center text-xs text-slate-400 hover:text-slate-600 mt-2 py-2">
                     Cancel
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
};
