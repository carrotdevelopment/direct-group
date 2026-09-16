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
    const originalFetch=window.fetch.bind(window); window.__requests=[]; window.__writes=[]; window.__remaining=true;
    const today=new Date().toISOString().slice(0,10);
    window.fetch=async(input,options={})=>{
      const url=new URL(String(input),location.origin), method=options.method||'GET';
      const json=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));
      if(url.pathname==='/api/local-db/egress-profiles')return json({profiles:[{client:'Santander',headerRow:2,columns:['Dia','Mes','Año','SKU','ID','Cantidad'],mapping:{dateDay:['Dia'],dateMonth:['Mes'],dateYear:['Año'],clientCode:['SKU'],product:['ID'],quantity:['Cantidad']}}]});
      if(url.pathname==='/api/local-db/client-codes')return json({mappings:[]});
      if(url.pathname==='/api/local-db/egresos'){
        window.__requests.push(Object.fromEntries(url.searchParams));
        if(method==='DELETE'){window.__writes.push(JSON.parse(options.body));window.__remaining=false;return json({ok:true,deletedRows:6000,message:'6000 egresos inactivados. Se conservó el respaldo original.'})}
        if(method==='POST')return json({ok:false,message:'La carga contiene un registro ya importado. No se importó ninguna fila.'},409);
        if(url.searchParams.get('preview')==='1')return json({count:window.__remaining?6000:0});
        return json({rows:window.__remaining?[{'ID egreso':'987','Modificado por':'user-test',__rowIndex:987,__date:today,fecha:today,Dia:today.slice(8),Mes:today.slice(5,7),Año:today.slice(0,4),SKU:'TEST-E',ID:'EGRESO PRUEBA',Cantidad:2,Operación:'CANJE'}]:[],summary:[{client:'Santander',rows:window.__remaining?6000:0}],batches:[{id:'42',fileName:'PRUEBA.xlsx',createdAt:today+'T12:00:00Z',importedRows:6000}],source:'postgresql'});
      }
      if(method!=='GET')throw Error('Real mutation blocked');return originalFetch(input,options);
    };
  })();`;
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride',{width:1600,height:1100,deviceScaleFactor:1,mobile:false});
  await send('Page.addScriptToEvaluateOnNewDocument',{source:fixture});
  await send('Page.navigate',{url:'http://localhost:3000/egresos'});
  await wait(`document.body.textContent.includes('EGRESO PRUEBA')`);
  const select = async(selector,value)=>{await evaluate(`(()=>{const s=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(value)});s.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause(150)};
  assert(await evaluate(`document.body.textContent.includes('ID egreso')&&document.body.textContent.includes('987')`));
  await select('[aria-label="Fechas relativas"]','7days');
  await wait(`window.__requests.some(r=>r.from && r.to && r.from!==r.to)`);
  const lastRange=await evaluate(`window.__requests.filter(r=>!r.preview).at(-1)`);
  const span=(Date.parse(lastRange.to)-Date.parse(lastRange.from))/86400000;assert.equal(span,6);
  await select('[aria-label="Subida a inactivar"]','42');await click('Revisar alcance');
  await wait(`document.body.textContent.includes('6000 egresos activos')`);
  await click('Cancelar');assert.equal(await evaluate('window.__writes.length'),0);
  await click('Revisar alcance');await wait(`document.body.textContent.includes('6000 egresos activos')`);
  await click('Confirmar inactivación');await wait(`window.__writes.length===1`);
  assert.deepEqual(await evaluate('window.__writes[0]'),{client:'Santander',scope:{batchId:'42'}});
  await wait(`!document.body.textContent.includes('EGRESO PRUEBA')`);
  await evaluate('window.__remaining=true');
  await select('[aria-label="Tipo de baja"]','date');
  for(const [selector,value] of [['[aria-label="Baja desde"]','2026-09-01'],['[aria-label="Baja hasta"]','2026-09-09']]){
    await evaluate(`(()=>{const input=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}))})()`);await pause(100);
  }
  await click('Revisar alcance');await wait(`document.body.textContent.includes('6000 egresos activos')`);
  await click('Confirmar inactivación');await wait(`window.__writes.length===2`);
  assert.deepEqual(await evaluate('window.__writes[1]'),{client:'Santander',scope:{from:'2026-09-01',to:'2026-09-09'}});
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync('dev/egress-ui-functional.png',Buffer.from(shot.data,'base64'));
  console.log('PASS: visible ID, relative dates sent to server, preview 6000 rows, cancel without write, deactivate batch, deactivate date range, refresh. All writes simulated.');
  ws.close();
}
main().catch(error=>{console.error(error);process.exit(1)});