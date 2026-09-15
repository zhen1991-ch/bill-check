import { CATEGORIES } from '../core/domain.js';

export const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BillCheck Local</title><link rel="stylesheet" href="/app.css"></head>
<body><aside><a class="brand" href="/">BillCheck <span>Local</span></a><p class="workspace">Your personal Billspace</p><nav><button data-view="bills" class="active">Receipts</button><button data-view="collections">Collections</button><button data-view="budget">Budget</button><button data-view="settings">Local settings</button></nav><p class="privacy">Your receipts stay on this computer.<br>No account required.<br><a href="https://github.com/zhen1991-ch/bill-check" target="_blank" rel="noopener noreferrer">Source code · AGPL-3.0-only</a></p></aside>
<main><header><div><p id="eyebrow">Local Billspace</p><h1 id="heading">Receipts</h1></div><button id="add" class="primary">Add receipt</button></header><p id="message" role="status" aria-live="polite"></p><section id="content"></section></main>
<dialog id="editor"><form id="bill-form"><header><h2 id="editor-title">Add receipt</h2><button type="button" id="close-editor" aria-label="Close">×</button></header><input name="id" type="hidden"><input name="version" type="hidden">
<label>Merchant<input name="merchantName" required maxlength="300"></label><div class="pair"><label>Date<input name="date" type="date" required></label><label>Category<select name="category">${CATEGORIES.map(c=>`<option>${c}</option>`).join('')}</select></label></div>
<div class="pair"><label>Total<input name="amount" type="number" min="0" step="any" required></label><label>Currency<input name="currency" value="EUR" pattern="[A-Z]{3}" maxlength="3" required></label></div>
<label>Collections<select name="collectionIds" multiple aria-label="Collections"></select></label><label class="check"><input name="isTaxRelevant" type="checkbox">Tax relevant</label><label>Tax note<textarea name="taxReason" maxlength="2000"></textarea></label>
<label>Original file<input name="attachment" type="file"></label><p class="hint">Up to 650 KB per receipt. Your agent can attach files through MCP too.</p><label class="check"><input name="removeAttachment" type="checkbox">Remove saved original</label><p id="form-error" role="alert"></p><footer><button type="button" id="delete" class="danger">Delete receipt</button><button class="primary" type="submit">Save receipt</button></footer></form></dialog>
<script src="/app.js"></script></body></html>`;

export const stylesheet = `
:root{font-family:"Segoe UI",system-ui,sans-serif;color:#183c35;background:#f4f8f6;font-synthesis:none;font-size:15px}*{box-sizing:border-box}body{margin:0;display:grid;grid-template-columns:230px 1fr;min-height:100vh}aside{background:#e5f0eb;padding:34px 22px;display:flex;flex-direction:column;position:sticky;top:0;height:100vh}.brand{font-size:25px;font-weight:750;text-decoration:none;color:#124d3c;letter-spacing:-1px}.brand span{font-size:13px;letter-spacing:0;border:1px solid #7da18e;padding:3px 6px;border-radius:4px}.workspace{font-size:13px;color:#56746a;margin:25px 0}nav{display:grid;gap:8px}nav button{text-align:left;background:transparent;border:0;padding:13px 16px}nav button.active{background:#fff;color:#125238;font-weight:650}.privacy{margin-top:auto;font-size:12px;line-height:1.8;color:#56746a}.privacy a{color:#125238;font-weight:650}main{padding:40px 5vw;max-width:1450px;width:100%}header{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:22px}h1{font-size:34px;letter-spacing:-1px;margin:5px 0}h2{font-size:22px;margin:0}p{line-height:1.6}#eyebrow{color:#56746a;margin:0;font-size:14px}button,input,select,textarea{font:inherit}button{cursor:pointer;border:1px solid #c8d8ce;background:white;border-radius:7px;padding:10px 15px;color:inherit}button:disabled{opacity:.5;cursor:wait}button:hover{background:#edf5f0}.primary{background:#187249;color:white;border-color:#187249}.primary:hover{background:#125938}.danger{color:#a12b33}input,select,textarea{width:100%;background:white;border:1px solid #bdd0c3;border-radius:6px;padding:9px 10px;color:#183c35}input[type=checkbox]{width:auto}label{display:grid;gap:6px;margin-bottom:15px;color:#405e52;font-size:14px}.check{display:flex;align-items:center;gap:8px}.pair{display:grid;grid-template-columns:1fr 1fr;gap:15px}.toolbar{display:flex;align-items:end;gap:12px;margin:22px 0;flex-wrap:wrap}.toolbar label{margin:0;max-width:180px}.summary{display:flex;gap:40px;flex-wrap:wrap;padding:25px 0;border-top:1px solid #d2e1d8;border-bottom:1px solid #d2e1d8}.summary strong{display:block;font-size:29px;font-weight:650;font-variant-numeric:tabular-nums}.summary span{font-size:13px;color:#56746a}.table-wrap{overflow-x:auto;background:white;border-radius:10px;border:1px solid #dce6df}table{width:100%;border-collapse:collapse;text-align:left;white-space:nowrap}th{font-weight:500;font-size:12px;color:#6b8074;padding:14px 18px;border-bottom:1px solid #dce6df}td{padding:17px 18px;border-bottom:1px solid #edf2ef}td.money{text-align:right;font-variant-numeric:tabular-nums;font-weight:650}td small{display:block;color:#688275;font-size:12px}td button.link{padding:0;border:0;font-weight:600;background:none}tr:last-child td{border-bottom:0}.empty{padding:70px 25px;text-align:center;color:#688275;background:white;border-radius:10px}.empty h2{color:#183c35;margin-bottom:10px}#message:empty{display:none}#message,#form-error{color:#9c2937;white-space:pre-wrap}.hint{font-size:12px;color:#688275}.settings{max-width:700px}.settings pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#e8f0eb;padding:16px;border-radius:8px}.stack{display:grid;gap:15px}.collection{display:flex;justify-content:space-between;align-items:center;padding:18px;background:white;border-bottom:1px solid #e5ede7}.actions{display:flex;gap:8px}dialog{border:0;border-radius:14px;box-shadow:0 18px 80px #183c3533;padding:28px;width:min(620px,94vw);max-height:92vh}dialog::backdrop{background:#12352966}dialog header{margin-bottom:20px}dialog footer{display:flex;justify-content:space-between;gap:12px;margin-top:20px}dialog h2{font-size:22px}.budget-form{max-width:480px}*:focus-visible{outline:3px solid #49a47c;outline-offset:3px}@media(max-width:800px){body{display:block}aside{height:auto;position:static;padding:18px}.workspace,.privacy{display:none}nav{display:flex;overflow:auto;margin-top:18px}nav button{white-space:nowrap;padding:10px}main{padding:25px 18px}.summary{gap:20px}.pair{grid-template-columns:1fr}h1{font-size:28px}td,th{padding:12px}.toolbar label{max-width:145px}}
`;

export const javascript = String.raw`
const $=s=>document.querySelector(s),content=$('#content');
let token=location.hash.slice(1)||sessionStorage.getItem('billcheck-token');
if(location.hash){sessionStorage.setItem('billcheck-token',token);history.replaceState(null,'','/');}
let view='bills', bills=[],collections=[],editing=null,filters={};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(amount,currency)=>{try{return new Intl.NumberFormat(undefined,{style:'currency',currency}).format(amount)}catch{return amount+' '+currency}};
async function call(method,...args){const res=await fetch('/rpc',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({method,args})});const body=await res.json();if(!res.ok)throw Error(body.error);return body.result;}
function report(error){$('#message').textContent=error.message||String(error)}
async function refresh(){
 $('#message').textContent='';$('#add').hidden=view!=='bills';$('#heading').textContent={bills:'Receipts',collections:'Collections',budget:'Budget',settings:'Local settings'}[view];
 document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 try{
  if(!token)throw Error('Open BillCheck using the address printed by billcheck-local open.');
  if(view==='bills'){
   [bills,collections]=await Promise.all([call('listBills','local',{...filters,limit:500}),call('listCollections','local')]);
   const summary=await call('getSpendingSummary','local','category',{from:filters.from,to:filters.to});
   content.innerHTML='<div class="summary"><div><strong>'+summary.billCount+'</strong><span>Receipts in date range</span></div>'+Object.entries(summary.totalsByCurrency).map(([c,n])=>'<div><strong>'+esc(money(n,c))+'</strong><span>'+esc(c)+' spending in date range</span></div>').join('')+'</div>'+ 
   '<form id="filters" class="toolbar"><label>From<input name="from" type="date" value="'+esc(filters.from)+'"></label><label>To<input name="to" type="date" value="'+esc(filters.to)+'"></label><button>Filter</button><button type="button" id="clear-filters">Clear</button><button type="button" id="archive">Export selected originals</button></form>'+ 
   (bills.length?'<div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="select-all" aria-label="Select all receipts"></th><th>Merchant</th><th>Date</th><th>Category</th><th>Total</th><th>Original</th></tr></thead><tbody>'+bills.map(b=>'<tr><td><input class="select-bill" type="checkbox" value="'+esc(b.data.id)+'" aria-label="Select '+esc(b.data.merchantName)+'"></td><td><button class="link" data-edit="'+esc(b.data.id)+'">'+esc(b.data.merchantName)+'</button><small>'+b.data.collectionIds.map(id=>esc(collections.find(c=>c.data.id===id)?.data.name||id)).join(', ')+'</small></td><td>'+esc(b.data.date)+'</td><td>'+esc(b.data.category)+'</td><td class="money">'+esc(money(b.data.amount,b.data.currency))+'</td><td><button data-original="'+esc(b.data.id)+'">Download</button></td></tr>').join('')+'</tbody></table></div><p class="hint">Showing up to 500 receipts. Date-range totals include all matching receipts.</p>':'<div class="empty"><h2>Your receipts, in one place</h2><p>Add a receipt or connect your agent to start your local collection.</p></div>');
  }else if(view==='collections'){
   collections=await call('listCollections','local');content.innerHTML='<form id="collection-form" class="toolbar"><label>Name<input name="name" required maxlength="200"></label><button class="primary">Create collection</button></form><div>'+collections.map(c=>'<div class="collection"><strong>'+esc(c.data.name)+'</strong><div class="actions"><button data-rename="'+esc(c.data.id)+'">Rename</button><button data-remove-collection="'+esc(c.data.id)+'">Delete</button></div></div>').join('')+'</div>';
  }else if(view==='budget'){
   const b=await call('getBudget','local');content.innerHTML='<form id="budget-form" class="budget-form"><p>Set the limits for your local Billspace in EUR.</p><input type="hidden" name="version" value="'+esc(b?.version)+'"><label>Monthly limit<input name="monthlyLimit" type="number" min="0" step="0.01" required value="'+(b?.data.monthlyLimit??0)+'"></label><label>Yearly limit<input name="yearlyLimit" type="number" min="0" step="0.01" required value="'+(b?.data.yearlyLimit??0)+'"></label><label class="check"><input name="isEnabled" type="checkbox" '+(b?.data.isEnabled?'checked':'')+'>Enable budget</label><button class="primary">Save budget</button></form>';
  }else{
   const status=await call('doctor');content.innerHTML='<div class="settings"><h2>Stored on this computer</h2><p>Your bills and originals are available without a cloud account. Your agent uses its own model for reading and understanding receipts.</p><pre>'+esc(status.directory)+'</pre><p>Database check: '+esc(status.integrity)+'</p><button id="backup" class="primary">Create backup</button><h2>Connect an agent</h2><p>Use this command in any client that supports a local MCP server:</p><pre>billcheck-local mcp</pre><p>For a custom data directory, add the same --data-dir option used at installation.</p><p class="hint">Backups include receipts and original files. Restore to a new directory using the CLI so your current data remains available.</p></div>';
  }
 }catch(error){report(error)}
}
async function openEditor(id){
 editing=id?await call('getBill','local',id):null;const form=$('#bill-form');form.reset();
 const b=editing?.data||{date:new Date().toLocaleDateString('en-CA'),currency:'EUR',category:'Other',collectionIds:[]};
 for(const name of ['merchantName','date','amount','currency','category','taxReason'])form.elements[name].value=b[name]??'';
 form.elements.id.value=id||'';form.elements.version.value=editing?.version||'';form.elements.isTaxRelevant.checked=!!b.isTaxRelevant;
 form.elements.collectionIds.innerHTML=collections.map(c=>'<option value="'+esc(c.data.id)+'" '+(b.collectionIds.includes(c.data.id)?'selected':'')+'>'+esc(c.data.name)+'</option>').join('');
 $('#delete').hidden=!id;$('#form-error').textContent='';$('#editor-title').textContent=id?'Edit receipt':'Add receipt';$('#editor').showModal();
}
document.querySelector('nav').onclick=e=>{if(e.target.dataset.view){view=e.target.dataset.view;void refresh()}};
$('#add').onclick=()=>openEditor().catch(report);$('#close-editor').onclick=()=>$('#editor').close();
$('#bill-form').onsubmit=async e=>{
 e.preventDefault();const form=e.target;const button=form.querySelector('[type=submit]');button.disabled=true;
 try{
 const data={merchantName:form.elements.merchantName.value,date:form.elements.date.value,amount:Number(form.elements.amount.value),currency:form.elements.currency.value,category:form.elements.category.value,isTaxRelevant:form.elements.isTaxRelevant.checked,taxReason:form.elements.taxReason.value,collectionIds:Array.from(form.elements.collectionIds.selectedOptions).map(o=>o.value),items:editing?.data.items||[]};
 const file=form.elements.attachment.files[0];if(file){if(file.size>650000)throw Error('Please choose an original smaller than 650 KB.');data.imageUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)});data.attachmentName=file.name;}
 else if(form.elements.removeAttachment.checked)data.imageUrl=null;
 if(editing)await call('updateBill','local',editing.data.id,data,editing.version);else await call('createBill','local',data);
 $('#editor').close();await refresh();
 }catch(error){$('#form-error').textContent=error.message}finally{button.disabled=false}
};
$('#delete').onclick=async()=>{if(!editing||!confirm('Delete this receipt?'))return;try{await call('deleteBill','local',editing.data.id,editing.version);$('#editor').close();await refresh()}catch(error){$('#form-error').textContent=error.message}};
content.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;try{
 if(f.id==='filters'){filters={from:f.elements.from.value||undefined,to:f.elements.to.value||undefined};}
 if(f.id==='collection-form')await call('createCollection','local',{name:f.elements.name.value});
 if(f.id==='budget-form')await call('setBudget','local',{monthlyLimit:Number(f.elements.monthlyLimit.value),yearlyLimit:Number(f.elements.yearlyLimit.value),isEnabled:f.elements.isEnabled.checked},f.elements.version.value||undefined);
 await refresh();}catch(error){report(error)}});
content.addEventListener('click',async e=>{const b=e.target.closest('button,input');if(!b)return;try{
 if(b.dataset.edit)await openEditor(b.dataset.edit);
 if(b.id==='clear-filters'){filters={};await refresh()}
 if(b.id==='select-all')document.querySelectorAll('.select-bill').forEach(c=>c.checked=b.checked);
 if(b.dataset.rename){const c=collections.find(c=>c.data.id===b.dataset.rename),name=prompt('Collection name',c.data.name);if(name){await call('updateCollection','local',c.data.id,{name},c.version);await refresh()}}
 if(b.dataset.removeCollection){const c=collections.find(c=>c.data.id===b.dataset.removeCollection);if(confirm('Delete collection? Receipts will be retained.')){await call('deleteCollection','local',c.data.id,c.version);await refresh()}}
 if(b.id==='backup'){b.disabled=true;try{const r=await call('backup');$('#message').textContent='Backup saved: '+r.directory}finally{b.disabled=false}}
 if(b.dataset.original||b.id==='archive'){
  const ids=b.dataset.original?[b.dataset.original]:Array.from(document.querySelectorAll('.select-bill:checked')).map(c=>c.value);
  if(!ids.length)throw Error('Select at least one receipt.');if(ids.length>100)throw Error('Select at most 100 receipts per archive.');
  const r=await call('createDownload',{kind:b.id==='archive'?'archive':'attachment',workspaceId:'local',billIds:ids,fileName:b.id==='archive'?'receipts.zip':'receipt'});
  const a=document.createElement('a');a.href=r.url;a.download='';document.body.append(a);a.click();a.remove();
 }
}catch(error){report(error)}});
void refresh();
`;
