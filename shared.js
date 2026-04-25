// ══════════════════════════════════════════════════════════════════════════════
// SHARED.JS — CS HEADSHOT SQUAD v4.0
// Firebase Realtime Database + localStorage fallback
// Base de données : https://ff-tournament-manager-default-rtdb.firebaseio.com/
// ══════════════════════════════════════════════════════════════════════════════

// ── EMAILJS ───────────────────────────────────────────────────────
const EMAIL_CONFIG = {
  publicKey:  'dKQOzPSvxtNG6oImA',
  serviceId:  'service_wim75fa',
  templateId: {
    inscription_admin: 'template_jrmnetj',
    validation_joueur: 'template_uhmdfu6',
    refus_joueur:      'template_uhmdfu6', // ← même template, adapter si tu crées un template dédié
  },
  adminEmail: 'kayodegael@gmail.com',
  enabled: true
};

// ── HASHES PAR DÉFAUT (SHA-256) ───────────────────────────────────
const _H_ADMIN = '0e89f223e226ae63268cf39152ab75722e811b89d29efb22a852f1667bd22ae0';
const _H_DEV   = 'f5e7a0fc70accc07bf4ea5b6efac819bf44ebef9b1e78416ca8a78012e7b7bda';

// ── FIREBASE CONFIG ───────────────────────────────────────────────
const FB_URL = 'https://ff-tournament-manager-default-rtdb.firebaseio.com';

// ══════════════════════════════════════════════════════════════════════════════
// COUCHE FIREBASE REALTIME DATABASE (REST API — sans SDK)
// Utilise l'API REST Firebase pour lire/écrire depuis le navigateur
// Fallback automatique sur localStorage si Firebase est inaccessible
// ══════════════════════════════════════════════════════════════════════════════

// Convertir une clé localStorage en chemin Firebase
// ex: 'hsq-tournaments' → 'hsq-tournaments'
// ex: 'hsq-data-T-ABC'  → 'hsq-data/T-ABC'
function _fbPath(key) {
  // Convertit la clé localStorage en chemin Firebase valide
  // Règle : remplacer tirets par underscore SAUF dans les IDs de tournoi (T-XXXX)
  // ex: 'hsq-tournaments'      → 'hsq_tournaments'
  // ex: 'hsq-data-T-ABC123'   → 'hsq_data/T_ABC123'
  // ex: 'hsq-claims-T-ABC123' → 'hsq_claims/T_ABC123'
  let path = key;
  if (path.startsWith('hsq-data-'))   { path = 'hsq_data/' + path.slice(9).replace(/-/g, '_'); return path; }
  if (path.startsWith('hsq-claims-')) { path = 'hsq_claims/' + path.slice(11).replace(/-/g, '_'); return path; }
  if (path.startsWith('hsq-music-'))  { path = 'hsq_music/' + path.slice(10).replace(/-/g, '_'); return path; }
  return path.replace(/-/g, '_');
}

// Lecture Firebase (async)
async function _fbGet(key, def = null) {
  try {
    const path = _fbPath(key);
    const res  = await fetch(`${FB_URL}/${path}.json`, { method: 'GET' });
    if (!res.ok) return def;
    const data = await res.json();
    return data !== null ? data : def;
  } catch(e) {
    return def;
  }
}

// Écriture Firebase (async, fire-and-forget)
function _fbSet(key, val) {
  const path = _fbPath(key);
  fetch(`${FB_URL}/${path}.json`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(val)
  }).catch(e => console.warn('Firebase write error:', e));
}

// Suppression Firebase
function _fbDelete(key) {
  const path = _fbPath(key);
  fetch(`${FB_URL}/${path}.json`, { method: 'DELETE' })
    .catch(e => console.warn('Firebase delete error:', e));
}

// ── CACHE LOCAL (évite des requêtes inutiles + fonctionne hors-ligne) ─
const _cache = {};

// ── STORAGE HYBRIDE ───────────────────────────────────────────────
// lsGet  = lecture  : cache → localStorage  (synchrone, pour compatibilité)
// lsSet  = écriture : localStorage + Firebase (Firebase en arrière-plan)
// dbGet  = lecture  : Firebase (async, données fraîches)
// dbLoad = initialise le cache depuis Firebase au démarrage

function lsGet(key, def = null) {
  // 1. Cache mémoire
  if (_cache[key] !== undefined) return _cache[key];
  // 2. localStorage
  try {
    const r = localStorage.getItem(key);
    if (r !== null) {
      const parsed = JSON.parse(r);
      _cache[key] = parsed;
      return parsed;
    }
  } catch(e) {}
  return def;
}

function lsSet(key, val) {
  // 1. Cache mémoire
  _cache[key] = val;
  // 2. localStorage (synchrone)
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
  // 3. Firebase Realtime Database (asynchrone, arrière-plan)
  // Ne pas uploader les données de musique (trop lourdes pour Firebase)
  if (!key.startsWith('hsq-music-') && !key.startsWith('hsq-dark') && !key.startsWith('hsq-muted') && !key.startsWith('hsq-votes')) {
    _fbSet(key, val);
  }
}

function lsDel(key) {
  delete _cache[key];
  try { localStorage.removeItem(key); } catch(e) {}
  _fbDelete(key);
}

// Charge les données Firebase dans le cache et localStorage au démarrage
// Appelé UNE fois par page — met à jour silencieusement en arrière-plan
async function dbSync() {
  const keys = [
    'hsq-tournaments',
    'hsq-announcements',
    'hsq-last-tournament'
  ];

  // Récupérer aussi les données des tournois connus
  const localTournaments = lsGet('hsq-tournaments', []);
  localTournaments.forEach(t => {
    keys.push('hsq-data-' + t.id);
    keys.push('hsq-claims-' + t.id);
  });

  for (const key of keys) {
    try {
      const val = await _fbGet(key, null);
      if (val !== null) {
        // Firebase a des données — mettre à jour cache et localStorage
        _cache[key] = val;
        try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
      }
    } catch(e) {}
  }
}

// Écouteur temps réel sur les tournois — rafraîchit la page si les données changent
// Firebase Realtime Database supporte les EventSource (Server-Sent Events)
let _realtimeListener = null;

function startRealtimeSync(onUpdate) {
  if (_realtimeListener) return;
  try {
    const url = `${FB_URL}/hsq_tournaments.json`;
    _realtimeListener = new EventSource(url);
    _realtimeListener.addEventListener('put', (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.data !== null) {
          _cache['hsq-tournaments'] = msg.data;
          try { localStorage.setItem('hsq-tournaments', JSON.stringify(msg.data)); } catch(e) {}
          if (typeof onUpdate === 'function') onUpdate(msg.data);
        }
      } catch(err) {}
    });
    _realtimeListener.onerror = () => {
      // Connexion perdue — on ferme proprement (pas de spam de reconnexion)
      if (_realtimeListener) { _realtimeListener.close(); _realtimeListener = null; }
    };
  } catch(e) {}
}

function stopRealtimeSync() {
  if (_realtimeListener) { _realtimeListener.close(); _realtimeListener = null; }
}

// ══════════════════════════════════════════════════════════════════════════════
// TYPES RÉCOMPENSES FREE FIRE
// ══════════════════════════════════════════════════════════════════════════════
const REWARD_TYPES = [
  {value:'booyah_pass',label:'Booyah Pass',      icon:'🏆'},
  {value:'weekly',     label:'Abonnement hebdo',  icon:'📅'},
  {value:'monthly',    label:'Abonnement mensuel',icon:'📆'},
  {value:'100d',       label:'100 Diamonds',      icon:'💎'},
  {value:'200d',       label:'200 Diamonds',      icon:'💎'},
  {value:'300d',       label:'300 Diamonds',      icon:'💎'},
  {value:'500d',       label:'500 Diamonds',      icon:'💎'},
  {value:'800d',       label:'800 Diamonds',      icon:'💎'},
  {value:'1180d',      label:'1180 Diamonds',     icon:'💎'},
  {value:'2000d',      label:'2000 Diamonds',     icon:'💎'},
  {value:'3000d',      label:'3000 Diamonds',     icon:'💎'},
  {value:'5000d',      label:'5000 Diamonds',     icon:'💎'},
  {value:'10000d',     label:'10000 Diamonds',    icon:'💎'},
  {value:'custom',     label:'Personnalisé',       icon:'🎁'}
];
function getRewardTypeInfo(v) { return REWARD_TYPES.find(r=>r.value===v)||REWARD_TYPES[REWARD_TYPES.length-1]; }
function getDefaultRewards() {
  return [
    {id:'r1',rank:1,rankLabel:'1ère place',type:'2000d', qty:1,unitPrice:0,note:''},
    {id:'r2',rank:2,rankLabel:'2ème place',type:'1180d', qty:1,unitPrice:0,note:''},
    {id:'r3',rank:3,rankLabel:'3ème place',type:'500d',  qty:1,unitPrice:0,note:''},
  ];
}

// ══════════════════════════════════════════════════════════════════════════════
// TOURNOIS CRUD
// ══════════════════════════════════════════════════════════════════════════════
function getTournaments()      { return lsGet('hsq-tournaments',[]); }
function saveTournaments(list) { lsSet('hsq-tournaments',list); }
function getTournamentById(id) { return getTournaments().find(t=>t.id===id)||null; }

function saveTournament(t) {
  if (!t||!t.id) return;
  const list=getTournaments(), idx=list.findIndex(x=>x.id===t.id);
  if (idx>=0) list[idx]={...list[idx],...t}; else list.push(t);
  saveTournaments(list);
}
function deleteTournament(id) {
  saveTournaments(getTournaments().filter(t=>t.id!==id));
  lsDel('hsq-data-'+id);
  lsDel('hsq-claims-'+id);
  localStorage.removeItem('hsq-music-'+id);
}

function genTournamentId() { return 'T-'  +Math.random().toString(36).substr(2,8).toUpperCase(); }
function genRef()          { return 'HSQ-'+Math.random().toString(36).substr(2,6).toUpperCase(); }
function genPlayerCode()   { return 'PL-' +Math.random().toString(36).substr(2,8).toUpperCase(); }
function genMatchId()      { return 'M-'  +Date.now().toString(36).toUpperCase(); }
function genClaimId()      { return 'CLM-'+Math.random().toString(36).substr(2,8).toUpperCase(); }
function genDeliveryId()   { return 'DEL-'+Math.random().toString(36).substr(2,8).toUpperCase(); }
function genAnnouncementId(){ return 'ANN-'+Math.random().toString(36).substr(2,8).toUpperCase(); }

function getDefaultTournament() {
  return {
    id:'T-DEFAULT',name:'CS HEADSHOT',sub:'SQUAD · FREE FIRE',
    date:'',lieu:'En ligne · Bénin',format:'4 vs 4 · Headshot only',maxTeams:16,
    type:'free',paymentInfo:'',
    p1:'300 000 FCFA',p2:'150 000 FCFA',p3:'50 000 FCFA',pt:'500 000 FCFA',
    kills:32,squads:16,hs:85,rounds:5,
    status:'upcoming',roomId:'',nextMatchDate:'',
    rewards:getDefaultRewards(),rewardDeliveries:[],matches:[],
    adminHash:'',devHash:'',createdAt:new Date().toISOString(),
    music:'',musicName:'',contactPhone:'',contactEmail:'',joinLink:'',rules:''
  };
}

// ── INSCRIPTIONS ──────────────────────────────────────────────────
function getData(tid) { return lsGet(tid?'hsq-data-'+tid:'hsq-data',{pending:[],approved:[],rejected:[]}); }
function saveData(d,tid) { lsSet(tid?'hsq-data-'+tid:'hsq-data',d); }
function getAllEntries(tid) { const d=getData(tid); return [...(d.pending||[]),...(d.approved||[]),...(d.rejected||[])]; }
function getEntryByCode(tid,code) { return getAllEntries(tid).find(e=>e.playerCode===code||e.ref===code)||null; }

// ── MATCHS ────────────────────────────────────────────────────────
function getMatches(tid) { return (getTournamentById(tid)||{}).matches||[]; }
function saveMatch(tid,match) {
  const t=getTournamentById(tid); if(!t) return;
  if(!t.matches) t.matches=[];
  const idx=t.matches.findIndex(m=>m.id===match.id);
  if(idx>=0) t.matches[idx]=match; else t.matches.push(match);
  saveTournament(t);
}
function deleteMatch(tid,mid) {
  const t=getTournamentById(tid); if(!t||!t.matches) return;
  t.matches=t.matches.filter(m=>m.id!==mid); saveTournament(t);
}

// ── RÉCLAMATIONS ──────────────────────────────────────────────────
function getClaims(tid) { return lsGet('hsq-claims-'+tid,[]); }
function saveClaim(tid,claim) {
  const claims=getClaims(tid),idx=claims.findIndex(c=>c.id===claim.id);
  if(idx>=0) claims[idx]=claim; else claims.push(claim);
  lsSet('hsq-claims-'+tid,claims);
}

// ── LIVRAISONS RÉCOMPENSES ─────────────────────────────────────────
function getRewardDeliveries(tid) { return (getTournamentById(tid)||{}).rewardDeliveries||[]; }
function saveRewardDelivery(tid,delivery) {
  const t=getTournamentById(tid); if(!t) return;
  if(!t.rewardDeliveries) t.rewardDeliveries=[];
  const idx=t.rewardDeliveries.findIndex(d=>d.id===delivery.id);
  if(idx>=0) t.rewardDeliveries[idx]=delivery; else t.rewardDeliveries.push(delivery);
  saveTournament(t);
}
function getPlayerDeliveries(tid,playerCode) { return getRewardDeliveries(tid).filter(d=>d.playerCode===playerCode); }

// ── ANNONCES ──────────────────────────────────────────────────────
function getAnnouncements()       { return lsGet('hsq-announcements',[]); }
function saveAnnouncements(list)  { lsSet('hsq-announcements',list); }
function saveAnnouncement(ann) {
  const list=getAnnouncements(),idx=list.findIndex(a=>a.id===ann.id);
  if(idx>=0) list[idx]=ann; else list.push(ann);
  saveAnnouncements(list);
}
function deleteAnnouncement(id) {
  saveAnnouncements(getAnnouncements().filter(a=>a.id!==id));
}

// Votes sondages — stockés localement (propres à chaque visiteur)
function votePoll(annId,optIdx) {
  const votes=lsGet('hsq-votes',{});
  if(votes[annId]!==undefined) return false;
  votes[annId]=optIdx;
  try{localStorage.setItem('hsq-votes',JSON.stringify(votes));}catch(e){}
  const ann=getAnnouncements().find(a=>a.id===annId);
  if(!ann||!ann.options) return false;
  if(!ann.votes) ann.votes={};
  ann.votes[optIdx]=(ann.votes[optIdx]||0)+1;
  saveAnnouncement(ann);
  return true;
}
function hasVoted(annId) { return (lsGet('hsq-votes',{})[annId])!==undefined; }
function getMyVote(annId){ return lsGet('hsq-votes',{})[annId]; }

// ══════════════════════════════════════════════════════════════════════════════
// MIGRATION
// ══════════════════════════════════════════════════════════════════════════════
function migrateIfNeeded() {
  let list = getTournaments();

  if (list.length===0) {
    const oldS=lsGet('hsq-settings',null), oldD=lsGet('hsq-data',null);
    if (oldS||oldD) {
      const def=getDefaultTournament();
      if(oldS) Object.assign(def,{
        name:oldS.name||def.name,sub:oldS.sub||def.sub,date:oldS.date||'',
        lieu:oldS.lieu||def.lieu,format:oldS.format||def.format,maxTeams:oldS.maxTeams||16,
        p1:oldS.p1||def.p1,p2:oldS.p2||def.p2,p3:oldS.p3||def.p3,pt:oldS.pt||def.pt,
        kills:oldS.kills||32,squads:oldS.squads||16,hs:oldS.hs||85,rounds:oldS.rounds||5,
        adminHash:oldS.adminHash||''
      });
      saveTournaments([def]);
      if(oldD) lsSet('hsq-data-T-DEFAULT',oldD);
      list=[def];
    }
  }

  if(list.length>0) {
    let dirty=false;
    list=list.map(t=>{
      let c=false;
      if(!t.rewards)          {t.rewards=getDefaultRewards();c=true;}
      if(!t.rewardDeliveries) {t.rewardDeliveries=[];c=true;}
      if(!t.matches)          {t.matches=[];c=true;}
      if(t.musicName===undefined)   {t.musicName='';c=true;}
      if(t.paymentInfo===undefined) {t.paymentInfo='';c=true;}
      if(t.rules===undefined)       {t.rules='';c=true;}
      if(t.joinLink===undefined)    {t.joinLink='';c=true;}
      if(c) dirty=true;
      return t;
    });
    if(dirty) saveTournaments(list);

    list.forEach(t=>{
      const data=getData(t.id); let dd=false;
      ['pending','approved','rejected'].forEach(b=>{
        (data[b]||[]).forEach(e=>{if(!e.playerCode){e.playerCode=genPlayerCode();dd=true;}});
      });
      if(dd) saveData(data,t.id);
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SESSION / AUTH
// ══════════════════════════════════════════════════════════════════════════════
function getActiveTournamentId() {
  return sessionStorage.getItem('hsq-active-tournament')||lsGet('hsq-last-tournament',null);
}
function setActiveTournamentId(id) {
  sessionStorage.setItem('hsq-active-tournament',id);
  lsSet('hsq-last-tournament',id);
}
function setAuth(s)    { sessionStorage.setItem('hsq-auth-'+s,'1'); }
function clearAuth(s)  { sessionStorage.removeItem('hsq-auth-'+s); }
function isAuthed(s)   { return sessionStorage.getItem('hsq-auth-'+s)==='1'; }
function setDevAuth()  { sessionStorage.setItem('hsq-dev-auth','1'); }
function clearDevAuth(){ sessionStorage.removeItem('hsq-dev-auth'); }
function isDevAuthed() { return sessionStorage.getItem('hsq-dev-auth')==='1'; }

async function sha256(str) {
  const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function checkAdminPassword(pwd,t) {
  return (await sha256(pwd))===((t&&t.adminHash)?t.adminHash:_H_ADMIN);
}
async function checkDevPassword(pwd) {
  const stored=lsGet('hsq-dev-hash',null);
  return (await sha256(pwd))===(stored||_H_DEV);
}
async function hashPassword(pwd) { return sha256(pwd); }

function getSettings() {
  migrateIfNeeded();
  const id=getActiveTournamentId(), list=getTournaments();
  if(!list.length) return getDefaultTournament();
  return getTournamentById(id)||list[0];
}
function saveSettings(s) { if(!s.id) s.id=getActiveTournamentId(); saveTournament(s); }

// ══════════════════════════════════════════════════════════════════════════════
// DARK MODE
// ══════════════════════════════════════════════════════════════════════════════
function getDarkMode()    { const v=localStorage.getItem('hsq-dark'); return v!==null?v==='true':true; }
function setDarkMode(val) { localStorage.setItem('hsq-dark',String(val)); applyDarkMode(val); }
function applyDarkMode(dark) {
  document.documentElement.classList.toggle('light-mode',!dark);
  const btn=document.getElementById('darkmode-btn');
  if(btn) btn.textContent=dark?'☀️':'🌙';
}
function initDarkMode() { applyDarkMode(getDarkMode()); }

// ══════════════════════════════════════════════════════════════════════════════
// UI HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function startCountdown(dateStr,prefix) {
  const pad=n=>String(n).padStart(2,'0'),p=prefix?prefix+'-':'';
  function tick(){
    const target=dateStr?new Date(dateStr):(()=>{const d=new Date();d.setDate(d.getDate()+25);d.setHours(20,0,0,0);return d;})();
    const diff=Math.max(0,target-Date.now());
    [['cd-d',Math.floor(diff/86400000)],['cd-h',Math.floor((diff%86400000)/3600000)],
     ['cd-m',Math.floor((diff%3600000)/60000)],['cd-s',Math.floor((diff%60000)/1000)]]
    .forEach(([id,v])=>{const el=document.getElementById(p+id);if(el)el.textContent=pad(v);});
  }
  tick(); return setInterval(tick,1000);
}
function applyHero(tournament) {
  const s=tournament||getSettings();
  const titleEl=document.getElementById('h-title'),subEl=document.getElementById('h-sub');
  if(titleEl){const pts=s.name.trim().split(' ');
    titleEl.innerHTML=pts.length>=2?pts[0]+' <span>'+pts.slice(1).join(' ')+'</span>':'<span>'+s.name+'</span>';}
  if(subEl) subEl.textContent=s.sub;
  startCountdown(s.date);
}
function applyPrize(tournament) {
  const s=tournament||getSettings();
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('pz-total',s.pt);set('pz1',s.p1);set('pz2',s.p2);set('pz3',s.p3);
}
function applyStats(tournament) {
  const s=tournament||getSettings();
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('stat-kills',s.kills);set('stat-squads',s.squads);
  set('stat-hs',(s.hs||0)+'%');set('stat-rounds',s.rounds);
}
function notify(msg,type='ok') {
  const n=document.createElement('div');
  n.className='notif '+type;n.textContent=msg;document.body.appendChild(n);
  setTimeout(()=>{n.style.animation='notifOut .3s ease forwards';setTimeout(()=>n.remove(),300);},2800);
}
function getTournamentStatus(t) {
  if(!t) return 'upcoming';
  if(t.status==='ended') return 'ended';
  if(!t.date) return t.status||'upcoming';
  return Date.now()>=new Date(t.date).getTime()?'ongoing':'upcoming';
}
function getStatusLabel(status) {
  return {upcoming:{label:'BIENTÔT',color:'var(--yellow)',icon:'⏳'},
          ongoing: {label:'EN COURS',color:'var(--green)', icon:'🔴'},
          ended:   {label:'TERMINÉ', color:'var(--text3)', icon:'✓'}}[status]||{label:'BIENTÔT',icon:'⏳'};
}

// ══════════════════════════════════════════════════════════════════════════════
// MUSIQUE
// ══════════════════════════════════════════════════════════════════════════════
let _musicAudio=null;
function getMuteState()    { return localStorage.getItem('hsq-muted')==='true'; }
function setMuteState(val) { localStorage.setItem('hsq-muted',String(val)); }
function fileToBase64(file){return new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=rej;r.readAsDataURL(file);});}
async function saveMusicFile(file,tid){
  try{
    const b64=await fileToBase64(file);
    localStorage.setItem('hsq-music-'+tid,JSON.stringify(b64)); // localStorage only — trop lourd pour Firebase
    const t=getTournamentById(tid);if(!t)return null;
    t.music='__local__';t.musicName=file.name;saveTournament(t);return b64;
  }catch(e){console.error('Music error:',e);return null;}
}
function getMusicSrc(tournament){
  const t=tournament||getSettings();if(!t||!t.music)return null;
  if(t.music==='__local__'){try{return JSON.parse(localStorage.getItem('hsq-music-'+t.id));}catch(e){return null;}}
  return t.music;
}
function initMusicGlobal(tournament){
  const src=getMusicSrc(tournament);if(!src)return;
  if(_musicAudio){_musicAudio.pause();_musicAudio=null;}
  _musicAudio=new Audio(src);_musicAudio.loop=true;_musicAudio.volume=getMuteState()?0:0.3;
  const start=()=>{_musicAudio.play().catch(()=>{});document.removeEventListener('click',start);document.removeEventListener('touchstart',start);};
  document.addEventListener('click',start);document.addEventListener('touchstart',start);
  lsSet('hsq-music-active-tid',tournament.id);
}
function initMusic(t){initMusicGlobal(t);}
function stopMusicGlobal(){if(_musicAudio){_musicAudio.pause();_musicAudio=null;}}
function toggleMute(){
  const muted=!getMuteState();setMuteState(muted);
  if(_musicAudio)_musicAudio.volume=muted?0:0.3;
  const btn=document.getElementById('mute-btn');if(btn)btn.textContent=muted?'🔇':'🔊';
  return muted;
}
// Alias global — utilisé dans tous les boutons mute-btn via onclick="toggleMuteBtn()"
function toggleMuteBtn(){
  const muted=toggleMute();
  return muted;
}
function resumeGlobalMusic(){
  const tid=lsGet('hsq-music-active-tid',null);
  if(!tid){const t=getTournaments().find(t=>t.music);if(t)initMusicGlobal(t);return;}
  const t=getTournamentById(tid);if(t&&t.music)initMusicGlobal(t);
}

// ── ROOM ID ───────────────────────────────────────────────────────
function shouldShowRoomId(t){if(!t||!t.roomId||!t.nextMatchDate)return false;return Date.now()>=new Date(t.nextMatchDate).getTime()-5*60*1000;}

// ── RECHERCHE MULTI-TOURNOIS ──────────────────────────────────────
function findPlayerByCode(code){for(const t of getTournaments()){const e=getEntryByCode(t.id,code);if(e)return{entry:e,tournament:t};}return null;}

// ══════════════════════════════════════════════════════════════════════════════
// RÉCOMPENSES — INVALIDATION CODES
// ══════════════════════════════════════════════════════════════════════════════
function allRewardsConfirmed(tid){const d=getRewardDeliveries(tid);if(!d.length)return false;return d.every(x=>x.status==='confirmed');}
function invalidateWinnerCodes(tid){
  const t=getTournamentById(tid);if(!t)return 0;
  const deliveries=getRewardDeliveries(tid),data=getData(tid);let count=0;
  const confirmed=new Set(deliveries.filter(d=>d.status==='confirmed').map(d=>d.playerCode));
  ['approved','pending','rejected'].forEach(b=>{(data[b]||[]).forEach(e=>{if(confirmed.has(e.playerCode)&&!e.codeInvalidated){e.codeInvalidated=true;count++;}});});
  if(count>0){saveData(data,tid);t.codesInvalidated=true;t.invalidatedAt=new Date().toLocaleString('fr-FR');saveTournament(t);}
  return count;
}
function isPlayerCodeValid(tid,code){const e=getEntryByCode(tid,code);if(!e)return false;return !e.codeInvalidated;}
function canEndTournament(tid){
  const deliveries=getRewardDeliveries(tid);if(!deliveries.length)return{ok:true,reason:''};
  const pending=deliveries.filter(d=>d.status!=='confirmed');
  if(pending.length>0)return{ok:false,reason:`${pending.length} récompense(s) non confirmée(s). Distribue toutes les récompenses avant de terminer.`};
  return{ok:true,reason:''};
}

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL CENTRALISÉ
// ══════════════════════════════════════════════════════════════════════════════
async function sendEmail(templateKey,toEmail,vars){
  if(!EMAIL_CONFIG.enabled) return false;
  if(typeof emailjs==='undefined') return false;
  const tid=EMAIL_CONFIG.templateId[templateKey];
  if(!tid||tid.startsWith('REMPLACE')){console.warn('EmailJS: template non configuré:',templateKey);return false;}
  // to_email DOIT être dans le payload — EmailJS cherche cette variable dans le template
  const payload = { to_email: toEmail, ...vars };
  // Si vars contient aussi player_email, on garde les deux pour compatibilité
  try{await emailjs.send(EMAIL_CONFIG.serviceId,tid,payload);return true;}
  catch(e){console.error('EmailJS error:',e);return false;}
}
