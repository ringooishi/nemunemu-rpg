(function(){
  // Prevent double-tap/gesture zoom
  let lastTouchEnd = 0;
  document.addEventListener('touchend', function(e){
    const now = Date.now();
    if (now - lastTouchEnd <= 350) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
  document.addEventListener('gesturestart', e => e.preventDefault(), { passive: false });
})();

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
  const base = layer.getBoundingClientRect();
  const box = targetEl.getBoundingClientRect();
  tip.style.left = (box.left + box.width / 2 - base.left) + "px";
  tip.style.top  = (box.top - base.top - 20) + "px";
  layer.appendChild(tip);
  setTimeout(() => tip.remove(), 950);
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));


// ==== NIGHTMARE用ヘルパー ====
// 敵与ダメに段階補正（mods.dmgMul）と狂化（最大+30%）を適用
function nmApplyEnemyDamageMods(base){
  let out = base;
  if (state.diffKey === "NIGHTMARE" && state.enemy?.mods){
    if (state.enemy.mods.dmgMul){
      out = Math.round(out * state.enemy.mods.dmgMul);
    }
    if (state.enemy.mods.berserk){
      const maxUp = state.enemy.mods.berserk; // 例: 0.30
      const ratio = 1 + maxUp * (1 - (state.enemy.hp / state.enemy.maxHp));
      out = Math.round(out * ratio);
    }
  }
  return out;
}

// 敵ターン終了処理（NIGHTMARE再生→finish）
function nmEndEnemyTurn(){
  if (state.diffKey === "NIGHTMARE" && state.enemy?.mods?.regen){
    const e = state.enemy;
    const heal = Math.max(1, Math.round(e.maxHp * e.mods.regen));
    e.hp = Math.min(e.maxHp, e.hp + heal);
    log(`敵は再生して ${heal} 回復した`, "heal");
  }
  setBars();
  finishEnemyTurn();
}

// 自爆で敵が自滅した場合の「撃破→次の敵」処理（NIGHTMARE専用）
function nmSelfDestructDefeatedFlow(){
  // 1) 討伐カウント & アイテム +1
  state.killCount = (state.killCount || 0) + 1;
  state.player.items++;
  showToast("回復アイテム +1");
  log("回復アイテムを拾った！", "heal");
  setBars();

  // 2) フェード演出 → 次の敵
  const banner = $("#nextEnemyBanner");
  const enemySprite = $("#enemySprite");
  banner.src = "img/next_enemy.png";
  enemySprite.classList.add("fadeout");
  setTimeout(() => {
    enemySprite.classList.remove("fadeout");
    enemySprite.style.display = "none";
    banner.style.display = "block";
  }, 800);

  setTimeout(() => {
    banner.style.display = "none";
    // 次の段階へ
    state.nmStage = (state.killCount || 0) + 1;
    nextEnemy();
    state.busy = false;
  }, 2000);
}


// ===== data =====

// プレイヤーの使えるスキル一覧
const PLAYER_SKILLS = [
  { key: "moonSlash",  name: "ムーンスラッシュ", mp: 10, desc: "鋭い一閃で大ダメージを与える（30）", effect: { dmg: 30 }, log: "月光の一閃！" },
  { key: "sleepSong",  name: "スリープソング", mp: 15, desc: "小ダメージ（14）＋35%で敵をうとうと", effect: { dmg: 14, sleep: 0.35 }, log: "♪ スリープソング！" },
  { key: "healLight",  name: "ヒールライト",   mp: 12, desc: "HPを50回復する", effect: { heal: 50 }, log: "やさしい光が包んだ。" },
  { key: "manaCharge", name: "マナチャージ",   mp: 0,  desc: "MPを30回復する", effect: { mpGain: 30 }, log: "精神統一！ MPが満ちていく…" }
];

const DIFFS = {
  EASY:{label:"やさしい",pHP:120,pMP:70,items:5,eHpMul:0.85,eDmgMul:0.80,delay:900},
  NORMAL:{label:"ふつう",pHP:100,pMP:50,items:3,eHpMul:1.00,eDmgMul:1.00,delay:800},
  HARD:{label:"むずかしい",pHP:100,pMP:50,items:3,eHpMul:1.15,eDmgMul:1.15,delay:700},
  NIGHTMARE:{label:"ナイトメア",pHP:150,pMP:100,items:5,eHpMul:1.35,eDmgMul:1.30,delay:600}
};

const ENEMY_MASTERS = [
  {name:"ブルーライトの獣",baseHp:60,spriteClass:"enemy-blue",skills:[
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
  ]},
  // 追加分
  {name:"寝返りドラゴン",baseHp:300,spriteClass:"enemy-negaeri",skills:[
    {name:"布団めくり",type:"crit",power:8,chance:0.25,critMul:1.7,log:"布団がはがれた！"},
    {name:"通常攻撃",type:"basic",power:5,chance:1.00,log:"睡眠妨害攻撃！"}
  ]},
  {name:"夜食の誘惑",baseHp:75,spriteClass:"enemy-poteto",skills:[
    {name:"ポテチのささやき",type:"debuff",chance:0.30,effect:"mpDrain",value:12,log:"つい手が伸びてしまう…"},
    {name:"通常攻撃",type:"basic",power:16,chance:1.00,log:"睡眠妨害攻撃！"}
  ]},
  {name:"締切の影",baseHp:90,spriteClass:"enemy-shimekiri",skills:[
    {name:"不安の波",type:"nuke",power:19,chance:0.30,log:"胸がざわつく…！"},
    {name:"焦りの増幅",type:"buff",chance:0.25,effect:"doubleNext",log:"次のターン2回攻撃！"},
    {name:"通常攻撃",type:"basic",power:16,chance:1.00,log:"睡眠妨害攻撃！"}
  ]}
];

const RARE_ENEMY = {
  name: "眠気の妖精",
  baseHp: 1,
  spriteClass: "enemy-fairy",
  isRare: true,          // ドロップ判定に使う
  firstStrike: true,     // 出現直後に先攻
  skills: [
    { name:"癒しの粉", type:"bless", chance:1.0, log:"ふわっと癒しの粉が舞った！" }
  ]
};

// ラスボス定義
const BOSS_MASTERS = {
  bakurem: {
    name: "睡眠破壊竜バクレム",
    baseHp: 250,
    spriteClass: "enemy-boss-bakurem",
    skills: [
      {name:"悪夢の咆哮", type:"nuke", power:60, chance:0.4, log:"悪夢の咆哮が響き渡る！"},
      {name:"眠気吸収",   type:"drain", value:20, chance:0.3, log:"眠気を吸い取られた…"},
      {name:"通常攻撃",   type:"basic", power:35, chance:1.0, log:"鋭い爪で切り裂いた！"}
    ]
  }
};

// 抽選関数（重複なし）
function sampleWithoutReplacement(arr, n){
  const pool = arr.slice();
  const out = [];
  while (out.length < Math.min(n, pool.length)) {
    out.push(pool.splice(Math.floor(Math.random()*pool.length), 1)[0]);
  }
  return out;
}

// 難易度ごとの敵編成
function buildEnemySequence(diffKey){
  if (diffKey === "EASY" || diffKey === "NORMAL") {
    return ENEMY_MASTERS.slice(0, 3);
  }

  if (diffKey === "HARD") {
    const rnd = sampleWithoutReplacement(ENEMY_MASTERS, 3);
    rnd.push(BOSS_MASTERS.bakurem);
    return rnd;
  }

  if (diffKey === "NIGHTMARE") {
    const rnd = sampleWithoutReplacement(ENEMY_MASTERS, 4);
    rnd.push(BOSS_MASTERS.bakurem);
    return rnd;
  }
}


// ==== NIGHTMARE専用 アフィックス（弱めチューニング） ====
const NM_AFFIXES = [
  { key:"thorns", label:"帯電",  // 反射
    apply:(e,stage)=>{ e.mods.thorns = 0.18; }, // 18%
    desc:"受けたダメージの一部を反射"
  },
  { key:"vamp",   label:"吸血",  // 与ダメの回復
    apply:(e,stage)=>{ e.mods.vamp   = 0.25; }, // 25%
    desc:"与ダメージの一部を回復"
  },
  { key:"regen",  label:"再生",  // 毎ターン自動回復
    apply:(e,stage)=>{ e.mods.regen  = 0.05; }, // 5%/T
    desc:"毎ターン少し回復"
  },
  { key:"berserk",label:"狂化",  // 残HP少で与ダメ↑
    apply:(e,stage)=>{ e.mods.berserk = 0.30; }, // 最大+30%
    desc:"瀕死で攻撃が強化"
  },
  { key:"bomb",   label:"自爆",  // カウント→大ダメ
    apply:(e,stage)=>{ e.mods.countdown = 4; e.mods.bombRatio = 0.55; }, // 4T/55%
    desc:"カウント0で大ダメージ"
  },
];

function formatAffixName(baseName, affs){
  if (!affs?.length) return baseName;
  return `【${affs.map(a=>a.label).join("/")}】${baseName}`;
}



// ==== NIGHTMARE: 段階式ランダム敵生成 ====
function rollNightmareEnemy(){
  const stage = (state.killCount ?? 0) + 1;

  // ★ NIGHTMAREでもレア（眠気の妖精）を出す
  const rareRate = stage <= 5 ? 0.04 : stage <= 10 ? 0.06 : 0.08;
  if (Math.random() < rareRate) {
    const e = { ...RARE_ENEMY };
    e.maxHp = e.hp = 1;
    e.isRare = true;            // ドロップ3個の判定用
    return e;
  }

  const diff   = DIFFS[state.diffKey];
  const base   = ENEMY_MASTERS[Math.floor(Math.random() * ENEMY_MASTERS.length)];

  // 段階ごとのHP・与ダメの穏やかなスケーリング
  let hpMul = 1.0, dmgMul = 1.0;
  if (stage >= 6  && stage <= 10){ hpMul = 1.05; dmgMul = 1.05; }
  if (stage >= 11 && stage <= 15){ hpMul = 1.15; dmgMul = 1.12; }
  if (stage >= 16 && stage <= 20){ hpMul = 1.25; dmgMul = 1.20; }
  if (stage >= 21){                hpMul = 1.35; dmgMul = 1.30; }

  const maxHp = Math.round(base.baseHp * diff.eHpMul * hpMul);
  const enemy = {
    name: base.name,
    spriteClass: base.spriteClass,
    baseHp: base.baseHp,
    maxHp, hp: maxHp,
    skills: base.skills.map(s=>({...s})),
    isRare: false,
    firstStrike: false,
    mods: { dmgMul }
  };

  // 特性付与（段階式）
  const bag  = [...NM_AFFIXES];
  const take = () => bag.splice(Math.floor(Math.random()*bag.length),1)[0];
  const affixes = [];
  if (stage <= 5){
    if (Math.random() < 0.30) affixes.push(take());
  } else if (stage <= 10){
    affixes.push(take());
  } else {
    affixes.push(take());
    if (Math.random() < 0.50) affixes.push(take());
  }
  affixes.forEach(a => a.apply(enemy, stage));
  enemy.name = formatAffixName(enemy.name, affixes);

  // 先制は控えめ（自爆は先制なし）
  if (!enemy.mods.countdown && Math.random() < 0.25) enemy.firstStrike = true;

  return enemy;
}

// === 追加：差し替え用ヘルパー ===
function maybeInsertRare(selected, diffKey){
  // 出現率はお好みで（例：25%）
  if (Math.random() >= 0.25) return selected;

  const last = selected.length - 1;
  const blocked = new Set();

  // EASY / NORMAL…3戦目(=index 2)は出さない
  if (diffKey === "EASY" || diffKey === "NORMAL") {
    if (selected.length >= 3) blocked.add(2);
  }

  // HARD / NIGHTMARE…最後はバクレム固定
  if (diffKey === "HARD" || diffKey === "NIGHTMARE") {
    blocked.add(last);
  }

  // 差し替え可能なインデックスを抽出
  const cand = [];
  for (let i = 0; i <= last; i++){
    if (!blocked.has(i)) cand.push(i);
  }
  if (!cand.length) return selected;

  const idx = cand[Math.floor(Math.random() * cand.length)];
  selected[idx] = RARE_ENEMY;
  return selected;
}

// ===== state =====
let state = {
  diffKey: "NORMAL",
  player: { name:"勇者ねむねむ", maxHp:100, hp:100, maxMp:50, mp:50, items:3, skills: [] },
  enemyIndex: 0,
  enemies: [],
  enemy: null,
  enemyDoubleNext: false,
  busy: false,
  gameEnded: false,
  turnCount: 0,
  killCount: 0,
  nmStage: 0,   // NIGHTMARE用：何体目の敵か（1スタート）
};

// ===== UI helpers =====
function openSkillOverlay(){
  const ov = $("#skillOverlay");
  const list = $("#skillList");
  if (!ov || !list) return;

  list.innerHTML = "";
  state.player.skills.forEach(sk => {
    const li = document.createElement("li");
    li.className = "skill-item";
    li.innerHTML = `
      <div style="flex:1">
        <div class="skill-row">
          <div class="skill-name">${sk.name}</div>
          <div class="skill-cost">MP ${sk.mp}</div>
        </div>
        <div class="skill-desc">${sk.desc}</div>
      </div>
    `;
    li.addEventListener("click", () => {
      closeSkillOverlay();
      playerUseSkill(sk);
    });
    list.appendChild(li);
  });

  ov.classList.remove("hidden");
  setCommandsEnabled(false);
}

function burstHealAt(targetBox){
  const layer = $("#effectLayer");
  if (!layer || !targetBox) return;
  const spark = document.createElement("div");
  spark.style.width = "90px";
  spark.style.height = "90px";
  spark.style.borderRadius = "50%";
  spark.style.boxShadow = "0 0 18px 6px rgba(110,255,180,.65) inset, 0 0 24px rgba(110,255,180,.85)";
  spark.style.position = "absolute";
  const pb  = targetBox.getBoundingClientRect();
  const app = document.querySelector(".arena").getBoundingClientRect();
  spark.style.left = (pb.left + pb.width/2 - app.left - 45) + "px";
  spark.style.top  = (pb.top  + pb.height/2 - app.top  - 45) + "px";
  layer.appendChild(spark);
  setTimeout(()=>spark.remove(), 450);
}

function burstMpAt(targetBox){
  const layer = $("#effectLayer");
  if (!layer || !targetBox) return;
  const spark = document.createElement("div");
  spark.style.width = "90px";
  spark.style.height = "90px";
  spark.style.borderRadius = "50%";
  spark.style.boxShadow = "0 0 18px 6px rgba(110,180,255,.65) inset, 0 0 24px rgba(110,180,255,.85)";
  spark.style.position = "absolute";
  const pb  = targetBox.getBoundingClientRect();
  const app = document.querySelector(".arena").getBoundingClientRect();
  spark.style.left = (pb.left + pb.width/2 - app.left - 45) + "px";
  spark.style.top  = (pb.top  + pb.height/2 - app.top  - 45) + "px";
  layer.appendChild(spark);
  setTimeout(()=>spark.remove(), 450);
}


function closeSkillOverlay(){
  const ov = $("#skillOverlay");
  if (ov) ov.classList.add("hidden");
  if (!state.busy && !state.gameEnded) setCommandsEnabled(true);
}

function setBars(){
  const { player, enemy } = state;
  const hpFill = $("#playerHpBar");
  const mpFill = $("#playerMpBar");
  const ehpFill = $("#enemyHpBar");

  hpFill.style.width = (player.hp/player.maxHp*100) + "%";
  mpFill.style.width = (player.mp/player.maxMp*100) + "%";
  ehpFill.style.width = enemy ? (enemy.hp/enemy.maxHp*100) + "%" : "0%";

  $("#playerHpWrap").setAttribute("data-value", `${player.hp}/${player.maxHp}`);
  $("#playerMpWrap").setAttribute("data-value", `${player.mp}/${player.maxMp}`);
  $("#enemyHpWrap").setAttribute("data-value", enemy ? `${enemy.hp}/${enemy.maxHp}` : `--/--`);
  hpFill.setAttribute("data-value", `${player.hp}/${player.maxHp}`);
  mpFill.setAttribute("data-value", `${player.mp}/${player.maxMp}`);
  ehpFill.setAttribute("data-value", enemy ? `${enemy.hp}/${enemy.maxHp}` : `--/--`);

  $("#itemPill").textContent = `回復アイテムx${player.items}`;
}

function setCommandsEnabled(v){
  $("#btnAttack").disabled = !v;
  $("#btnSkill").disabled  = !v;
  $("#btnItem").disabled   = !v;
  $("#btnRest").disabled   = !v;
}

function setDifficultyPill(){
  const k = state.diffKey;
  if (k === "NIGHTMARE"){
    $("#difficultyPill").textContent = `${k} Kills:${state.killCount}`;
    return;
  }
  const total = state.enemies?.length || 0;
  const current = (total && state.enemyIndex < total) ? (state.enemyIndex + 1) : 0;
  const text = total ? `${k} ${current}/${total}` : `${k}`;
  $("#difficultyPill").textContent = text;
}

function populateDiffButtons(){
  const row = $("#difficultyRow");
  row.innerHTML = "";
  ["EASY","NORMAL","HARD","NIGHTMARE"].forEach(k=>{
    const d = document.createElement("div");
    d.className = "diff" + (k==="NORMAL" ? " active" : "");
    d.textContent = k;
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

  // スキルロード
  state.player.skills = PLAYER_SKILLS.map(s => ({ ...s }));

  // 敵リスト生成（数と順序は難易度で決定）
  let selected;

  if (state.diffKey === "NIGHTMARE"){
    // エンドレス：配列は使わず、その都度ランダム生成
    selected = []; // ダミー（使わない）
    state.killCount = 0;   // ★ キル数リセット
  } else {
    selected = buildEnemySequence(state.diffKey);
    // ★ レア敵を条件付きで差し込む（E/Nの3戦目NG、H/NMは最後NG）
    selected = maybeInsertRare(selected, state.diffKey);
  }

  // state初期化
  if (state.diffKey === "NIGHTMARE"){
    state.killCount = 0;
    state.nmStage   = 1; // 1体目から
  } else {
    state.enemies = selected.map(m=>{
      const diff = DIFFS[state.diffKey];
      const hp = Math.round(m.baseHp * diff.eHpMul);
      return {
        name: m.name,
        spriteClass: m.spriteClass,
        baseHp: m.baseHp,
        maxHp: hp, hp: hp,
        skills: m.skills.map(s=>({...s})),
        isRare: m.isRare || false,
        firstStrike: m.firstStrike || false
      };
    });
    state.enemyIndex = 0;
  }
  state.enemy = null;
  state.enemyDoubleNext = false;
  state.busy = false;
  state.gameEnded = false;
  state.turnCount = 0;

  $("#start-screen").classList.add("hidden");
  $("#game-screen").classList.remove("hidden");
  setDifficultyPill();

  $("#playerNameLabel").textContent = state.player.name;

  const psp = document.querySelector(".player-sprite");
  if (psp) psp.classList.add("player-img");

  nextEnemy();
}

function nextEnemy(){
  // === NIGHTMARE: 毎回ランダム生成 ===
  if (state.diffKey === "NIGHTMARE"){
    state.enemy = rollNightmareEnemy();

    const enemySprite = $("#enemySprite");
    enemySprite.className = "sprite enemy-sprite " + (state.enemy.spriteClass || "");
    enemySprite.classList.remove("shake");
    enemySprite.style.display = "block";

    setDifficultyPill();
    $("#enemyNameLabel").textContent = state.enemy.name;
    setBars();
    log(`魔物が現れた！: ${state.enemy.name}`);
    setCommandsEnabled(true);
    state.busy = false;

    if (state.enemy.firstStrike) {
      state.busy = true;
      setCommandsEnabled(false);
      setTimeout(()=> enemyTurn(), 400);
    }

    // エンドレスではバナーは通常版
    const banner = $("#nextEnemyBanner");
    banner.src = "img/next_enemy.png";
    return; // ★このreturnは関数の中にあります
  }

  // === 通常/HARDコース ===
  if (state.enemyIndex >= state.enemies.length){
    finishGame();
    return;
  }
  state.enemy = { ...state.enemies[state.enemyIndex] };

  const enemySprite = $("#enemySprite");
  enemySprite.className = "sprite enemy-sprite " + (state.enemy.spriteClass || "");
  enemySprite.classList.remove("shake");
  enemySprite.style.display = "block";

  setDifficultyPill();
  $("#enemyNameLabel").textContent = state.enemy.name;
  setBars();
  log(`魔物が現れた！: ${state.enemy.name}`);
  setCommandsEnabled(true);
  state.busy = false;

  if (state.enemy.firstStrike) {
    state.busy = true;
    setCommandsEnabled(false);
    setTimeout(()=> enemyTurn(), 400);
  }

  const banner = $("#nextEnemyBanner");
  if (state.enemy.name === "睡眠破壊竜バクレム") {
    banner.src = "img/last_boss.png";
  } else {
    banner.src = "img/next_enemy.png";
  }
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
    // スキルはオーバーレイへ
    openSkillOverlay();
    state.busy = false; // 入力待ち
    return;

  } else if (action === "item") {
    // ===== アイテム使用（HP/MP回復） =====
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
    const playerFig = document.querySelector(".player");
    burstHealAt(playerFig);
    burstMpAt(playerFig);
    log("回復アイテムを使用した！", "heal");

    setBars();

    // 敵ターンへ
    setTimeout(()=>{
      if (!state.gameEnded) enemyTurn();
    }, DIFFS[state.diffKey].delay);
    return;

  } else if (action === "rest") {
    // ===== ガード =====
    state.player.isGuarding = true;
    floatText(playerBox, `GUARD`, "heal");
    log("防御体勢！ 次の敵のこうげきを無効化する。");
  }

  setBars();
  if (e.hp <= 0) {
    log(`${e.name}を倒した！`);

    if (state.diffKey === "NIGHTMARE"){
  state.killCount++;

  // ★ ドロップ数：妖精なら3、通常は1
  const dropCount = (state.enemy?.isRare ? 3 : 1);
  state.player.items += dropCount;
  showToast(`回復アイテム +${dropCount}`);
  log(dropCount === 3 ? "眠気の妖精が回復アイテムを3個落とした！" : "回復アイテムを拾った！", "heal");
  setBars();

  const banner = $("#nextEnemyBanner");
  const enemySprite = $("#enemySprite");
  banner.src = "img/next_enemy.png";

  enemySprite.classList.add("fadeout");
  setTimeout(() => {
    enemySprite.classList.remove("fadeout");
    enemySprite.style.display = "none";
    banner.style.display = "block";
  }, 800);

  setTimeout(() => {
    banner.style.display = "none";
    nextEnemy();
    state.busy = false;
  }, 2000);
  return;
}

    // 通常コース（既存）
    state.enemyIndex++;

    const banner = $("#nextEnemyBanner");
    const enemySprite = $("#enemySprite");
    const next = state.enemies[state.enemyIndex];
    banner.src = (next && next.name === "睡眠破壊竜バクレム") ? "img/last_boss.png" : "img/next_enemy.png";

    enemySprite.classList.add("fadeout");
    setTimeout(() => {
      enemySprite.classList.remove("fadeout");
      enemySprite.style.display = "none";
      banner.style.display = "block";
    }, 800);

    setTimeout(() => {
      banner.style.display = "none";
      nextEnemy();
      state.busy = false;
    }, 2000);
    return;
  } // ← ここで e.hp<=0 ブロックを閉じる！

  // 敵ターンへ（スキル/アイテム以外）
  setTimeout(()=>{
    if (!state.gameEnded) enemyTurn();
  }, DIFFS[state.diffKey].delay);
}

function playerUseSkill(sk){
  if (state.busy || state.gameEnded || !state.enemy) return;

  const p = state.player;
  const e = state.enemy;
  const enemyBox  = $("#enemySprite");
  const playerBox = document.querySelector(".player-sprite");

  if (p.mp < sk.mp){
    log("MPが足りない…");
    showToast("MPが足りない…");
    return;
  }

  state.busy = true;
  setCommandsEnabled(false);
  state.turnCount++;

  // コスト消費
  p.mp = clamp(p.mp - sk.mp, 0, p.maxMp);

  // 効果適用
  let didAttack = false;
  if (sk.effect.dmg){
    const dmg = sk.effect.dmg;
    e.hp = clamp(e.hp - dmg, 0, e.maxHp);
    didAttack = true;
    enemyBox.classList.add("shake");
    setTimeout(()=>enemyBox.classList.remove("shake"), 250);
    floatText(enemyBox, `-${dmg}`, "dmg");
  }
  if (sk.effect.sleep){
    const slept = Math.random() < sk.effect.sleep;
    if (slept) e._skipTurn = true;
  }
  if (sk.effect.heal){
    const heal = sk.effect.heal;
    p.hp = clamp(p.hp + heal, 0, p.maxHp);
    floatText(playerBox, `+${heal}`, "heal");
    burstHealAt(document.querySelector(".player"));
    log(`${p.name}はHPを ${heal} 回復！`, "heal");
  }
  if (sk.effect.mpGain){
    const g = sk.effect.mpGain;
    p.mp = clamp(p.mp + g, 0, p.maxMp);
    floatText(playerBox, `+${g}MP`, "heal");
    burstMpAt(document.querySelector(".player"));
    log(`${p.name}のMPが ${g} 回復！`, "mp");
  }

  log(sk.log || `${p.name}はスキルを使った！`, didAttack ? "dmg" : "heal");
  setBars();

  // ★ ここで撃破チェック → モード別に遷移
  if (e.hp <= 0){
    log(`${e.name}を倒した！`);

    if (state.diffKey === "NIGHTMARE"){
      state.killCount++;

      // 妖精だけドロップ3、通常は1
      const dropCount = (state.enemy?.isRare ? 3 : 1);
      state.player.items += dropCount;
      showToast(`回復アイテム +${dropCount}`);
      log(dropCount === 3 ? "眠気の妖精が回復アイテムを3個落とした！" : "回復アイテムを拾った！", "heal");
      setBars();

      const banner = $("#nextEnemyBanner");
      const enemySprite = $("#enemySprite");
      banner.src = "img/next_enemy.png";

      enemySprite.classList.add("fadeout");
      setTimeout(() => {
        enemySprite.classList.remove("fadeout");
        enemySprite.style.display = "none";
        banner.style.display = "block";
      }, 800);

      setTimeout(() => {
        banner.style.display = "none";
        nextEnemy();
        state.busy = false;
      }, 2000);
      return;
    }

    // 通常コース
    state.enemyIndex++;
    const banner = $("#nextEnemyBanner");
    const enemySprite = $("#enemySprite");
    const next = state.enemies[state.enemyIndex];
    banner.src = (next && next.name === "睡眠破壊竜バクレム") ? "img/last_boss.png" : "img/next_enemy.png";

    enemySprite.classList.add("fadeout");
    setTimeout(() => {
      enemySprite.classList.remove("fadeout");
      enemySprite.style.display = "none";
      banner.style.display = "block";
    }, 800);

    setTimeout(() => {
      banner.style.display = "none";
      nextEnemy();
      state.busy = false;
    }, 2000);
    return;
  }

  // ★ 敵ターンへ（眠りスキップは enemyTurn 内で処理）
  setTimeout(()=>{
    if (!state.gameEnded) enemyTurn();
  }, DIFFS[state.diffKey].delay);
}





// ======================================================
// ここから本体：クリーンな enemyTurn()
// ======================================================
function enemyTurn(){
  if (state.gameEnded || !state.enemy) return;

  const e = state.enemy;
  const p = state.player;
  const enemyBox  = $("#enemySprite");
  const playerBox = document.querySelector(".player-sprite");

  // --- NIGHTMARE: 自爆カウント ---
  if (state.diffKey === "NIGHTMARE" && e?.mods?.countdown != null){
    e.mods.countdown--;
    const c = e.mods.countdown;
    if (c > 0){
      log(`カウントダウン: ${c}`, "warn");
    } else if (c === 0){
      const ratio = e.mods.bombRatio || 0.55;
      const boom = Math.max(20, Math.round(e.maxHp * ratio));
      log("💥 自爆！", "warn");
      p.hp = clamp(p.hp - boom, 0, p.maxHp);
      e.hp = 0; // 自滅
      setBars();
      if (p.hp <= 0){
        finishEnemyTurn();
        return;
      } else {
        nmSelfDestructDefeatedFlow();
        return;
      }
    }
  }

  // バクレムの交互行動
  if (e.name === "睡眠破壊竜バクレム") {
    e._altTurn = !e._altTurn;
    if (e._altTurn) {
      if (p.isGuarding) p.isGuarding = false;
      log(`${e.name}は様子を見ている…`);
      setBars();
      nmEndEnemyTurn(); // 再生を考慮
      return;
    }
  }

  // スリープで1Tスキップ
  if (e._skipTurn){
    delete e._skipTurn;
    log(`${e.name}は眠っていて動けない！`);
    nmEndEnemyTurn();
    return;
  }

  // スキル抽選
  const pool = e.skills.filter(s => Math.random() < (s.chance ?? 1));
  const chosen = pool[Math.floor(Math.random()*pool.length)]
              || e.skills.find(s => s.type === "basic")
              || e.skills[0];

  const diff  = DIFFS[state.diffKey];
  const dmgMul = diff.eDmgMul;
  let logs = [];

  const nullifiedByGuard = () => {
    floatText(playerBox, `GUARD`, "heal");
    logs.push(`${p.name}はガードで攻撃を無効化した！`);
    p.isGuarding = false;
    logs.forEach(t=>log(t));
    nmEndEnemyTurn(); // 再生もここで
  };

  const performBasic = (power)=>{
    let dmg = Math.round((power||14) * dmgMul);
    dmg = nmApplyEnemyDamageMods(dmg);              // 段階補正＆狂化
    p.hp = clamp(p.hp - dmg, 0, p.maxHp);
    playerBox.classList.add("shake");
    setTimeout(()=>playerBox.classList.remove("shake"), 250);
    floatText(playerBox, `-${dmg}`, "dmg");
    logs.push(`${e.name}の ${chosen.log || chosen.name} ${p.name}は ${dmg} ダメージ！`);

    // 吸血（drainは二重回復防止で除外）
    if (state.diffKey === "NIGHTMARE" && e?.mods?.vamp && dmg > 0 && chosen.type !== "drain"){
      const heal = Math.max(1, Math.round(dmg * e.mods.vamp));
      e.hp = clamp(e.hp + heal, 0, e.maxHp);
      logs.push(`敵は吸血し ${heal} 回復した！`);
    }
  };

  // ガード無効判定
  if (["basic","nuke","crit","debuff","drain"].includes(chosen.type)){
    if (p.isGuarding){
      nullifiedByGuard();
      return;
    }
  }

  // タイプ別処理
  if (chosen.type === "basic"){
    performBasic(chosen.power ?? 14);

  } else if (chosen.type === "nuke"){
    performBasic(chosen.power ?? 16);

  } else if (chosen.type === "crit"){
    const base = chosen.power ?? 12;
    const critMul = chosen.critMul ?? 1.5;
    const isCrit = Math.random() < 0.35;

    let dmg = Math.round(base * (isCrit ? critMul : 1) * dmgMul);
    dmg = nmApplyEnemyDamageMods(dmg);              // 段階補正＆狂化

    p.hp = clamp(p.hp - dmg, 0, p.maxHp);
    playerBox.classList.add("shake");
    setTimeout(()=>playerBox.classList.remove("shake"), 250);
    floatText(playerBox, `-${dmg}${isCrit?"!!":""}`, isCrit ? "crit" : "dmg");
    logs.push(`${e.name}の ${chosen.name}！ ${isCrit?"痛恨の一撃！！ ":""}`);
    logs.push(`${p.name}は ${dmg} のダメージ！`);

    if (state.diffKey === "NIGHTMARE" && e?.mods?.vamp && dmg > 0){
      const heal = Math.max(1, Math.round(dmg * e.mods.vamp));
      e.hp = clamp(e.hp + heal, 0, e.maxHp);
      logs.push(`敵は吸血し ${heal} 回復した！`);
    }

  } else if (chosen.type === "debuff"){
    if (chosen.effect === "mpDrain"){
      const loss = chosen.value ?? 10;
      p.mp = clamp(p.mp - loss, 0, p.maxMp);
      floatText(playerBox, `-${loss}MP`, "dmg");
      logs.push(`${e.name}の ${chosen.name}！ ${chosen.log}`);
      logs.push(`${p.name}のMPが ${loss} 減少！`);
    } else {
      performBasic(12);
    }

  } else if (chosen.type === "bless"){
    const healHp = p.maxHp - p.hp;
    const healMp = p.maxMp - p.mp;
    p.hp = p.maxHp;
    p.mp = p.maxMp;
    floatText(playerBox, `FULL`, "heal");
    if (healHp > 0) floatText(playerBox, `+${healHp}`, "heal");
    if (healMp > 0) floatText(playerBox, `+${healMp}MP`, "heal");
    burstHealAt(document.querySelector(".player"));
    logs.push(`${e.name}の ${chosen.name}！ ${chosen.log}`);
    if (healHp > 0) logs.push(`${p.name}はHPを ${healHp} 回復！`);
    if (healMp > 0) logs.push(`${p.name}のMPが ${healMp} 回復！`);

  } else if (chosen.type === "drain"){
    let amount = chosen.value ?? 15;
    amount = Math.round(amount * dmgMul);
    amount = nmApplyEnemyDamageMods(amount);        // 段階補正＆狂化

    p.hp = clamp(p.hp - amount, 0, p.maxHp);
    e.hp = clamp(e.hp + amount, 0, e.maxHp);

    playerBox.classList.add("shake");
    setTimeout(()=>playerBox.classList.remove("shake"), 250);
    floatText(playerBox, `-${amount}`, "dmg");
    floatText($("#enemySprite"), `+${amount}`, "heal");

    logs.push(`${e.name}の ${chosen.name}！ ${chosen.log}`);
    logs.push(`${p.name}は ${amount} のHPを吸い取られた！`);
    logs.push(`${e.name}のHPが ${amount} 回復！`);

  } else if (chosen.type === "buff"){
    if (p.isGuarding) p.isGuarding = false;
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
    setTimeout(()=>{
      if (state.gameEnded) return;
      if (p.isGuarding){
        floatText(playerBox, `GUARD`, "heal");
        log(`${p.name}はガードで追撃も無効化した！`);
        p.isGuarding = false;
        state.enemyDoubleNext = false;
        setBars();
        nmEndEnemyTurn();
        return;
      }
      const base = 12;
      let dmg = Math.round(base * DIFFS[state.diffKey].eDmgMul);
      dmg = nmApplyEnemyDamageMods(dmg);            // 段階補正＆狂化

      p.hp = clamp(p.hp - dmg, 0, p.maxHp);
      playerBox.classList.add("shake");
      setTimeout(()=>playerBox.classList.remove("shake"), 250);
      floatText(playerBox, `-${dmg}`, "dmg");
      log(`${e.name}の 追撃！ ${p.name}は ${dmg} ダメージ！`, "dmg");
      setBars();
      nmEndEnemyTurn();
    }, 350);
  } else {
    nmEndEnemyTurn();
  }
}

function finishEnemyTurn() {
  if (state.player.hp <= 0) {
    log("あなたは眠りを妨げられてしまった…… GAME OVER");
    showToast("ゲームオーバー");
    setCommandsEnabled(false);
    const gameScreen = $("#game-screen");
    const gameoverModal = $("#gameoverModal");
    if (gameScreen && gameoverModal) {
      gameScreen.classList.add("hidden");
      gameoverModal.style.display = "block";
      
      
     // ★ NIGHTMARE専用：スコア記録ボタン設定
if (state.diffKey === "NIGHTMARE"){
  const snapshotNM = {
    name: state.player.name,
    diff: "NIGHTMARE",
    kills: state.killCount || 0,
    date: new Date().toISOString()
  };
  const saveBtnNM = $("#btnSaveScoreNM");
  if (saveBtnNM){
    saveBtnNM.onclick = async ()=>{
      addLocalScore(snapshotNM);
      showToast("この端末に記録しました");
      // オンラインにも投げたい場合（任意）
      if (ONLINE_SCOREBOARD_URL){
        const ok = confirm("オンラインのスコアボードにも登録しますか？（全員に公開されます）");
        if (ok){
          const r = await postOnlineScore(snapshotNM);
          showToast(r.ok ? "オンラインへ記録しました" : "送信に失敗しました");
        }
      }
    };
  }
  const openBtnNM = $("#btnOpenBoardNM");
  if (openBtnNM){
    openBtnNM.onclick = async ()=>{
      $("#gameoverModal").style.display = "none";
      $("#scoreOverlay").classList.remove("hidden");
      const list = (SCORE_SOURCE === "local") ? loadLocalScores() : await fetchOnlineScores();
      renderScoresFiltered(list);
    };
  }
} 

// スコアボード閉じるボタン
document.getElementById('closeScore')?.addEventListener('click', () => {
  document.getElementById('scoreOverlay')?.classList.add('hidden');
  const gom = document.getElementById('gameoverModal');
  if (gom && gom.style) gom.style.display = 'block';
});

// スコアボード背景クリックでも閉じる
document.getElementById('scoreOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'scoreOverlay') {
    document.getElementById('scoreOverlay')?.classList.add('hidden');
    const gom = document.getElementById('gameoverModal');
    if (gom && gom.style) gom.style.display = 'block';
  }
});
      
// ★ NIGHTMARE の戦績表示を固定行へ
if (state.diffKey === "NIGHTMARE"){
  const slot = document.getElementById("nmResult");
  if (slot) slot.textContent = `今回の討伐数：${state.killCount} 体`;
}
      
    }
    state.busy = true;
    return;
  }
  state.busy = false;
  setCommandsEnabled(true);
}




// === スコアボード：設定 ===
// ====== 接続先 ======
const ONLINE_SCOREBOARD_URL = 'https://script.google.com/macros/s/AKfycbxjUXeKPf6xdeXhxL3cVO7QLc2_P135E0AuzksJZLj9Ktu3I-d9oAvxzWT9O-LqTfw/exec';

// ====== 送信（登録） ======
async function postOnlineScore(snapshotNM){
  try{
    const r = await fetch(ONLINE_SCOREBOARD_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshotNM),
      mode: 'cors',
    });
    return await r.json();
  }catch(err){
    return { ok:false, error:String(err) };
  }
}

// ====== 取得（ランキング表示用） ======
async function fetchOnlineScores(top=50){
  try{
    const r = await fetch(`${ONLINE_SCOREBOARD_URL}?top=${encodeURIComponent(top)}`, {
      method: 'GET',
      mode: 'cors',
    });
    const data = await r.json();
    return data.list || [];
  }catch(err){
    console.error(err);
    return [];
  }
}







// === ローカル保存 ===
function loadLocalScores(){
  try { return JSON.parse(localStorage.getItem("nrscores") || "[]"); } catch { return []; }
}
function saveLocalScores(list){
  localStorage.setItem("nrscores", JSON.stringify(list));
}
function addLocalScore(entry){
  const list = loadLocalScores();
  list.push(entry);
  // NIGHTMARE専用：討伐数が多い順に上位20件
  list.sort((a,b)=>{
    // 後方互換：古いデータ(turns)が混じってもNIGHTMAREのみ残す想定だが一応ケア
    const ak = (typeof a.kills === "number") ? -a.kills : Infinity; // kills大きいほど先頭
    const bk = (typeof b.kills === "number") ? -b.kills : Infinity;
    return ak - bk || a.date.localeCompare(b.date);
  });
  saveLocalScores(list.slice(0,20));
}




let SCORE_SOURCE = "local";   // "local" or "online"
let SCORE_DIFF   = "NIGHTMARE"; // 固定
function renderScoresFiltered(rawList){
  const list = rawList.filter(s => s.diff === "NIGHTMARE");
  renderScores(list);
}


// === 描画 ===
function renderScores(list){
  const box = $("#scoreList");
  if (!box) return;

  // NIGHTMARE専用に絞る（保険）
  const nmOnly = list.filter(s => s.diff === "NIGHTMARE");

  if (!nmOnly.length){
    box.innerHTML = `<p class="small">まだ記録がありません。</p>`;
    return;
  }

  // kills の降順で並べ替え（セーフティ）
  nmOnly.sort((a,b)=> (b.kills||0) - (a.kills||0) || a.date.localeCompare(b.date));

  const rows = nmOnly.map((s,i)=>`
    <tr>
      <td>${i+1}</td>
      <td>${s.name}</td>
      <td>${s.kills ?? 0}体</td>
      <td class="small">${new Date(s.date).toLocaleString()}</td>
    </tr>`).join("");

  box.innerHTML = `
    <table>
      <thead><tr><th>#</th><th>名前</th><th>討伐数</th><th>日時</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
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

  // スキルオーバーレイ
  $("#skillClose")?.addEventListener("click", closeSkillOverlay);
  $("#skillOverlay")?.addEventListener("click", (e)=>{
    if (e.target.id === "skillOverlay") closeSkillOverlay();
  });

  // スコアボード
  $("#btnCloseBoard")?.addEventListener("click", ()=> backToTitle());
  $("#scoreOverlay")?.addEventListener("click", (e)=>{
    if (e.target.id === "scoreOverlay") backToTitle();
  });
  $("#tabLocal")?.addEventListener("click", ()=>{
    SCORE_SOURCE = "local"; renderScoresFiltered(loadLocalScores());
  });
  $("#tabOnline")?.addEventListener("click", async ()=>{
    SCORE_SOURCE = "online"; renderScoresFiltered(await fetchOnlineScores());
  });
  document.querySelectorAll("#diffTabs [data-diff]")?.forEach(btn=>{
    btn.addEventListener("click", async ()=>{
      SCORE_DIFF = btn.dataset.diff || "ALL";
      const list = SCORE_SOURCE === "local" ? loadLocalScores() : await fetchOnlineScores();
      renderScoresFiltered(list);
    });
  });
}); // ←ここが抜けてないか確認！

function showVictoryModal(turns){
  const modal = document.getElementById("victoryModal");
  const span = document.getElementById("turnCountDisplay");
  span.textContent = turns;
  modal.style.display = "block";

  // 勝利時の記録用データ
  const snapshot = {
    name: state.player.name,
    diff: state.diffKey,
    turns: turns,
    date: new Date().toISOString()
  };

  // 記録ボタン
  const saveBtn = $("#btnSaveScore");
  if (saveBtn){
    saveBtn.onclick = async ()=>{
      // まず端末ローカルに保存
      addLocalScore(snapshot);
      showToast("この端末に記録しました");

      // オンラインURLが設定されていれば、送信するか確認
      if (ONLINE_SCOREBOARD_URL){
        const ok = confirm("オンラインのスコアボードにも登録しますか？（全員に公開されます）");
        if (ok){
          const r = await postOnlineScore(snapshot);
          showToast(r.ok ? "オンラインへ記録しました" : "送信に失敗しました");
        }
      }
    };
  }

  // スコアボードを開く
 const openBtn = $("#btnOpenBoard");
 if (openBtn){
  openBtn.onclick = async ()=>{
    // 勝利モーダルは閉じて、スコアボードを前面に
    document.getElementById("victoryModal").style.display = "none";
    $("#scoreOverlay").classList.remove("hidden");

    // 初期表示：この端末 / 今回の難易度
    SCORE_SOURCE = "local";
    SCORE_DIFF   = state.diffKey; // 例: "EASY"
    renderScoresFiltered(loadLocalScores());
  };
 }
}


function backToTitle(){
  $("#scoreOverlay")?.classList.add("hidden");
  const v = document.getElementById("victoryModal");
  if (v) v.style.display = "none";
  const g = document.getElementById("game-screen");
  const s = document.getElementById("start-screen");
  if (g) g.classList.add("hidden");
  if (s) s.classList.remove("hidden");
  // ゲーム状態リセットしたい場合は reload でもOK：
  // location.reload();
}


window.addEventListener("DOMContentLoaded", ()=>{
  populateDiffButtons();        // 難易度ボタン生成
  $("#startBtn")?.addEventListener("click", startGame);
});


document.getElementById('closeScore')?.addEventListener('click', () => {
  document.getElementById('scoreOverlay')?.classList.add('hidden');
  const gom = document.getElementById('gameoverModal');
  if (gom && gom.style) gom.style.display = 'block';
});

document.getElementById('scoreOverlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'scoreOverlay') {
    document.getElementById('scoreOverlay')?.classList.add('hidden');
    const gom = document.getElementById('gameoverModal');
    if (gom && gom.style) gom.style.display = 'block';
  }
});
