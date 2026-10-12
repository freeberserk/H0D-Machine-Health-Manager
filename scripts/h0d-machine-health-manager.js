const MODULE_ID="h0d-machine-health-manager";
const TITLE="H0D Machine Health Manager";
const VERSION="0.3.2";
const MACRO_NAME="H0D — État machine";
const MACRO_COMMAND=`if (!game.h0dMachineHealth?.open) {
  ui.notifications.error("H0D Machine Health Manager : module non chargé ou API indisponible.");
} else {
  game.h0dMachineHealth.open();
}`;

const STATES=[
  {key:"Intact",label:"Intacte"},
  {key:"Endommage",label:"Endommagée"},
  {key:"Detruit",label:"Détruite"},
  {key:"Detache",label:"Détachée"}
];

const clamp=(v,min,max)=>Math.min(Math.max(Number(v)||0,min),max);
const esc=v=>foundry.utils.escapeHTML(String(v??""));
const props=d=>d?.system?.props??{};
const bool=v=>v===true||v===1||v==="1"||String(v).toLowerCase()==="true";

function notice(level,msg){ ui.notifications?.[level]?.(`${TITLE} | ${msg}`); }

function selectedMachine(){
  const tokens=canvas?.tokens?.controlled??[];
  if(tokens.length!==1){ notice("warn","Sélectionne exactement un token machine."); return null; }
  const token=tokens[0];
  if(!token?.actor){ notice("warn","Le token sélectionné n'a pas d'Actor."); return null; }
  const p=props(token.actor);
  const isMachine=("H0D_Machine_PV_Corps_Base" in p)||Boolean(token.actor.getFlag("h0d-machine-builder","machineKey"));
  if(!isMachine){ notice("warn",`« ${token.name} » n'utilise pas le template Machine H0D.`); return null; }
  return token;
}

function pieces(actor){
  return Array.from(actor.items??[]).filter(i=>{
    const p=props(i);
    return i.getFlag("h0d-machine-builder","kind")==="piece" ||
      ("H0D_Composant_PV_Actuels" in p && "H0D_Composant_PV_Max" in p);
  });
}

function pieceHP(item){
  const p=props(item), max=Math.max(0,Number(p.H0D_Composant_PV_Max)||0);
  return {max,current:clamp(p.H0D_Composant_PV_Actuels,0,max)};
}

function state(item){
  const p=props(item), hp=pieceHP(item), key=String(p.H0D_Composant_Etat||"");
  if(key==="Detache") return "Detache";
  if(key==="Detruit"||hp.current<=0) return "Detruit";
  if(key==="Endommage"||hp.current<hp.max) return "Endommage";
  return "Intact";
}
function stateLabel(key){ return STATES.find(s=>s.key===key)?.label??key; }
function isActive(item){ const s=state(item); return pieceHP(item).current>0 && s!=="Detruit" && s!=="Detache"; }
function countsIntegrity(item){
  const p=props(item);
  if(Object.prototype.hasOwnProperty.call(p,"H0D_Composant_Compte_PV")) return bool(p.H0D_Composant_Compte_PV);
  return true; // compatibilité pièces legacy
}
function pieceContribution(item){
  return countsIntegrity(item) && isActive(item) ? pieceHP(item).current : 0;
}

function inferZone(item){
  const p=props(item);
  const configured=String(p.H0D_Composant_Zone??"").trim();
  if(configured && configured!=="Autre") return configured;
  const text=`${item.name??""} ${p.H0D_Composant_Emplacement??""}`.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  if(/tete|gorge|machoire|mandib|corne|cran|oeil|capteur frontal/.test(text)) return "Tete";
  if(/arriere|queue|croupe|rear/.test(text)) return "Arriere";
  if(/ventre|ventral|abdomen/.test(text)) return "Ventre";
  if(/dos|dorsal/.test(text)) return "Dos";
  if(/avant|front|epaule/.test(text)) return "Avant";
  if(/patte/.test(text)) return /avant/.test(text)?"Avant":(/arriere/.test(text)?"Arriere":"Central");
  if(/chassis|structure|blindage|plaque|carapace|flanc/.test(text)) return "Central";
  return configured||"Autre";
}

function protectsBody(item){
  const p=props(item);
  if(bool(p.H0D_Composant_Protection_Corps)) return true;
  // Compatibilité avec les anciennes pièces avant migration : un châssis/blindage
  // ou une pièce qui apporte de la DEF continue de protéger le corps.
  const text=`${item.name??""} ${p.H0D_Composant_Type??""}`.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return Number(p.H0D_Composant_Bonus_DEF_Machine||0)>0 || /chassis|blindage|plaque|carapace/.test(text);
}

function activeProtections(actor){ return pieces(actor).filter(i=>protectsBody(i)&&isActive(i)); }
function bodyProtected(actor){ return activeProtections(actor).length>0; }

function integrityMax(actor){
  const base=Math.max(0,Number(props(actor).H0D_Machine_PV_Corps_Base)||0);
  const parts=pieces(actor).reduce((sum,i)=>sum+(countsIntegrity(i)?pieceHP(i).max:0),0);
  return base+parts;
}
function integrity(actor){
  const max=integrityMax(actor);
  const raw=Number(props(actor).H0D_Machine_PV_Actuels);
  return {max,current:Number.isFinite(raw)?clamp(raw,0,max):max};
}

async function setIntegrity(actor,value){
  const h=integrity(actor);
  await actor.update({"system.props.H0D_Machine_PV_Actuels":clamp(value,0,h.max)});
}
async function changeIntegrity(actor,delta){
  const h=integrity(actor);
  const next=clamp(h.current+Number(delta||0),0,h.max);
  await actor.update({"system.props.H0D_Machine_PV_Actuels":next});
  return {before:h.current,after:next,delta:next-h.current,max:h.max};
}

function chooseAdjacent(actor,target){
  const zone=inferZone(target);
  const candidates=pieces(actor).filter(i=>i.id!==target.id && isActive(i) && inferZone(i)===zone);
  candidates.sort((a,b)=>{
    const ap=protectsBody(a)?1:0, bp=protectsBody(b)?1:0;
    if(bp!==ap) return bp-ap; // la structure/protection absorbe en priorité
    const ac=countsIntegrity(a)?1:0, bc=countsIntegrity(b)?1:0;
    if(bc!==ac) return bc-ac;
    const ah=pieceHP(a), bh=pieceHP(b);
    if(bh.current!==ah.current) return bh.current-ah.current;
    return String(a.name).localeCompare(String(b.name));
  });
  return candidates[0]??null;
}

async function updatePieceAndIntegrity(item,update,{syncIntegrity=true}={}){
  const actor=item.parent;
  const before=pieceContribution(item);
  await item.update(update,{h0dMachineHealthSkipSync:true});
  const after=pieceContribution(item);
  if(syncIntegrity && actor?.documentName==="Actor" && before!==after){
    await changeIntegrity(actor,after-before);
  }
  return {beforeContribution:before,afterContribution:after,deltaContribution:after-before};
}

async function updatePieceCurrent(item,next,manual=true){
  const hp=pieceHP(item), before=hp.current, value=clamp(next,0,hp.max), oldState=state(item);
  const update={"system.props.H0D_Composant_PV_Actuels":value};
  if(value<=0 && oldState!=="Detache") update["system.props.H0D_Composant_Etat"]=bool(props(item).H0D_Composant_Detachable)?"Detache":"Detruit";
  else if(value>=hp.max && oldState!=="Detache") update["system.props.H0D_Composant_Etat"]="Intact";
  else if(value>0 && value<hp.max && oldState!=="Detache") update["system.props.H0D_Composant_Etat"]="Endommage";
  await updatePieceAndIntegrity(item,update,{syncIntegrity:manual});
  return {before,after:value,delta:value-before};
}


async function applyBodyDamage(actor,incoming){
  incoming=Math.max(0,Math.floor(Number(incoming)||0));
  const protectedBody=bodyProtected(actor);
  const effective=protectedBody?Math.floor(incoming/2):incoming;
  const h=integrity(actor);
  const absorbed=Math.min(h.current,effective);
  await setIntegrity(actor,h.current-absorbed);

  return {
    incoming,
    effective,
    absorbed,
    protectedBody,
    before:h.current,
    after:h.current-absorbed
  };
}

async function applyPieceDamage(actor,target,incoming){
  incoming=Math.max(0,Math.floor(Number(incoming)||0));

  if(!isActive(target)){
    throw new Error(`${target.name} est déjà détruite ou détachée.`);
  }

  const targetHP=pieceHP(target);
  const targetAbsorbed=Math.min(incoming,targetHP.current);

  // Ici on NE synchronise PAS l'intégrité pièce par pièce :
  // on calcule l'attaque complète puis on retire une seule fois la perte réelle.
  await updatePieceCurrent(target,targetHP.current-targetAbsorbed,false);
  // Le seuil critique compare les dégâts du coup aux 200 % des PV MAX.
  // Une pièce détachable neutralisée se détache, sauf destruction critique.
  const targetOutcome = targetAbsorbed >= targetHP.current
    ? (incoming >= 2 * targetHP.max || !bool(props(target).H0D_Composant_Detachable) ? "Detruit" : "Detache")
    : null;
  if(targetOutcome) await target.update({"system.props.H0D_Composant_Etat":targetOutcome},{h0dMachineHealthSkipSync:true});

  let integrityLoss=countsIntegrity(target)?targetAbsorbed:0;

  const overkill=Math.max(0,incoming-targetAbsorbed);
  const reportRequested=Math.floor(overkill/2);

  let adjacent=null;
  let adjacentAbsorbed=0;

  if(reportRequested>0){
    adjacent=chooseAdjacent(actor,target);

    if(adjacent){
      const adjacentHP=pieceHP(adjacent);
      adjacentAbsorbed=Math.min(reportRequested,adjacentHP.current);

      // Aucun second rebond : tout surplus sur la pièce adjacente est perdu.
      await updatePieceCurrent(adjacent,adjacentHP.current-adjacentAbsorbed,false);
      if(adjacentAbsorbed >= adjacentHP.current){
        const outcome = reportRequested >= 2 * adjacentHP.max || !bool(props(adjacent).H0D_Composant_Detachable) ? "Detruit" : "Detache";
        await adjacent.update({"system.props.H0D_Composant_Etat":outcome},{h0dMachineHealthSkipSync:true});
      }

      if(countsIntegrity(adjacent)){
        integrityLoss+=adjacentAbsorbed;
      }
    }
  }

  const h=integrity(actor);
  const realLoss=Math.min(h.current,integrityLoss);
  await setIntegrity(actor,h.current-realLoss);

  return {
    incoming,
    target,
    targetAbsorbed,
    targetOutcome,
    overkill,
    reportRequested,
    adjacent,
    adjacentAbsorbed,
    reportLost:Math.max(0,reportRequested-adjacentAbsorbed),
    integrityLoss:realLoss,
    before:h.current,
    after:h.current-realLoss
  };
}

async function setState(item,key){
  const hp=pieceHP(item);
  let next=hp.current;

  // État manuel = couple PV/état cohérent.
  if(key==="Detruit") next=0;
  else if(key==="Intact") next=hp.max;
  else if(key==="Endommage"){
    if(hp.max<=1) next=hp.max;
    else next=clamp(next,1,hp.max-1);
  }
  // Detache conserve les PV courants : une pièce peut être arrachée encore exploitable.

  const update={"system.props.H0D_Composant_Etat":key};
  if(next!==hp.current) update["system.props.H0D_Composant_PV_Actuels"]=next;
  await updatePieceAndIntegrity(item,update,{syncIntegrity:true});
}

async function setMarked(item,value){ await item.update({"system.props.H0D_Composant_Marquee":!!value}); }

function bar(current,max,kind="integrity"){
  const pc=max?clamp(current/max*100,0,100):0;
  return `<div class="hm-bar hm-bar-${kind}" aria-hidden="true"><i style="width:${pc}%"></i></div>`;
}
function zoneLabel(zone){ return ({Tete:"Tête",Avant:"Avant",Dos:"Dos",Ventre:"Ventre",Arriere:"Arrière",Central:"Central",Autre:"Autre"})[zone]??zone; }
function stateClass(st){ return ({Intact:"intact",Endommage:"damaged",Detruit:"destroyed",Detache:"detached"})[st]??"intact"; }

function integrityCard(actor){
  const h=integrity(actor), protectedBody=bodyProtected(actor), n=activeProtections(actor).length;
  const pct=h.max?Math.round(h.current/h.max*100):0;
  return `<section class="hm-hero">
    <div class="hm-hero-top">
      <img class="hm-portrait" src="${esc(actor.img)}" alt="">
      <div class="hm-hero-title">
        <span class="hm-kicker">MACHINE ACTIVE</span>
        <h2>${esc(actor.name)}</h2>
        <div class="hm-body-status ${protectedBody?'is-protected':'is-exposed'}">
          <i class="fas ${protectedBody?'fa-shield-halved':'fa-triangle-exclamation'}"></i>
          <span>${protectedBody?`CORPS PROTÉGÉ · ${n} protection${n>1?'s':''} active${n>1?'s':''}`:'CORPS EXPOSÉ · dégâts directs normaux'}</span>
        </div>
      </div>
      <div class="hm-integrity-number">
        <span>INTÉGRITÉ</span>
        <b>${h.current}<em>/ ${h.max}</em></b>
      </div>
    </div>
    <div class="hm-integrity-track">
      ${bar(h.current,h.max,"integrity")}
      <div class="hm-integrity-scale"><span>${pct}%</span><span>${protectedBody?'Dégâts corps ÷2':'Dégâts corps ×1'}</span></div>
    </div>
    <div class="hm-maintenance">
      <button type="button" class="hm-ghost" data-a="maintenance"><i class="fas fa-screwdriver-wrench"></i> Maintenance</button>
      <div class="hm-maintenance-panel" hidden>
        <button type="button" data-a="iset">Intégrité manuelle</button>
        <button type="button" data-a="imax">Restaurer MAX</button>
      </div>
    </div>
  </section>`;
}

function combatBar(actor,ui={}){
  const damage=Math.max(0,Math.floor(Number(ui.damage)||1));
  return `<section class="hm-combat">
    <div class="hm-combat-copy">
      <span class="hm-kicker">ATTAQUE ENTRANTE</span>
      <b>Choisis une cible, saisis les dégâts, applique.</b>
    </div>
    <label class="hm-damage-field">
      <span>DÉGÂTS</span>
      <input type="number" min="0" step="1" value="${damage}" data-hm-damage inputmode="numeric">
    </label>
    <button type="button" class="hm-apply" data-a="apply"><i class="fas fa-bolt"></i> APPLIQUER</button>
  </section>`;
}

function bodyTargetCard(actor,selected){
  const protectedBody=bodyProtected(actor);
  return `<div class="hm-target-card hm-body-card${selected?' is-selected':''}" data-target="body" tabindex="0">
    <input class="hm-target-radio" type="radio" name="hm-target" value="body"${selected?' checked':''} aria-label="Cibler le corps">
    <span class="hm-target-dot"></span>
    <div class="hm-target-copy">
      <b>CORPS</b>
      <small>${protectedBody?'Structure protégée · dégâts directs divisés par 2':'Structure exposée · dégâts directs normaux'}</small>
    </div>
    <span class="hm-chip ${protectedBody?'hm-chip-protected':'hm-chip-exposed'}"><i class="fas ${protectedBody?'fa-shield-halved':'fa-triangle-exclamation'}"></i>${protectedBody?'Protégé':'Exposé'}</span>
  </div>`;
}

function pieceCard(item,selected){
  const hp=pieceHP(item), st=state(item), p=props(item), marked=bool(p.H0D_Composant_Marquee);
  const zone=inferZone(item), protection=protectsBody(item), active=isActive(item);
  const stClass=stateClass(st);
  return `<article class="hm-piece-card hm-state-${stClass}${selected?' is-selected':''}${marked?' is-marked':''}" data-id="${item.id}" data-target="${item.id}">
    <div class="hm-piece-select" tabindex="0">
      <input class="hm-target-radio" type="radio" name="hm-target" value="${item.id}"${selected?' checked':''}${active?'':' disabled'} aria-label="Cibler ${esc(item.name)}">
      <span class="hm-target-dot"></span>
      <img src="${esc(item.img)}" alt="">
      <div class="hm-piece-copy">
        <div class="hm-piece-name"><b>${esc(item.name)}</b>${protection?'<span class="hm-mini-shield" title="Protège le corps"><i class="fas fa-shield-halved"></i></span>':''}</div>
        <small>${zoneLabel(zone)} · ${stateLabel(st)}${marked?' · Marquée':''}</small>
      </div>
      <div class="hm-piece-hp">
        <b>${hp.current}<em>/ ${hp.max}</em></b>
        ${bar(hp.current,hp.max,stClass)}
      </div>
    </div>
    <div class="hm-piece-actions">
      <button type="button" class="hm-mark${marked?' is-active':''}" data-a="mark">${marked?'Démarquer':'Marquer'}</button>
      <button type="button" class="hm-more" data-a="more" aria-label="Plus d'actions"><i class="fas fa-ellipsis"></i></button>
    </div>
    <div class="hm-advanced" hidden>
      <span>Maintenance pièce</span>
      <button type="button" data-a="ps">PV</button>
      <button type="button" data-a="heal" data-v="1">+1</button>
      <button type="button" data-a="pm">MAX</button>
      <button type="button" data-a="state">État</button>
    </div>
  </article>`;
}

function piecesGrid(actor,ui={}){
  const selected=ui.targetId??"body";
  const list=pieces(actor).sort((a,b)=>{
    const order={Central:0,Tete:1,Avant:2,Dos:3,Ventre:4,Arriere:5,Autre:6};
    const za=order[inferZone(a)]??9, zb=order[inferZone(b)]??9;
    return za-zb||(a.sort??0)-(b.sort??0)||a.name.localeCompare(b.name);
  });
  if(!list.length) return '<p class="hm-empty">Aucune pièce machine détectée.</p>';
  return `<section class="hm-pieces"><div class="hm-section-title"><span>COMPOSANTS</span><small>Clique sur une pièce pour la cibler</small></div><div class="hm-piece-grid">${list.map(i=>pieceCard(i,selected===i.id)).join("")}</div></section>`;
}

function panelBody(actor,ui={}){
  const selected=ui.targetId??"body";
  return `<div class="hm-wrap">${integrityCard(actor)}${combatBar(actor,ui)}<section class="hm-targets"><div class="hm-section-title"><span>CIBLE</span><small>Le report d'overkill est automatique</small></div>${bodyTargetCard(actor,selected==="body")}</section>${piecesGrid(actor,ui)}</div>`;
}

function makeContent(actor,ui={}){
  const root=document.createElement("div"); // DialogV2 v14 : racine sans attribut
  root.innerHTML=`<style>
    .hm-shell{
      --hm-bg:#090c13;--hm-panel:#111620;--hm-panel-2:#151b26;--hm-line:rgba(126,215,229,.20);
      --hm-cyan:#79d8e7;--hm-cyan-2:#b7f2fb;--hm-amber:#d7a85f;--hm-red:#d56d68;--hm-muted:#87909d;
      min-width:760px;color:#e9eef2;font-family:var(--font-primary);
    }
    .hm-wrap{display:flex;flex-direction:column;gap:12px;padding:2px;background:radial-gradient(circle at 10% 0%,rgba(58,157,174,.08),transparent 38%)}
    .hm-hero,.hm-combat,.hm-targets,.hm-pieces{border:1px solid var(--hm-line);background:linear-gradient(145deg,rgba(14,19,29,.96),rgba(8,11,18,.96));box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}
    .hm-hero{padding:14px 16px 12px;position:relative;overflow:hidden}
    .hm-hero:before{content:"";position:absolute;inset:0 auto auto 0;width:38%;height:2px;background:linear-gradient(90deg,var(--hm-cyan),transparent)}
    .hm-hero-top{display:grid;grid-template-columns:58px 1fr auto;gap:12px;align-items:center}
    .hm-portrait{width:56px;height:56px;object-fit:cover;border:1px solid rgba(121,216,231,.45);clip-path:polygon(10% 0,100% 0,100% 90%,90% 100%,0 100%,0 10%)}
    .hm-kicker{display:block;font-size:10px;letter-spacing:.16em;color:var(--hm-cyan);font-weight:700;text-transform:uppercase;margin-bottom:2px}
    .hm-hero-title h2{font-size:20px;line-height:1.05;margin:0 0 6px;text-transform:uppercase;letter-spacing:.035em}
    .hm-body-status{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:700;letter-spacing:.035em;padding:4px 7px;border:1px solid currentColor}
    .hm-body-status.is-protected{color:var(--hm-cyan)}.hm-body-status.is-exposed{color:var(--hm-amber)}
    .hm-integrity-number{text-align:right;min-width:120px}.hm-integrity-number>span{display:block;color:var(--hm-muted);font-size:10px;letter-spacing:.12em}
    .hm-integrity-number b{font-size:27px;color:var(--hm-cyan-2);font-variant-numeric:tabular-nums}.hm-integrity-number em,.hm-piece-hp em{font-style:normal;font-size:.62em;color:var(--hm-muted);margin-left:3px}
    .hm-integrity-track{margin-top:11px}.hm-bar{height:6px;background:rgba(255,255,255,.09);overflow:hidden;position:relative}.hm-bar i{display:block;height:100%;transition:width .18s ease;background:linear-gradient(90deg,var(--hm-cyan),var(--hm-cyan-2));box-shadow:0 0 8px rgba(121,216,231,.35)}
    .hm-bar-damaged i{background:linear-gradient(90deg,#9b7138,var(--hm-amber));box-shadow:none}.hm-bar-destroyed i,.hm-bar-detached i{background:var(--hm-red);box-shadow:none}
    .hm-integrity-scale{display:flex;justify-content:space-between;margin-top:4px;color:var(--hm-muted);font-size:10px;text-transform:uppercase;letter-spacing:.05em}
    .hm-maintenance{display:flex;justify-content:flex-end;align-items:center;gap:6px;margin-top:7px;position:relative}.hm-maintenance-panel{display:flex;gap:5px}.hm-maintenance-panel[hidden]{display:none}
    .hm-shell button{border:1px solid rgba(121,216,231,.24);background:rgba(14,20,29,.88);color:#dbe7eb;box-shadow:none;min-height:30px;transition:.12s ease}
    .hm-shell button:hover{border-color:rgba(121,216,231,.65);background:rgba(35,68,78,.45);color:white}.hm-shell button:disabled{opacity:.35;cursor:not-allowed}
    .hm-ghost{font-size:11px;padding:2px 9px!important;min-height:25px!important;color:var(--hm-muted)!important}
    .hm-combat{display:grid;grid-template-columns:1fr 120px 180px;gap:10px;align-items:center;padding:11px 14px;border-color:rgba(215,168,95,.28)}
    .hm-combat-copy b{display:block;font-size:12px;color:#d8dde1}.hm-damage-field{display:grid;grid-template-columns:auto 1fr;align-items:center;gap:7px;border:1px solid rgba(215,168,95,.35);background:rgba(215,168,95,.06);padding:5px 8px}.hm-damage-field span{font-size:10px;letter-spacing:.12em;color:var(--hm-amber);font-weight:700}.hm-damage-field input{height:30px;border:0!important;background:transparent!important;color:white!important;text-align:center;font-size:20px;font-weight:700;box-shadow:none!important}
    .hm-apply{height:42px!important;border-color:rgba(215,168,95,.65)!important;background:linear-gradient(180deg,rgba(128,81,29,.65),rgba(78,47,18,.65))!important;color:#fff0d8!important;font-weight:800;letter-spacing:.06em}.hm-apply:hover{filter:brightness(1.15)}
    .hm-targets,.hm-pieces{padding:10px 12px}.hm-section-title{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:7px}.hm-section-title>span{font-size:10px;letter-spacing:.14em;color:var(--hm-cyan);font-weight:800}.hm-section-title small{font-size:10px;color:var(--hm-muted)}
    .hm-target-card{display:grid;grid-template-columns:22px 1fr auto;gap:8px;align-items:center;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.025);padding:8px 10px;cursor:pointer;position:relative}.hm-target-card:hover,.hm-target-card.is-selected{border-color:rgba(121,216,231,.62);background:rgba(46,115,127,.12)}.hm-target-card.is-selected:before,.hm-piece-card.is-selected:before{content:"";position:absolute;left:-1px;top:-1px;bottom:-1px;width:3px;background:var(--hm-cyan);box-shadow:0 0 8px rgba(121,216,231,.65)}
    .hm-target-radio{position:absolute;opacity:0;pointer-events:none}.hm-target-dot{width:14px;height:14px;border:1px solid rgba(121,216,231,.45);border-radius:50%;display:block;position:relative}.is-selected .hm-target-dot:after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--hm-cyan);box-shadow:0 0 6px var(--hm-cyan)}
    .hm-target-copy b{font-size:13px;letter-spacing:.04em}.hm-target-copy small{display:block;color:var(--hm-muted);font-size:10px;margin-top:2px}.hm-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid currentColor;font-size:10px;font-weight:700;text-transform:uppercase}.hm-chip-protected{color:var(--hm-cyan)}.hm-chip-exposed{color:var(--hm-amber)}
    .hm-piece-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.hm-piece-card{border:1px solid rgba(255,255,255,.10);background:linear-gradient(145deg,rgba(20,25,35,.90),rgba(12,15,22,.90));position:relative;min-width:0;overflow:hidden}.hm-piece-card:hover{border-color:rgba(121,216,231,.32)}.hm-piece-card.is-selected{border-color:rgba(121,216,231,.68);background:linear-gradient(145deg,rgba(28,50,58,.92),rgba(12,18,24,.94))}.hm-piece-card.is-marked{box-shadow:inset 0 -2px 0 rgba(215,168,95,.8)}
    .hm-piece-select{display:grid;grid-template-columns:16px 38px 1fr 78px;gap:7px;align-items:center;padding:8px;cursor:pointer;min-width:0}.hm-piece-select img{width:36px;height:36px;object-fit:cover;border:0;clip-path:polygon(10% 0,100% 0,100% 90%,90% 100%,0 100%,0 10%)}.hm-piece-copy{min-width:0}.hm-piece-name{display:flex;align-items:center;gap:5px;min-width:0}.hm-piece-name b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:12px}.hm-piece-copy small{display:block;color:var(--hm-muted);font-size:9.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}.hm-mini-shield{color:var(--hm-cyan);font-size:10px}.hm-piece-hp{text-align:right;font-variant-numeric:tabular-nums}.hm-piece-hp>b{font-size:14px}.hm-piece-hp .hm-bar{height:4px;margin-top:4px}
    .hm-piece-actions{display:grid;grid-template-columns:1fr 36px;gap:5px;padding:0 8px 8px}.hm-piece-actions button{min-height:27px;font-size:11px}.hm-mark.is-active{border-color:rgba(215,168,95,.7);color:#f3d3a2;background:rgba(119,77,24,.25)}.hm-more{padding:0!important}
    .hm-advanced{display:grid;grid-template-columns:1fr repeat(4,54px);gap:5px;align-items:center;padding:7px 8px;border-top:1px solid rgba(121,216,231,.12);background:rgba(0,0,0,.18)}.hm-advanced[hidden]{display:none}.hm-advanced>span{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--hm-muted)}.hm-advanced button{min-height:25px;font-size:10px;padding:0 4px}
    .hm-state-damaged{border-color:rgba(215,168,95,.25)}.hm-state-destroyed,.hm-state-detached{opacity:.55}.hm-state-destroyed .hm-piece-name b{text-decoration:line-through;text-decoration-color:var(--hm-red)}.hm-state-detached{border-style:dashed}.hm-state-destroyed .hm-piece-select,.hm-state-detached .hm-piece-select{cursor:not-allowed}
    .hm-empty{text-align:center;color:var(--hm-muted);padding:18px}
    @media(max-width:820px){.hm-shell{min-width:650px}.hm-piece-grid{grid-template-columns:1fr}.hm-combat{grid-template-columns:1fr 110px 150px}}
  </style><div class="hm-shell">${panelBody(actor,ui)}</div>`;
  return root;
}

async function askNumber(title,label,current,min=0,max=9999){
  const fd=await foundry.applications.api.DialogV2.input({window:{title},content:`<div class="form-group"><label>${esc(label)}</label><div class="form-fields"><input type="number" name="value" min="${min}" max="${max}" value="${current}" autofocus></div></div>`,ok:{label:"Appliquer"}});
  if(!fd) return null; const n=Number(fd.value); return Number.isFinite(n)?n:null;
}
async function askState(item){
  const cur=state(item);
  const fd=await foundry.applications.api.DialogV2.input({window:{title:`${item.name} — État`},content:`<div class="form-group"><label>État</label><div class="form-fields"><select name="state">${STATES.map(s=>`<option value="${s.key}"${s.key===cur?' selected':''}>${s.label}</option>`).join("")}</select></div></div>`,ok:{label:"Appliquer"}});
  return fd?String(fd.state):null;
}

function damageSummary(r){
  if(r.target){
    const report=r.adjacent?` · report ${r.adjacentAbsorbed}/${r.reportRequested} → ${r.adjacent.name}${r.reportLost>0?` · ${r.reportLost} perdu`:``}`:(r.reportRequested>0?' · report perdu (aucune pièce adjacente)':'');
    return `${r.incoming} dégâts → ${r.target.name} : ${r.targetAbsorbed} absorbés${r.targetOutcome?` · ${r.targetOutcome==="Detache"?"détachée":"détruite"}`:""}${report} · Intégrité −${r.integrityLoss}`;
  }
  return `${r.incoming} dégâts corps → ${r.protectedBody?`÷2 = ${r.effective}`:`${r.effective}`} · Intégrité −${r.absorbed}`;
}

function captureUi(dialog){
  const input=dialog.element?.querySelector("[data-hm-damage]");
  if(input){
    const n=Number(input.value);
    if(Number.isFinite(n)) dialog._h0dUi.damage=Math.max(0,Math.floor(n));
  }
  const checked=dialog.element?.querySelector('input[name="hm-target"]:checked');
  if(checked) dialog._h0dUi.targetId=checked.value;
  return dialog._h0dUi;
}

function replacePanel(dialog,actor){
  captureUi(dialog);
  const current=dialog.element?.querySelector(".hm-wrap"); if(!current)return false;
  const temp=document.createElement("div"); temp.innerHTML=panelBody(actor,dialog._h0dUi); const fresh=temp.firstElementChild; if(!fresh)return false;
  current.replaceWith(fresh); bindControls(dialog,actor); return true;
}

function selectTarget(dialog,targetId){
  dialog._h0dUi.targetId=targetId;
  const el=dialog.element; if(!el)return;
  for(const card of el.querySelectorAll("[data-target]")) card.classList.toggle("is-selected",card.dataset.target===targetId);
  for(const radio of el.querySelectorAll('input[name="hm-target"]')) radio.checked=radio.value===targetId;
}

async function handleAction(dialog,actor,event){
  event.preventDefault(); event.stopPropagation();
  const button=event.currentTarget, action=button.dataset.a, row=button.closest("[data-id]"), item=row?actor.items.get(row.dataset.id):null;
  try{
    if(action==="apply"){
      captureUi(dialog);
      const incoming=Math.max(0,Math.floor(Number(dialog._h0dUi.damage)||0));
      const targetId=dialog._h0dUi.targetId??"body";
      if(targetId==="body"){
        const r=await applyBodyDamage(actor,incoming); notice("info",damageSummary(r));
      }else{
        const target=actor.items.get(targetId);
        if(!target) throw new Error("La pièce ciblée n'existe plus.");
        if(!isActive(target)) throw new Error(`${target.name} est déjà détruite ou détachée.`);
        const r=await applyPieceDamage(actor,target,incoming); notice("info",damageSummary(r));
        if(!isActive(target)){
          dialog._h0dUi.targetId="body";
          selectTarget(dialog,"body");
        }
      }
      replacePanel(dialog,actor);
    } else if(action==="maintenance"){
      const panel=dialog.element?.querySelector(".hm-maintenance-panel"); if(panel) panel.hidden=!panel.hidden; return;
    } else if(action==="more"&&item){
      const panel=row.querySelector(".hm-advanced"); if(panel) panel.hidden=!panel.hidden; return;
    } else if(action==="iset"){
      const h=integrity(actor),v=await askNumber(`${actor.name} — Intégrité`,"Intégrité actuelle",h.current,0,h.max); if(v===null)return; await setIntegrity(actor,v);
    } else if(action==="imax"){
      await setIntegrity(actor,integrity(actor).max);
    } else if(action==="ps"&&item){
      const h=pieceHP(item),v=await askNumber(`${item.name} — PV`,"PV actuels",h.current,0,h.max); if(v===null)return; await updatePieceCurrent(item,v,true);
    } else if(action==="heal"&&item){
      const h=pieceHP(item); await updatePieceCurrent(item,h.current+Number(button.dataset.v||0),true);
    } else if(action==="pm"&&item){
      await updatePieceCurrent(item,pieceHP(item).max,true);
    } else if(action==="state"&&item){
      const v=await askState(item); if(!v)return; await setState(item,v);
    } else if(action==="mark"&&item){
      await setMarked(item,!bool(props(item).H0D_Composant_Marquee));
    }
    replacePanel(dialog,actor);
  }catch(err){ console.error(`${MODULE_ID} | action`,err); notice("error",err?.message??String(err)); }
}

function bindControls(dialog,actor){
  const el=dialog.element; if(!el)return;
  for(const button of el.querySelectorAll(".hm-wrap [data-a]")){
    if(button.dataset.hmBound==="1")continue;
    button.dataset.hmBound="1";
    button.addEventListener("click",event=>handleAction(dialog,actor,event));
  }
  for(const card of el.querySelectorAll(".hm-target-card,.hm-piece-select")){
    if(card.dataset.hmTargetBound==="1")continue;
    card.dataset.hmTargetBound="1";
    const target=card.closest("[data-target]")?.dataset.target;
    if(!target) continue;
    const radio=card.closest("[data-target]")?.querySelector('input[name="hm-target"]');
    const choose=()=>{ if(radio?.disabled)return; selectTarget(dialog,target); };
    card.addEventListener("click",choose);
    card.addEventListener("keydown",event=>{ if(event.key==="Enter"||event.key===" "){event.preventDefault();choose();} });
  }
  const damage=el.querySelector("[data-hm-damage]");
  if(damage && damage.dataset.hmBound!=="1"){
    damage.dataset.hmBound="1";
    damage.addEventListener("input",()=>{const n=Number(damage.value);if(Number.isFinite(n))dialog._h0dUi.damage=Math.max(0,Math.floor(n));});
    damage.addEventListener("keydown",event=>{
      if(event.key==="Enter"){
        event.preventDefault();
        el.querySelector('[data-a="apply"]')?.click();
      }
    });
  }
}

async function open(){
  try{
    if(!game.user?.isGM){ notice("warn","Cette console est prévue pour le MJ."); return; }
    const token=selectedMachine(); if(!token)return; const actor=token.actor;
    const DialogV2=foundry.applications.api.DialogV2;
    const dialog=new DialogV2({window:{title:`H0D — État machine · ${actor.name}`,resizable:true},position:{width:900},content:makeContent(actor,{targetId:"body",damage:1}),buttons:[{action:"close",label:"Fermer",icon:"fas fa-xmark"}]});
    dialog._h0dUi={targetId:"body",damage:1};
    await dialog.render(true); bindControls(dialog,actor); return dialog;
  }catch(err){ console.error(`${MODULE_ID} | ouverture`,err); notice("error",`Ouverture impossible : ${err?.message??err}`); }
}

async function diagnostic(){
  const token=canvas?.tokens?.controlled?.[0]??null,actor=token?.actor??null;
  const data={version:VERSION,active:game.modules.get(MODULE_ID)?.active??false,dialogV2:Boolean(foundry?.applications?.api?.DialogV2),controlledTokens:canvas?.tokens?.controlled?.length??0,
    actor:actor?.name??null,integrity:actor?integrity(actor):null,protected:actor?bodyProtected(actor):null,protections:actor?activeProtections(actor).map(i=>i.name):[],pieces:actor?pieces(actor).map(i=>({name:i.name,zone:inferZone(i),protection:protectsBody(i),hp:pieceHP(i),state:state(i)})):[]};
  console.log(`${MODULE_ID} | diagnostic`,data); notice("info",`Diagnostic v${VERSION} envoyé dans la console (F12).`); return data;
}

async function ensureMacro(){
  if(!game.user?.isGM)return; let m=game.macros?.getName(MACRO_NAME);
  if(m){ const updates={}; if(m.command!==MACRO_COMMAND)updates.command=MACRO_COMMAND;if(m.type!=="script")updates.type="script";if(m.scope!=="global")updates.scope="global";if(Object.keys(updates).length)await m.update(updates);return m; }
  m=await Macro.create({name:MACRO_NAME,type:"script",scope:"global",command:MACRO_COMMAND,img:"icons/svg/repair.svg"}); notice("info",`Macro « ${MACRO_NAME} » créée.`); return m;
}


const externalPieceSync=new Map();

function changeHas(changes,key){
  if(Object.prototype.hasOwnProperty.call(changes,key)) return true;
  return foundry.utils.getProperty(changes,key)!==undefined;
}

function relevantPieceUpdate(changes){
  const keys=[
    "system.props.H0D_Composant_PV_Actuels",
    "system.props.H0D_Composant_Etat",
    "system.props.H0D_Composant_Compte_PV",
    "system.props.H0D_Composant_PV_Max"
  ];
  return keys.some(k=>changeHas(changes,k));
}

function isMachinePiece(item){
  if(item?.parent?.documentName!=="Actor") return false;
  const p=props(item);
  return ("H0D_Composant_PV_Actuels" in p && "H0D_Composant_PV_Max" in p) ||
    item.getFlag("h0d-machine-builder","kind")==="piece";
}

function normalizedExternalPieceUpdate(item,changes,pending){
  const hp=pieceHP(item);
  const p=props(item);
  const stateChanged=changeHas(changes,"system.props.H0D_Composant_Etat");
  const hpChanged=changeHas(changes,"system.props.H0D_Composant_PV_Actuels");
  const stored=String(p.H0D_Composant_Etat||"Intact");
  const update={};

  if(stateChanged){
    // Une édition explicite de l'état impose un couple cohérent.
    if(stored==="Detruit" && hp.current!==0){
      update["system.props.H0D_Composant_PV_Actuels"]=0;
    } else if(stored==="Intact" && hp.current!==hp.max){
      update["system.props.H0D_Composant_PV_Actuels"]=hp.max;
    } else if(stored==="Endommage" && hp.max>1 && (hp.current<=0 || hp.current>=hp.max)){
      update["system.props.H0D_Composant_PV_Actuels"]=Math.max(1,hp.max-1);
    }
    // Detache conserve volontairement ses PV : utile pour le craft/loot.
    return update;
  }

  if(hpChanged){
    // Une édition directe des PV fait évoluer automatiquement l'état.
    // Une pièce déjà détachée reste détachée même si ses PV sont corrigés.
    let desired;
    if(pending?.stateBefore==="Detache") desired="Detache";
    else if(hp.current<=0) desired=bool(p.H0D_Composant_Detachable)?"Detache":"Detruit";
    else if(hp.current>=hp.max) desired="Intact";
    else desired="Endommage";

    if(desired!==stored) update["system.props.H0D_Composant_Etat"]=desired;
  }

  return update;
}

Hooks.on("preUpdateItem",(item,changes,options,userId)=>{
  if(options?.h0dMachineHealthSkipSync || !game.user?.isGM || (userId && userId!==game.user.id)) return;
  if(!isMachinePiece(item) || !relevantPieceUpdate(changes)) return;
  externalPieceSync.set(item.uuid,{
    before:pieceContribution(item),
    maxBefore:integrityMax(item.parent),
    stateBefore:String(props(item).H0D_Composant_Etat||"Intact")
  });
});

Hooks.on("updateItem",async(item,changes,options,userId)=>{
  if(options?.h0dMachineHealthSkipSync || !game.user?.isGM || (userId && userId!==game.user.id)) return;
  const pending=externalPieceSync.get(item.uuid);
  if(!pending || !isMachinePiece(item)) return;
  externalPieceSync.delete(item.uuid);

  try{
    const actor=item.parent;

    const normalized=normalizedExternalPieceUpdate(item,changes,pending);
    if(Object.keys(normalized).length){
      await item.update(normalized,{h0dMachineHealthSkipSync:true});
    }

    const after=pieceContribution(item);
    const delta=after-pending.before;
    if(delta) await changeIntegrity(actor,delta);
    else {
      // Un changement de PV max peut modifier l'Intégrité max sans modifier la
      // contribution actuelle ; on recadre simplement la jauge si nécessaire.
      const h=integrity(actor);
      if(Number(props(actor).H0D_Machine_PV_Actuels)!==h.current) await setIntegrity(actor,h.current);
    }
  }catch(err){
    console.error(`${MODULE_ID} | synchronisation modification directe de pièce`,err);
  }
});

Hooks.once("ready",async()=>{
  try{
    const required={
      open,diagnostic,ensureMacro,integrity,integrityMax,
      bodyProtected,activeProtections,inferZone,protectsBody,
      chooseAdjacent,applyBodyDamage,applyPieceDamage
    };

    for(const [name,fn] of Object.entries(required)){
      if(typeof fn!=="function") throw new Error(`API incomplète : ${name} indisponible`);
    }

    const api={...required,version:VERSION};
    const mod=game.modules.get(MODULE_ID);
    if(mod) mod.api=api;
    game.h0dMachineHealth=api;

    try{
      await ensureMacro();
    }catch(err){
      console.error(`${MODULE_ID} | création macro`,err);
      notice("error",`Impossible de créer/réparer la macro : ${err?.message??err}`);
    }

    console.log(`${MODULE_ID} | v${VERSION} prêt`);
  }catch(err){
    console.error(`${MODULE_ID} | initialisation`,err);
    notice("error",`Initialisation impossible : ${err?.message??err}`);
  }
});
