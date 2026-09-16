import fs from 'node:fs';
import assert from 'node:assert/strict';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

// Isolated headless Chrome session, no real write requests.
async function main() {
  const tabs = await (await fetch('http://localhost:9333/json')).json();
  const ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }));
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) { const p = pending.get(message.id); pending.delete(message.id); if(message.error) p.reject(message.error); else p.resolve(message.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })); });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const wait = async expression => { for (let i = 0; i < 100; i++) { if(await evaluate(expression)) return; await pause(100); } throw new Error(`Timed out: ${expression}`); };
  const click = text => evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b)throw Error('Button missing');b.click()})()`);
  const fixture = `(() => {
    const originalFetch = window.fetch.bind(window);
    const period = new Date().toISOString().slice(0,7);
    const row = (id) => ({id,uniqueCode:id,clientCode:id,active:true,stock:0,date:'2026-07-01',costDgUpdatedAt:'2026-07-01',pvcUpdatedAt:'2026-07',previousAdjustment:{period:'2026-07',freightNoVat:10,pvcNoVat:200,pvcWithVat:242},product:'PRUEBA '+id,supplier:'Prueba',category:'Prueba',publicPrice:242,vatRate:21,markup:0,costDgNoVat:100,freightNoVat:10,pvcNoVat:200,pvcWithVat:242,latestSupplierCostDg:100,supplierCostDgDate:'2026-07-01',hasPriceAlert:false,segment:'active',pvcHistory:[],freightCriterion:null});
    window.__writes=[]; window.__failSave=false; window.__errors=[];
    window.addEventListener('error',e=>window.__errors.push(e.message));
    window.fetch=async(input, options={})=>{
      const url=String(input), method=options.method || 'GET';
      const json=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));
      if(url==='/api/local-db/clients')return json({clients:[{id:'1',name:'Santander',active:true,configs:[]},{id:'2',name:'Cliente prueba',active:true,configs:[]}]});
      if(url.startsWith('/api/local-db/cost-structures')){
        if(method==='GET')return json({rows:JSON.parse(sessionStorage.getItem('fixtureRows')||'null')||[row('TEST-A'),row('TEST-B')],message:'Datos de prueba aislados'});
        if(method==='PUT'){
          const body=JSON.parse(options.body); window.__writes.push(body);
          if(window.__failSave)return json({ok:false,message:'Fallo simulado'},500);
          let rows=JSON.parse(sessionStorage.getItem('fixtureRows')||'null')||[row('TEST-A'),row('TEST-B')];
          rows=rows.map(r=>{const changed=body.rows.find(c=>c.id===r.id);return changed?{...changed,pvcUpdatedAt:period,previousAdjustment:{period,freightNoVat:changed.freightNoVat,pvcNoVat:changed.pvcNoVat,pvcWithVat:changed.pvcWithVat}}:r});sessionStorage.setItem('fixtureRows',JSON.stringify(rows));
          return json({ok:true,message:'Prueba guardada'});
        }
      }
      if(method!=='GET')throw Error('Real write blocked: '+url);
      return originalFetch(input,options);
    };
  })();`;
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1100, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: fixture });
  await send('Page.navigate', { url: 'http://localhost:3000/estructura-costos' });
  await wait(`document.querySelector('select')?.options.length===2`);
  await evaluate(`sessionStorage.removeItem('fixtureRows')`);
  const selectClient = value => evaluate(`(()=>{const s=document.querySelector('select');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await selectClient('Cliente prueba');
  await wait(`localStorage.getItem('dg:cost-structure:client')==='Cliente prueba'`);
  await send('Page.navigate', { url:'http://localhost:3000/egresos' });
  await pause(500);
  await send('Page.navigate', { url:'http://localhost:3000/estructura-costos' });
  await wait(`document.querySelector('select')?.value==='Cliente prueba'`);
  await wait(`document.body.textContent.includes('PRUEBA TEST-A')`);
  await selectClient('Santander');
  const rowSelector = `([...document.querySelectorAll('tbody tr')].find(r=>r.textContent.includes('PRUEBA TEST-A')&&r.querySelectorAll('input').length>=3))`;
  const otherSelector = rowSelector.replaceAll('TEST-A','TEST-B');
  await wait(`${rowSelector}!==undefined`);
  const previousCells = () => evaluate(`[...${rowSelector}.cells].slice(10,14).map(c=>c.textContent.trim())`);
  const previous = await previousCells();
  const monthSelect = `[...document.querySelectorAll('select')].find(s=>[...s.options].some(o=>o.textContent==='Ago'))`;
  const originalMonth = await evaluate(`${monthSelect}.value`);
  await evaluate(`(()=>{const s=${monthSelect};Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'8');s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await pause(300); assert.deepEqual(await previousCells(),previous);
  await evaluate(`(()=>{const s=${monthSelect};Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(originalMonth)});s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  await pause(300); assert.deepEqual(await previousCells(),previous);
  const headers=await evaluate(`[...document.querySelectorAll('thead th')].map(h=>({label:h.textContent.trim(),title:h.title}))`);
  fs.writeFileSync('dev/cost-ui-headers.json',JSON.stringify(headers,null,2));
  for(const label of ['PP s/IVA','PP c/IVA','Fecha PVC','PVC s/IVA','PVC c/IVA','Utilidad','Util.'])assert(headers.some(h=>h.label.includes(label)&&h.title),`Tooltip missing: ${label}`);
  const formulaButton = `[...document.querySelectorAll('th button')].find(b=>b.getAttribute('aria-label')?.includes('PVC sin IVA') && b.getAttribute('aria-label')?.includes('costo total'))`;
  const orderBefore = await evaluate(`[...document.querySelectorAll('tbody tr')].map(r=>r.textContent)`);
  await evaluate(`${formulaButton}.click()`);
  await wait(`document.querySelector('dialog')?.open`);
  assert(await evaluate(`document.querySelector('dialog').textContent.includes('costo total')`));
  await click('Cerrar');await wait(`!document.querySelector('dialog')`);
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('tbody tr')].map(r=>r.textContent)`),orderBefore);
  const dates = () => evaluate(`[${rowSelector}.cells[14].textContent.trim(),${otherSelector}.cells[14].textContent.trim()]`);
  console.log('initial cells',await evaluate(`[...${rowSelector}.cells].map(c=>c.textContent.trim())`));
  await evaluate(`${rowSelector}.querySelector('button').click()`);
  await wait(`document.body.textContent.includes('Cómo se llega al precio final')`);
  assert.equal(await evaluate(`[...document.querySelectorAll('div')].filter(e=>e.children.length===0 && e.textContent.includes('se llega al precio final')).length`),1);
  assert.equal(await evaluate(`document.body.textContent.includes('C?mo')`),false);
  const edit = async value => {
    await evaluate(`${rowSelector}.querySelectorAll('input')[2].focus()`);
    await pause(100);
    await evaluate(`${rowSelector}.querySelectorAll('input')[2].select()`);
    await send('Input.insertText', {text:value});
    await pause(100);
    await evaluate(`${rowSelector}.querySelectorAll('input')[2].blur()`);
    await pause(100);
  };
  await edit('210'); await pause(200);
  const current = new Date(); const expected = String(current.getMonth()+1).padStart(2,'0')+'/'+current.getFullYear();
  assert.deepEqual(await dates(),[expected,'07/2026']);
  await edit('200'); assert.deepEqual(await dates(),['07/2026','07/2026']);
  await edit('210'); assert.deepEqual(await dates(),[expected,'07/2026']);
  await click('Guardar'); await wait(`document.body.textContent.includes('Confirmar cambios')`);
  await evaluate(`window.__failSave=true`); await click('Confirmar y guardar');
  await wait(`document.body.textContent.includes('Fallo simulado')`);
  await evaluate(`window.__failSave=false`); await click('Guardar'); await click('Confirmar y guardar');
  await wait(`document.body.textContent.includes('Prueba guardada')`);
  const writes=await evaluate(`window.__writes`);assert(writes.every(w=>w.rows.length===1&&w.rows[0].id==='TEST-A'));
  await send('Page.reload');
  await wait(`document.querySelector('select')?.value==='Santander'`);
  await wait(`${rowSelector}!==undefined`);
  assert.deepEqual(await dates(),[expected,'07/2026']);
  await evaluate(`${rowSelector}.querySelector('button').click()`);await pause(100);
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync('dev/cost-ui-functional.png',Buffer.from(shot.data,'base64'));
  assert.deepEqual(await evaluate('window.__errors'),[]);
  console.log('PASS: tooltips, detail, client navigation persistence, failed save, single-row save, reload. Simulated persistence only.');
  ws.close();
}
main().catch(error=>{console.error(error);process.exit(1)});
