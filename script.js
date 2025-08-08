// ===== helpers =====
const $ = (sel) => document.querySelector(sel);
const logBox = $("#log");

function log(text, css = "") {
  const line = document.createElement("div");
  line.className = "line " + css;
  line.textContent = text;
  logBox.appendChild(line);
  logBox.scrollTop = logBox.scrollHeight;
}

function showToast(msg) {
  const t = $("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), 1200);
}

function floatText(targetEl, text, cssClass = "dmg") {
  const layer = $("#effectLayer");
  if (!layer || !targetEl) return;

  const tip = document.createElement("div");
  tip.className = "floating " + cssClass;
  tip.textContent = text;

  // layer（.arena内の絶対配置）基準に座標を出す
  const base = layer.getBoundingClientRect();
  const box = targetEl.getBoundingClientRect();
  tip.style.left = (box.left + box.width / 2 - base.left) + "px";
  tip.style.top  = (box.top - base.top - 20) + "px";

  layer.appendChild(tip);
  setTimeout(() => tip.remove(), 950);
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

// ===== data =====
const DIFFS = {
  EASY:{label:"やさしい",pHP:120,pMP:70,items:5,eHpMul:0.85,eDmgMul:0.80,delay:900},
  NORMAL:{label:"ふつう",pHP:100,pMP:50,items:3,eHpMul:1.00,eDmgMul:1.00,delay:800},
  HARD:{label:"むずかしい",pHP:90,pMP:45,items:3,eHpMul:1.15,eDmgMul:1.15,delay:700},
  NIGHTMARE:{label:"ナイトメア",pHP:80,pMP:40,items:3,eHpMul:1.35,eDmgMul:1.30,delay:600}
};

const ENEMY_MASTERS = [
  {name:"ブルーライトのけもの",baseHp:60,spriteClass:"enemy-blue",skills:[
    {name:"眠気はぎ取り",type:"nuke",power:20,chance:0.35,log:"鋭い光がまぶしい！"},
    {name:"チラつき",type:"crit",power:12,chance:0.20,critMul:1.8,log:"画面がチラついた！"},
    {name:"通常攻撃",type:"basic",power:15,chance:1.00,log:"睡眠妨害攻撃！"}
  ]},
  {name:"深夜の通知おばけ",baseHp:70,spriteClass:"enemy-ghost",skills:[
    {name:"ピコンピコン",type:"nuke",power:18,chance:0.30,log:"通知音が鳴り響く！"},
    {name:"未読の山",type:"debuff",chance:0.25,effect:"mpDrain",value:10,log:"未読の山で集中がそがれた…"},
    {name:"通常攻撃",type:"basic",power:14,chance:1.00,log:"睡眠妨害攻撃！"}
  ]},
  {name:"カフェインまじん",baseHp:80,spriteClass:"enemy-caffeine",skills:[
    {name:"濃ゆいエスプレッソ",type:"nuke",power:16,chance:0.30,log:"苦味が染みわたる…！"},
    {name:"覚醒テンション",type:"buff",chance:0.25,effect:"doubleNext",log:"次のターン2回攻撃！"},
    {name:"通常攻撃",type:"basic",power:15,chance:1.00,log:"睡眠妨害攻撃！"}
  ]}
];

// ===== state =====
let state = {
  diffKey: "NORMAL",
  player: { name:"勇者ねむねむ", maxHp:100, hp:100, maxMp:50, mp:50, items:3 },
  enemyIndex: 0,
  enemies: [],
  enemy: null,
  enemyDoubleNext: false,
  busy: false,
  gameEnded: false,   // ← クリア後の入力ガード
  turnCount: 0
};

// ===== UI helpers =====
function setBars(){
  const {player, enemy} = state;
  $("#playerNameLabel").textContent = player.name;
  $("#playerHpText").textContent = `${player.hp}/${player.maxHp}`;
  $("#playerMpText").textContent = `${player.mp}/${player.maxMp}`;
  $("#itemPill").textContent = `回復x${player.items}`;
  $("#playerHpBar").style.width = (player.hp/player.maxHp*100)+"%";
  $("#playerMpBar").style.width = (player.mp/player.maxMp*100)+"%";

  if (enemy){
    $("#enemyNameLabel").textContent = enemy.name;
    $("#enemyHpText").textContent = `${enemy.hp}/${enemy.maxHp}`;
    $("#enemyHpBar").style.width = (enemy.hp/enemy.maxHp*100)+"%";
  } else {
    $("#enemyNameLabel").textContent = "----";
    $("#enemyHpText").textContent = `--/--`;
    $("#enemyHpBar").style.width = "0%";
  }
}

function setCommandsEnabled(v){
  $("#btnAttack").disabled = !v;
  $("#btnSkill").disabled  = !v;
  $("#btnItem").disabled   = !v;
  $("#btnRest").disabled   = !v;
}

function setDifficultyPill(){
  const k = state.diffKey;
  $("#difficultyPill").textContent = `${k} ・ ${DIFFS[k].label}`;
}

function populateDiffButtons(){
  const row = $("#difficultyRow");
  row.innerHTML = "";
  ["EASY","NORMAL","HARD","NIGHTMARE"].forEach(k=>{
    const d = document.createElement("div");
    d.className = "diff" + (k==="NORMAL" ? " active" : "");
    d.textContent = `${k} / ${DIFFS[k].label}`;
    d.dataset.key = k;
    d.addEventListener("click", ()=>{
      document.querySelectorAll(".diff").forEach(x=>x.classList.remove("active"));
      d.classList.add("active");
      state.diffKey = k;
    });
    row.appendChild(d);
  });
}

// ===== flow =====
function finishGame(){
  state.gameEnded = true;
  setCommandsEnabled(false);
  log("すべての魔物を倒した！快眠が訪れる……zzz");
  // 勝利モーダルが用意されていれば呼ぶ
  if (typeof window.showVictoryModal === "function") {
    window.showVictoryModal(state.turnCount || 0);
  } else {
    showToast("クリア！おめでとう ✨");
  }
}

function startGame(){
  const name = $("#playerName").value.trim() || "勇者ねむねむ";
  state.player.name = name;

  const diff = DIFFS[state.diffKey];
  state.player.maxHp = diff.pHP;
  state.player.hp    = diff.pHP;
  state.player.maxMp = diff.pMP;
  state.player.mp    = diff.pMP;
  state.player.items = diff.items;

  state.enemies = ENEMY_MASTERS.map(m=>{
    const hp = Math.round(m.baseHp * diff.eHpMul);
    return { name:m.name, spriteClass:m.spriteClass, baseHp:m.baseHp,
             maxHp:hp, hp:hp, skills:m.skills.map(s=>({...s})) };
  });

  state.enemyIndex = 0;
  state.enemy = null;
  state.enemyDoubleNext = false;
  state.busy = false;
  state.gameEnded = false;
  state.turnCount = 0;

  $("#start-screen").classList.add("hidden");
  $("#game-screen").classList.remove("hidden");
  setDifficultyPill();
  nextEnemy();

  // プレイヤー画像クラス付与（CSSが用意されている前提）
  const psp = document.querySelector(".player-sprite");
  if (psp) psp.classList.add("player-img");
}

function nextEnemy(){
  // 全滅チェック：ここでもガードしておく
  if (state.enemyIndex >= state.enemies.length){
    finishGame();
    return;
  }
  state.enemy = { ...state.enemies[state.enemyIndex] };
  $("#enemySprite").className = "sprite enemy-sprite " + (state.enemy.spriteClass || "");
  $("#enemySprite").classList.remove("shake");
  setBars();
  log(`魔物が現れた！: ${state.enemy.name}`);
  setCommandsEnabled(true);
  state.busy = false;
}

function playerTurn(action){
  if (state.busy || state.gameEnded || !state.enemy) return;

  const enemyBox  = $("#enemySprite");
  const playerBox = document.querySelector(".player-sprite");

  state.busy = true;
  setCommandsEnabled(false);

  const e = state.enemy;
  const p = state.player;
  state.turnCount++;

  if (action === "attack"){
    const dmg = 20;
    e.hp = clamp(e.hp - dmg, 0, e.maxHp);
    enemyBox.classList.add("shake");
    setTimeout(()=>enemyBox.classList.remove("shake"), 250);
    floatText(enemyBox, `-${dmg}`, "dmg");
    log(`${p.name}の攻撃！ ${e.name}に ${dmg} ダメージ！`, "dmg");

  } else if (action === "skill"){
    const mpCost = 15;
    if (p.mp < mpCost){
      log("MPが足りない…");
      state.busy = false;
      setCommandsEnabled(true);
      return;
    }
    p.mp -= mpCost;
    const dmg = 14;
    e.hp = clamp(e.hp - dmg, 0, e.maxHp);
    floatText(enemyBox, `-${dmg}`, "dmg");
    const slept = Math.random() < 0.35;
    if (slept){
      e._skipTurn = true;
      log(`♪ スリープソング！ ${e.name}は うとうと…`, "heal");
    } else {
      log(`♪ スリープソング！ しかし効かなかった…`);
    }

 } else if (action === "item") {
  if (p.items <= 0){
    log("回復アイテムを持っていない！");
    showToast("アイテムがありません！");
    state.busy = false;
    setCommandsEnabled(true);
    return;
  }

  const heal = 50;
  const mpRecover = 20;

  p.items--;
  p.hp = clamp(p.hp + heal, 0, p.maxHp);
  p.mp = clamp(p.mp + mpRecover, 0, p.maxMp);

  floatText(playerBox, `+${heal}`, "heal");
  floatText(playerBox, `+${mpRecover}MP`, "heal");
  log("回復アイテムを使用した！", "heal");



    // ちょっとしたエフェクト
    const spark = document.createElement("div");
    spark.style.width = "90px";
    spark.style.height = "90px";
    spark.style.borderRadius = "50%";
    spark.style.boxShadow = "0 0 18px 6px rgba(110,255,180,.65) inset, 0 0 24px rgba(110,255,180,.85)";
    spark.style.position = "absolute";
    const pb  = document.querySelector(".player").getBoundingClientRect();
    const app = document.querySelector(".arena").getBoundingClientRect();
    spark.style.left = (pb.left + pb.width/2 - app.left - 45) + "px";
    spark.style.top  = (pb.top  + pb.height/2 - app.top  - 45) + "px";
    $("#effectLayer").appendChild(spark);
    setTimeout(()=>spark.remove(), 450);
    log("回復アイテムを使った！", "heal");

} else if (action === "rest") {
  const mpCost = 20;
  if (p.mp < mpCost) {
    log("MPが足りない…");
    showToast("MPが足りない…");
    state.busy = false;
    setCommandsEnabled(true);
    return;
  }
  const heal = 40;
  p.hp = clamp(p.hp + heal, 0, p.maxHp);
  p.mp = clamp(p.mp - mpCost, 0, p.maxMp);
  floatText(playerBox, `+${heal}`, "heal");
  floatText(playerBox, `-${mpCost}MP`, "dmg");
  log("ひと休みして体勢を立て直した。", "heal");
}

  setBars();

  // 撃破判定
if (e.hp <= 0) {
  log(`${e.name}を倒した！`);
  state.enemyIndex++;

  const enemySprite = $("#enemySprite");
  const banner = document.getElementById("nextEnemyBanner");

  // 敵をフェードアウト＋非表示
  enemySprite.classList.add("fadeout");
  setTimeout(() => {
    enemySprite.classList.remove("fadeout");
    enemySprite.style.display = "none"; // ← 非表示
    banner.style.display = "block";
  }, 800);

  // 次の敵を遅れて表示
  setTimeout(() => {
    banner.style.display = "none";
    nextEnemy();
    $("#enemySprite").style.display = "block"; // ← 再表示
    state.busy = false;
  }, 2000);

  return;

  
    // 最終戦なら終了
    if (state.enemyIndex >= state.enemies.length){
      finishGame();
      state.busy = false;
      return; // ← ここで完全に止める
    }

    // 次の敵へ
    setTimeout(()=>{
      nextEnemy();
    }, 600);
    return;
  }

  // 睡眠でスキップ
  if (e._skipTurn){
    delete e._skipTurn;
    log(`${e.name}は眠っていて動けない！`);
    state.busy = false;
    if (!state.gameEnded) setCommandsEnabled(true);
    return;
  }

  // 敵ターンへ
  setTimeout(()=>{
    if (!state.gameEnded) enemyTurn();
  }, DIFFS[state.diffKey].delay);
}

function enemyTurn(){
  if (state.gameEnded || !state.enemy) return;

  const e = state.enemy;
  const p = state.player;
  const enemyBox  = $("#enemySprite");
  const playerBox = document.querySelector(".player-sprite");

  // スキル抽選
  let chosen = e.skills.find(s => s.name.includes("通常攻撃"));
  for (let i=0;i<e.skills.length;i++){
    const s = e.skills[i];
    if (Math.random() < (s.chance || 0)){ chosen = s; break; }
  }

  const diff  = DIFFS[state.diffKey];
  const dmgMul = diff.eDmgMul;
  let logs = [];

  const performBasic = (power)=>{
    const dmg = Math.round((power||14) * dmgMul);
    p.hp = clamp(p.hp - dmg, 0, p.maxHp);
    playerBox.classList.add("shake");
    setTimeout(()=>playerBox.classList.remove("shake"), 250);
    floatText(playerBox, `-${dmg}`, "dmg");
    logs.push(`${e.name}の ${chosen.log} ${p.name}は ${dmg} ダメージ！`);
  };

  if (chosen.type === "basic"){
    performBasic(chosen.power ?? 14);

  } else if (chosen.type === "nuke"){
    performBasic(chosen.power ?? 16);

  } else if (chosen.type === "crit"){
    const base = chosen.power ?? 12;
    const critMul = chosen.critMul ?? 1.5;
    const isCrit = Math.random() < 0.35;
    const dmg = Math.round(base * (isCrit ? critMul : 1) * dmgMul);
    p.hp = clamp(p.hp - dmg, 0, p.maxHp);
    playerBox.classList.add("shake");
    setTimeout(()=>playerBox.classList.remove("shake"), 250);
    floatText(playerBox, `-${dmg}${isCrit?"!!":""}`, isCrit ? "crit" : "dmg");
    logs.push(`${e.name}の ${chosen.name}！ ${isCrit?"痛恨の一撃！！ ":""}`);
    logs.push(`${p.name}は ${dmg} のダメージ！`);

  } else if (chosen.type === "debuff"){
    if (chosen.effect === "mpDrain"){
      const loss = chosen.value ?? 10;
      p.mp = clamp(p.mp - loss, 0, p.maxMp);
      floatText(playerBox, `-${loss}MP`, "dmg");
      logs.push(`${e.name}の ${chosen.name}！ ${chosen.log}`);
    } else {
      performBasic(12);
    }

  } else if (chosen.type === "buff"){
    if (chosen.effect === "doubleNext"){
      state.enemyDoubleNext = true;
      logs.push(`${e.name}の ${chosen.name}！ ${chosen.log}`);
    } else {
      logs.push(`${e.name}は様子を見ている…`);
    }
  }

  logs.forEach(t=>log(t));
  setBars();

  // 追撃
  if (state.enemyDoubleNext && chosen.type !== "buff"){
    state.enemyDoubleNext = false;
    setTimeout(()=>{
      if (state.gameEnded) return;
      const base = 12;
      const dmg = Math.round(base * DIFFS[state.diffKey].eDmgMul);
      p.hp = clamp(p.hp - dmg, 0, p.maxHp);
      playerBox.classList.add("shake");
      setTimeout(()=>playerBox.classList.remove("shake"), 250);
      floatText(playerBox, `-${dmg}`, "dmg");
      log(`${e.name}の 追撃！ ${p.name}は ${dmg} ダメージ！`, "dmg");
      setBars();
      finishEnemyTurn();
    }, 350);
  } else {
    finishEnemyTurn();
  }
}

function finishEnemyTurn() {
  if (state.player.hp <= 0) {
    log("あなたは眠りを妨げられてしまった…… GAME OVER");
    showToast("ゲームオーバー");

    // コマンド無効化
    setCommandsEnabled(false);

    // ゲーム画面非表示＆モーダル表示
    const gameScreen = document.getElementById("game-screen");
    const gameoverModal = document.getElementById("gameoverModal");
    if (gameScreen && gameoverModal) {
      gameScreen.classList.add("hidden");
      gameoverModal.style.display = "block";
    }

    // busyをtrueにして次のターンを止める
    state.busy = true;
    return;
  }

  // 敵の行動後、プレイヤーの操作を許可
  state.busy = false;
  setCommandsEnabled(true);
}

// ===== boot =====
window.addEventListener("DOMContentLoaded", ()=>{
  populateDiffButtons();

  $("#startBtn").addEventListener("click", startGame);
  $("#btnAttack").addEventListener("click", ()=>playerTurn("attack"));
  $("#btnSkill").addEventListener("click",  ()=>playerTurn("skill"));
  $("#btnItem").addEventListener("click",   ()=>playerTurn("item"));
  $("#btnRest").addEventListener("click",   ()=>playerTurn("rest"));
  $("#btnRetry").addEventListener("click",  ()=>location.reload());
});

function showVictoryModal(turns){
  const modal = document.getElementById("victoryModal");
  const span = document.getElementById("turnCountDisplay");
  span.textContent = turns;
  modal.style.display = "block";
}