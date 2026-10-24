import {useState,useEffect,createContext,useContext} from 'react';
import {auth,db} from './firebase';
import {createUserWithEmailAndPassword,signInWithEmailAndPassword,onAuthStateChanged,signOut} from 'firebase/auth';
import {collection,doc,setDoc,addDoc,getDoc,updateDoc,onSnapshot,arrayUnion,increment,runTransaction} from 'firebase/firestore';
import * as AI from './gemini';
import './styles.css';

/* ---------- helpers ---------- */
const C=createContext(),useC=()=>useContext(C);
const todayStr=()=>new Date().toISOString().slice(0,10);
const daysLeft=d=>Math.ceil((new Date(d)-new Date(todayStr()))/864e5);
const addDays=n=>new Date(Date.now()+n*864e5).toISOString().slice(0,10);
const rm=n=>'RM '+Number(n||0).toFixed(2);
const AREAS={'Petaling Jaya':[3.1073,101.6067],'Subang Jaya':[3.0565,101.5851],'Puchong':[3.0319,101.6176],'Shah Alam':[3.0738,101.5183],'Kuala Lumpur':[3.139,101.6869],'Bangsar':[3.1291,101.6711],'Cheras':[3.0833,101.743],'Klang':[3.0449,101.4455]};
const dist=(a,b)=>{const[p,q]=[AREAS[a]||AREAS['Petaling Jaya'],AREAS[b]||AREAS['Petaling Jaya']],r=x=>x*Math.PI/180;const h=Math.sin(r(q[0]-p[0])/2)**2+Math.cos(r(p[0]))*Math.cos(r(q[0]))*Math.sin(r(q[1]-p[1])/2)**2;return +(12742*Math.asin(Math.sqrt(h))).toFixed(1)};
const factor=d=>d<=3?.3:d<=7?.4:d<=14?.5:d<=30?.6:.7;
const toData=(f,max=900)=>new Promise(res=>{const r=new FileReader();r.onload=()=>{const i=new Image();i.onload=()=>{const s=Math.min(1,max/Math.max(i.width,i.height)),c=document.createElement('canvas');c.width=i.width*s;c.height=i.height*s;c.getContext('2d').drawImage(i,0,0,c.width,c.height);res(c.toDataURL('image/jpeg',.7))};i.src=r.result};r.readAsDataURL(f)});
const svg=(e,a,b)=>`data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><defs><linearGradient id="g"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="400" fill="url(#g)"/><text x="300" y="250" font-size="150" text-anchor="middle">${e}</text></svg>`)}`;
const label=d=>`data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#fff"/><text x="40" y="110" font-size="34" font-family="monospace">BEST BEFORE</text><text x="40" y="190" font-size="60" font-family="monospace" font-weight="bold">${d}</text></svg>`)}`;
const log=(u,action,detail)=>addDoc(collection(db,'audit'),{who:u?.business_name||u?.full_name||'system',action,detail,at:Date.now()});
function useCol(n){const[d,s]=useState([]);useEffect(()=>onSnapshot(collection(db,n),x=>s(x.docs.map(y=>({id:y.id,...y.data()})))),[n]);return d}
const has=(arr,t)=>(arr||[]).some(x=>{x=(x||'').toLowerCase();t=(t||'').toLowerCase();return x&&t&&(x.includes(t)||t.includes(x))});
function matchLocal(l,b){const d=dist(l.sellerArea,b.city_area),w=(b.wanted_ingredients||[]).find(x=>has([x.item],l.product_name)),u=has(b.ingredients_used,l.product_name);
  const s=Math.min(99,Math.round(Math.max(0,30-d*2)+(w?45:0)+(u?25:0)));
  return{score:s,reason:`${b.business_name} is ${d} km away${w?` and needs ${w.qty||''} ${w.item}`:''}${u?', and uses it in its recipes':''}.`.replace(/\s+/g,' '),km:d}}
async function runMatcher(l,id,users,me){
  const c=users.filter(u=>u.id!==me.id&&u.business_name).map(u=>({u,...matchLocal(l,u)})).sort((a,b)=>b.score-a.score).slice(0,5),out={};
  c.forEach(x=>out[x.u.id]={score:x.score,reason:x.reason});
  try{const r=await AI.aiMatch(l,c.map(x=>({uid:x.u.id,name:x.u.business_name,km:x.km,menu:x.u.menu_items_sold,wanted:x.u.wanted_ingredients,score:x.score})));r.forEach(x=>out[x.uid]&&(out[x.uid]={score:x.score,reason:x.reason}))}catch(e){console.warn('Matcher fell back to local scoring',e)}
  await updateDoc(doc(db,'listings',id),{matches:out});
  for(const[uid,m]of Object.entries(out))if(m.score>=40)await addDoc(collection(db,'notifications'),{to:uid,text:`${m.score}/100 match: ${l.product_name} from ${l.sellerName}. ${m.reason}`,at:Date.now()});
  return Object.entries(out).map(([uid,m])=>({...m,name:users.find(u=>u.id===uid)?.business_name})).sort((a,b)=>b.score-a.score)}

/* ---------- ui bits ---------- */
const F=({l,req,children})=><label className="f"><span>{l}{req&&<i> *</i>}</span>{children}</label>;
function Tags({v,on,ph}){const[t,setT]=useState('');const add=()=>{const x=t.trim();x&&!v.includes(x)&&on([...v,x]);setT('')};
  return<div className="tags">{v.map(x=><b key={x} onClick={()=>on(v.filter(y=>y!==x))}>{x} ×</b>)}<input value={t} placeholder={ph} onChange={e=>setT(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'||e.key===','){e.preventDefault();add()}}} onBlur={add}/></div>}
const Img=({v,on,l,max})=><label className={'img'+(v?' has':'')}>{v?<img src={v} alt=""/>:<span>{l}</span>}<input type="file" accept="image/*" hidden onChange={async e=>e.target.files[0]&&on(await toData(e.target.files[0],max))}/></label>;
const Ring=({n,s=52})=>{const r=s/2-5,c=2*Math.PI*r;return<svg width={s} height={s} className="ring"><circle cx={s/2} cy={s/2} r={r} className="bg"/><circle cx={s/2} cy={s/2} r={r} className="fg" strokeDasharray={c} strokeDashoffset={c*(1-n/100)} transform={`rotate(-90 ${s/2} ${s/2})`}/><text x="50%" y="54%" textAnchor="middle" dominantBaseline="middle">{n}</text></svg>};
const Modal=({on,children})=><div className="modal" onClick={()=>on()}><div onClick={e=>e.stopPropagation()}>{children}<br/><br/><button className="btn alt" onClick={()=>on()}>Close</button></div></div>;
const Sel=({v,on,o})=><select value={v} onChange={e=>on(e.target.value)}>{o.map(x=><option key={x}>{x}</option>)}</select>;

/* ---------- auth (Step 1) ---------- */
function Auth(){
  const[mode,setMode]=useState('login'),[err,setErr]=useState(''),[busy,setBusy]=useState(false);
  const[f,setF]=useState({user_role:'Owner',business_type:'Cafe',city_area:'Petaling Jaya',menu_items_sold:[],ingredients_used:[],wanted_ingredients:[]});
  const s=k=>e=>setF({...f,[k]:e?.target?e.target.value:e}),T=(k,p={})=><input value={f[k]||''} onChange={s(k)} {...p}/>;
  const go=async e=>{e.preventDefault();setBusy(true);setErr('');try{
    if(mode==='login')await signInWithEmailAndPassword(auth,f.email,f.password);
    else{if(!f.menu_items_sold.length||!f.ingredients_used.length)throw new Error('Add at least one menu item and one ingredient you use.');
      const c=await createUserWithEmailAndPassword(auth,f.email,f.password),{password,...p}=f;
      await setDoc(doc(db,'users',c.user.uid),{...p,wanted_ingredients:p.wanted_ingredients.filter(w=>w.item),uid:c.user.uid,verified:/^\d{12}$/.test(f.ssm_reg_no||''),rating_sum:0,rating_count:0,created:Date.now()});
      log(p,'Business registered',p.business_name)}
  }catch(x){setErr(x.message.replace('Firebase: ',''))}setBusy(false)};
  const W=f.wanted_ingredients,setW=(i,k,v)=>setF({...f,wanted_ingredients:W.map((w,j)=>j===i?{...w,[k]:v}:w)});
  return<div className="auth"><div className="hero">
    <h1>Don’t bin it.<br/>Sell it next door.</h1><p>SurplusLink AI matches cafés, bakeries and caterers that have extra ingredients with the nearby kitchens that need them — before the expiry date does.</p>
    <div className="ticket"><div className="a"><small>Kopi Kita Cafe → Bake &amp; Bloom</small><h3 style={{margin:'6px 0'}}>12 kg Arabica Beans</h3><div className="muted">Sealed · 17 days left · 1.6 km away</div><p style={{marginTop:8}}><b style={{fontSize:20}}>RM 45/kg</b> <s className="muted">RM 75</s></p></div><div className="b"><div><b style={{fontSize:30,display:'block'}}>92</b>match score</div></div></div>
  </div><div className="formside"><form className="stack" onSubmit={go}>
    <div className="seg"><button type="button" className={mode==='login'?'on':''} onClick={()=>setMode('login')}>Log in</button><button type="button" className={mode==='reg'?'on':''} onClick={()=>setMode('reg')}>Register business</button></div>
    {mode==='reg'&&<><h3>Your details</h3>
      <div className="row"><F l="Full name" req>{T('full_name',{required:1,placeholder:'Ahmad Razak'})}</F><F l="Phone number" req>{T('phone_number',{required:1,placeholder:'+6012-3456789'})}</F></div></>}
    <div className="row"><F l="Email" req>{T('email',{type:'email',required:1})}</F><F l="Password" req>{T('password',{type:'password',required:1,minLength:6})}</F></div>
    {mode==='reg'&&<>
      <div className="row"><F l="Your role" req><Sel v={f.user_role} on={s('user_role')} o={['Owner','Staff']}/></F><F l="Business type" req><Sel v={f.business_type} on={s('business_type')} o={['Cafe','Bakery','Restaurant','Dessert Shop','Caterer']}/></F></div>
      <div className="row"><F l="Business name" req>{T('business_name',{required:1,placeholder:'Kopi Kita Cafe'})}</F><F l="SSM registration no. (12 digits)" req>{T('ssm_reg_no',{required:1,placeholder:'202301012345'})}</F></div>
      <F l="Area" req><Sel v={f.city_area} on={s('city_area')} o={Object.keys(AREAS)}/></F>
      <F l="Full address" req><textarea required rows={2} value={f.full_address||''} onChange={s('full_address')}/></F>
      <h3>Help the AI match you</h3>
      <F l="Menu items you sell" req><Tags v={f.menu_items_sold} on={s('menu_items_sold')} ph="Tiramisu, Croissant… press Enter"/></F>
      <F l="Ingredients you use" req><Tags v={f.ingredients_used} on={s('ingredients_used')} ph="Coffee Beans, Flour…"/></F>
      <F l="Ingredients you want to buy (optional)">{W.map((w,i)=><div className="row" key={i} style={{marginBottom:6}}><input placeholder="Item" value={w.item||''} onChange={e=>setW(i,'item',e.target.value)}/><input placeholder="Qty e.g. 6 kg" value={w.qty||''} onChange={e=>setW(i,'qty',e.target.value)}/><input type="date" value={w.needed_by||''} onChange={e=>setW(i,'needed_by',e.target.value)}/></div>)}<button type="button" className="btn alt sm" onClick={()=>setF({...f,wanted_ingredients:[...W,{}]})}>+ Add wanted ingredient</button></F></>}
    {err&&<div className="err">{err}</div>}
    <button className="btn" disabled={busy}>{busy?'Please wait…':mode==='login'?'Log in':'Create account'}</button>
  </form></div></div>}

/* ---------- marketplace (Step 4) ---------- */
function Feed({openChat}){
  const{me,role,toast}=useC(),L=useCol('listings'),U=useCol('users'),[q,setQ]=useState(''),[cat,setCat]=useState('All'),[sort,setSort]=useState('Best match'),[proof,setProof]=useState(null);
  const um=Object.fromEntries(U.map(u=>[u.id,u]));
  const items=L.filter(l=>l.status==='live'&&l.available_quantity>0&&daysLeft(l.expiry_date)>0&&l.sellerId!==me.id&&(cat==='All'||l.category===cat)&&l.product_name.toLowerCase().includes(q.toLowerCase()))
    .map(l=>({...l,m:l.matches?.[me.id]||matchLocal(l,me),d:dist(l.sellerArea,me.city_area)}))
    .sort((a,b)=>sort==='Best match'?b.m.score-a.m.score:sort==='Nearest'?a.d-b.d:sort==='Expiring soon'?daysLeft(a.expiry_date)-daysLeft(b.expiry_date):a.asking_unit_price-b.asking_unit_price);
  const seed=async()=>{const e=(n,x)=>({...x,business_name:n,verified:true,created:Date.now(),user_role:'Owner'});
    const us={demo_bake:e('Bake & Bloom',{business_type:'Bakery',city_area:'Bangsar',menu_items_sold:['Tiramisu','Mocha Cake'],ingredients_used:['Coffee Beans','Whipping Cream','Flour'],wanted_ingredients:[{item:'Coffee Beans',qty:'6 kg'}],rating_sum:93,rating_count:10}),
      demo_cafe:e('Kopi Kita Cafe',{business_type:'Cafe',city_area:'Petaling Jaya',menu_items_sold:['Latte','Croissant'],ingredients_used:['Coffee Beans','Milk'],rating_sum:92,rating_count:10}),
      demo_cater:e('Sri Selera Catering',{business_type:'Caterer',city_area:'Puchong',menu_items_sold:['Nasi Lemak'],ingredients_used:['Rice','Coconut Milk'],rating_sum:86,rating_count:10})};
    for(const[id,u]of Object.entries(us))await setDoc(doc(db,'users',id),u);
    const mk=(sid,n,em,a,b,cat,q,unit,days,o,p,extra={})=>({sellerId:sid,sellerName:us[sid].business_name,sellerArea:us[sid].city_area,sellerVerified:true,product_name:n,product_photo:svg(em,a,b),category:cat,total_quantity:q,available_quantity:q,unit,min_order_qty:2,packaging_status:'Unopened / Factory Sealed',storage_type:'Dry / Room Temp',date_type:'Best Before',expiry_date:addDays(days),expiry_proof_type:'Label Photo on Pack',expiry_proof_img:label(addDays(days)),original_unit_price:o,asking_unit_price:p,retail_price:o*1.13,suggested_price:p,ai_price_reason:`Sealed stock with ${days} days left; priced under retail.`,delivery_options:['Self-Pickup','Lalamove / GrabExpress'],status:'live',matches:{},created:Date.now(),...extra});
    await addDoc(collection(db,'listings'),mk('demo_cafe','Arabica Coffee Beans (Dark Roast)','☕','#7a4a2b','#2b1608','Dry Goods',12,'kg',17,75,45));
    await addDoc(collection(db,'listings'),mk('demo_cater','Premium Coconut Milk','🥥','#c9e6d6','#6fb99a','Beverages',24,'cartons',9,6.5,3.2));
    await addDoc(collection(db,'listings'),mk('demo_bake','Unsalted Butter Blocks','🧈','#ffe9a6','#ffb020','Dairy & Chilled',10,'kg',6,38,16,{storage_type:'Chilled'}));
    toast('Demo businesses and listings added.')};
  return<div className="stack"><div className="row" style={{alignItems:'end'}}><div><h2>Marketplace</h2><p className="muted">Surplus stock near you, ranked by how well it fits your kitchen.</p></div>
    {role==='Admin'&&<p className="muted">Admins can browse but not trade.</p>}</div>
    <div className="row"><input placeholder="Search ingredients…" value={q} onChange={e=>setQ(e.target.value)}/><Sel v={cat} on={setCat} o={['All','Dry Goods','Baking','Dairy & Chilled','Beverages','Frozen']}/><Sel v={sort} on={setSort} o={['Best match','Nearest','Expiring soon','Lowest price']}/></div>
    {!items.length&&<div className="card stack" style={{alignItems:'start'}}><h3>No deals nearby yet</h3><p className="muted">Post a surplus listing, or load sample businesses to explore the full flow.</p><button className="btn mango" onClick={seed}>Load demo data</button></div>}
    <div className="grid">{items.map(l=>{const s=um[l.sellerId],rt=s?.rating_count?(s.rating_sum/s.rating_count).toFixed(1):'New';return<div className="lc" key={l.id}><img src={l.product_photo} alt={l.product_name}/><div className="in">
      <div><h3>{l.product_name}</h3><span className="muted">{l.sellerName} · ★ {rt}{rt!=='New'&&' / 10'}</span></div>
      <div className="price">{rm(l.asking_unit_price)}/{l.unit}<s>{rm(l.original_unit_price)}</s></div>
      <div className="meta"><span className="badge m">{l.available_quantity} {l.unit} left</span><span className="badge m">{daysLeft(l.expiry_date)} days left</span><span className="badge m">{l.d} km</span>{l.delivery_options?.map(o=><span className="badge m" key={o}>{o}</span>)}</div>
      <button className="badge" onClick={()=>setProof(l)}>✓ Verified expiry proof</button>
      {l.m.score>=40&&<div className="match"><Ring n={l.m.score} s={46}/><span><b>Recommended for you.</b> {l.m.reason}</span></div>}
      <button className="btn" style={{marginTop:'auto'}} disabled={role==='Admin'} onClick={()=>openChat(l)}>Chat with seller</button></div></div>})}</div>
    {proof&&<Modal on={()=>setProof(null)}><h3>{proof.product_name}</h3><p className="muted" style={{margin:'6px 0 12px'}}>{proof.expiry_proof_type} · declared {proof.expiry_date}</p><img src={proof.expiry_proof_img} alt="Expiry proof"/></Modal>}</div>}

/* ---------- sell (Steps 2 & 3) ---------- */
const blank=()=>({raw:'',product_photo:'',product_name:'',category:'Dry Goods',total_quantity:'',unit:'kg',min_order_qty:1,packaging_status:'Unopened / Factory Sealed',storage_type:'Dry / Room Temp',date_type:'Best Before',expiry_date:'',expiry_proof_type:'Label Photo on Pack',expiry_proof_img:'',batch_lot_no:'',original_unit_price:'',asking_unit_price:'',delivery_options:['Self-Pickup'],suggested_price:null,ai_price_reason:'',retail_price:null});
function Sell(){
  const{me,role,toast}=useC(),L=useCol('listings'),U=useCol('users'),[f,setF]=useState(blank()),[draftId,setDraft]=useState(null),[busy,setBusy]=useState(''),[gate,setGate]=useState([]),[matches,setMatches]=useState(null);
  const mine=L.filter(l=>l.sellerId===me.id).sort((a,b)=>b.created-a.created),s=k=>v=>setF(p=>({...p,[k]:v?.target?v.target.value:v})),I=(k,p={})=><input value={f[k]??''} onChange={s(k)} {...p}/>;
  const blocked=me.suspended||(me.frozen_until&&me.frozen_until>Date.now());
  const advise=async x=>{const days=daysLeft(x.expiry_date);if(!x.original_unit_price||!(days>0))return toast('Add the original price and a future expiry date first.');
    const sp=+(x.original_unit_price*factor(days)).toFixed(2);setF(p=>({...p,suggested_price:sp,asking_unit_price:p.asking_unit_price||sp}));
    try{const r=await AI.aiPriceReason({...x,days,sp});setF(p=>({...p,ai_price_reason:r.reason,retail_price:r.retail_price}))}catch(e){setF(p=>({...p,ai_price_reason:`${Math.round((1-factor(days))*100)}% off original with ${days} days left.`}))}};
  const fill=async()=>{if(!f.product_photo)return toast('Upload a product photo first.');setBusy('fill');
    try{const r=await AI.aiQuickFill(f.raw,f.product_photo),m={...f,...Object.fromEntries(Object.entries(r).filter(([,v])=>v!=null&&v!==''))};setF(m);await advise(m);toast('Filled in. Please review every field.')}catch(e){toast('AI fill failed: '+e.message)}setBusy('')};
  const submit=async draft=>{
    if(blocked)return toast('Your account is frozen or suspended, so you can’t post listings.');
    const need=['product_photo','product_name','total_quantity','min_order_qty','expiry_date','original_unit_price','asking_unit_price'].filter(k=>!f[k]);
    if(need.length)return toast('Missing: '+need.join(', ').replace(/_/g,' '));
    const base={...f,total_quantity:+f.total_quantity,min_order_qty:+f.min_order_qty,original_unit_price:+f.original_unit_price,asking_unit_price:+f.asking_unit_price,sellerId:me.id,sellerName:me.business_name,sellerArea:me.city_area,sellerVerified:!!me.verified,created:Date.now()};delete base.raw;
    if(draft){draftId?await updateDoc(doc(db,'listings',draftId),{...base,status:'draft'}):await addDoc(collection(db,'listings'),{...base,available_quantity:base.total_quantity,status:'draft'});log(me,'Draft saved',f.product_name);setF(blank());setDraft(null);return toast('Draft saved. An Owner can approve the price and publish it.')}
    setBusy('pub');setGate([]);const errs=[];
    if(daysLeft(f.expiry_date)<=0)errs.push('Rule 1: the expiry date must be later than today.');
    if(!f.expiry_proof_img)errs.push('Rule 2: upload a close-up of the printed expiry date or the supplier invoice.');
    if(f.packaging_status.startsWith('Opened'))errs.push('Opened food can’t be listed. Only sealed stock is allowed.');
    if(f.expiry_proof_type.startsWith('Supplier')&&!f.batch_lot_no)errs.push('Add the batch / lot number when using a supplier invoice as proof.');
    if(!errs.length)try{const r=await AI.aiReadExpiry(f.expiry_proof_img);if(!r.date)errs.push('Rule 3: AI Vision couldn’t read a date. Retake the photo closer to the label.');else if(r.date!==f.expiry_date)errs.push(`Rule 3: the photo shows ${r.date} but you entered ${f.expiry_date}. Fix the mismatch to continue.`)}catch(e){errs.push('AI Vision check failed: '+e.message)}
    setGate(errs);if(errs.length){log(me,'Listing blocked by anti-scam gate',f.product_name);return setBusy('')}
    const l={...base,available_quantity:base.total_quantity,status:'live',matches:{}};let id=draftId;
    if(id)await updateDoc(doc(db,'listings',id),l);else id=(await addDoc(collection(db,'listings'),l)).id;
    log(me,'Listing published',`${l.product_name} ${l.total_quantity}${l.unit} @ ${rm(l.asking_unit_price)}`);
    setMatches(await runMatcher(l,id,U,me));setF(blank());setDraft(null);setBusy('');toast('Published. Matched buyers were notified.')};
  const toggle=o=>s('delivery_options')(f.delivery_options.includes(o)?f.delivery_options.filter(x=>x!==o):[...f.delivery_options,o]);
  return<div className="stack"><div><h2>Post surplus stock</h2><p className="muted">{role==='Staff'?'Staff can draft listings. An Owner approves the price and publishes.':'Drop a photo and a messy note — AI does the typing.'}</p></div>
    {blocked&&<div className="err">Your account can’t post listings right now because of a moderator penalty.</div>}
    <div className="card stack" style={{background:'linear-gradient(135deg,#E3F3EA,#fff)'}}><h3>AI quick-fill</h3>
      <F l="Describe it any way you like"><textarea rows={2} value={f.raw} onChange={s('raw')} placeholder="Got 12kg arabica beans unopened exp 12 Nov bought RM75/kg"/></F>
      <div className="row"><F l="Product photo" req><Img v={f.product_photo} on={s('product_photo')} l="Upload product photo"/></F><div style={{display:'flex',alignItems:'end'}}><button className="btn mango" disabled={busy==='fill'} onClick={fill}>{busy==='fill'?'Reading photo…':'✨ Auto-fill with AI'}</button></div></div></div>
    <div className="card stack"><h3>Listing details</h3>
      <div className="row"><F l="Product name" req>{I('product_name')}</F><F l="Category" req><Sel v={f.category} on={s('category')} o={['Dry Goods','Baking','Dairy & Chilled','Beverages','Frozen']}/></F></div>
      <div className="row"><F l="Total quantity" req>{I('total_quantity',{type:'number',min:0})}</F><F l="Unit" req><Sel v={f.unit} on={s('unit')} o={['kg','g','L','ml','packs','cartons']}/></F><F l="Minimum order" req>{I('min_order_qty',{type:'number',min:0})}</F></div>
      <div className="row"><F l="Packaging" req><Sel v={f.packaging_status} on={s('packaging_status')} o={['Unopened / Factory Sealed','Opened (blocked)']}/></F><F l="Storage" req><Sel v={f.storage_type} on={s('storage_type')} o={['Dry / Room Temp','Chilled','Frozen']}/></F></div>
      <div className="row"><F l="Date type" req><Sel v={f.date_type} on={s('date_type')} o={['Best Before','Use By (Expiry)']}/></F><F l="Expiry date" req>{I('expiry_date',{type:'date',min:addDays(1)})}</F></div>
      <div className="row"><F l="Expiry proof type" req><Sel v={f.expiry_proof_type} on={s('expiry_proof_type')} o={['Label Photo on Pack','Supplier Invoice + Batch No.']}/></F>{f.expiry_proof_type.startsWith('Supplier')&&<F l="Batch / lot no." req>{I('batch_lot_no')}</F>}</div>
      <F l="Expiry proof photo (close-up of the printed date or invoice)" req><Img v={f.expiry_proof_img} on={s('expiry_proof_img')} l="Upload expiry proof"/></F>
      <div className="row"><F l="Original unit price (RM)" req>{I('original_unit_price',{type:'number',min:0,step:'0.01'})}</F><F l="Your asking price (RM)" req>{I('asking_unit_price',{type:'number',min:0,step:'0.01'})}</F></div>
      <div className="match" style={{flexWrap:'wrap'}}><div style={{flex:1}}><b>AI price advisor:</b> {f.suggested_price?<>{rm(f.suggested_price)}/{f.unit} suggested. {f.ai_price_reason}</>:'Add your original price and expiry date to get a suggestion.'}</div><button className="btn mango sm" onClick={()=>advise(f)}>Suggest price</button></div>
      <F l="Delivery options" req><div className="row">{['Self-Pickup','Lalamove / GrabExpress','Seller Delivery'].map(o=><label key={o} className="badge m" style={{padding:'8px 14px'}}><input type="checkbox" style={{width:'auto',marginRight:6}} checked={f.delivery_options.includes(o)} onChange={()=>toggle(o)}/>{o}</label>)}</div></F>
      {gate.length>0&&<div className="err">Anti-scam gate: this listing can’t be published yet.<ul style={{margin:'6px 0 0',paddingLeft:18}}>{gate.map(g=><li key={g}>{g}</li>)}</ul></div>}
      <div className="row"><button className="btn alt" onClick={()=>submit(true)}>Save draft</button>{role==='Owner'?<button className="btn" disabled={busy==='pub'} onClick={()=>submit(false)}>{busy==='pub'?'Verifying proof…':'Verify & publish'}</button>:<button className="btn" disabled style={{opacity:.4}}>Owner approval needed to publish</button>}</div></div>
    {matches&&<div className="card stack"><h3>Smart matcher results</h3>{matches.map(m=><div className="match" key={m.name}><Ring n={m.score}/><span><b>{m.name}</b>: {m.reason}</span></div>)}</div>}
    <div className="card stack"><h3>Your listings</h3>{!mine.length&&<p className="muted">Nothing posted yet.</p>}{mine.map(l=><div className="row" key={l.id} style={{alignItems:'center'}}><span><b>{l.product_name}</b><br/><span className="muted">{l.available_quantity}/{l.total_quantity} {l.unit} · {rm(l.asking_unit_price)} · expires {l.expiry_date}</span></span><span className={'badge '+(l.status==='live'?'':'m')} style={{flex:'none'}}>{l.status}</span>{l.status==='draft'&&<button className="btn alt sm" style={{flex:'none'}} onClick={()=>{setF({...blank(),...l});setDraft(l.id);scrollTo(0,0)}}>Open draft</button>}</div>)}</div></div>}

/* ---------- deals (Steps 5-9) ---------- */
const STAGES=['NEGOTIATING','OFFERED','CONFIRMED','HANDED_OVER','COMPLETED'];
function Deals({sel,setSel}){
  const{me,role,toast}=useC(),D=useCol('deals'),L=useCol('listings'),mine=D.filter(d=>d.sellerId===me.id||d.buyerId===me.id).sort((a,b)=>(b.updated||0)-(a.updated||0)),d=D.find(x=>x.id===sel);
  return<div className="stack"><div><h2>Deals</h2><p className="muted">Chat, agree terms, approve, hand over, review.</p></div><div className="chat">
    <div className="list">{!mine.length&&<p className="muted">No conversations yet. Tap “Chat with seller” on a listing.</p>}{mine.map(x=><button key={x.id} className={'li'+(x.id===sel?' on':'')} onClick={()=>setSel(x.id)}><b>{x.listingName}</b><br/><span className="muted">{me.id===x.sellerId?'Buyer: '+x.buyerName:'Seller: '+x.sellerName}</span><br/><span className="badge m">{x.status}</span></button>)}</div>
    {d?<Win key={d.id} d={d} l={L.find(x=>x.id===d.listingId)}/>:<div className="card" style={{display:'grid',placeItems:'center'}}><p className="muted">Select a conversation.</p></div>}</div></div>}
function Win({d,l}){
  const{me,role,toast}=useC(),[t,setT]=useState(''),[card,setCard]=useState(null),[busy,setBusy]=useState(false),[dsp,setDsp]=useState(null),[fb,setFb]=useState({ai_match_relevant:'Yes',item_as_described:true,expiry_matched:true,packaging_ok:true,ai_private_note:'',seller_score_10:9,review_tags:[],public_comment:'',review_photo:''});
  const isS=me.id===d.sellerId,isB=me.id===d.buyerId,demoS=d.sellerId.startsWith('demo_'),canSell=isS||demoS,ref=doc(db,'deals',d.id),up=p=>updateDoc(ref,{...p,updated:Date.now()});
  const send=async(img)=>{if(!t.trim()&&!img)return;await up({messages:arrayUnion({from:me.id,name:me.business_name,text:t.trim(),img:img||null,at:Date.now()})});setT('')};
  const sum=async()=>{setBusy(true);try{const r=await AI.aiSummarise(d.messages,l);setCard({agreed_quantity:r.agreed_quantity||l.min_order_qty,agreed_unit_price:r.agreed_unit_price||l.asking_unit_price,fulfilment_method:r.fulfilment_method||l.delivery_options[0],handover_time:'',payment_method:'DuitNow / Bank Transfer'});toast('Deal card filled from chat. Check it, then send.')}catch(e){toast('AI summary failed: '+e.message)}setBusy(false)};
  const newCard=()=>setCard({agreed_quantity:l.min_order_qty,agreed_unit_price:l.asking_unit_price,fulfilment_method:l.delivery_options[0],handover_time:'',payment_method:'DuitNow / Bank Transfer'});
  const offer=async()=>{const q=+card.agreed_quantity;if(!(q>=l.min_order_qty))return toast(`Minimum order is ${l.min_order_qty} ${l.unit}.`);if(q>l.available_quantity)return toast(`Only ${l.available_quantity} ${l.unit} available.`);if(!card.handover_time)return toast('Pick a handover time.');
    await up({card:{...card,agreed_quantity:q,agreed_unit_price:+card.agreed_unit_price,total_amount:+(q*card.agreed_unit_price).toFixed(2),locked_expiry_date:l.expiry_date},approvals:{seller:false,buyer:false},status:'OFFERED'});setCard(null);log(me,'Deal offer created',`${d.listingName} ${q}${l.unit}`)};
  const approve=async side=>{if(role!=='Owner')return toast('Staff accounts can’t approve deals. Switch to Owner.');const ap={...d.approvals,[side]:true};
    try{if(ap.seller&&ap.buyer){await runTransaction(db,async tx=>{const lr=doc(db,'listings',d.listingId),s=await tx.get(lr),a=s.data().available_quantity;if(a<d.card.agreed_quantity)throw new Error('Not enough stock left');tx.update(lr,{available_quantity:a-d.card.agreed_quantity});tx.update(ref,{approvals:ap,status:'CONFIRMED',updated:Date.now()})});log(me,'Deal CONFIRMED',`${d.listingName}: ${d.card.agreed_quantity}${l.unit} reserved, ${rm(d.card.total_amount)}`);toast('Deal confirmed. Stock reserved.')}else await up({approvals:ap})}catch(e){toast(e.message)}};
  const done=async()=>{await up({feedback:fb,status:'COMPLETED'});await updateDoc(doc(db,'users',d.sellerId),{rating_sum:increment(+fb.seller_score_10*10),rating_count:increment(1)}).catch(()=>{});await addDoc(collection(db,'reviews'),{sellerId:d.sellerId,sellerName:d.sellerName,buyerName:me.business_name,score:+fb.seller_score_10,comment:fb.public_comment,tags:fb.review_tags,photo:fb.review_photo,at:Date.now()});log(me,'Deal COMPLETED',`${d.listingName}, ${fb.seller_score_10}/10`);toast('Thanks! Impact dashboard updated.')};
  const dispute=async()=>{if(!dsp.evidence_photos?.length||!dsp.dispute_details)return toast('Add evidence photo and details.');await addDoc(collection(db,'disputes'),{...dsp,dealId:d.id,listingId:d.listingId,sellerId:d.sellerId,sellerName:d.sellerName,buyerName:d.buyerName,listingName:d.listingName,status:'OPEN',at:Date.now()});await up({status:'DISPUTED'});log(me,'Dispute opened',`${d.listingName}: ${dsp.dispute_reason}`);setDsp(null)};
  const idx=STAGES.indexOf(d.status),c=d.card;
  return<div className="card win"><div style={{padding:'14px 18px',borderBottom:'1px solid var(--line)'}}><b>{d.listingName}</b><div className="steps" style={{marginTop:6}}>{STAGES.map((s,i)=><span key={s} className={i<idx||d.status==='COMPLETED'?'d':i===idx?'c':''}>{s.replace('_',' ')}</span>)}{d.status==='DISPUTED'&&<span className="c" style={{background:'var(--chili)'}}>DISPUTED</span>}{d.status==='RESOLVED'&&<span className="c">RESOLVED</span>}</div></div>
    <div className="msgs">{d.messages.map((m,i)=><div key={i} className={'m'+(m.from===me.id?' me':'')}><small>{m.name}</small>{m.text}{m.img&&<img src={m.img} alt=""/>}</div>)}</div>
    {['NEGOTIATING','OFFERED'].includes(d.status)&&<div className="comp"><input value={t} placeholder="e.g. Can I take 6kg at RM40/kg? I’ll arrange Lalamove." onChange={e=>setT(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}/><label className="btn alt sm">📷<input type="file" accept="image/*" hidden onChange={async e=>e.target.files[0]&&send(await toData(e.target.files[0],600))}/></label><button className="btn sm" onClick={()=>send()}>Send</button><button className="btn alt sm" disabled={busy||d.messages.length<1} onClick={sum}>{busy?'Reading…':'✨ AI summarise'}</button><button className="btn mango sm" onClick={newCard}>Create deal offer</button></div>}
    <div className="dealbox">
      {card&&<div className="stack"><h3>Deal confirmation card</h3><div className="row"><F l={`Quantity (${l.unit})`}><input type="number" value={card.agreed_quantity} onChange={e=>setCard({...card,agreed_quantity:e.target.value})}/></F><F l="Unit price (RM)"><input type="number" step=".01" value={card.agreed_unit_price} onChange={e=>setCard({...card,agreed_unit_price:e.target.value})}/></F><F l="Total (auto)"><input readOnly value={rm(card.agreed_quantity*card.agreed_unit_price)}/></F></div>
        <div className="row"><F l="Locked expiry (auto)"><input readOnly value={l.expiry_date}/></F><F l="Fulfilment"><Sel v={card.fulfilment_method} on={v=>setCard({...card,fulfilment_method:v})} o={['Self-Pickup','Lalamove / GrabExpress','Seller Delivery']}/></F><F l="Handover time"><input type="datetime-local" value={card.handover_time} onChange={e=>setCard({...card,handover_time:e.target.value})}/></F><F l="Payment"><Sel v={card.payment_method} on={v=>setCard({...card,payment_method:v})} o={['DuitNow / Bank Transfer','Cash on Pickup']}/></F></div>
        <div className="row"><button className="btn" onClick={offer}>Send offer</button><button className="btn alt" onClick={()=>setCard(null)}>Cancel</button></div></div>}
      {c&&!card&&<div className="ok">Deal: {c.agreed_quantity} {l.unit} × {rm(c.agreed_unit_price)} = <b>{rm(c.total_amount)}</b> · {c.fulfilment_method} · {c.handover_time?.replace('T',' ')} · {c.payment_method} · expiry locked {c.locked_expiry_date}</div>}
      {d.status==='OFFERED'&&<div className="row"><button className="btn" disabled={d.approvals.seller||!canSell} onClick={()=>approve('seller')}>{d.approvals.seller?'✓ Seller approved':'Approve as seller'+(demoS&&!isS?' (demo)':'')}</button><button className="btn" disabled={d.approvals.buyer||!isB} onClick={()=>approve('buyer')}>{d.approvals.buyer?'✓ Buyer approved':'Approve as buyer'}</button></div>}
      {['CONFIRMED','HANDED_OVER'].includes(d.status)&&<div className="stack"><div className="row"><F l="Delivery note"><input defaultValue={d.delivery_note||''} placeholder="Lalamove driver WXY 1234" onBlur={e=>up({delivery_note:e.target.value})}/></F>
        {canSell&&<button className="btn alt" onClick={()=>up({payment_received:!d.payment_received})}>{d.payment_received?`✓ Payment received (${rm(c.total_amount)})`:'Mark payment received'}</button>}
        {canSell&&d.status==='CONFIRMED'&&<button className="btn" onClick={()=>up({status:'HANDED_OVER'})}>Goods handed over</button>}</div>
        {d.status==='HANDED_OVER'&&isB&&<div className="row"><button className="btn" onClick={()=>up({inspect:'OK'})}>Goods received &amp; OK</button><button className="btn red" onClick={()=>setDsp({dispute_reason:'Expiry Date Mismatch',evidence_photos:[],dispute_details:'',requested_outcome:'Full Refund / Return'})}>Issue with goods</button></div>}</div>}
      {d.status==='HANDED_OVER'&&d.inspect==='OK'&&isB&&<div className="stack"><h3>How did it go?</h3><div className="row"><F l="Did this suit your menu or needs?"><Sel v={fb.ai_match_relevant} on={v=>setFb({...fb,ai_match_relevant:v})} o={['Yes','Somewhat','No']}/></F>{[['item_as_described','Item as described?'],['expiry_matched','Expiry label matched?'],['packaging_ok','Sealed and stored well?']].map(([k,t])=><F key={k} l={t}><Sel v={fb[k]?'Yes':'No'} on={v=>setFb({...fb,[k]:v==='Yes'})} o={['Yes','No']}/></F>)}</div>
        <F l="Private note to the AI (hidden from public)"><textarea rows={2} value={fb.ai_private_note} onChange={e=>setFb({...fb,ai_private_note:e.target.value})}/></F>
        <div className="row"><F l={`Seller score: ${fb.seller_score_10} / 10`}><input type="range" min="1" max="10" value={fb.seller_score_10} onChange={e=>setFb({...fb,seller_score_10:e.target.value})}/></F><F l="Tags"><div className="row">{['Friendly Seller','Fast Chat','Accurate Expiry','Well Packed'].map(x=><label key={x} className="badge m"><input type="checkbox" style={{width:'auto',marginRight:4}} checked={fb.review_tags.includes(x)} onChange={()=>setFb({...fb,review_tags:fb.review_tags.includes(x)?fb.review_tags.filter(y=>y!==x):[...fb.review_tags,x]})}/>{x}</label>)}</div></F></div>
        <F l="Public comment" req><textarea rows={2} value={fb.public_comment} onChange={e=>setFb({...fb,public_comment:e.target.value})}/></F><Img v={fb.review_photo} on={v=>setFb({...fb,review_photo:v})} l="Optional photo of received stock" max={600}/>
        <button className="btn" onClick={()=>fb.public_comment?done():toast('Write a short public comment.')}>Submit feedback</button></div>}
      {dsp&&<div className="stack"><h3>Report an issue</h3><div className="row"><F l="Reason"><Sel v={dsp.dispute_reason} on={v=>setDsp({...dsp,dispute_reason:v})} o={['Expiry Date Mismatch','Missing Date Label','Opened / Damaged Pack','Spoiled Item','Short Quantity']}/></F><F l="Outcome you want"><Sel v={dsp.requested_outcome} on={v=>setDsp({...dsp,requested_outcome:v})} o={['Full Refund / Return','Partial Refund']}/></F></div>
        <Img v={dsp.evidence_photos[0]} on={v=>setDsp({...dsp,evidence_photos:[v]})} l="Upload evidence photo (required)"/><F l="What went wrong?"><textarea rows={2} value={dsp.dispute_details} onChange={e=>setDsp({...dsp,dispute_details:e.target.value})}/></F><div className="row"><button className="btn red" onClick={dispute}>Submit dispute</button><button className="btn alt" onClick={()=>setDsp(null)}>Cancel</button></div></div>}
      {d.status==='COMPLETED'&&<div className="ok">Completed. Thank you for rescuing {c.agreed_quantity} {l.unit} of food.</div>}
      {d.status==='DISPUTED'&&<div className="err">A moderator is reviewing this dispute.</div>}
      {d.status==='RESOLVED'&&<div className="ok">Dispute resolved by a moderator.</div>}</div></div>}

/* ---------- impact ---------- */
function Impact(){
  const D=useCol('deals'),R=useCol('reviews'),L=useCol('listings'),lm=Object.fromEntries(L.map(l=>[l.id,l])),ok=D.filter(d=>d.status==='COMPLETED');
  const kg=ok.reduce((a,d)=>a+d.card.agreed_quantity,0),rec=ok.reduce((a,d)=>a+d.card.total_amount,0),sav=ok.reduce((a,d)=>a+d.card.agreed_quantity*Math.max(0,(lm[d.listingId]?.retail_price||0)-d.card.agreed_unit_price),0);
  return<div className="stack"><h2>Impact dashboard</h2><div className="stats"><div className="stat"><b>{kg}</b>units of surplus rescued</div><div className="stat"><b>{rm(rec)}</b>recovered by sellers</div><div className="stat"><b>{rm(sav)}</b>saved by buyers vs retail</div></div>
    <div className="card stack"><h3>Recent reviews</h3>{!R.length&&<p className="muted">Reviews appear after the first completed deal.</p>}{R.sort((a,b)=>b.at-a.at).slice(0,6).map(r=><div key={r.at}><b>{r.sellerName}</b> · {r.score}/10 <span className="muted">by {r.buyerName}</span><p>{r.comment}</p></div>)}</div></div>}

/* ---------- moderation (Step 9B + audit) ---------- */
function Admin(){
  const{me,toast}=useC(),Dp=useCol('disputes'),A=useCol('audit'),[sm,setSm]=useState({}),[v,setV]=useState({});
  const run=async x=>{setSm({...sm,[x.id]:'…'});try{const l=(await getDoc(doc(db,'listings',x.listingId))).data();setSm({...sm,[x.id]:await AI.aiDispute(l,x)})}catch(e){setSm({...sm,[x.id]:'AI summary failed: '+e.message})}};
  const decide=async x=>{const o=v[x.id]||{verdict:'Approve Buyer Claim',penalty:'Warning'};
    await updateDoc(doc(db,'disputes',x.id),{status:'RESOLVED',...o,ai_summary:sm[x.id]||''});await updateDoc(doc(db,'deals',x.dealId),{status:'RESOLVED'});
    if(o.verdict==='Approve Buyer Claim'){const p={warnings:increment(1)};if(o.penalty.startsWith('7-Day'))p.frozen_until=Date.now()+7*864e5;if(o.penalty.startsWith('Account'))p.suspended=true;await updateDoc(doc(db,'users',x.sellerId),p).catch(()=>{})}
    log(me,'Dispute resolved',`${x.listingName}: ${o.verdict}${o.verdict.startsWith('Approve')?' / '+o.penalty:''}`);toast('Verdict recorded.')};
  return<div className="stack"><h2>Moderation</h2>{!Dp.length&&<p className="muted">No disputes yet.</p>}
    {Dp.sort((a,b)=>b.at-a.at).map(x=><div className="card stack" key={x.id}><div className="row" style={{alignItems:'center'}}><div><h3>{x.listingName}</h3><span className="muted">{x.buyerName} vs {x.sellerName} · {x.dispute_reason} · wants {x.requested_outcome}</span></div><span className={'badge '+(x.status==='OPEN'?'r':'')} style={{flex:'none'}}>{x.status}</span></div>
      <p>“{x.dispute_details}”</p><div className="row"><img src={x.evidence_photos[0]} style={{maxWidth:220,borderRadius:10}} alt="Evidence"/></div>
      {x.status==='OPEN'?<><button className="btn mango" style={{alignSelf:'start'}} onClick={()=>run(x)}>✨ AI dispute summary</button>{sm[x.id]&&<div className="ok">{sm[x.id]}</div>}
        <div className="row"><F l="Verdict (human decision)"><Sel v={(v[x.id]||{}).verdict||'Approve Buyer Claim'} on={z=>setV({...v,[x.id]:{...(v[x.id]||{penalty:'Warning'}),verdict:z}})} o={['Approve Buyer Claim','Reject Claim']}/></F><F l="Seller penalty"><Sel v={(v[x.id]||{}).penalty||'Warning'} on={z=>setV({...v,[x.id]:{...(v[x.id]||{verdict:'Approve Buyer Claim'}),penalty:z}})} o={['Warning','7-Day Listing Freeze','Account Suspension / Permanent Ban']}/></F></div><button className="btn" style={{alignSelf:'start'}} onClick={()=>decide(x)}>Record verdict</button></>:<div className="ok">{x.verdict}{x.verdict?.startsWith('Approve')&&` · ${x.penalty}`}</div>}</div>)}
    <div className="card"><h3 style={{marginBottom:10}}>Audit log</h3><div style={{overflow:'auto',maxHeight:360}}><table><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>{A.sort((a,b)=>b.at-a.at).slice(0,80).map(a=><tr key={a.id}><td>{new Date(a.at).toLocaleString()}</td><td>{a.who}</td><td>{a.action}</td><td>{a.detail}</td></tr>)}</tbody></table></div></div></div>}

/* ---------- shell ---------- */
export default function App(){
  const[u,setU]=useState(undefined),[me,setMe]=useState(null),[role,setRole]=useState(null),[view,setView]=useState('feed'),[sel,setSel]=useState(null),[msg,setMsg]=useState(''),[bell,setBell]=useState(false),N=useCol('notifications');
  useEffect(()=>onAuthStateChanged(auth,x=>{setU(x);if(!x){setMe(null);setRole(null)}}),[]);
  useEffect(()=>{if(!u)return;return onSnapshot(doc(db,'users',u.uid),s=>s.exists()&&setMe({id:s.id,...s.data()}))},[u]);
  useEffect(()=>{if(me&&!role)setRole(me.user_role)},[me]);
  const toast=m=>{setMsg(m);setTimeout(()=>setMsg(''),3600)};
  if(u===undefined||(u&&!me))return<div style={{display:'grid',placeItems:'center',height:'100vh'}}>Loading…</div>;
  if(!u)return<Auth/>;
  const r=role||me.user_role,mineN=N.filter(n=>n.to===me.id).sort((a,b)=>b.at-a.at);
  const openChat=async l=>{if(l.sellerId===me.id)return;const id=`${l.id}_${me.id}`,ref=doc(db,'deals',id);if(!(await getDoc(ref)).exists()){await setDoc(ref,{listingId:l.id,listingName:l.product_name,sellerId:l.sellerId,sellerName:l.sellerName,buyerId:me.id,buyerName:me.business_name,messages:[],status:'NEGOTIATING',approvals:{seller:false,buyer:false},updated:Date.now()});await addDoc(collection(db,'notifications'),{to:l.sellerId,text:`${me.business_name} wants to chat about ${l.product_name}.`,at:Date.now()})}setSel(id);setView('deals')};
  const nav=[['feed','🛒','Market'],...(r==='Admin'?[]:[['sell','➕','Sell'],['deals','💬','Deals']]),['impact','🌱','Impact'],...(r==='Admin'?[['admin','🛡️','Moderate']]:[])];
  const cur=r==='Admin'&&['sell','deals'].includes(view)?'feed':view;
  return<C.Provider value={{me,role:r,toast}}><div className="app"><aside className="side"><div className="logo">Surplus<span>Link</span> AI</div>{nav.map(([k,i,t])=><button key={k} className={'nav'+(cur===k?' on':'')} onClick={()=>setView(k)}><span>{i}</span>{t}</button>)}<div style={{flex:1}}/><button className="nav" onClick={()=>signOut(auth)}>↩ Log out</button></aside>
    <div><div className="top"><div><b>{me.business_name}</b> {me.verified&&<span className="badge">✓ SSM verified</span>}</div><div className="row" style={{flex:'none',alignItems:'center'}}><div className="seg" title="Role switcher (RBAC demo)">{['Owner','Staff','Admin'].map(x=><button key={x} className={r===x?'on':''} onClick={()=>setRole(x)}>{x}</button>)}</div>
      <div className="bell"><button className="btn alt sm" onClick={()=>setBell(!bell)}>🔔 {mineN.length}</button>{bell&&<div className="pop">{!mineN.length&&<p className="muted">No notifications yet.</p>}{mineN.slice(0,15).map(n=><p key={n.id}>{n.text}</p>)}</div>}</div></div></div>
      <main className="main">{cur==='feed'&&<Feed openChat={openChat}/>}{cur==='sell'&&<Sell/>}{cur==='deals'&&<Deals sel={sel} setSel={setSel}/>}{cur==='impact'&&<Impact/>}{cur==='admin'&&<Admin/>}</main></div>
    {msg&&<div className="toast">{msg}</div>}</div></C.Provider>}
