import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import nextEnv from '@next/env'; const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const db = new PrismaClient();
const base = process.env.ACCESS_TEST_URL || 'http://localhost:3015';
const credentials = readFileSync('local-data/private/admin-access.txt', 'utf8');
const email = credentials.match(/Email: (.+)/)[1].trim();
const password = credentials.split('\n')[2].split(': ').slice(1).join(': ').trim();
const jar = () => {
 const cookies = new Map();
 return async (path, options={}) => {
  const r = await fetch(base+path,{...options,redirect:'manual',headers:{...options.headers,Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}});
  for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0];const i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1));}
  return r;
 };
};
const login = async (request,email,password) => {
 const csrf = await (await request('/api/auth/csrf')).json();
 const response = await request('/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body:new URLSearchParams({csrfToken:csrf.csrfToken,email,password,callbackUrl:base+'/inicio'})});
 assert.equal(response.status,200);
 return (await (await request('/api/auth/session')).json())?.user;
};
const json = body => ({method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
let testId;
const extraIds=[];
let checks = 0;
const equal = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };
const routes = [
 ['compras','/compras'], ['compras','/ingresos'], ['precios','/precios'], ['precios','/pricing'], ['precios','/estructura-costos'],
 ['proveedores','/proveedores'], ['clientes','/clientes'], ['clientes','/codigos-clientes'], ['productos','/productos'], ['ventas','/ventas'], ['ventas','/egresos'], ['stock','/stock'], ['importaciones','/importaciones'],
 ['admin','/dashboard'], ['admin','/permisos'], ['admin','/auditoria'], ['admin','/configuracion'], ['admin','/integraciones'],
];
const endpoints = [
 ['productos','/api/local-db/products',['GET','PUT']], ['productos','/api/local-db/categories',['GET','PUT']],
 ['clientes','/api/local-db/clients',['GET','PUT']], ['clientes','/api/local-db/client-codes',['GET','PUT']],
 ['proveedores','/api/local-db/suppliers',['GET','PUT']], ['precios','/api/local-db/prices',['GET','POST','PUT','DELETE']],
 ['precios','/api/local-db/prices/preview',['POST']], ['precios','/api/local-db/cost-structures',['GET','PUT','PATCH','DELETE']],
 ['precios','/api/price-requests/send-test',['POST']], ['compras','/api/local-db/ingresos',['GET']],
 ['ventas','/api/local-db/egresos',['GET','POST','PUT','DELETE']], ['ventas','/api/local-db/egress-profiles',['GET','PUT']],
 ['stock','/api/local-db/stock',['GET']], ['admin','/api/local-db/health',['GET']], ['admin','/api/users',['GET','POST','PUT']],
];
const requestMethod = method => method === 'GET' ? {} : { ...json({}), method };
try {
 const anonymous = jar();
 for(const [,path,methods] of endpoints) for(const method of methods) equal((await anonymous(path,requestMethod(method))).status,401,`anonymous ${method} ${path}`);
 for(const [,path] of routes) equal((await anonymous(path)).headers.get('location'),'/login',`anonymous page ${path}`);
 equal((await anonymous('/api/trpc/products.list?input='+encodeURIComponent(JSON.stringify({json:{}})))).status,401,'anonymous trpc');
 equal(await login(jar(), email, 'incorrect-password-123'), undefined, 'invalid login');
} catch(error) { await db.$disconnect(); throw error; }
try {
 const admin=jar();equal((await login(admin,email,password)).role,'ADMIN','admin login');
 const users=await (await admin('/api/users')).json();equal(JSON.stringify(users).includes('passwordHash'),false,'hash omitted');
 for(const [,path] of routes) equal((await admin(path)).status,200,`admin page ${path}`);
 const account={name:'Access validation temporary',email:`access-test-${Date.now()}@example.invalid`,password:randomBytes(18).toString('hex'),active:true,role:'VENDEDOR',moduleAccess:['compras']};
 const create=await admin('/api/users',{...json(account),method:'POST'});equal(create.status,200,'create');testId=(await create.json()).user.id;
 const restricted=jar();equal((await login(restricted,account.email,account.password)).id,testId,'new login');
 const update = async overrides => equal((await admin('/api/users',json({...account,id:testId,...overrides}))).status,200,'update');
 for(const key of ['compras','precios','proveedores','clientes','productos','ventas','stock','importaciones']) {
   await update({moduleAccess:[key]});
   for(const [owner,path] of routes) equal((await restricted(path)).status,owner === key ? 200 : 307,`${key} page ${path}`);
   for(const [owner,path,methods] of endpoints) if(owner!==key) for(const method of methods) equal((await restricted(path,requestMethod(method))).status,403,`${key} denied ${method} ${path}`);
 }
 await update({role:'LECTURA',moduleAccess:['compras','precios','proveedores','clientes','productos','ventas','stock','importaciones']});
 for(const [,path,methods] of endpoints) for(const method of methods.filter(m=>m!=='GET' && path!=='/api/local-db/prices/preview')) equal((await restricted(path,requestMethod(method))).status,403,`reader ${method} ${path}`);
 await update({moduleAccess:[]});
 equal((await restricted('/api/trpc/products.list?input='+encodeURIComponent(JSON.stringify({json:{}})))).status,403,'restricted trpc');
 equal((await restricted('/api/trpc/stock.transfer',{...json({json:{}}),method:'POST'})).status,403,'restricted trpc mutation');
 equal((await restricted('/inicio')).headers.get('location'),'/sin-acceso','no modules landing');
 for(const invalid of [{moduleAccess:['admin']},{role:'SUPERADMIN'},{password:'short'},{password:'x'.repeat(73)},{password:'\u00e1'.repeat(37)},{email:'invalid'},{name:''}]) equal((await admin('/api/users',json({...account,id:testId,...invalid}))).status,400,'invalid input');
 equal((await admin('/api/users',{...json(account),method:'POST'})).status,409,'duplicate email');
 equal((await admin('/api/users',json({...account,id:'does-not-exist'}))).status,404,'missing user');
 equal((await admin('/api/users',{method:'PUT',headers:{'Content-Type':'application/json'},body:'{'})).status,400,'malformed json');
 const myself=users.users.find(u=>u.email===email);
 for(const invalid of [{active:false},{role:'LECTURA'}]) equal((await admin('/api/users',json({...myself,...invalid}))).status,400,'self lockout');
 await update({active:false});equal((await restricted('/api/users')).status,401,'disable active session');
 equal(await login(jar(),account.email,account.password),undefined,'disabled login');
 await update({active:true,moduleAccess:['compras']});
 const oldSession=jar();await login(oldSession,account.email,account.password);
 const newPassword=randomBytes(18).toString('hex');await update({password:newPassword});
 equal(await login(jar(),account.email,account.password),undefined,'old password rejected');
 equal((await login(jar(),account.email,newPassword)).id,testId,'new password accepted');
 equal((await oldSession('/api/local-db/ingresos')).status,401,'password reset revokes old session');
 const adminPeers=[];
 for(let i=0;i<2;i++) {
  const peer={...account,email:`peer-${i}-${account.email}`,role:'ADMIN'};
  const response=await admin('/api/users',{...json(peer),method:'POST'});equal(response.status,200,'create peer admin');
  peer.id=(await response.json()).user.id;extraIds.push(peer.id);
  const request=jar();await login(request,peer.email,peer.password);adminPeers.push({peer,request});
 }
 const outcomes=await Promise.all(adminPeers.map((entry,index)=>entry.request('/api/users',json({...adminPeers[1-index].peer,role:'VENDEDOR'}))));
 equal(outcomes.filter(r=>r.status===200).length,1,'concurrent admin revocations cannot both succeed');
 equal(outcomes.some(r=>[403,409].includes(r.status)),true,'concurrent operation rejected');
 const logs=await db.auditLog.findMany({where:{entity:'User',recordId:testId}});
 equal(logs.length>10,true,'audit entries');equal(JSON.stringify(logs).includes('passwordHash'),false,'no hash in audit');equal(JSON.stringify(logs).includes(newPassword),false,'no password in audit');
 console.log(`PASS: ${checks} HTTP assertions; pages, all module boundaries, all API methods, readonly, input validation, audit, passwords, disable and admin safeguards.`);
} finally {
 const ids=[...extraIds,...(testId?[testId]:[])];
 if(ids.length){await db.auditLog.deleteMany({where:{OR:[{entity:'User',recordId:{in:ids}},{userId:{in:ids}}]}});await db.user.deleteMany({where:{id:{in:ids}}});}
 await db.$disconnect();
}
