// ============================================================
//  MOTEUR COMPLET – FIDÈLE AU PDF DE FORMALISATION
// ============================================================

// --- Constantes ---
const RULES = {
  pitsPerPlayer: 7,
  initialSeeds: 5,
  totalSeeds: 70,
  victoryScore: 40,
  lowBoardLimit: 10,
  captureValues: [2, 3, 4],
  maxNormalSow: 13
};

// Cycle complet de semaille (coordonnées physiques)
// N0..N6 → S6..S0 → boucle
const CYCLE = [
  {p:"north",i:0},{p:"north",i:1},{p:"north",i:2},{p:"north",i:3},
  {p:"north",i:4},{p:"north",i:5},{p:"north",i:6},
  {p:"south",i:6},{p:"south",i:5},{p:"south",i:4},{p:"south",i:3},
  {p:"south",i:2},{p:"south",i:1},{p:"south",i:0}
];

// Chemin adverse : pour distribution grenier & prise à la chaîne
function opponentPath(player) {
  return player === "north"
    ? [{p:"south",i:6},{p:"south",i:5},{p:"south",i:4},{p:"south",i:3},{p:"south",i:2},{p:"south",i:1},{p:"south",i:0}]
    : [{p:"north",i:0},{p:"north",i:1},{p:"north",i:2},{p:"north",i:3},{p:"north",i:4},{p:"north",i:5},{p:"north",i:6}];
}

function other(p){ return p==="north"?"south":"north"; }
function samePos(a,b){ return a.p===b.p && a.i===b.i; }
function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
function cloneState(s){
  return {
    board:{north:[...s.board.north],south:[...s.board.south]},
    scores:{north:s.scores.north,south:s.scores.south},
    currentPlayer:s.currentPlayer,
    status:s.status,
    winner:s.winner,
    reason:s.reason,
    moveNumber:s.moveNumber,
    history:[...s.history]
  };
}

// Case d'attaque et première case adverse (protégée)
function attackPit(player){
  return player==="north" ? {p:"north",i:6} : {p:"south",i:0};
}
function opponentFirstPit(player){
  return player==="north" ? {p:"south",i:6} : {p:"north",i:0};
}

function boardSeeds(s){ return sum(s.board.north)+sum(s.board.south); }
function totalSeedsCheck(s){ return s.scores.north+s.scores.south+boardSeeds(s); }

// --- Création de partie ---
function createGame(startingPlayer="south"){
  return {
    board:{north:[5,5,5,5,5,5,5],south:[5,5,5,5,5,5,5]},
    scores:{north:0,south:0},
    currentPlayer:startingPlayer,
    status:"playing",
    winner:null,reason:null,
    moveNumber:0,history:[]
  };
}

// --- Chemin de semaille ---
function cycleIndexOf(pos){
  return CYCLE.findIndex(c=>samePos(c,pos));
}
function nextPositionsAfter(source){
  const start=cycleIndexOf(source);
  const positions=[];
  for(let step=1;step<=13;step++){
    positions.push(CYCLE[(start+step)%CYCLE.length]);
  }
  return positions;
}

// --- Semaille normale (1..13 graines) ---
function sowNormal(state,player,pitIndex){
  const seeds=state.board[player][pitIndex];
  const source={p:player,i:pitIndex};
  state.board[player][pitIndex]=0;
  const path=nextPositionsAfter(source);
  const visited=[];
  for(let i=0;i<seeds;i++){
    const pos=path[i];
    state.board[pos.p][pos.i]++;
    visited.push(pos);
  }
  return {visited,lastPosition:visited[visited.length-1],specialCapture:0};
}

// --- Semaille grenier (>13 graines) ---
function sowGranary(state,player,pitIndex){
  const seeds=state.board[player][pitIndex];
  const source={p:player,i:pitIndex};
  state.board[player][pitIndex]=0;
  let remaining=seeds;
  let specialCapture=0;
  const visited=[];

  // Tour complet (13 cases)
  for(const pos of nextPositionsAfter(source)){
    state.board[pos.p][pos.i]++;
    visited.push(pos);
    remaining--;
  }

  // Reste uniquement chez l'adversaire
  const path=opponentPath(player);
  for(let i=0;i<remaining;i++){
    const pos=path[i % path.length];
    const isLast=(i===remaining-1);
    const isProtected=samePos(pos,opponentFirstPit(player));
    if(isLast && isProtected){
      specialCapture=1;
      visited.push(pos);
      continue;
    }
    state.board[pos.p][pos.i]++;
    visited.push(pos);
  }
  return {visited,lastPosition:visited[visited.length-1],specialCapture};
}

function sow(state,player,pitIndex){
  const seeds=state.board[player][pitIndex];
  if(seeds<=0) throw new Error("Case vide");
  if(seeds<=13) return sowNormal(state,player,pitIndex);
  return sowGranary(state,player,pitIndex);
}

// --- Capture ---
function isCaptureValue(n){ return n===2||n===3||n===4; }

function canStartCapture(state,player,lastPos){
  if(lastPos.p===player) return false;
  if(samePos(lastPos,opponentFirstPit(player))) return false;
  return isCaptureValue(state.board[lastPos.p][lastPos.i]);
}

function captureChainPositions(state,player,lastPos){
  const path=opponentPath(player);
  const lastIndex=path.findIndex(pos=>samePos(pos,lastPos));
  if(lastIndex<0) return [];
  const captured=[];
  for(let idx=lastIndex;idx>=0;idx--){
    const pos=path[idx];
    const count=state.board[pos.p][pos.i];
    if(!isCaptureValue(count)) break;
    captured.push({p:pos.p,i:pos.i,seeds:count});
  }
  return captured;
}

function wouldEmptyOpponent(state,player,captureList){
  const opp=other(player);
  const rem=[...state.board[opp]];
  for(const c of captureList) rem[c.i]-=c.seeds;
  return sum(rem)===0;
}

function applyCaptureIfAllowed(state,player,captureList){
  if(!captureList.length) return 0;
  if(wouldEmptyOpponent(state,player,captureList)) return 0;
  let total=0;
  for(const c of captureList){
    state.board[c.p][c.i]-=c.seeds;
    total+=c.seeds;
  }
  state.scores[player]+=total;
  return total;
}

function resolveCaptures(state,player,sowResult){
  if(sowResult.specialCapture>0){
    state.scores[player]+=sowResult.specialCapture;
    return {captured:sowResult.specialCapture,type:"special-granary"};
  }
  const last=sowResult.lastPosition;
  if(!canStartCapture(state,player,last)) return {captured:0,type:"none"};
  const captureList=captureChainPositions(state,player,last);
  const captured=applyCaptureIfAllowed(state,player,captureList);
  return {
    captured,
    type: captured>0&&captureList.length>1?"chain":"normal",
    cancelledStarvation: captured===0&&captureList.length>0
  };
}

// --- Coups interdits (case d'attaque) ---
function isAttackPitMove(player,pitIndex){
  const a=attackPit(player);
  return a.p===player && a.i===pitIndex;
}

function wouldMoveCapture(state,player,pitIndex){
  const sim=cloneState(state);
  const sowRes=sow(sim,player,pitIndex);
  if(sowRes.specialCapture>0) return true;
  return canStartCapture(sim,player,sowRes.lastPosition);
}

function isForbiddenAttackMove(state,player,pitIndex){
  if(!isAttackPitMove(player,pitIndex)) return false;
  const seeds=state.board[player][pitIndex];
  if(seeds===1) return true;
  if(seeds===2) return !wouldMoveCapture(state,player,pitIndex);
  return false;
}

// --- Solidarité ---
function opponentCampIsEmpty(state,player){
  return sum(state.board[other(player)])===0;
}

function countDeliveredToOpponent(state,player,pitIndex){
  const sim=cloneState(state);
  const before=sum(sim.board[other(player)]);
  sow(sim,player,pitIndex);
  return sum(sim.board[other(player)])-before;
}

function ownNonEmptyMoves(state,player){
  const moves=[];
  for(let i=0;i<7;i++){
    if(state.board[player][i]>0) moves.push({player,pitIndex:i});
  }
  return moves;
}

function getSolidarityMoves(state,player){
  const candidates=ownNonEmptyMoves(state,player);
  const ordinary=candidates.filter(m=>!isForbiddenAttackMove(state,player,m.pitIndex));
  const enriched=ordinary.map(m=>({...m,delivered:countDeliveredToOpponent(state,player,m.pitIndex)}));

  const atLeast7=enriched.filter(m=>m.delivered>=7);
  if(atLeast7.length>0) return atLeast7;

  const positive=enriched.filter(m=>m.delivered>0);
  if(positive.length>0){
    const maxD=Math.max(...positive.map(m=>m.delivered));
    return positive.filter(m=>m.delivered===maxD);
  }

  // Don forcé
  const forced=candidates.filter(m=>isAttackPitMove(player,m.pitIndex)&&[1,2].includes(state.board[player][m.pitIndex]));
  return forced.map(m=>({...m,forcedDonation:true}));
}

function getLegalMoves(state){
  const player=state.currentPlayer;
  if(state.status!=="playing") return [];
  if(opponentCampIsEmpty(state,player)) return getSolidarityMoves(state,player);
  return ownNonEmptyMoves(state,player).filter(m=>!isForbiddenAttackMove(state,player,m.pitIndex));
}

// --- Don forcé ---
function applyForcedDonation(state,player,pitIndex){
  const seeds=state.board[player][pitIndex];
  state.board[player][pitIndex]=0;
  state.scores[other(player)]+=seeds;
  return {type:"forced-donation",donated:seeds};
}

// --- Fin de partie ---
function collectRemainingSeeds(state){
  state.scores.north+=sum(state.board.north);
  state.scores.south+=sum(state.board.south);
  state.board.north=[0,0,0,0,0,0,0];
  state.board.south=[0,0,0,0,0,0,0];
}

function computeWinner(state){
  if(state.scores.north>=40) return "north";
  if(state.scores.south>=40) return "south";
  return "draw";
}

function computeWinnerStrict(state){
  if(state.scores.north>=40) return "north";
  if(state.scores.south>=40) return "south";
  return "draw";
}

function resolveEndGameAfterMove(state){
  if(state.scores.north>=40||state.scores.south>=40){
    state.status="ended"; state.reason="score_40";
    state.winner=computeWinner(state); return;
  }
  if(boardSeeds(state)<10){
    collectRemainingSeeds(state);
    state.status="ended"; state.reason="low_board";
    state.winner=computeWinnerStrict(state); return;
  }
}

function resolveEndGameBeforeTurn(state){
  const legal=getLegalMoves(state);
  if(legal.length>0) return;
  collectRemainingSeeds(state);
  state.status="ended"; state.reason="solidarity_impossible";
  state.winner=computeWinnerStrict(state);
}

function assertTotalSeeds(state){
  const total=totalSeedsCheck(state);
  if(total!==70) throw new Error(`Invariant brisé : ${total} graines au lieu de 70`);
}

// --- Validation ---
function validateMove(state,move){
  if(state.status!=="playing") return {ok:false,reason:"Partie terminée."};
  if(move.player!==state.currentPlayer) return {ok:false,reason:"Ce n'est pas votre tour."};
  if(move.pitIndex<0||move.pitIndex>6) return {ok:false,reason:"Case inconnue."};
  if(state.board[move.player][move.pitIndex]<=0) return {ok:false,reason:"La case est vide."};
  const legal=getLegalMoves(state);
  const ok=legal.some(lm=>lm.player===move.player&&lm.pitIndex===move.pitIndex);
  if(!ok) return {ok:false,reason:"Coup interdit par les règles."};
  return {ok:true};
}

// --- Application d'un coup ---
function applyMove(state,move){
  const v=validateMove(state,move);
  if(!v.ok) return {state,ok:false,error:v.reason,action:null};

  const legal=getLegalMoves(state);
  const lm=legal.find(l=>l.player===move.player&&l.pitIndex===move.pitIndex);

  let actionResult;
  if(lm&&lm.forcedDonation){
    actionResult=applyForcedDonation(state,move.player,move.pitIndex);
  } else {
    const sowRes=sow(state,move.player,move.pitIndex);
    const captureRes=resolveCaptures(state,move.player,sowRes);
    actionResult={type:"sow",sowing:sowRes,capture:captureRes};
  }

  state.moveNumber++;
  state.history.push({
    moveNumber:state.moveNumber,
    player:move.player,
    pitIndex:move.pitIndex,
    result:actionResult
  });

  resolveEndGameAfterMove(state);
  if(state.status==="playing"){
    state.currentPlayer=other(state.currentPlayer);
    resolveEndGameBeforeTurn(state);
  }

  assertTotalSeeds(state);
  return {state,ok:true,action:actionResult};
}

// ============================================================
//  INTERFACE
// ============================================================

let gameState = null;
let legalMovesList = [];

// Noms humains des cases
// Nord physique : N0=N1humain...N6=N7humain — mais l'image montre N1..N7 sur le plateau
// On affiche "N{i+1}" pour les indices physiques
function pitLabel(player, idx){
  return player==="north" ? `N${idx+1}` : `S${idx+1}`;
}

function initGame(){
  const starter = Math.random()<0.5 ? "north" : "south";
  gameState = createGame(starter);
  legalMovesList = getLegalMoves(gameState);
  renderAll();
  const sName = starter==="north" ? "Nord (Joueur 1)" : "Sud (Joueur 2)";
  setStatus(`${sName} commence la partie !`, starter==="north"?"turn-north":"turn-south");
  updateInfoBar();
}

function handlePitClick(player, idx){
  if(!gameState || gameState.status!=="playing") return;
  if(player!==gameState.currentPlayer){
    setStatus(`Ce n'est pas le tour de ${playerLabel(player)} !`, "error");
    return;
  }
  const result = applyMove(gameState, {player, pitIndex:idx});
  if(!result.ok){
    setStatus(result.error, "error");
    return;
  }
  gameState = result.state;
  legalMovesList = getLegalMoves(gameState);

  // Build status message
  let msg = "";
  const act = result.action;
  if(act.type==="forced-donation"){
    msg = `${playerLabel(player)} : don forcé de ${act.donated} graine${act.donated>1?"s":""} à l'adversaire.`;
  } else {
    const cap = act.capture;
    const lastPos = act.sowing.lastPosition;
    const lastLabel = pitLabel(lastPos.p, lastPos.i);
    if(cap.captured>0){
      let typeStr = cap.type==="chain"?"(prise à la chaîne)":cap.type==="special-granary"?"(grenier)":"";
      msg = `${playerLabel(player)} joue ${pitLabel(player,idx)}, dernière graine en ${lastLabel}, <strong>${cap.captured} graine${cap.captured>1?"s":""} capturée${cap.captured>1?"s":""}</strong> ${typeStr}.`;
    } else if(cap.cancelledStarvation){
      msg = `${playerLabel(player)} joue ${pitLabel(player,idx)}. (Capture annulée : évite d'affamer l'adversaire)`;
    } else {
      msg = `${playerLabel(player)} joue ${pitLabel(player,idx)}, dernière graine en ${lastLabel}. Aucune capture.`;
    }
  }

  renderAll();
  setStatus(msg, act.capture&&act.capture.captured>0?"capture":"");
  updateLastMove(msg);
  addHistory(gameState.moveNumber, player, idx, result.action);
  updateInfoBar();

  if(gameState.status==="ended") setTimeout(()=>showEndModal(), 500);
}

function playerLabel(p){ return p==="north"?"Nord (J1)":"Sud (J2)"; }

function renderAll(){
  renderRow("row-north","north");
  renderRow("row-south","south");
  document.getElementById("score-north").textContent = gameState.scores.north;
  document.getElementById("score-south").textContent = gameState.scores.south;

  // Turn indicator
  const ti = document.getElementById("turn-indicator");
  if(gameState.status==="playing"){
    ti.textContent = `À ${playerLabel(gameState.currentPlayer)} de jouer`;
    ti.className = `turn-indicator ti-${gameState.currentPlayer}`;
  } else {
    ti.textContent = "Partie terminée";
    ti.className = "turn-indicator";
  }
}

function renderRow(rowId, player){
  const row = document.getElementById(rowId);
  row.innerHTML = "";
  const isMyTurn = gameState.currentPlayer===player && gameState.status==="playing";

  for(let i=0;i<7;i++){
    const seeds = gameState.board[player][i];
    const legal = isMyTurn && legalMovesList.some(lm=>lm.player===player&&lm.pitIndex===i);
    const isEmpty = seeds===0;

    const pit = document.createElement("div");
    pit.className = "pit";
    if(isEmpty) pit.classList.add("pit-empty");
    else if(!isMyTurn) pit.classList.add("pit-disabled");
    else if(legal) pit.classList.add("pit-legal");
    else pit.classList.add("pit-disabled");

    pit.innerHTML = `
      <span class="pit-label">${pitLabel(player,i)}</span>
      <span class="pit-count">${seeds}</span>
      <div class="pit-seeds">${renderSeeds(seeds)}</div>
    `;

    if(legal && !isEmpty){
      pit.addEventListener("click", ()=>handlePitClick(player,i));
    }
    row.appendChild(pit);
  }
}

function renderSeeds(n){
  if(n===0) return "";
  const show = Math.min(n, 12);
  let html = "";
  const large = n>10;
  for(let i=0;i<show;i++) html += `<div class="seed${large?" large-seed":""}"></div>`;
  if(n>12) html += `<div class="seed" style="opacity:.4"></div>`;
  return html;
}

function setStatus(html, cls=""){
  const el = document.getElementById("status-inner");
  el.innerHTML = html;
  el.className = cls ? `${cls}` : "";
}

function updateLastMove(msg){
  document.getElementById("last-move-text").innerHTML = msg;
}

function addHistory(num, player, idx, action){
  const list = document.getElementById("history-list");
  const li = document.createElement("li");
  let capStr = "";
  if(action.type==="forced-donation") capStr = `, don forcé ${action.donated}`;
  else if(action.capture) capStr = `, capture ${action.capture.captured}`;
  const pClass = player==="north"?"hl-player-north":"hl-player-south";
  li.innerHTML = `<span class="hl-num">Tour ${num} :</span><span class="${pClass}">${playerLabel(player)}</span> joue ${pitLabel(player,idx)}${capStr}.`;
  list.insertBefore(li, list.firstChild);
}

function updateInfoBar(){
  const p = gameState.currentPlayer;
  document.getElementById("ic-camp").textContent = p==="north"?"Nord":"Sud";
  document.getElementById("ic-tour").textContent = p==="north"?"Nord":"Sud";
  document.getElementById("ic-etat").textContent = gameState.status==="playing"?"En jeu":"Terminé";
  document.getElementById("ic-total").textContent = boardSeeds(gameState);
}

function showEndModal(){
  const [sn,ss] = [gameState.scores.north, gameState.scores.south];
  let title="", body="";
  const reasonMap={
    "score_40":"Un joueur a atteint 40 graines.",
    "low_board":"Moins de 10 graines restantes sur le plateau.",
    "solidarity_impossible":"Solidarité impossible, la partie s'arrête.",
    "no_legal_move":"Plus aucun coup légal disponible."
  };
  const reasonStr = reasonMap[gameState.reason]||"";
  if(gameState.winner==="north"){
    title="🔵 Nord gagne !";
  } else if(gameState.winner==="south"){
    title="🔴 Sud gagne !";
  } else {
    title="🤝 Match nul !";
  }
  body = `${reasonStr}\n\nNord : ${sn} graines | Sud : ${ss} graines`;
  document.getElementById("modal-title").textContent=title;
  document.getElementById("modal-body").textContent=body;
  document.getElementById("modal-overlay").classList.add("show");
}

// ===== EVENTS =====
document.getElementById("btn-restart").addEventListener("click",()=>{
  document.getElementById("history-list").innerHTML="";
  document.getElementById("last-move-text").innerHTML="–";
  initGame();
});
document.getElementById("modal-btn").addEventListener("click",()=>{
  document.getElementById("modal-overlay").classList.remove("show");
  document.getElementById("history-list").innerHTML="";
  document.getElementById("last-move-text").innerHTML="–";
  initGame();
});
document.getElementById("btn-rules-nav").addEventListener("click",()=>{
  document.getElementById("rules-overlay").classList.add("show");
});
document.getElementById("btn-prise-nav").addEventListener("click",()=>{
  document.getElementById("rules-overlay").classList.add("show");
});
document.getElementById("btn-quit-nav").addEventListener("click",()=>{
  if(confirm("Quitter la partie ?")) {
    document.getElementById("history-list").innerHTML="";
    document.getElementById("last-move-text").innerHTML="–";
    initGame();
  }
});
document.getElementById("rules-close").addEventListener("click",()=>{
  document.getElementById("rules-overlay").classList.remove("show");
});

// ===== INIT =====
initGame();
