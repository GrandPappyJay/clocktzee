import { useState, useEffect, useRef, createContext, useContext } from "react";
import { db } from "./firebase";
import {
  collection, doc, getDoc, setDoc, onSnapshot, addDoc,
  query, orderBy, writeBatch, getDocs, updateDoc, deleteDoc,
} from "firebase/firestore";

// ─── VERSION ──────────────────────────────────────────────────────────────────
const VERSION = "1.5.0";

// ─── GRUVBOX PALETTES ─────────────────────────────────────────────────────────
const GV_DARK = {
  bg:      "#282828", bg0:     "#1d2021", bg1:     "#3c3836", bg2:     "#504945",
  bg3:     "#665c54", bg4:     "#7c6f64", fg:      "#ebdbb2", fg1:     "#d5c4a1",
  fg2:     "#bdae93", fg3:     "#a89984", red:     "#cc241d", redB:    "#fb4934",
  green:   "#98971a", greenB:  "#b8bb26", yellow:  "#d79921", yellowB: "#fabd2f",
  blue:    "#458588", blueB:   "#83a598", purple:  "#b16286", purpleB: "#d3869b",
  aqua:    "#689d6a", aquaB:   "#8ec07c", orange:  "#d65d0e", orangeB: "#fe8019",
};

const GV_LIGHT = {
  bg:      "#fbf1c7", bg0:     "#f9f5d7", bg1:     "#ebdbb2", bg2:     "#d5c4a1",
  bg3:     "#bdae93", bg4:     "#a89984", fg:      "#3c3836", fg1:     "#504945",
  fg2:     "#665c54", fg3:     "#7c6f64", red:     "#cc241d", redB:    "#9d0006",
  green:   "#98971a", greenB:  "#79740e", yellow:  "#d79921", yellowB: "#b57614",
  blue:    "#458588", blueB:   "#076678", purple:  "#b16286", purpleB: "#8f3f71",
  aqua:    "#689d6a", aquaB:   "#427b58", orange:  "#d65d0e", orangeB: "#af3a03",
};

// ─── THEME CONTEXT ────────────────────────────────────────────────────────────
const ThemeContext = createContext(GV_DARK);

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const HALL_OF_FAME_DEFAULT = [
  { number: "420",  label: "420 🌿",            points: 40 },
  { number: "404",  label: "404 Not Found",      points: 40 },
  { number: "666",  label: "The Beast",          points: 40 },
  { number: "777",  label: "Lucky 7s",           points: 40 },
  { number: "1337", label: "Leet",               points: 40 },
  { number: "007",  label: "Bond",               points: 40 },
  { number: "42",   label: "The Answer",         points: 40 },
  { number: "69",   label: "Classic",            points: 40 },
  { number: "911",  label: "Emergency",          points: 40 },
  { number: "1234", label: "Too Easy",           points: 40 },
  { number: "8008", label: "Calculator Classic", points: 40 },
];

const CATEGORIES = [
  "Clock / Time", "Street Address", "Purchase Total", "Odometer / Mileage",
  "Phone Number", "Receipt Number", "Random Signage", "Birthday Find",
  "Hall of Fame", "Other",
];

const EMOJI_OPTIONS = [
  "👴","👩","🎵","🧢","⭐","🌟","🎯","🎲","🚀","💎",
  "🦊","🐯","🦁","🐻","🐼","🎸","🏆","🔥","💥","🎪",
  "🧙","👑","🤖","👾","🎭","🌈","⚡","🍕","🎮","🏀",
  "🧶","🧦","🎩","🦄","🐉","🌵","🍀","🎻","🥷","🦸",
];

const COLOR_OPTIONS = [
  GV_DARK.orangeB, GV_DARK.purpleB, GV_DARK.blueB,   GV_DARK.greenB,  GV_DARK.yellowB,
  GV_DARK.redB,    GV_DARK.aquaB,   GV_DARK.orange,   GV_DARK.purple,  GV_DARK.blue,
  GV_DARK.green,   GV_DARK.yellow,  GV_DARK.fg,       GV_DARK.fg2,     GV_DARK.aqua,
];

const REACTIONS = ["🔥","😂","🤯","👀","💯"];

const IMAGE_TTL_MS = 48 * 60 * 60 * 1000;

// ─── PERIOD HELPERS ───────────────────────────────────────────────────────────

function getPeriodKey(date, mode) {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (mode === "monthly") return `${y}-${String(m).padStart(2,"0")}`;
  const q = Math.ceil(m / 3);
  return `${y}-Q${q}`;
}

function getPeriodLabel(key, mode) {
  if (mode === "monthly") {
    const [y, m] = key.split("-");
    return new Date(parseInt(y), parseInt(m) - 1, 1)
      .toLocaleString("default", { month: "long", year: "numeric" });
  }
  const [y, q] = key.split("-");
  const qNum = parseInt(q.replace("Q",""));
  const months = ["","Jan–Mar","Apr–Jun","Jul–Sep","Oct–Dec"];
  return `${months[qNum]} ${y}`;
}

function getPeriodResetDates(mode) {
  if (mode === "monthly") return "1st of every month";
  return "Jan 1, Apr 1, Jul 1, Oct 1";
}

// ─── SCORING ENGINE ───────────────────────────────────────────────────────────

function extractDigits(raw) { return raw.replace(/\D/g, ""); }

function scoreDigits(digits) {
  if (!digits || digits.length < 2) return { name: "No Pattern", points: 0 };
  const counts = {};
  for (const d of digits) counts[d] = (counts[d] || 0) + 1;
  const vals = Object.values(counts).sort((a, b) => b - a);

  if (vals[0] >= 5) return { name: "Five of a Kind 🎰", points: 100 };

  const hasStraightRun = (d, runLen) => {
    for (let i = 0; i <= d.length - runLen; i++) {
      const slice = d.slice(i, i + runLen);
      let asc = true, desc = true;
      for (let j = 1; j < slice.length; j++) {
        if (parseInt(slice[j]) !== parseInt(slice[j-1]) + 1) asc = false;
        if (parseInt(slice[j]) !== parseInt(slice[j-1]) - 1) desc = false;
      }
      if (asc || desc) return true;
    }
    return false;
  };
  if (hasStraightRun(digits, 5) || hasStraightRun(digits, 4))
    return { name: "Straight 📈", points: 80 };
  if (vals[0] >= 4) return { name: "Four of a Kind 🔥", points: 60 };
  if (vals[0] >= 3 && vals[1] >= 2) return { name: "Full House 🏠", points: 50 };
  if (hasStraightRun(digits, 3)) return { name: "Small Straight 📉", points: 40 };
  if (vals[0] >= 3) return { name: "Three of a Kind ✨", points: 30 };
  if (vals[0] >= 2 && vals[1] >= 2) return { name: "Two Pair 👀", points: 20 };
  return { name: "No Pattern", points: 0 };
}

function checkBirthday(digits, birthdays) {
  const today = new Date();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();
  for (const [pid, bday] of Object.entries(birthdays)) {
    if (!bday || bday.month !== todayM || bday.day !== todayD) continue;
    const mm = String(bday.month).padStart(2,"0");
    const dd = String(bday.day).padStart(2,"0");
    const m  = String(bday.month);
    const d  = String(bday.day);
    for (const pat of [mm+dd, m+dd, mm+d, m+d]) {
      if (digits === pat) return { playerId: pid, bonus: 25 };
    }
  }
  return null;
}

function checkHallOfFame(digits, hofList) {
  for (const hof of hofList) {
    const pat = hof.number;
    if (digits === pat) return hof;
    const idx = digits.indexOf(pat);
    if (idx === -1) continue;
    const before = idx > 0 ? digits[idx-1] : null;
    const after  = idx + pat.length < digits.length ? digits[idx+pat.length] : null;
    if (before !== null || after !== null) continue;
    return hof;
  }
  return null;
}

function isFirstOfDay(submissions, playerId) {
  const today = new Date().toDateString();
  return !submissions.some(
    s => s.playerId === playerId && new Date(s.timestamp).toDateString() === today
  );
}

function checkStreak(submissions, playerId) {
  const daySet = new Set(
    submissions.filter(s => s.playerId === playerId).map(s => {
      const d = new Date(s.timestamp);
      return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    })
  );
  const days = [...daySet].sort((a,b) => {
    const [ay,am,ad] = a.split("-").map(Number);
    const [by,bm,bd] = b.split("-").map(Number);
    return new Date(ay,am,ad) - new Date(by,bm,bd);
  });
  if (days.length < 5) return false;
  const last5 = days.slice(-5);
  for (let i = 1; i < last5.length; i++) {
    const [py,pm,pd] = last5[i-1].split("-").map(Number);
    const [cy,cm,cd] = last5[i].split("-").map(Number);
    if (Math.round((new Date(cy,cm,cd) - new Date(py,pm,pd)) / 86400000) !== 1) return false;
  }
  return true;
}

function hasPlayerSubmittedThisFind(submissions, playerId, raw) {
  const digits = extractDigits(raw);
  return submissions.some(s => s.playerId === playerId && extractDigits(s.raw) === digits);
}

function scoreSubmission(raw, category, playerId, submissions, birthdays, hofList) {
  const digits = extractDigits(raw);
  const base = scoreDigits(digits);
  const bonuses = [];
  let total = base.points;

  const hof = checkHallOfFame(digits, hofList);
  if (hof) { bonuses.push({ label: hof.label, points: 40 }); total += 40; }

  const bday = checkBirthday(digits, birthdays);
  if (bday) { bonuses.push({ label: "🎂 Birthday Find!", points: 25 }); total += 25; }

  if (base.points > 0 && isFirstOfDay(submissions, playerId)) {
    bonuses.push({ label: "🌅 First of the Day", points: 5 }); total += 5;
  }

  if (base.points > 0 && !submissions.some(s => extractDigits(s.raw) === digits)) {
    bonuses.push({ label: "🆕 Rare Find (first ever!)", points: 10 }); total += 10;
  }

  if (checkStreak(submissions, playerId)) {
    bonuses.push({ label: "🔥 5-Day Streak", points: 25 }); total += 25;
  }

  return { base, bonuses, total, digits };
}

// ─── IMAGE HELPERS ────────────────────────────────────────────────────────────

function compressImage(file, maxWidth = 800, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = e => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function isImageExpired(ts) { return Date.now() - new Date(ts).getTime() > IMAGE_TTL_MS; }

function timeUntilExpiry(ts) {
  const ms = IMAGE_TTL_MS - (Date.now() - new Date(ts).getTime());
  if (ms <= 0) return "Expired";
  return `${Math.floor(ms/3600000)}h ${Math.floor((ms%3600000)/60000)}m`;
}

// ─── FIREBASE HELPERS ─────────────────────────────────────────────────────────

async function fsGet(path, fallback) {
  try {
    const snap = await getDoc(doc(db, ...path.split("/")));
    if (snap.exists()) return snap.data().value;
    return fallback;
  } catch {
    return fallback;
  }
}
async function fsSet(path, value) {
  try { await setDoc(doc(db, ...path.split("/")), { value }); } catch(e) { console.error(e); }
}

// ─── BIRTHDAY INPUT HELPER ────────────────────────────────────────────────────
function parseBirthdayText(text) {
  const parts = text.replace(/[^0-9/]/g,"").split("/");
  if (parts.length === 2) {
    const m = parseInt(parts[0]);
    const d = parseInt(parts[1]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return { month: m, day: d };
  }
  return null;
}

// ─── CONFETTI ─────────────────────────────────────────────────────────────────
function Confetti({ active }) {
  const GV = useContext(ThemeContext);
  if (!active) return null;
  const pieces = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: [GV.orangeB, GV.yellowB, GV.greenB, GV.blueB, GV.purpleB][i % 5],
    delay: Math.random() * 0.5,
    size: 6 + Math.random() * 8,
  }));
  return (
    <div style={{ position:"fixed", inset:0, pointerEvents:"none", zIndex:500 }}>
      {pieces.map(p => (
        <div key={p.id} style={{
          position:"absolute", left:`${p.x}%`, top:"-20px",
          width: p.size, height: p.size, background: p.color,
          borderRadius: p.id % 2 === 0 ? "50%" : "2px",
          animation: `fall 1.5s ${p.delay}s ease-in forwards`,
        }} />
      ))}
      <style>{`
        @keyframes fall {
          0%   { transform: translateY(0) rotate(0deg); opacity:1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity:0; }
        }
      `}</style>
    </div>
  );
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function ScorePreview({ score }) {
  const GV = useContext(ThemeContext);
  if (!score) return null;
  return (
    <div style={{ background:`${GV.bg1}`, border:`1px solid ${GV.orangeB}55`,
      borderRadius:10, padding:"14px 16px", marginTop:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <span style={{ fontFamily:"'Courier Prime',monospace", color:GV.orangeB, fontWeight:700, fontSize:15 }}>
          {score.base.name}
        </span>
        <span style={{ fontFamily:"'Courier Prime',monospace", color:GV.orangeB, fontWeight:900, fontSize:22 }}>
          +{score.total}
        </span>
      </div>
      <div style={{ color:GV.fg3, fontSize:11, fontFamily:"'Courier Prime',monospace",
        letterSpacing:3, marginBottom: score.bonuses.length ? 8 : 0 }}>
        DIGITS: {score.digits.split("").join(" · ")}
      </div>
      {score.bonuses.map((b,i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between",
          color:GV.yellowB, fontSize:12, marginTop:3 }}>
          <span>{b.label}</span><span>+{b.points}</span>
        </div>
      ))}
    </div>
  );
}

function PlayerBadge({ player, size="sm" }) {
  const GV = useContext(ThemeContext);
  const sz = size === "lg" ? 40 : 28;
  return (
    <div style={{ width:sz, height:sz, borderRadius:"50%", background:player.color+"33",
      border:`2px solid ${player.color}`, display:"flex", alignItems:"center",
      justifyContent:"center", fontSize: size==="lg" ? 20 : 14, flexShrink:0 }}>
      {player.emoji}
    </div>
  );
}

function ProofImage({ imageData, timestamp, hadImage }) {
  const GV = useContext(ThemeContext);
  const [open, setOpen] = useState(false);
  const expired = isImageExpired(timestamp);
  if (!hadImage) return null;
  if (expired || !imageData) {
    return <div style={{ marginTop:8, color:GV.bg3, fontSize:11, fontStyle:"italic" }}>📷 Proof expired (48h window closed)</div>;
  }
  return (
    <>
      <div onClick={() => setOpen(true)} style={{ marginTop:8, cursor:"pointer",
        borderRadius:8, overflow:"hidden", border:`1px solid ${GV.bg2}`, maxWidth:160, position:"relative" }}>
        <img src={imageData} alt="proof" style={{ width:"100%", display:"block", opacity:0.85 }} />
        <div style={{ position:"absolute", bottom:0, left:0, right:0,
          background:"rgba(0,0,0,0.6)", fontSize:9, color:GV.fg3, padding:"3px 6px", letterSpacing:1 }}>
          ⏱ {timeUntilExpiry(timestamp)} left
        </div>
      </div>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position:"fixed", inset:0,
          background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"center",
          justifyContent:"center", zIndex:999, padding:20 }}>
          <img src={imageData} alt="full" style={{ maxWidth:"100%", maxHeight:"90vh",
            borderRadius:12, border:`2px solid ${GV.orangeB}` }} />
        </div>
      )}
    </>
  );
}

function ReactionBar({ submissionId, reactions = {} }) {
  const GV = useContext(ThemeContext);
  const [local, setLocal] = useState(reactions);

  async function handleReact(emoji) {
    const current = local[emoji] || 0;
    const updated = { ...local, [emoji]: current + 1 };
    setLocal(updated);
    try {
      await updateDoc(doc(db, "submissions", submissionId),
        { [`reactions.${emoji}`]: (reactions[emoji] || 0) + 1 });
    } catch(e) { console.error(e); }
  }

  return (
    <div style={{ display:"flex", gap:6, marginTop:8, flexWrap:"wrap" }}>
      {REACTIONS.map(e => {
        const count = local[e] || 0;
        return (
          <button key={e} onClick={() => handleReact(e)} style={{
            padding:"3px 8px", borderRadius:20, cursor:"pointer",
            background: count > 0 ? `${GV.bg2}` : "transparent",
            border: `1px solid ${count > 0 ? GV.bg3 : GV.bg1}`,
            fontSize:13, color: count > 0 ? GV.fg : GV.bg3,
            display:"flex", alignItems:"center", gap:4, fontFamily:"inherit",
            transition:"all 0.1s",
          }}>
            {e}{count > 0 && <span style={{ fontSize:11, color:GV.fg2 }}>{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── WINNER BANNER ────────────────────────────────────────────────────────────

function WinnerBanner({ winner, periodLabel, onDismiss }) {
  const GV = useContext(ThemeContext);
  if (!winner) return null;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)",
      zIndex:300, display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ background:GV.bg1, border:`2px solid ${GV.yellowB}`,
        borderRadius:16, padding:32, maxWidth:380, textAlign:"center", width:"100%" }}>
        <div style={{ fontSize:48, marginBottom:12 }}>🏆</div>
        <div style={{ color:GV.yellowB, fontSize:11, letterSpacing:3, marginBottom:8 }}>
          {periodLabel.toUpperCase()} CHAMPION
        </div>
        <div style={{ fontSize:28, marginBottom:4 }}>{winner.emoji}</div>
        <div style={{ color:GV.fg, fontWeight:900, fontSize:26, marginBottom:4 }}>{winner.name}</div>
        <div style={{ color:winner.color, fontFamily:"'Courier Prime',monospace",
          fontSize:36, fontWeight:900, marginBottom:20 }}>{winner.total} pts</div>
        <button onClick={onDismiss} style={{ width:"100%", padding:"13px",
          background:`linear-gradient(135deg,${GV.yellow},${GV.orange})`,
          border:"none", borderRadius:12, color:GV.bg0, fontSize:14,
          fontWeight:900, letterSpacing:2, cursor:"pointer", fontFamily:"inherit" }}>
          START NEW PERIOD 🎲
        </button>
      </div>
    </div>
  );
}

// ─── PLAYER PROFILE ───────────────────────────────────────────────────────────

function PlayerProfile({ player, submissions, onClose, onEdit }) {
  const GV = useContext(ThemeContext);
  const subs = submissions.filter(s => s.playerId === player.id);
  const total = subs.reduce((a,s) => a+s.score, 0);
  const best  = subs.length ? Math.max(...subs.map(s => s.score)) : 0;
  const rare  = subs.filter(s => s.scoreDetail?.bonuses?.some(b => b.label.includes("Rare")));

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)",
      zIndex:200, overflowY:"auto", padding:"20px 16px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:GV.bg1,
        border:`1px solid ${player.color}55`, borderRadius:16, maxWidth:480,
        margin:"0 auto", overflow:"hidden" }}>
        <div style={{ background:`linear-gradient(135deg,${player.color}22,transparent)`,
          padding:"24px 20px 16px", borderBottom:`1px solid ${GV.bg2}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:52, height:52, borderRadius:"50%", background:player.color+"33",
              border:`3px solid ${player.color}`, display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:28 }}>{player.emoji}</div>
            <div>
              <div style={{ fontWeight:900, fontSize:22, color:GV.fg }}>{player.name}</div>
              <div style={{ color:player.color, fontSize:12, marginTop:2 }}>{subs.length} finds total</div>
            </div>
            <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
              {onEdit && (
                <button onClick={onEdit} style={{ background:"transparent",
                  border:`1px solid ${GV.bg2}`, borderRadius:8, padding:"6px 12px",
                  color:GV.fg3, fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>✏️ Edit</button>
              )}
              <button onClick={onClose} style={{ background:"none", border:"none",
                color:GV.fg3, fontSize:22, cursor:"pointer", padding:4 }}>✕</button>
            </div>
          </div>
          <div style={{ display:"flex", gap:12, marginTop:16 }}>
            {[["TOTAL PTS",total],["BEST FIND",`+${best}`],["RARE FINDS",rare.length]].map(([label,val]) => (
              <div key={label} style={{ flex:1, background:"rgba(0,0,0,0.3)", borderRadius:10,
                padding:"10px 12px", textAlign:"center" }}>
                <div style={{ color:player.color, fontWeight:900, fontSize:20,
                  fontFamily:"'Courier Prime',monospace" }}>{val}</div>
                <div style={{ color:GV.fg3, fontSize:9, letterSpacing:1, marginTop:2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding:"16px", maxHeight:"60vh", overflowY:"auto" }}>
          <div style={{ color:GV.fg3, fontSize:11, letterSpacing:3, marginBottom:12 }}>FIND HISTORY</div>
          {subs.length === 0 && (
            <div style={{ color:GV.bg3, textAlign:"center", padding:"30px 0", fontSize:13 }}>No finds yet!</div>
          )}
          {subs.map(s => {
            const dt = new Date(s.timestamp);
            return (
              <div key={s.id} style={{ display:"flex", alignItems:"flex-start", gap:12,
                padding:"10px 0", borderBottom:`1px solid ${GV.bg0}` }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Courier Prime',monospace", fontSize:18,
                    color:GV.fg, letterSpacing:2 }}>{s.raw}</div>
                  <div style={{ color:GV.orangeB, fontSize:11, marginTop:2 }}>{s.scoreDetail?.base?.name}</div>
                  {s.scoreDetail?.bonuses?.length > 0 && (
                    <div style={{ color:GV.yellowB, fontSize:10, marginTop:1 }}>
                      {s.scoreDetail.bonuses.map(b => b.label).join(" · ")}
                    </div>
                  )}
                  {s.category && <div style={{ color:GV.bg3, fontSize:10, marginTop:2 }}>{s.category}</div>}
                  <div style={{ color:GV.bg2, fontSize:10, marginTop:2 }}>
                    {dt.toLocaleDateString()} {dt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                  </div>
                </div>
                <div style={{ fontWeight:900, fontSize:20, color:player.color,
                  fontFamily:"'Courier Prime',monospace", flexShrink:0 }}>+{s.score}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── ADD / EDIT PLAYER MODAL ──────────────────────────────────────────────────

function PlayerModal({ player, birthday, onSave, onRemove, onClose, inputStyle, isEdit }) {
  const GV = useContext(ThemeContext);
  const [name,   setName]   = useState(player?.name || "");
  const [emoji,  setEmoji]  = useState(player?.emoji || EMOJI_OPTIONS[0]);
  const [color,  setColor]  = useState(player?.color || COLOR_OPTIONS[0]);
  const [bdText, setBdText] = useState(
    birthday ? `${birthday.month}/${birthday.day}` : ""
  );

  function handleSave() {
    if (!isEdit && !name.trim()) return;
    const bd = parseBirthdayText(bdText) || { month:1, day:1 };
    onSave({ name: name.trim(), emoji, color, birthday: bd });
  }

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.88)",
      zIndex:200, display:"flex", alignItems:"center", justifyContent:"center",
      padding:20, overflowY:"auto" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:GV.bg1,
        border:`1px solid ${GV.bg2}`, borderRadius:16, padding:24, width:"100%", maxWidth:420 }}>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ color:GV.fg, fontWeight:700, fontSize:16 }}>
            {isEdit ? `Edit ${player.name}` : "Add Player"}
          </span>
          <button onClick={onClose} style={{ background:"none", border:"none",
            color:GV.fg3, fontSize:20, cursor:"pointer" }}>✕</button>
        </div>

        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20,
          padding:"12px 16px", background:GV.bg,
          border:`1px solid ${color}44`, borderRadius:12 }}>
          <div style={{ width:44, height:44, borderRadius:"50%", background:color+"22",
            border:`2px solid ${color}`, display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:22 }}>{emoji}</div>
          <span style={{ color:color, fontWeight:700, fontSize:16 }}>{name || player?.name || "Player Name"}</span>
        </div>

        {!isEdit && (
          <div style={{ marginBottom:16 }}>
            <label style={{ color:GV.fg3, fontSize:11, letterSpacing:2, display:"block", marginBottom:8 }}>NAME</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="Enter name"
              style={{ ...inputStyle, width:"100%", boxSizing:"border-box" }} />
          </div>
        )}

        <div style={{ marginBottom:16 }}>
          <label style={{ color:GV.fg3, fontSize:11, letterSpacing:2, display:"block", marginBottom:8 }}>EMOJI</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {EMOJI_OPTIONS.map(e => (
              <button key={e} onClick={() => setEmoji(e)} style={{
                width:36, height:36, borderRadius:8, fontSize:18, cursor:"pointer",
                background: emoji===e ? `${GV.orangeB}33` : GV.bg,
                border: `1px solid ${emoji===e ? GV.orangeB : GV.bg2}`,
              }}>{e}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom:16 }}>
          <label style={{ color:GV.fg3, fontSize:11, letterSpacing:2, display:"block", marginBottom:8 }}>COLOR</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {COLOR_OPTIONS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width:28, height:28, borderRadius:"50%", background:c, cursor:"pointer",
                border: color===c ? `3px solid ${GV.fg}` : `2px solid transparent`,
                outline: color===c ? `2px solid ${c}` : "none",
              }} />
            ))}
          </div>
        </div>

        <div style={{ marginBottom:24 }}>
          <label style={{ color:GV.fg3, fontSize:11, letterSpacing:2, display:"block", marginBottom:8 }}>
            BIRTHDAY <span style={{ color:GV.bg3, letterSpacing:0, textTransform:"none", fontSize:10 }}>(MM/DD — for bonus)</span>
          </label>
          <input value={bdText} onChange={e => setBdText(e.target.value)}
            placeholder="e.g. 4/12 or 11/03"
            style={{ ...inputStyle, width:160, boxSizing:"border-box" }} />
          {bdText && !parseBirthdayText(bdText) && (
            <div style={{ color:GV.redB, fontSize:11, marginTop:4 }}>Use MM/DD format</div>
          )}
        </div>

        <button onClick={handleSave} style={{ width:"100%", padding:"13px",
          marginBottom: (isEdit && onRemove) ? 10 : 0,
          background:`linear-gradient(135deg,${GV.orange},${GV.orangeB})`,
          border:"none", borderRadius:12, color:GV.bg0, fontSize:14,
          fontWeight:900, letterSpacing:2, cursor:"pointer", fontFamily:"inherit" }}>
          {isEdit ? "SAVE CHANGES" : "ADD PLAYER"}
        </button>

        {isEdit && onRemove && (
          <button onClick={() => {
            if (window.confirm(`Remove ${player.name}? Their finds stay in history.`)) onRemove();
          }} style={{ width:"100%", padding:"11px", background:"transparent",
            border:`1px solid ${GV.red}`, borderRadius:12, color:GV.redB,
            fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            Remove Player
          </button>
        )}
      </div>
    </div>
  );
}

// ─── RULES TAB ────────────────────────────────────────────────────────────────

function RulesTab({ hofList }) {
  const GV = useContext(ThemeContext);
  const baseScores = [
    { name:"Five of a Kind 🎰", pts:100, example:"1:11:11", desc:"All digits the same" },
    { name:"Straight 📈",       pts:80,  example:"1:23:45", desc:"4 or 5 sequential digits (asc or desc)" },
    { name:"Four of a Kind 🔥", pts:60,  example:"11:11",   desc:"Four matching digits" },
    { name:"Full House 🏠",     pts:50,  example:"11:22:2", desc:"Three of one + two of another" },
    { name:"Small Straight 📉", pts:40,  example:"1:23",    desc:"3 sequential digits (asc or desc)" },
    { name:"Three of a Kind ✨",pts:30,  example:"2:22",    desc:"Three matching digits" },
    { name:"Two Pair 👀",       pts:20,  example:"11:22",   desc:"Two sets of pairs" },
    { name:"No Pattern",        pts:0,   example:"1:37",    desc:"No matches or runs" },
  ];
  const bonuses = [
    { label:"🎂 Birthday Find",   pts:"+25", desc:"Today is someone's birthday and submission matches their MM/DD — only fires on the actual birthday" },
    { label:"🏆 Hall of Fame",     pts:"+40", desc:"Submission contains a recognized funny/famous number" },
    { label:"🌅 First of the Day", pts:"+5",  desc:"Your first qualifying submission of the calendar day" },
    { label:"🆕 Rare Find",        pts:"+10", desc:"This digit pattern has never been submitted by anyone before" },
    { label:"🔥 5-Day Streak",     pts:"+25", desc:"You've submitted at least one find on each of the last 5 consecutive days" },
  ];

  const row = (left, right, accent) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
      padding:"10px 14px", borderBottom:`1px solid ${GV.bg0}`,
      background: accent ? `${GV.orangeB}08` : "transparent" }}>
      {left}{right}
    </div>
  );

  return (
    <div>
      <div style={{ color:GV.fg3, fontSize:11, letterSpacing:3, marginBottom:20 }}>HOW TO PLAY</div>
      <div style={{ color:GV.fg2, fontSize:12, lineHeight:1.7, marginBottom:24,
        background:GV.bg1, border:`1px solid ${GV.bg2}`, borderRadius:12, padding:"14px 16px" }}>
        Spot a number in the wild — a clock, receipt, address, odometer, anything.
        Screenshot or photograph it, then submit. Your digits are scored like Yahtzee.
        Everyone plays independently; the same number can be submitted by multiple players
        but you can't submit the same digits twice yourself. Proof photo required.
      </div>
      <div style={{ color:GV.fg3, fontSize:11, letterSpacing:3, marginBottom:12 }}>BASE SCORES</div>
      <div style={{ border:`1px solid ${GV.bg2}`, borderRadius:12, overflow:"hidden", marginBottom:24 }}>
        {baseScores.map((s,i) => row(
          <div>
            <div style={{ color: s.pts > 0 ? GV.fg : GV.fg3, fontSize:13, fontWeight: s.pts > 0 ? 600 : 400 }}>{s.name}</div>
            <div style={{ color:GV.bg3, fontSize:11, marginTop:2 }}>{s.desc}</div>
            <div style={{ color:GV.fg3, fontSize:11, fontFamily:"'Courier Prime',monospace", marginTop:2, letterSpacing:2 }}>e.g. {s.example}</div>
          </div>,
          <div style={{ fontFamily:"'Courier Prime',monospace", fontWeight:900, fontSize:18,
            color: s.pts >= 80 ? GV.orangeB : s.pts >= 50 ? GV.yellowB : s.pts > 0 ? GV.fg3 : GV.bg3,
            marginLeft:12, flexShrink:0 }}>{s.pts > 0 ? `+${s.pts}` : "—"}</div>,
          i % 2 === 0
        ))}
      </div>
      <div style={{ color:GV.fg3, fontSize:11, letterSpacing:3, marginBottom:12 }}>BONUSES (stack with base)</div>
      <div style={{ border:`1px solid ${GV.bg2}`, borderRadius:12, overflow:"hidden", marginBottom:24 }}>
        {bonuses.map((b,i) => row(
          <div>
            <div style={{ color:GV.fg, fontSize:13, fontWeight:600 }}>{b.label}</div>
            <div style={{ color:GV.bg3, fontSize:11, marginTop:2, lineHeight:1.5 }}>{b.desc}</div>
          </div>,
          <div style={{ fontFamily:"'Courier Prime',monospace", fontWeight:900, fontSize:18,
            color:GV.yellowB, marginLeft:12, flexShrink:0 }}>{b.pts}</div>,
          i % 2 === 0
        ))}
      </div>
      <div style={{ color:GV.fg3, fontSize:11, letterSpacing:3, marginBottom:12 }}>HALL OF FAME NUMBERS</div>
      <div style={{ border:`1px solid ${GV.bg2}`, borderRadius:12, overflow:"hidden", marginBottom:24 }}>
        {hofList.map((h,i) => row(
          <span style={{ color:GV.yellowB, fontFamily:"'Courier Prime',monospace", letterSpacing:2, fontSize:14 }}>{h.number}</span>,
          <span style={{ color:GV.fg3, fontSize:12 }}>{h.label}</span>,
          i % 2 === 0
        ))}
      </div>
      <div style={{ color:GV.fg3, fontSize:11, letterSpacing:3, marginBottom:12 }}>VALIDITY</div>
      <div style={{ border:`1px solid ${GV.bg2}`, borderRadius:12, padding:"14px 16px",
        color:GV.bg4, fontSize:12, lineHeight:1.8 }}>
        ✓ Real photo or screenshot required — no exceptions<br/>
        ✓ Numbers must appear naturally in the wild<br/>
        ✗ No staging (don't set your clock to 1:11)<br/>
        ✗ No submitting the same digit pattern twice<br/>
        ✓ Honor system — it's for fun
      </div>
    </div>
  );
}

// ─── HALL OF CHAMPIONS TAB ────────────────────────────────────────────────────

function ChampionsTab({ champions, players }) {
  const GV = useContext(ThemeContext);
  if (champions.length === 0) {
    return (
      <div>
        <div style={{ color:GV.fg3, fontSize:11, letterSpacing:3, marginBottom:20 }}>HALL OF CHAMPIONS</div>
        <div style={{ color:GV.bg3, textAlign:"center", marginTop:40, fontSize:13 }}>
          No champions yet — first period still in progress! 🏆
        </div>
      </div>
    );
  }
  return (
    <div>
      <div style={{ color:GV.fg3, fontSize:11, letterSpacing:3, marginBottom:20 }}>HALL OF CHAMPIONS</div>
      {champions.map((c, i) => {
        const player = players.find(p => p.id === c.playerId) ||
          { name: c.playerName || "?", emoji: "🏆", color: GV_DARK.yellowB };
        return (
          <div key={i} style={{ display:"flex", alignItems:"center", gap:12,
            background: i===0 ? `${GV.yellowB}11` : GV.bg1,
            border:`1px solid ${i===0 ? GV.yellowB+"44" : GV.bg2}`,
            borderRadius:12, padding:"14px 16px", marginBottom:10 }}>
            <div style={{ fontSize:24, width:32, textAlign:"center" }}>
              {i===0?"🥇":i===1?"🥈":i===2?"🥉":"🏅"}
            </div>
            <div style={{ width:36, height:36, borderRadius:"50%", background:player.color+"33",
              border:`2px solid ${player.color}`, display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:18, flexShrink:0 }}>{player.emoji}</div>
            <div style={{ flex:1 }}>
              <div style={{ color:GV.fg, fontWeight:700, fontSize:15 }}>{player.name}</div>
              <div style={{ color:GV.fg3, fontSize:11, marginTop:2 }}>{c.periodLabel}</div>
            </div>
            <div style={{ fontFamily:"'Courier Prime',monospace", fontWeight:900,
              fontSize:22, color: i===0 ? GV.yellowB : GV.fg3 }}>{c.score}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── PLAYER SELECT SCREEN ─────────────────────────────────────────────────────

function PlayerSelectScreen({ players, onSelect, onAddPlayer }) {
  const GV = useContext(ThemeContext);
  return (
    <div style={{ background:GV.bg0, minHeight:"100vh", display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center", padding:"24px 16px",
      fontFamily:"'Courier Prime',monospace" }}>
      <div style={{ marginBottom:32, textAlign:"center" }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:10, justifyContent:"center", marginBottom:10 }}>
          <span style={{ fontSize:34, fontWeight:900, color:GV.orangeB, letterSpacing:-1 }}>CLOCK</span>
          <span style={{ fontSize:34, fontWeight:900, color:GV.yellowB, letterSpacing:-1 }}>TZEE</span>
          <span style={{ fontSize:24, marginLeft:4 }}>🎲</span>
        </div>
        <div style={{ color:GV.fg3, fontSize:12, letterSpacing:3 }}>WHO ARE YOU?</div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(2, 1fr)", gap:12, width:"100%", maxWidth:400 }}>
        {players.map(p => (
          <button key={p.id} onClick={() => onSelect(p)} style={{
            background:GV.bg1, border:`2px solid ${p.color}44`,
            borderRadius:16, padding:"20px 16px", cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"center", gap:10,
            fontFamily:"inherit", transition:"all 0.15s",
          }}
            onMouseOver={e => e.currentTarget.style.borderColor = p.color}
            onMouseOut={e => e.currentTarget.style.borderColor = p.color+"44"}
          >
            <div style={{ width:52, height:52, borderRadius:"50%", background:p.color+"33",
              border:`2px solid ${p.color}`, display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:26 }}>{p.emoji}</div>
            <span style={{ color:GV.fg, fontWeight:700, fontSize:14 }}>{p.name}</span>
          </button>
        ))}
      </div>
      <button onClick={onAddPlayer} style={{
        marginTop:24, padding:"10px 24px", background:"transparent",
        border:`1px dashed ${GV.bg3}`, borderRadius:20, color:GV.fg3,
        fontSize:12, cursor:"pointer", fontFamily:"inherit", letterSpacing:1,
        transition:"all 0.15s",
      }}
        onMouseOver={e => { e.currentTarget.style.borderColor=GV.orangeB; e.currentTarget.style.color=GV.orangeB; }}
        onMouseOut={e => { e.currentTarget.style.borderColor=GV.bg3; e.currentTarget.style.color=GV.fg3; }}
      >+ New Player</button>
    </div>
  );
}

// ─── PROFILE SHEET ────────────────────────────────────────────────────────────

function ProfileSheet({ player, submissions, onClose, onEdit, onLogout, onThemeToggle }) {
  const GV = useContext(ThemeContext);
  const subs = submissions.filter(s => s.playerId === player.id);
  const total = subs.reduce((a,s) => a+s.score, 0);
  const best  = subs.length ? Math.max(...subs.map(s => s.score)) : 0;
  const rare  = subs.filter(s => s.scoreDetail?.bonuses?.some(b => b.label.includes("Rare")));

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.7)",
      zIndex:200, display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
      <div onClick={e => e.stopPropagation()} style={{
        background:GV.bg1, border:`1px solid ${player.color}55`,
        borderRadius:"16px 16px 0 0", width:"100%", maxWidth:480,
        padding:"24px 20px 40px",
      }}>
        <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
          <div style={{ width:52, height:52, borderRadius:"50%", background:player.color+"33",
            border:`3px solid ${player.color}`, display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:26 }}>{player.emoji}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontWeight:900, fontSize:20, color:GV.fg }}>{player.name}</div>
            <div style={{ color:player.color, fontSize:12, marginTop:2 }}>{subs.length} finds total</div>
          </div>
          <button onClick={onClose} style={{ background:"none", border:"none",
            color:GV.fg3, fontSize:22, cursor:"pointer", padding:4 }}>✕</button>
        </div>

        <div style={{ display:"flex", gap:10, marginBottom:20 }}>
          {[["TOTAL",total],["BEST",`+${best}`],["RARE",rare.length]].map(([label,val]) => (
            <div key={label} style={{ flex:1, background:"rgba(0,0,0,0.2)", borderRadius:10,
              padding:"10px 12px", textAlign:"center" }}>
              <div style={{ color:player.color, fontWeight:900, fontSize:20,
                fontFamily:"'Courier Prime',monospace" }}>{val}</div>
              <div style={{ color:GV.fg3, fontSize:9, letterSpacing:1, marginTop:2 }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          <button onClick={onEdit} style={{ padding:"12px", background:"transparent",
            border:`1px solid ${GV.bg2}`, borderRadius:12, color:GV.fg,
            fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            ✏️ Edit Profile
          </button>
          <button onClick={onThemeToggle} style={{ padding:"12px", background:"transparent",
            border:`1px solid ${GV.bg2}`, borderRadius:12, color:GV.fg,
            fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            {player.theme === "light" ? "🌙 Switch to Dark Mode" : "☀️ Switch to Light Mode"}
          </button>
          <button onClick={onLogout} style={{ padding:"12px", background:"transparent",
            border:`1px solid ${GV.red}`, borderRadius:12, color:GV.redB,
            fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
            Switch Player
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab,          setTab]          = useState("board");
  const [players,      setPlayers]      = useState([]);
  const [submissions,  setSubmissions]  = useState([]);
  const [hofList,      setHofList]      = useState(HALL_OF_FAME_DEFAULT);
  const [periodMode,   setPeriodMode]   = useState("monthly");
  const [champions,    setChampions]    = useState([]);
  const [loaded,       setLoaded]       = useState(false);
  const [playersLoaded,setPlayersLoaded]= useState(false);

  const [currentPlayer,       setCurrentPlayer]       = useState(null);
  const [showProfileSheet,    setShowProfileSheet]     = useState(false);
  const [editingCurrentPlayer,setEditingCurrentPlayer] = useState(false);

  const [rawInput,        setRawInput]        = useState("");
  const [category,        setCategory]        = useState("");
  const [note,            setNote]            = useState("");
  const [imageFile,       setImageFile]       = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [preview,         setPreview]         = useState(null);
  const [submitError,     setSubmitError]     = useState("");
  const [submitting,      setSubmitting]      = useState(false);
  const [showConfetti,    setShowConfetti]    = useState(false);
  const fileInputRef = useRef();

  const [profilePlayer, setProfilePlayer] = useState(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState(null);
  const [pendingWinner, setPendingWinner] = useState(null);

  const [newHof,       setNewHof]       = useState("");
  const [newHofLabel,  setNewHofLabel]  = useState("");
  const [adminSection, setAdminSection] = useState("players");

  const GV = currentPlayer?.theme === "light" ? GV_LIGHT : GV_DARK;

  // ── Load players via onSnapshot ──
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "players"), snap => {
      setPlayers(snap.docs.map(d => d.data()));
      setPlayersLoaded(true);
    });
    return unsub;
  }, []);

  // ── Keep currentPlayer in sync with live player data ──
  useEffect(() => {
    if (!currentPlayer) return;
    const updated = players.find(p => p.id === currentPlayer.id);
    if (updated) setCurrentPlayer(updated);
  }, [players]);

  // ── Restore session from localStorage once players are available ──
  useEffect(() => {
    if (!playersLoaded || currentPlayer) return;
    const savedId = localStorage.getItem("ctz_player_id");
    if (savedId) {
      const found = players.find(p => p.id === savedId);
      if (found) setCurrentPlayer(found);
    }
  }, [playersLoaded]);

  // ── Load settings ──
  useEffect(() => {
    (async () => {
      const h  = await fsGet("settings/hof",        HALL_OF_FAME_DEFAULT);
      const pm = await fsGet("settings/periodMode", "monthly");
      const ch = await fsGet("settings/champions",  []);
      setHofList(h); setPeriodMode(pm); setChampions(ch);
      setLoaded(true);
    })();
  }, []);

  // ── Live submissions ──
  useEffect(() => {
    const q = query(collection(db, "submissions"), orderBy("timestamp", "desc"));
    const unsub = onSnapshot(q, snap => {
      const now = Date.now();
      setSubmissions(snap.docs.map(d => {
        const data = d.data();
        if (data.hasImage && (now - new Date(data.timestamp).getTime() > IMAGE_TTL_MS))
          data.imageData = null;
        return { ...data, id: d.id };
      }));
    });
    return unsub;
  }, []);

  // ── Persist settings ──
  const [hofDirty,        setHofDirty]        = useState(false);
  const [periodModeDirty, setPeriodModeDirty] = useState(false);
  const [championsDirty,  setChampionsDirty]  = useState(false);

  useEffect(() => { if (hofDirty)        { fsSet("settings/hof",        hofList);    setHofDirty(false);        } }, [hofList]);
  useEffect(() => { if (periodModeDirty) { fsSet("settings/periodMode", periodMode); setPeriodModeDirty(false); } }, [periodMode]);
  useEffect(() => { if (championsDirty)  { fsSet("settings/champions",  champions);  setChampionsDirty(false);  } }, [champions]);

  // ── Birthdays derived from player docs ──
  const birthdays = Object.fromEntries(
    players.filter(p => p.birthday).map(p => [p.id, p.birthday])
  );

  // ── Period reset check ──
  useEffect(() => {
    if (!loaded || submissions.length === 0) return;
    const currentKey = getPeriodKey(new Date(), periodMode);
    const lastResetKey = localStorage.getItem("ctz_last_period") || currentKey;
    if (lastResetKey !== currentKey) {
      const lastSubs = submissions.filter(s => {
        const sk = getPeriodKey(new Date(s.timestamp), periodMode);
        return sk === lastResetKey;
      });
      if (lastSubs.length > 0) {
        const scores = {};
        lastSubs.forEach(s => { scores[s.playerId] = (scores[s.playerId] || 0) + s.score; });
        const winnerId = Object.entries(scores).sort((a,b) => b[1]-a[1])[0][0];
        const winnerPlayer = players.find(p => p.id === winnerId) ||
          { name: winnerId, emoji: "🏆", color: GV_DARK.yellowB };
        const winnerEntry = {
          playerId: winnerId,
          playerName: winnerPlayer.name,
          score: scores[winnerId],
          periodLabel: getPeriodLabel(lastResetKey, periodMode),
          periodKey: lastResetKey,
        };
        setChampions(prev => [winnerEntry, ...prev].slice(0, 20));
        setChampionsDirty(true);
        setPendingWinner({ ...winnerPlayer, total: scores[winnerId],
          periodLabel: getPeriodLabel(lastResetKey, periodMode) });
      }
      localStorage.setItem("ctz_last_period", currentKey);
    } else {
      localStorage.setItem("ctz_last_period", currentKey);
    }
  }, [loaded, periodMode]);

  // ── Score preview ──
  useEffect(() => {
    if (!rawInput || !currentPlayer) { setPreview(null); return; }
    setPreview(scoreSubmission(rawInput, category, currentPlayer.id, submissions, birthdays, hofList));
  }, [rawInput, currentPlayer, category, submissions]);

  // ── Last visited tracking ──
  const [lastVisited] = useState(() => {
    const stored = localStorage.getItem("ctz_last_visited");
    const ts = stored ? new Date(stored) : null;
    localStorage.setItem("ctz_last_visited", new Date().toISOString());
    return ts;
  });
  const newFindsCount = lastVisited
    ? submissions.filter(s => new Date(s.timestamp) > lastVisited).length
    : 0;

  // ── Image ──
  async function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreviewUrl(URL.createObjectURL(file));
  }
  function clearImage() {
    setImageFile(null); setImagePreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Submit ──
  async function handleSubmit() {
    setSubmitError("");
    if (!rawInput.trim()) { setSubmitError("Enter the number you found."); return; }
    if (!imageFile)       { setSubmitError("Attach a proof photo — pic or it didn't happen! 📷"); return; }
    if (hasPlayerSubmittedThisFind(submissions, currentPlayer.id, rawInput)) {
      setSubmitError("You already submitted this find!"); return;
    }
    setSubmitting(true);
    try {
      const score = scoreSubmission(rawInput, category, currentPlayer.id, submissions, birthdays, hofList);
      const imageData = await compressImage(imageFile);

      const playerSubs = submissions.filter(s => s.playerId === currentPlayer.id);
      const prevBest = playerSubs.length ? Math.max(...playerSubs.map(s => s.score)) : 0;
      if (score.total > prevBest && prevBest > 0) {
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 2000);
      }

      await addDoc(collection(db, "submissions"), {
        playerId: currentPlayer.id,
        playerName: currentPlayer.name,
        raw: rawInput.trim(), category: category || null,
        note: note.trim(), score: score.total, scoreDetail: score,
        hasImage: true, imageData, reactions: {},
        timestamp: new Date().toISOString(),
      });
      setRawInput(""); setNote(""); setCategory(""); setPreview(null); clearImage();
      setTab("board");
    } catch(e) {
      console.error(e);
      setSubmitError("Couldn't save. Try a smaller photo.");
    }
    setSubmitting(false);
  }

  // ── Player CRUD ──
  async function handleAddPlayer({ name, emoji, color, birthday }) {
    const id = name.toLowerCase().replace(/\s+/g,"_") + "_" + Date.now();
    await setDoc(doc(db, "players", id), { id, name, emoji, color, isAdmin: false, birthday, theme: "dark" });
    setShowAddPlayer(false);
  }

  async function handleEditPlayer(playerId, { emoji, color, birthday }) {
    await updateDoc(doc(db, "players", playerId), { emoji, color, birthday });
    setEditingPlayer(null);
    setEditingCurrentPlayer(false);
  }

  async function handleRemovePlayer(playerId) {
    await deleteDoc(doc(db, "players", playerId));
    setEditingPlayer(null);
  }

  function handleSelectPlayer(player) {
    localStorage.setItem("ctz_player_id", player.id);
    setCurrentPlayer(player);
  }

  function handleLogout() {
    localStorage.removeItem("ctz_player_id");
    setCurrentPlayer(null);
    setShowProfileSheet(false);
    setTab("board");
  }

  async function handleThemeToggle() {
    const newTheme = currentPlayer.theme === "light" ? "dark" : "light";
    setCurrentPlayer(prev => ({ ...prev, theme: newTheme }));
    try { await updateDoc(doc(db, "players", currentPlayer.id), { theme: newTheme }); }
    catch(e) { console.error(e); }
  }

  function addHof() {
    if (!newHof.trim()) return;
    setHofList(prev => [...prev, { number: newHof.trim(),
      label: newHofLabel.trim() || newHof.trim(), points: 40 }]);
    setHofDirty(true);
    setNewHof(""); setNewHofLabel("");
  }

  async function handleResetScores() {
    if (!window.confirm("Reset ALL scores and submissions? Players and settings stay. Cannot be undone.")) return;
    const snap = await getDocs(collection(db, "submissions"));
    const batch = writeBatch(db);
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  const leaderboard = players.map(p => {
    const subs = submissions.filter(s => s.playerId === p.id);
    const hasStreak = checkStreak(submissions, p.id);
    return { ...p,
      total: subs.reduce((a,s) => a+s.score, 0),
      count: subs.length,
      best:  subs.length ? Math.max(...subs.map(s => s.score)) : 0,
      hasStreak,
    };
  }).sort((a,b) => b.total - a.total);

  const S = {
    label:  { color:GV.fg3, fontSize:11, letterSpacing:2, display:"block", marginBottom:8 },
    input:  { background:GV.bg0, border:`1px solid ${GV.bg2}`, borderRadius:10,
              padding:"12px 14px", color:GV.fg, fontSize:13, fontFamily:"inherit",
              outline:"none", boxSizing:"border-box" },
    card:   { background:GV.bg1, border:`1px solid ${GV.bg2}`, borderRadius:12,
              padding:"14px 16px", marginBottom:10 },
    addBtn: { padding:"10px 16px", background:GV.orange, border:"none", borderRadius:10,
              color:GV.bg0, fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 },
  };

  if (!loaded || !playersLoaded) return (
    <div style={{ background:GV_DARK.bg0, minHeight:"100vh", display:"flex",
      alignItems:"center", justifyContent:"center",
      color:GV_DARK.orangeB, fontFamily:"'Courier Prime',monospace", fontSize:20 }}>
      Loading Clocktzee…
    </div>
  );

  if (!currentPlayer) return (
    <ThemeContext.Provider value={GV_DARK}>
      <PlayerSelectScreen players={players} onSelect={handleSelectPlayer} onAddPlayer={() => setShowAddPlayer(true)} />
      {showAddPlayer && (
        <PlayerModal
          player={null} birthday={null}
          onSave={handleAddPlayer} onRemove={null}
          onClose={() => setShowAddPlayer(false)}
          inputStyle={{ background:GV_DARK.bg0, border:`1px solid ${GV_DARK.bg2}`, borderRadius:10,
            padding:"12px 14px", color:GV_DARK.fg, fontSize:13, fontFamily:"inherit",
            outline:"none", boxSizing:"border-box" }}
          isEdit={false}
        />
      )}
    </ThemeContext.Provider>
  );

  const NAV = [
    ["board",     "🏆 Board"],
    ["submit",    "➕ Submit"],
    ["feed",      "📋 Feed"],
    ["rules",     "📖 Rules"],
    ["champions", "🥇 Champs"],
    ...(currentPlayer.isAdmin ? [["admin","⚙️ Admin"]] : []),
  ];

  return (
    <ThemeContext.Provider value={GV}>
      <div style={{ background:GV.bg0, minHeight:"100vh",
        fontFamily:"'Courier Prime',monospace", color:GV.fg,
        maxWidth:480, margin:"0 auto", paddingBottom:80 }}>

        <Confetti active={showConfetti} />

        {pendingWinner && (
          <WinnerBanner
            winner={pendingWinner}
            periodLabel={pendingWinner.periodLabel}
            onDismiss={() => setPendingWinner(null)}
          />
        )}
        {profilePlayer && (
          <PlayerProfile
            player={profilePlayer} submissions={submissions}
            onClose={() => setProfilePlayer(null)}
            onEdit={() => { setEditingPlayer(profilePlayer); setProfilePlayer(null); }}
          />
        )}
        {showProfileSheet && (
          <ProfileSheet
            player={currentPlayer} submissions={submissions}
            onClose={() => setShowProfileSheet(false)}
            onEdit={() => { setEditingCurrentPlayer(true); setShowProfileSheet(false); }}
            onLogout={handleLogout}
            onThemeToggle={handleThemeToggle}
          />
        )}
        {editingCurrentPlayer && (
          <PlayerModal
            player={currentPlayer} birthday={currentPlayer.birthday}
            onSave={changes => handleEditPlayer(currentPlayer.id, changes)}
            onRemove={null} onClose={() => setEditingCurrentPlayer(false)}
            inputStyle={S.input} isEdit
          />
        )}
        {showAddPlayer && (
          <PlayerModal
            player={null} birthday={null}
            onSave={handleAddPlayer} onRemove={null}
            onClose={() => setShowAddPlayer(false)}
            inputStyle={S.input} isEdit={false}
          />
        )}
        {editingPlayer && (
          <PlayerModal
            player={editingPlayer} birthday={editingPlayer.birthday}
            onSave={changes => handleEditPlayer(editingPlayer.id, changes)}
            onRemove={() => handleRemovePlayer(editingPlayer.id)}
            onClose={() => setEditingPlayer(null)}
            inputStyle={S.input} isEdit
          />
        )}

        {/* Header */}
        <div style={{ padding:"24px 20px 14px", borderBottom:`1px solid ${GV.bg2}`,
          background:`linear-gradient(180deg,${GV.bg1} 0%,${GV.bg0} 100%)` }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
              <span style={{ fontSize:30, fontWeight:900, color:GV.orangeB, letterSpacing:-1 }}>CLOCK</span>
              <span style={{ fontSize:30, fontWeight:900, color:GV.yellowB, letterSpacing:-1 }}>TZEE</span>
              <span style={{ fontSize:20, marginLeft:4 }}>🎲</span>
            </div>
            <button onClick={() => setShowProfileSheet(true)} style={{
              width:40, height:40, borderRadius:"50%",
              background:currentPlayer.color+"33",
              border:`2px solid ${currentPlayer.color}`,
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:20, cursor:"pointer", padding:0, flexShrink:0,
            }}>{currentPlayer.emoji}</button>
          </div>
        </div>

        {/* Nav */}
        <div style={{ display:"flex", borderBottom:`1px solid ${GV.bg2}`,
          background:GV.bg1, position:"sticky", top:0, zIndex:10, overflowX:"auto" }}>
          {NAV.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex:1, minWidth:55, padding:"11px 3px", background:"none", border:"none",
              borderBottom: tab===id ? `2px solid ${GV.orangeB}` : `2px solid transparent`,
              color: tab===id ? GV.orangeB : GV.bg4,
              fontSize:9, letterSpacing:0.5, cursor:"pointer", fontFamily:"inherit",
              fontWeight: tab===id ? 700 : 400, transition:"all 0.15s", whiteSpace:"nowrap",
            }}>{label}</button>
          ))}
        </div>

        <div style={{ padding:"20px 16px" }}>

          {/* ── BOARD ── */}
          {tab==="board" && (
            <div>
              <div style={{ color:GV.fg3, fontSize:11, letterSpacing:3, marginBottom:20 }}>
                STANDINGS · {getPeriodLabel(getPeriodKey(new Date(), periodMode), periodMode).toUpperCase()}
              </div>
              {leaderboard.map((p, i) => (
                <div key={p.id} onClick={() => setProfilePlayer(p)}
                  style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer",
                    background: i===0 ? `${GV.orangeB}11` : GV.bg1,
                    border:`1px solid ${i===0 ? GV.orangeB+"44" : GV.bg2}`,
                    borderRadius:12, padding:"14px 16px", marginBottom:10, transition:"border-color 0.15s" }}
                  onMouseOver={e => e.currentTarget.style.borderColor = p.color+"66"}
                  onMouseOut={e => e.currentTarget.style.borderColor = i===0 ? GV.orangeB+"44" : GV.bg2}>
                  <div style={{ color:i===0?GV.orangeB:GV.bg3, fontSize:18, fontWeight:900, width:28, textAlign:"center" }}>
                    {i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}
                  </div>
                  <PlayerBadge player={p} />
                  <div style={{ flex:1 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ fontWeight:700, fontSize:16, color:i===0?GV.fg:GV.fg1 }}>{p.name}</span>
                      {p.hasStreak && <span title="On a streak!">🔥</span>}
                    </div>
                    <div style={{ color:GV.fg3, fontSize:11, marginTop:2 }}>
                      {p.count} find{p.count!==1?"s":""} · best: +{p.best}
                    </div>
                  </div>
                  <div style={{ fontWeight:900, fontSize:26, color:i===0?GV.orangeB:GV.bg4,
                    fontFamily:"'Courier Prime',monospace" }}>{p.total}</div>
                  <div style={{ color:GV.bg3, fontSize:12 }}>›</div>
                </div>
              ))}
              {leaderboard.every(p => p.total===0) && (
                <div style={{ color:GV.bg3, textAlign:"center", marginTop:40, fontSize:13 }}>
                  No finds yet. Be the first! 🎲
                </div>
              )}
              <div style={{ marginTop:24, textAlign:"center" }}>
                <div style={{ color:GV.bg3, fontSize:10, letterSpacing:3 }}>
                  GRANDPAPPYLABS · v{VERSION}
                </div>
                <div style={{ color:GV.bg2, fontSize:10, letterSpacing:2, marginTop:3 }}>
                  FAMILY NUMBER HUNT
                </div>
              </div>
            </div>
          )}

          {/* ── SUBMIT ── */}
          {tab==="submit" && (
            <div>
              <div style={{ color:GV.fg3, fontSize:11, letterSpacing:3, marginBottom:20 }}>LOG A FIND</div>

              {/* Current player indicator */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20,
                padding:"10px 14px", background:GV.bg1,
                border:`1px solid ${currentPlayer.color}44`, borderRadius:12 }}>
                <div style={{ width:32, height:32, borderRadius:"50%",
                  background:currentPlayer.color+"33", border:`2px solid ${currentPlayer.color}`,
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>
                  {currentPlayer.emoji}
                </div>
                <span style={{ color:currentPlayer.color, fontWeight:700, fontSize:14 }}>{currentPlayer.name}</span>
              </div>

              <div style={{ marginBottom:16 }}>
                <label style={S.label}>WHAT DID YOU SEE?</label>
                <input value={rawInput} onChange={e => setRawInput(e.target.value)}
                  placeholder="e.g. 11:11 or $42.00 or 4204"
                  style={{ ...S.input, width:"100%", fontSize:20, letterSpacing:3,
                    fontFamily:"'Courier Prime',monospace" }} />
              </div>

              <div style={{ marginBottom:16 }}>
                <label style={S.label}>
                  CATEGORY <span style={{ color:GV.bg3, letterSpacing:0, textTransform:"none", fontSize:10 }}>· optional</span>
                </label>
                <select value={category} onChange={e => setCategory(e.target.value)}
                  style={{ ...S.input, width:"100%", cursor:"pointer" }}>
                  <option value="">— skip —</option>
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div style={{ marginBottom:16 }}>
                <label style={S.label}>
                  PROOF PHOTO <span style={{ color:GV.redB }}>* required</span>
                  <span style={{ color:GV.bg3, marginLeft:8, letterSpacing:0,
                    textTransform:"none", fontSize:10, fontWeight:400 }}>· expires 48h after submit</span>
                </label>
                {!imagePreviewUrl ? (
                  <div onClick={() => fileInputRef.current?.click()}
                    style={{ border:`2px dashed ${GV.bg2}`, borderRadius:12, padding:"28px 16px",
                      textAlign:"center", cursor:"pointer", color:GV.fg3, fontSize:13, transition:"all 0.15s" }}
                    onMouseOver={e => e.currentTarget.style.borderColor=GV.orangeB}
                    onMouseOut={e => e.currentTarget.style.borderColor=GV.bg2}>
                    <div style={{ fontSize:32, marginBottom:8 }}>📷</div>
                    Tap to attach screenshot or photo
                  </div>
                ) : (
                  <div style={{ position:"relative", borderRadius:12, overflow:"hidden",
                    border:`1px solid ${GV.orangeB}55` }}>
                    <img src={imagePreviewUrl} alt="preview"
                      style={{ width:"100%", display:"block", maxHeight:240, objectFit:"cover" }} />
                    <button onClick={clearImage} style={{ position:"absolute", top:8, right:8,
                      background:"rgba(0,0,0,0.7)", border:"none", borderRadius:"50%",
                      width:28, height:28, color:GV.fg, fontSize:14, cursor:"pointer",
                      display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                    <div style={{ position:"absolute", bottom:0, left:0, right:0,
                      background:"rgba(0,0,0,0.65)", padding:"5px 10px",
                      fontSize:10, color:GV.fg3, letterSpacing:1 }}>
                      ⏱ PROOF EXPIRES 48H AFTER SUBMIT
                    </div>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="image/*"
                  onChange={handleImageChange} style={{ display:"none" }} />
              </div>

              <div style={{ marginBottom:16 }}>
                <label style={S.label}>NOTE (optional)</label>
                <input value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Where / context…" style={{ ...S.input, width:"100%" }} />
              </div>

              <ScorePreview score={preview} />

              <button onClick={handleSubmit} disabled={submitting} style={{
                width:"100%", marginTop:16, padding:"15px",
                background: submitting ? GV.bg2 : `linear-gradient(135deg,${GV.orange},${GV.orangeB})`,
                border:"none", borderRadius:12, color:GV.bg0, fontSize:15,
                fontWeight:900, letterSpacing:2, cursor: submitting ? "not-allowed" : "pointer",
                fontFamily:"inherit", transition:"all 0.15s",
              }}>
                {submitting ? "SAVING…" : "SUBMIT FIND"}
              </button>

              {submitError && (
                <div style={{ marginTop:12, color:GV.redB, fontSize:13, textAlign:"center" }}>
                  {submitError}
                </div>
              )}
            </div>
          )}

          {/* ── FEED ── */}
          {tab==="feed" && (
            <div>
              {newFindsCount > 0 && (
                <div style={{ background:`${GV.orangeB}18`, border:`1px solid ${GV.orangeB}44`,
                  borderRadius:10, padding:"10px 14px", marginBottom:16,
                  display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:16 }}>🆕</span>
                  <span style={{ color:GV.orangeB, fontSize:13, fontWeight:600 }}>
                    {newFindsCount} new find{newFindsCount!==1?"s":""} since your last visit
                  </span>
                </div>
              )}
              <div style={{ color:GV.fg3, fontSize:11, letterSpacing:3, marginBottom:20 }}>
                RECENT FINDS · {submissions.length} TOTAL
              </div>
              {submissions.length===0 && (
                <div style={{ color:GV.bg3, textAlign:"center", marginTop:40, fontSize:13 }}>No finds yet!</div>
              )}
              {submissions.slice(0,40).map(s => {
                const player = players.find(p => p.id===s.playerId) ||
                  { name: s.playerName || s.playerId || "?", emoji:"👤", color:GV.bg4 };
                const dt = new Date(s.timestamp);
                return (
                  <div key={s.id} style={{ ...S.card, borderLeft:`3px solid ${player.color}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:18 }}>{player.emoji}</span>
                        <div>
                          <span style={{ color:player.color, fontWeight:700, fontSize:13 }}>{player.name}</span>
                          {s.category && <span style={{ color:GV.bg3, fontSize:11, marginLeft:8 }}>{s.category}</span>}
                        </div>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ color:GV.orangeB, fontWeight:900, fontSize:22,
                          fontFamily:"'Courier Prime',monospace" }}>+{s.score}</span>
                        {currentPlayer.isAdmin && (
                          <button onClick={async () => {
                            if (window.confirm("Delete this find? This cannot be undone.")) {
                              try { await deleteDoc(doc(db, "submissions", s.id)); }
                              catch(e) { console.error(e); }
                            }
                          }} style={{ background:"transparent", border:`1px solid ${GV.red}`,
                            borderRadius:6, padding:"3px 7px", color:GV.redB,
                            fontSize:11, cursor:"pointer", fontFamily:"inherit", flexShrink:0 }}>
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                    <div style={{ marginTop:8, fontFamily:"'Courier Prime',monospace",
                      fontSize:22, color:GV.fg, letterSpacing:3 }}>{s.raw}</div>
                    <div style={{ marginTop:4, color:GV.orangeB, fontSize:12 }}>{s.scoreDetail?.base?.name}</div>
                    {s.scoreDetail?.bonuses?.length > 0 && (
                      <div style={{ marginTop:3, color:GV.yellowB, fontSize:11 }}>
                        {s.scoreDetail.bonuses.map(b => b.label).join(" · ")}
                      </div>
                    )}
                    <ProofImage imageData={s.imageData} timestamp={s.timestamp} hadImage={!!s.hasImage} />
                    <ReactionBar submissionId={s.id} reactions={s.reactions || {}} />
                    {s.note && <div style={{ marginTop:6, color:GV.fg3, fontSize:12, fontStyle:"italic" }}>"{s.note}"</div>}
                    <div style={{ marginTop:6, color:GV.bg2, fontSize:11 }}>
                      {dt.toLocaleDateString()} {dt.toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"})}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── RULES ── */}
          {tab==="rules" && <RulesTab hofList={hofList} />}

          {/* ── CHAMPIONS ── */}
          {tab==="champions" && <ChampionsTab champions={champions} players={players} />}

          {/* ── ADMIN ── */}
          {tab==="admin" && currentPlayer.isAdmin && (
            <div>
              <div style={{ color:GV.fg3, fontSize:11, letterSpacing:3, marginBottom:20 }}>SETTINGS</div>

              <div style={{ marginBottom:20, padding:"14px 16px", background:GV.bg1,
                border:`1px solid ${GV.bg2}`, borderRadius:12 }}>
                <label style={{ ...S.label, marginBottom:10 }}>RESET PERIOD</label>
                <select value={periodMode} onChange={e => { setPeriodMode(e.target.value); setPeriodModeDirty(true); }}
                  style={{ ...S.input, width:"100%", cursor:"pointer", marginBottom:8 }}>
                  <option value="monthly">Monthly (resets 1st of every month)</option>
                  <option value="quarterly">Quarterly (resets Jan/Apr/Jul/Oct 1st)</option>
                </select>
                <div style={{ color:GV.bg3, fontSize:11 }}>
                  Current period: {getPeriodLabel(getPeriodKey(new Date(), periodMode), periodMode)}
                </div>
              </div>

              <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
                {[["players","👥 Players"],["hof","🏆 Hall of Fame"]].map(([id,label]) => (
                  <button key={id} onClick={() => setAdminSection(id)} style={{
                    padding:"7px 14px", borderRadius:20,
                    border:`1px solid ${adminSection===id ? GV.orangeB : GV.bg2}`,
                    background: adminSection===id ? `${GV.orangeB}18` : "transparent",
                    color: adminSection===id ? GV.orangeB : GV.fg3,
                    fontSize:12, cursor:"pointer", fontFamily:"inherit",
                  }}>{label}</button>
                ))}
              </div>

              {adminSection==="players" && (
                <div>
                  {players.map(p => (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10,
                      padding:"10px 14px", borderRadius:10, marginBottom:8,
                      background:GV.bg, border:`1px solid ${GV.bg2}` }}>
                      <PlayerBadge player={p} />
                      <span style={{ flex:1, color:GV.fg1 }}>{p.name}</span>
                      <span style={{ color:GV.bg3, fontSize:12, marginRight:8 }}>
                        {submissions.filter(s => s.playerId===p.id).length} finds
                      </span>
                      <button onClick={() => setEditingPlayer(p)} style={{
                        padding:"5px 10px", background:"transparent",
                        border:`1px solid ${GV.bg2}`, borderRadius:8,
                        color:GV.fg3, fontSize:11, cursor:"pointer", fontFamily:"inherit",
                      }}>Edit</button>
                    </div>
                  ))}
                  <button onClick={() => setShowAddPlayer(true)} style={{
                    width:"100%", marginTop:12, padding:"12px", background:"transparent",
                    border:`1px dashed ${GV.bg2}`, borderRadius:10, color:GV.fg3,
                    fontSize:13, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s",
                  }}
                    onMouseOver={e => { e.currentTarget.style.borderColor=GV.orangeB; e.currentTarget.style.color=GV.orangeB; }}
                    onMouseOut={e => { e.currentTarget.style.borderColor=GV.bg2; e.currentTarget.style.color=GV.fg3; }}
                  >+ Add Player</button>
                </div>
              )}

              {adminSection==="hof" && (
                <div>
                  <div style={{ color:GV.fg3, fontSize:11, marginBottom:12 }}>Each earns +40 bonus points</div>
                  {hofList.map((h,i) => (
                    <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                      padding:"9px 14px", borderRadius:10, marginBottom:6,
                      background:GV.bg, border:`1px solid ${GV.bg2}` }}>
                      <span style={{ color:GV.yellowB, fontFamily:"'Courier Prime',monospace", letterSpacing:2 }}>{h.number}</span>
                      <span style={{ color:GV.fg3, fontSize:12 }}>{h.label}</span>
                    </div>
                  ))}
                  <div style={{ marginTop:16, display:"flex", gap:8, flexWrap:"wrap" }}>
                    <input value={newHof} onChange={e => setNewHof(e.target.value)}
                      placeholder="Number" style={{ ...S.input, flex:1, minWidth:90 }} />
                    <input value={newHofLabel} onChange={e => setNewHofLabel(e.target.value)}
                      placeholder="Label" style={{ ...S.input, flex:2, minWidth:120 }} />
                    <button onClick={addHof} style={S.addBtn}>Add</button>
                  </div>
                </div>
              )}

              <div style={{ marginTop:32, borderTop:`1px solid ${GV.bg2}`, paddingTop:20 }}>
                <div style={{ color:GV.bg3, fontSize:11, letterSpacing:2, marginBottom:12 }}>DANGER ZONE</div>
                <button onClick={handleResetScores}
                  style={{ width:"100%", padding:"11px", background:"transparent",
                    border:`1px solid ${GV.red}`, borderRadius:10, color:GV.redB,
                    fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                  Reset All Scores
                </button>
              </div>
            </div>
          )}

        </div>
        <div style={{ height:20 }} />
      </div>
    </ThemeContext.Provider>
  );
}
