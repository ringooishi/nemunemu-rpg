// --- data classes ---
class Player{
  constructor(name){this.name=name;this.maxHp=100;this.hp=100;this.maxMp=50;this.mp=50;this.item=3;}
}
class Enemy{
  constructor(name,hp,img){this.name=name;this.maxHp=hp;this.hp=hp;this.img=img;this.sleep=false;}
}

// --- game state ---
const enemies=[
  new Enemy('ブルーライトのけもの',60,'blu.png'),
  new Enemy('深夜の通知おばけ',70,'ghost.png'),
  new Enemy('カフェインまじん',80,'caffeine.png')
];
let enemyIndex=0, currentEnemy=enemies[0];
let turnCount=0, isEnded=false;
const player=new Player(prompt('あなたの名前を入力してください：')||'勇者ねむねむ');

// --- ui refs ---
const el={
  playerName:document.getElementById('playerName'),
  enemyName:document.getElementById('enemyName'),
  pHP:document.getElementById('pHP'), pHPText:document.getElementById('pHPText'),
  pMP:document.getElementById('pMP'), pMPText:document.getElementById('pMPText'),
  eHP:document.getElementById('eHP'), eHPText:document.getElementById('eHPText'),
  playerImg:document.getElementById('playerImg'),
  enemyImg:document.getElementById('enemyImg'),
  fxLayer:document.getElementById('fxLayer'),
  log:document.getElementById('log'),
  btnAtk:document.getElementById('btnAtk'),
  btnSkill:document.getElementById('btnSkill'),
  btnHeal:document.getElementById('btnHeal'),
  btnItem:document.getElementById('btnItem'),
  result:document.getElementById('result'),
  resultTitle:document.getElementById('resultTitle'),
  resultTurns:document.getElementById('resultTurns'),
  btnRetry:document.getElementById('btnRetry')
};

// --- helpers ---
function log(t){el.log.textContent += t + "\n"; el.log.scrollTop = el.log.scrollHeight;}
function updateBars(){
  el.playerName.textContent = player.name;
  el.enemyName.textContent = currentEnemy.name;
  el.pHP.style.width = (player.hp/player.maxHp*100)+'%';
  el.pHPText.textContent = `${player.hp}/${player.maxHp}`;
  el.pMP.style.width = (player.mp/player.maxMp*100)+'%';
  el.pMPText.textContent = `${player.mp}/${player.maxMp}`;
  el.eHP.style.width = (currentEnemy.hp/currentEnemy.maxHp*100)+'%';
  el.eHPText.textContent = `${currentEnemy.hp}/${currentEnemy.maxHp}`;
  el.enemyImg.src = 'images/' + currentEnemy.img;
}
function setCmd(enabled){
  el.btnAtk.disabled=!enabled;
  el.btnSkill.disabled=!enabled;
  el.btnHeal.disabled=!enabled;
  el.btnItem.disabled=!(enabled && player.item>0);
  el.btnItem.textContent = `回復アイテム（${player.item}）`;
}
function fxNumber(targetEl, text, color){
  const r = targetEl.getBoundingClientRect();
  const root = el.fxLayer;
  const div = document.createElement('div');
  div.className='fx';
  div.textContent=text;
  div.style.left=(r.left + r.width/2 - root.getBoundingClientRect().left)+'px';
  div.style.top=(r.top - root.getBoundingClientRect().top)+'px';
  div.style.color=color;
  root.appendChild(div);
  setTimeout(()=>div.remove(),700);
}
function endBattle(win){
  isEnded=true; setCmd(false);
  el.resultTitle.textContent = win ? '🌙 おめでとう！これで気持ちよく眠れる！' : '😵 ゲームオーバー';
  el.resultTurns.textContent = `かかったターン数： ${turnCount}`;
  el.result.classList.remove('hidden');
}
el.btnRetry.onclick=()=>{ location.reload(); };

// --- battle actions ---
const CRIT_CHANCE=0.2, CRIT_MULT=2.0;
function attack(){
  if(isEnded) return; turnCount++;
  const base=10; const crit=Math.random()<CRIT_CHANCE; const dmg=Math.round(base*(crit?CRIT_MULT:1));
  currentEnemy.hp=Math.max(0,currentEnemy.hp-dmg);
  fxNumber(el.enemyImg, `-${dmg}${crit?'!!':''}`, crit?'#ff8c00':'#dc2828');
  log(player.name+'の まくらパンチ！' + (crit?' クリティカル！':''));
  afterPlayer();
}
function skill(){
  if(isEnded) return; if(player.mp<10){log('MPが足りない！');return;}
  turnCount++; player.mp-=10;
  const base=7; const crit=Math.random()<CRIT_CHANCE; const dmg=Math.round(base*(crit?CRIT_MULT:1));
  currentEnemy.hp=Math.max(0,currentEnemy.hp-dmg);
  fxNumber(el.enemyImg, `-${dmg}${crit?'!!':''}`, crit?'#ff8c00':'#dc2828');
  log(player.name+'の スリープソング！' + (crit?' クリティカル！':''));
  if(Math.random()<0.7){ currentEnemy.sleep=true; log(currentEnemy.name+'は眠ってしまった！'); }
  afterPlayer();
}
function heal(){
  if(isEnded) return; if(player.mp<15){log('MPが足りない！');return;}
  turnCount++; const before=player.hp; player.mp-=15;
  player.hp=Math.min(player.maxHp, player.hp+50);
  const healed=player.hp-before; if(healed>0){ fxNumber(el.playerImg, `+${healed}`, '#22c55e'); }
  log(player.name+'は 目を瞑って瞑想をした！');
  afterPlayer();
}
function useItem(){
  if(isEnded) return; if(player.item<=0){log('アイテムを持っていない！');return;}
  turnCount++; player.item--;
  const dhp=Math.min(player.maxHp-player.hp,80);
  const dmp=Math.min(player.maxMp-player.mp,40);
  player.hp+=dhp; player.mp+=dmp;
  if(dhp>0) fxNumber(el.playerImg, `+${dhp}`, '#22c55e');
  log(player.name+'は ホットミルク を飲んだ！');
  afterPlayer();
}

function afterPlayer(){
  updateBars();
  if(currentEnemy.hp<=0){
    log(currentEnemy.name+'を倒した！');
    enemyIndex++;
    if(enemyIndex>=enemies.length){ log('すべての魔物を倒した！快眠が訪れる……zzz'); endBattle(true); return; }
    currentEnemy=enemies[enemyIndex];
    updateBars(); log('次の魔物が現れた！: '+currentEnemy.name);
    return;
  }
  // enemy delayed attack
  setCmd(false);
  setTimeout(()=>enemyAttack(), 800);
}

function enemyAttack(){
  if(isEnded) return;
  if(currentEnemy.sleep){ log(currentEnemy.name+'は眠っていて動けない！'); currentEnemy.sleep=false; setCmd(true); updateBars(); return; }
  const base=15; const crit=Math.random()<0.1; const dmg=Math.round(base*(crit?1.5:1));
  player.hp=Math.max(0, player.hp-dmg);
  fxNumber(el.playerImg, `-${dmg}${crit?'!!':''}`, crit?'#ff8c00':'#dc2828');
  log(currentEnemy.name+'の 睡眠妨害攻撃！' + (crit?' 痛恨の一撃！':''));
  updateBars();
  if(player.hp<=0){ endBattle(false); } else { setCmd(true); }
}

// --- init ---
el.enemyImg.src='images/'+currentEnemy.img;
el.playerName.textContent=player.name;
el.btnAtk.onclick=attack;
el.btnSkill.onclick=skill;
el.btnHeal.onclick=heal;
el.btnItem.onclick=useItem;
log('魔物が現れた！: '+currentEnemy.name);
updateBars();
