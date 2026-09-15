export const BILL_IMAGE_WIDGET_URI = "ui://billcheck/receipt-image-v1.html";
export const BILL_ARCHIVE_WIDGET_URI = "ui://billcheck/receipt-archive-v1.html";

export function billImageWidgetHtml(): string {
  return widgetHtml("image");
}

export function billArchiveWidgetHtml(): string {
  return widgetHtml("archive");
}

function widgetHtml(kind: "image" | "archive"): string {
  const title = kind === "image" ? "Receipt attachment" : "Receipt attachment archive";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{margin:0;padding:12px;background:transparent;color:CanvasText}.card{display:grid;gap:10px}.meta{display:grid;gap:2px}.title{font-weight:650;font-size:15px}.sub{font-size:12px;opacity:.72}.receipt{display:none;width:100%;max-height:520px;object-fit:contain;border-radius:10px;background:rgba(127,127,127,.08)}
.actions{display:flex;align-items:center;gap:8px}.button{appearance:none;border:0;border-radius:999px;padding:9px 14px;background:#2563eb;color:white;font:inherit;font-weight:600;cursor:pointer}.button:disabled{opacity:.5;cursor:not-allowed}.error{color:#b91c1c;font-size:13px}
</style></head><body><div class="card"><div class="meta"><div class="title" id="title">${title}</div><div class="sub" id="sub">Loading…</div></div><img class="receipt" id="receipt" alt="Original receipt image"><div class="actions"><button class="button" id="download" disabled>Download original</button></div><div class="error" id="error"></div></div>
<script>
const expectedKind=${JSON.stringify(kind)};let currentUrl="";
const el={title:document.getElementById("title"),sub:document.getElementById("sub"),receipt:document.getElementById("receipt"),download:document.getElementById("download"),error:document.getElementById("error")};
function render(value){const data=value?.structuredContent??value??{};const item=expectedKind==="image"?(data.attachment||data.image):data.archive;if(!item)return;currentUrl=typeof item.download_url==="string"?item.download_url:"";el.title.textContent=expectedKind==="image"?(item.merchant_name||"Receipt attachment"):(item.file_name||"Receipt attachment archive");el.sub.textContent=expectedKind==="image"?[item.date,item.file_name,item.mime_type].filter(Boolean).join(" · "):(String(item.selected_bill_count||0)+" selected bills · link expires "+(item.expires_at||"soon"));el.download.disabled=!currentUrl;el.download.textContent=expectedKind==="image"?"Download original":"Download ZIP";if(expectedKind==="image"&&item.is_image&&currentUrl){el.receipt.src=currentUrl;el.receipt.style.display="block";}else{el.receipt.removeAttribute("src");el.receipt.style.display="none";}}
function initial(){try{if(window.openai?.toolOutput)render(window.openai.toolOutput)}catch{}}
window.addEventListener("message",event=>{if(event.source!==window.parent)return;const message=event.data;if(message?.jsonrpc==="2.0"&&message.method==="ui/notifications/tool-result")render(message.params);},{passive:true});
window.addEventListener("openai:set_globals",initial,{passive:true});initial();
el.receipt.addEventListener("error",()=>{el.error.textContent="The image preview could not be loaded. Use Download original."});
el.download.addEventListener("click",async()=>{if(!currentUrl)return;try{if(window.openai?.openExternal){await window.openai.openExternal({href:currentUrl,redirectUrl:false})}else{window.open(currentUrl,"_blank","noopener,noreferrer")}}catch(error){el.error.textContent="The download could not be opened."}});
</script></body></html>`;
}
