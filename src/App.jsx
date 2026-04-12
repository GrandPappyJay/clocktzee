import { useState, useEffect, useRef } from "react";
import { db } from "./firebase";
import {
  collection, doc, getDoc, setDoc, onSnapshot, addDoc, query, orderBy, writeBatch, getDocs,
} from "firebase/firestore";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const INITIAL_PLAYERS = [
  { id: "jason",    name: "Jason",    emoji: "👴", color: "#f97316" },
  { id: "shanda",   name: "Shanda",   emoji: "👩", color: "#ec4899" },
  { id: "lyric",    name: "Lyric",    emoji: "🎵", color: "#a78bfa" },
  { id: "brayden",  name: "Brayden",  emoji: "🧢", color: "#34d399" },
  { id: "karrigan", name: "Karrigan", emoji: "⭐", color: "#fbbf24" },
];

const INITIAL_BIRTHDAYS = {
  jason:    { month: 1, day: 1 },
  shanda:   { month: 1, day: 1 },
  lyric:    { month: 1, day: 1 },
  brayden:  { month: 1, day: 1 },
  karrigan: { month: 1, day: 1 },
};

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
];

const COLOR_OPTIONS = [
  "#f97316","#ec4899","#a78bfa","#34d399","#fbbf24",
  "#f43f5e","#06b6d4","#84cc16","#d946ef","#f59e0b",
  "#3b82f6","#10b981","#ef4444","#8b5cf6","#14b8a6",
];

const IMAGE_TTL_MS = 48 * 60 * 60 * 1000;

// ─── SCORING ENGINE ───────────────────────────────────────────────────────────

function extractDigits(raw) {
  return raw.replace(/\D/g, "");
}

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
        if (parseInt(slice[j]) !== parseInt(slice[j - 1]) + 1) asc = false;
        if (parseInt(slice[j]) !== parseInt(slice[j - 1]) - 1) desc = false;
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
  // One Pair removed by design
  return { name: "No Pattern", points: 0 };
}

function checkBirthday(digits, birthdays) {
  const today = new Date();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();
  for (const [pid, bday] of Object.entries(birthdays)) {
    if (bday.month !== todayM || bday.day !== todayD) continue;
    const mm = String(bday.month).padStart(2, "0");
    const dd = String(bday.day).padStart(2, "0");
    const m  = String(bday.month);
    const d  = String(bday.day);
    for (const pat of [mm + dd, m + dd, mm + d, m + d]) {
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
    const before = idx > 0 ? digits[idx - 1] : null;
    const after  = idx + pat.length < digits.length ? digits[idx + pat.length] : null;
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
  const days = [...daySet].sort((a, b) => {
    const [ay, am, ad] = a.split("-").map(Number);
    const [by, bm, bd] = b.split("-").map(Number);
    return new Date(ay, am, ad) - new Date(by, bm, bd);
  });
  if (days.length < 5) return false;
  const last5 = days.slice(-5);
  for (let i = 1; i < last5.length; i++) {
    const [py, pm, pd] = last5[i - 1].split("-").map(Number);
    const [cy, cm, cd] = last5[i].split("-").map(Number);
    const diff = (new Date(cy, cm, cd) - new Date(py, pm, pd)) / 86400000;
    if (Math.round(diff) !== 1) return false;
  }
  return true;
}

function hasPlayerSubmittedThisFind(submissions, playerId, raw) {
  const digits = extractDigits(raw);
  return submissions.some(
    s => s.playerId === playerId && extractDigits(s.raw) === digits
  );
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

  if (isFirstOfDay(submissions, playerId)) {
    bonuses.push({ label: "🌅 First of the Day", points: 5 }); total += 5;
  }

  const alreadySeen = submissions.some(s => extractDigits(s.raw) === digits);
  if (!alreadySeen) {
    bonuses.push({ label: "🆕 Rare Find (first ever!)", points: 10 }); total += 10;
  }

  if (checkStreak(submissions, playerId)) {
    bonuses.push({ label: "🔥 5-Day Streak", points: 25 }); total += 25;
  }

  return { base, bonuses, total, digits };
}

// ─── IMAGE HELPERS ────────────────────────────────────────────────────────────

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Resize to max 800px wide and compress to 80% JPEG — keeps images well under Firestore's 1MB limit
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
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function isImageExpired(timestamp) {
  return Date.now() - new Date(timestamp).getTime() > IMAGE_TTL_MS;
}

function timeUntilExpiry(timestamp) {
  const ms = IMAGE_TTL_MS - (Date.now() - new Date(timestamp).getTime());
  if (ms <= 0) return "Expired";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

// ─── FIREBASE HELPERS ─────────────────────────────────────────────────────────

async function fsGet(docPath, fallback) {
  try {
    const snap = await getDoc(doc(db, ...docPath.split("/")));
    return snap.exists() ? snap.data().value : fallback;
  } catch { return fallback; }
}

async function fsSet(docPath, value) {
  try {
    await setDoc(doc(db, ...docPath.split("/")), { value });
  } catch (e) { console.error("fsSet error", e); }
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function ScorePreview({ score }) {
  if (!score) return null;
  return (
    <div style={{ background:"rgba(249,115,22,0.07)", border:"1px solid rgba(249,115,22,0.25)",
      borderRadius:12, padding:"14px 16px", marginTop:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
        <span style={{ fontFamily:"'Courier Prime',monospace", color:"#f97316", fontWeight:700, fontSize:15 }}>
          {score.base.name}
        </span>
        <span style={{ fontFamily:"'Courier Prime',monospace", color:"#f97316", fontWeight:900, fontSize:22 }}>
          +{score.total}
        </span>
      </div>
      <div style={{ color:"#94a3b8", fontSize:11, fontFamily:"'Courier Prime',monospace", letterSpacing:3,
        marginBottom: score.bonuses.length ? 8 : 0 }}>
        DIGITS: {score.digits.split("").join(" · ")}
      </div>
      {score.bonuses.map((b, i) => (
        <div key={i} style={{ display:"flex", justifyContent:"space-between", color:"#fbbf24", fontSize:12, marginTop:3 }}>
          <span>{b.label}</span><span>+{b.points}</span>
        </div>
      ))}
    </div>
  );
}

function PlayerBadge({ player, size = "sm" }) {
  const sz = size === "lg" ? 40 : 28;
  return (
    <div style={{ width:sz, height:sz, borderRadius:"50%", background:player.color+"22",
      border:`2px solid ${player.color}`, display:"flex", alignItems:"center",
      justifyContent:"center", fontSize: size==="lg" ? 20 : 14, flexShrink:0 }}>
      {player.emoji}
    </div>
  );
}

function ProofImage({ imageData, timestamp, hadImage }) {
  const [open, setOpen] = useState(false);
  const expired = isImageExpired(timestamp);
  if (!hadImage) return null;
  if (expired || !imageData) {
    return (
      <div style={{ marginTop:8, color:"#2d3748", fontSize:11, fontStyle:"italic" }}>
        📷 Proof expired (48h window closed)
      </div>
    );
  }
  return (
    <>
      <div onClick={() => setOpen(true)} style={{ marginTop:8, cursor:"pointer",
        borderRadius:8, overflow:"hidden", border:"1px solid #1e293b",
        maxWidth:160, position:"relative" }}>
        <img src={imageData} alt="proof" style={{ width:"100%", display:"block", opacity:0.85 }} />
        <div style={{ position:"absolute", bottom:0, left:0, right:0,
          background:"rgba(0,0,0,0.6)", fontSize:9, color:"#94a3b8", padding:"3px 6px", letterSpacing:1 }}>
          ⏱ {timeUntilExpiry(timestamp)} left
        </div>
      </div>
      {open && (
        <div onClick={() => setOpen(false)} style={{ position:"fixed", inset:0,
          background:"rgba(0,0,0,0.92)", display:"flex", alignItems:"center",
          justifyContent:"center", zIndex:999, padding:20 }}>
          <img src={imageData} alt="proof full" style={{ maxWidth:"100%", maxHeight:"90vh",
            borderRadius:12, border:"2px solid #f97316" }} />
        </div>
      )}
    </>
  );
}

// ─── PLAYER PROFILE MODAL ─────────────────────────────────────────────────────

function PlayerProfile({ player, submissions, onClose }) {
  const subs = submissions.filter(s => s.playerId === player.id);
  const total = subs.reduce((a, s) => a + s.score, 0);
  const best = subs.length ? Math.max(...subs.map(s => s.score)) : 0;
  const rarFinds = subs.filter(s => s.scoreDetail?.bonuses?.some(b => b.label.includes("Rare")));

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)",
      zIndex:200, overflowY:"auto", padding:"20px 16px" }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#0f0f1a",
        border:`1px solid ${player.color}44`, borderRadius:16, maxWidth:480,
        margin:"0 auto", overflow:"hidden" }}>

        {/* Header */}
        <div style={{ background:`linear-gradient(135deg, ${player.color}22, transparent)`,
          padding:"24px 20px 16px", borderBottom:"1px solid #1e293b" }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <div style={{ width:52, height:52, borderRadius:"50%", background:player.color+"33",
              border:`3px solid ${player.color}`, display:"flex", alignItems:"center",
              justifyContent:"center", fontSize:28 }}>{player.emoji}</div>
            <div>
              <div style={{ fontWeight:900, fontSize:22, color:"#fff" }}>{player.name}</div>
              <div style={{ color:player.color, fontSize:12, marginTop:2 }}>{subs.length} finds total</div>
            </div>
            <button onClick={onClose} style={{ marginLeft:"auto", background:"none", border:"none",
              color:"#475569", fontSize:22, cursor:"pointer", padding:4 }}>✕</button>
          </div>

          {/* Stats row */}
          <div style={{ display:"flex", gap:12, marginTop:16 }}>
            {[["TOTAL PTS", total], ["BEST FIND", `+${best}`], ["RARE FINDS", rarFinds.length]].map(([label, val]) => (
              <div key={label} style={{ flex:1, background:"rgba(0,0,0,0.3)", borderRadius:10,
                padding:"10px 12px", textAlign:"center" }}>
                <div style={{ color:player.color, fontWeight:900, fontSize:20,
                  fontFamily:"'Courier Prime',monospace" }}>{val}</div>
                <div style={{ color:"#475569", fontSize:9, letterSpacing:1, marginTop:2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Submissions */}
        <div style={{ padding:"16px", maxHeight:"60vh", overflowY:"auto" }}>
          <div style={{ color:"#475569", fontSize:11, letterSpacing:3, marginBottom:12 }}>FIND HISTORY</div>
          {subs.length === 0 && (
            <div style={{ color:"#334155", textAlign:"center", padding:"30px 0", fontSize:13 }}>
              No finds yet!
            </div>
          )}
          {subs.map(s => {
            const dt = new Date(s.timestamp);
            return (
              <div key={s.id} style={{ display:"flex", alignItems:"flex-start", gap:12,
                padding:"10px 0", borderBottom:"1px solid #0f172a" }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Courier Prime',monospace", fontSize:18,
                    color:"#e2e8f0", letterSpacing:2 }}>{s.raw}</div>
                  <div style={{ color:"#f97316", fontSize:11, marginTop:2 }}>{s.scoreDetail?.base?.name}</div>
                  {s.scoreDetail?.bonuses?.length > 0 && (
                    <div style={{ color:"#fbbf24", fontSize:10, marginTop:1 }}>
                      {s.scoreDetail.bonuses.map(b => b.label).join(" · ")}
                    </div>
                  )}
                  {s.category && s.category !== "Other" && (
                    <div style={{ color:"#334155", fontSize:10, marginTop:2 }}>{s.category}</div>
                  )}
                  <div style={{ color:"#1e293b", fontSize:10, marginTop:2 }}>
                    {dt.toLocaleDateString()} {dt.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
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

// ─── ADD PLAYER MODAL ─────────────────────────────────────────────────────────

function AddPlayerModal({ onAdd, onClose, inputStyle }) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [bdMonth, setBdMonth] = useState(1);
  const [bdDay, setBdDay] = useState(1);

  function handleAdd() {
    if (!name.trim()) return;
    onAdd({ name: name.trim(), emoji, color, birthday: { month: bdMonth, day: bdDay } });
  }

  const numStyle = { width:50, background:"#0d0d16", border:"1px solid #1e293b",
    borderRadius:8, padding:"8px", color:"#e2e8f0", fontSize:13,
    fontFamily:"inherit", outline:"none", textAlign:"center" };

  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.85)",
      zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:"#0f0f1a",
        border:"1px solid #1e293b", borderRadius:16, padding:24, width:"100%", maxWidth:420 }}>

        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
          <span style={{ color:"#e2e8f0", fontWeight:700, fontSize:16 }}>Add Player</span>
          <button onClick={onClose} style={{ background:"none", border:"none",
            color:"#475569", fontSize:20, cursor:"pointer" }}>✕</button>
        </div>

        {/* Preview */}
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20,
          padding:"12px 16px", background:"rgba(255,255,255,0.02)",
          border:`1px solid ${color}44`, borderRadius:12 }}>
          <div style={{ width:44, height:44, borderRadius:"50%", background:color+"22",
            border:`2px solid ${color}`, display:"flex", alignItems:"center",
            justifyContent:"center", fontSize:22 }}>{emoji}</div>
          <span style={{ color:color, fontWeight:700, fontSize:16 }}>{name || "Player Name"}</span>
        </div>

        {/* Name */}
        <div style={{ marginBottom:16 }}>
          <label style={{ color:"#64748b", fontSize:11, letterSpacing:2, display:"block", marginBottom:8 }}>NAME</label>
          <input value={name} onChange={e => setName(e.target.value)}
            placeholder="Enter name"
            style={{ ...inputStyle, width:"100%", boxSizing:"border-box" }} />
        </div>

        {/* Emoji picker */}
        <div style={{ marginBottom:16 }}>
          <label style={{ color:"#64748b", fontSize:11, letterSpacing:2, display:"block", marginBottom:8 }}>EMOJI</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
            {EMOJI_OPTIONS.map(e => (
              <button key={e} onClick={() => setEmoji(e)} style={{
                width:36, height:36, borderRadius:8, fontSize:18, cursor:"pointer",
                background: emoji===e ? "rgba(249,115,22,0.2)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${emoji===e ? "#f97316" : "#1e293b"}`,
              }}>{e}</button>
            ))}
          </div>
        </div>

        {/* Color picker */}
        <div style={{ marginBottom:16 }}>
          <label style={{ color:"#64748b", fontSize:11, letterSpacing:2, display:"block", marginBottom:8 }}>COLOR</label>
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {COLOR_OPTIONS.map(c => (
              <button key={c} onClick={() => setColor(c)} style={{
                width:28, height:28, borderRadius:"50%", background:c, cursor:"pointer",
                border: color===c ? "3px solid #fff" : "2px solid transparent",
                outline: color===c ? `2px solid ${c}` : "none",
              }} />
            ))}
          </div>
        </div>

        {/* Birthday */}
        <div style={{ marginBottom:24 }}>
          <label style={{ color:"#64748b", fontSize:11, letterSpacing:2, display:"block", marginBottom:8 }}>
            BIRTHDAY <span style={{ color:"#334155", letterSpacing:0, textTransform:"none", fontSize:10 }}>(for bonus)</span>
          </label>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <input type="number" min="1" max="12" value={bdMonth}
              onChange={e => setBdMonth(parseInt(e.target.value)||1)} style={numStyle} />
            <span style={{ color:"#334155" }}>/</span>
            <input type="number" min="1" max="31" value={bdDay}
              onChange={e => setBdDay(parseInt(e.target.value)||1)} style={numStyle} />
            <span style={{ color:"#475569", fontSize:11 }}>MM / DD</span>
          </div>
        </div>

        <button onClick={handleAdd} style={{ width:"100%", padding:"13px",
          background:"linear-gradient(135deg,#f97316,#ea580c)", border:"none",
          borderRadius:12, color:"#fff", fontSize:14, fontWeight:900,
          letterSpacing:2, cursor:"pointer", fontFamily:"inherit" }}>
          ADD PLAYER
        </button>
      </div>
    </div>
  );
}

// ─── RULES TAB ────────────────────────────────────────────────────────────────

function RulesTab({ hofList }) {
  const baseScores = [
    { name: "Five of a Kind 🎰", pts: 100, example: "1:11:11", desc: "All digits the same" },
    { name: "Straight 📈",       pts: 80,  example: "1:23:45", desc: "4 or 5 sequential digits (asc or desc)" },
    { name: "Four of a Kind 🔥", pts: 60,  example: "11:12",   desc: "Four matching digits" },
    { name: "Full House 🏠",     pts: 50,  example: "11:22:2", desc: "Three of one + two of another" },
    { name: "Small Straight 📉", pts: 40,  example: "1:23",    desc: "3 sequential digits (asc or desc)" },
    { name: "Three of a Kind ✨",pts: 30,  example: "2:22",    desc: "Three matching digits" },
    { name: "Two Pair 👀",       pts: 20,  example: "11:22",   desc: "Two sets of pairs" },
    { name: "No Pattern",        pts: 0,   example: "1:37",    desc: "No matches or runs" },
  ];
  const bonuses = [
    { label: "🎂 Birthday Find",   pts: "+25", desc: "Today is someone's birthday and the submission is exactly their MM/DD digits" },
    { label: "🏆 Hall of Fame",     pts: "+40", desc: "Submission contains a recognized funny/famous number" },
    { label: "🌅 First of the Day", pts: "+5",  desc: "Your first submission of the calendar day" },
    { label: "🆕 Rare Find",        pts: "+10", desc: "This digit pattern has never been submitted by anyone before" },
    { label: "🔥 5-Day Streak",     pts: "+25", desc: "You've submitted at least one find on each of the last 5 consecutive days" },
  ];

  const row = (left, right, accent = false) => (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start",
      padding:"10px 14px", borderBottom:"1px solid #0f172a",
      background: accent ? "rgba(249,115,22,0.04)" : "transparent" }}>
      {left}{right}
    </div>
  );

  return (
    <div>
      <div style={{ color:"#475569", fontSize:11, letterSpacing:3, marginBottom:20 }}>HOW TO PLAY</div>
      <div style={{ color:"#94a3b8", fontSize:12, lineHeight:1.7, marginBottom:24,
        background:"rgba(255,255,255,0.02)", border:"1px solid #1e293b", borderRadius:12, padding:"14px 16px" }}>
        Spot a number in the wild — a clock, receipt, address, odometer, anything.
        Screenshot or photograph it, then submit. Your digits are scored like Yahtzee.
        Everyone plays independently; the same number can be submitted by multiple players
        but you can't submit the same digits twice yourself. Proof photo required.
      </div>
      <div style={{ color:"#475569", fontSize:11, letterSpacing:3, marginBottom:12 }}>BASE SCORES</div>
      <div style={{ border:"1px solid #1e293b", borderRadius:12, overflow:"hidden", marginBottom:24 }}>
        {baseScores.map((s, i) => row(
          <div>
            <div style={{ color: s.pts > 0 ? "#e2e8f0" : "#475569", fontSize:13, fontWeight: s.pts > 0 ? 600 : 400 }}>{s.name}</div>
            <div style={{ color:"#334155", fontSize:11, marginTop:2 }}>{s.desc}</div>
            <div style={{ color:"#475569", fontSize:11, fontFamily:"'Courier Prime',monospace", marginTop:2, letterSpacing:2 }}>e.g. {s.example}</div>
          </div>,
          <div style={{ fontFamily:"'Courier Prime',monospace", fontWeight:900, fontSize:18,
            color: s.pts >= 80 ? "#f97316" : s.pts >= 50 ? "#fbbf24" : s.pts > 0 ? "#94a3b8" : "#334155",
            marginLeft:12, flexShrink:0 }}>{s.pts > 0 ? `+${s.pts}` : "—"}</div>,
          i % 2 === 0
        ))}
      </div>
      <div style={{ color:"#475569", fontSize:11, letterSpacing:3, marginBottom:12 }}>BONUSES (stack with base)</div>
      <div style={{ border:"1px solid #1e293b", borderRadius:12, overflow:"hidden", marginBottom:24 }}>
        {bonuses.map((b, i) => row(
          <div>
            <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{b.label}</div>
            <div style={{ color:"#334155", fontSize:11, marginTop:2, lineHeight:1.5 }}>{b.desc}</div>
          </div>,
          <div style={{ fontFamily:"'Courier Prime',monospace", fontWeight:900, fontSize:18,
            color:"#fbbf24", marginLeft:12, flexShrink:0 }}>{b.pts}</div>,
          i % 2 === 0
        ))}
      </div>
      <div style={{ color:"#475569", fontSize:11, letterSpacing:3, marginBottom:12 }}>HALL OF FAME NUMBERS</div>
      <div style={{ border:"1px solid #1e293b", borderRadius:12, overflow:"hidden", marginBottom:24 }}>
        {hofList.map((h, i) => row(
          <span style={{ color:"#fbbf24", fontFamily:"'Courier Prime',monospace", letterSpacing:2, fontSize:14 }}>{h.number}</span>,
          <span style={{ color:"#64748b", fontSize:12 }}>{h.label}</span>,
          i % 2 === 0
        ))}
      </div>
      <div style={{ color:"#475569", fontSize:11, letterSpacing:3, marginBottom:12 }}>VALIDITY</div>
      <div style={{ border:"1px solid #1e293b", borderRadius:12, padding:"14px 16px",
        color:"#334155", fontSize:12, lineHeight:1.8 }}>
        ✓ Real photo or screenshot required — no exceptions<br/>
        ✓ Numbers must appear naturally in the wild<br/>
        ✗ No staging (don't set your clock to 1:11)<br/>
        ✗ No submitting the same digit pattern twice<br/>
        ✓ Honor system — it's for fun
      </div>
    </div>
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab] = useState("board");
  const [players, setPlayers] = useState(INITIAL_PLAYERS);
  const [submissions, setSubmissions] = useState([]);
  const [hofList, setHofList] = useState(HALL_OF_FAME_DEFAULT);
  const [birthdays, setBirthdays] = useState(INITIAL_BIRTHDAYS);
  const [loaded, setLoaded] = useState(false);

  const [selPlayer, setSelPlayer] = useState("");
  const [rawInput, setRawInput] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState(null);
  const [preview, setPreview] = useState(null);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef();

  const [profilePlayer, setProfilePlayer] = useState(null);
  const [showAddPlayer, setShowAddPlayer] = useState(false);

  const [newHof, setNewHof] = useState("");
  const [newHofLabel, setNewHofLabel] = useState("");
  const [adminSection, setAdminSection] = useState("players");

  // ── Load settings ──
  useEffect(() => {
    (async () => {
      const p = await fsGet("settings/players", INITIAL_PLAYERS);
      const h = await fsGet("settings/hof", HALL_OF_FAME_DEFAULT);
      const b = await fsGet("settings/birthdays", INITIAL_BIRTHDAYS);
      setPlayers(p); setHofList(h); setBirthdays(b);
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
        if (data.hasImage && (now - new Date(data.timestamp).getTime() > IMAGE_TTL_MS)) {
          data.imageData = null;
        }
        return { ...data, id: d.id };
      }));
    });
    return unsub;
  }, []);

  // ── Persist settings ──
  useEffect(() => { if (loaded) fsSet("settings/players", players); }, [players, loaded]);
  useEffect(() => { if (loaded) fsSet("settings/hof", hofList); }, [hofList, loaded]);
  useEffect(() => { if (loaded) fsSet("settings/birthdays", birthdays); }, [birthdays, loaded]);

  // ── Score preview ──
  useEffect(() => {
    if (!rawInput || !selPlayer) { setPreview(null); return; }
    setPreview(scoreSubmission(rawInput, category, selPlayer, submissions, birthdays, hofList));
  }, [rawInput, selPlayer, category, submissions]);

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

  async function handleSubmit() {
    setSubmitError("");
    if (!selPlayer)       { setSubmitError("Select a player."); return; }
    if (!rawInput.trim()) { setSubmitError("Enter the number you found."); return; }
    if (!imageFile)       { setSubmitError("Attach a proof photo — pic or it didn't happen! 📷"); return; }
    if (hasPlayerSubmittedThisFind(submissions, selPlayer, rawInput)) {
      setSubmitError("You already submitted this find!"); return;
    }
    setSubmitting(true);
    try {
      const score = scoreSubmission(rawInput, category, selPlayer, submissions, birthdays, hofList);
      const imageData = await compressImage(imageFile);
      await addDoc(collection(db, "submissions"), {
        playerId: selPlayer,
        raw: rawInput.trim(),
        category: category || null,
        note: note.trim(),
        score: score.total,
        scoreDetail: score,
        hasImage: true,
        imageData,
        timestamp: new Date().toISOString(),
      });
      setRawInput(""); setNote(""); setCategory(""); setPreview(null); clearImage();
      setTab("board");
    } catch (e) {
      console.error(e);
      setSubmitError("Couldn't save. Try a smaller photo.");
    }
    setSubmitting(false);
  }

  function handleAddPlayer({ name, emoji, color, birthday }) {
    const id = name.toLowerCase().replace(/\s+/g, "_") + "_" + Date.now();
    setPlayers(prev => [...prev, { id, name, emoji, color }]);
    setBirthdays(prev => ({ ...prev, [id]: birthday }));
    setShowAddPlayer(false);
  }

  function addHof() {
    if (!newHof.trim()) return;
    setHofList(prev => [...prev, { number: newHof.trim(),
      label: newHofLabel.trim() || newHof.trim(), points: 40 }]);
    setNewHof(""); setNewHofLabel("");
  }

  const leaderboard = players.map(p => {
    const subs = submissions.filter(s => s.playerId === p.id);
    return { ...p,
      total: subs.reduce((a, s) => a + s.score, 0),
      count: subs.length,
      best: subs.length ? Math.max(...subs.map(s => s.score)) : 0,
    };
  }).sort((a, b) => b.total - a.total);

  const S = {
    label: { color:"#64748b", fontSize:11, letterSpacing:2, display:"block", marginBottom:8 },
    input: { background:"#0d0d16", border:"1px solid #1e293b",
      borderRadius:10, padding:"12px 14px", color:"#e2e8f0",
      fontSize:13, fontFamily:"inherit", outline:"none", boxSizing:"border-box" },
    card:  { background:"rgba(255,255,255,0.02)", border:"1px solid #1e293b",
      borderRadius:12, padding:"14px 16px", marginBottom:10 },
    addBtn:{ padding:"10px 16px", background:"#f97316", border:"none",
      borderRadius:10, color:"#fff", fontWeight:700, cursor:"pointer", fontFamily:"inherit", fontSize:13 },
  };

  if (!loaded) return (
    <div style={{ background:"#0a0a0f", minHeight:"100vh", display:"flex",
      alignItems:"center", justifyContent:"center",
      color:"#f97316", fontFamily:"'Courier Prime',monospace", fontSize:20 }}>
      Loading Clocktzee…
    </div>
  );

  const NAV = [
    ["board",  "🏆 Board"],
    ["submit", "➕ Submit"],
    ["feed",   "📋 Feed"],
    ["rules",  "📖 Rules"],
    ["admin",  "⚙️ Admin"],
  ];

  return (
    <div style={{ background:"#0a0a0f", minHeight:"100vh",
      fontFamily:"'Courier Prime',monospace", color:"#e2e8f0",
      maxWidth:480, margin:"0 auto", paddingBottom:80 }}>

      {/* Modals */}
      {profilePlayer && (
        <PlayerProfile
          player={profilePlayer}
          submissions={submissions}
          onClose={() => setProfilePlayer(null)}
        />
      )}
      {showAddPlayer && (
        <AddPlayerModal
          onAdd={handleAddPlayer}
          onClose={() => setShowAddPlayer(false)}
          inputStyle={S.input}
        />
      )}

      {/* Header */}
      <div style={{ padding:"28px 20px 16px", borderBottom:"1px solid #1e293b",
        background:"linear-gradient(180deg,#0f0f1a 0%,#0a0a0f 100%)" }}>
        <div style={{ display:"flex", alignItems:"baseline", gap:10 }}>
          <span style={{ fontSize:32, fontWeight:900, color:"#f97316", letterSpacing:-1 }}>CLOCK</span>
          <span style={{ fontSize:32, fontWeight:900, color:"#fbbf24", letterSpacing:-1 }}>TZEE</span>
          <span style={{ fontSize:22, marginLeft:4 }}>🎲</span>
        </div>
        <div style={{ color:"#475569", fontSize:11, letterSpacing:3, marginTop:2 }}>
          FAMILY NUMBER HUNT · GRANDPAPPYLABS
        </div>
      </div>

      {/* Nav */}
      <div style={{ display:"flex", borderBottom:"1px solid #1e293b",
        background:"#0d0d16", position:"sticky", top:0, zIndex:10, overflowX:"auto" }}>
        {NAV.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{
            flex:1, minWidth:60, padding:"12px 4px", background:"none", border:"none",
            borderBottom: tab===id ? "2px solid #f97316" : "2px solid transparent",
            color: tab===id ? "#f97316" : "#475569",
            fontSize:10, letterSpacing:0.5, cursor:"pointer", fontFamily:"inherit",
            fontWeight: tab===id ? 700 : 400, transition:"all 0.15s", whiteSpace:"nowrap",
          }}>{label}</button>
        ))}
      </div>

      <div style={{ padding:"20px 16px" }}>

        {/* ── BOARD ── */}
        {tab==="board" && (
          <div>
            <div style={{ color:"#475569", fontSize:11, letterSpacing:3, marginBottom:20 }}>STANDINGS</div>
            {leaderboard.map((p, i) => (
              <div key={p.id}
                onClick={() => setProfilePlayer(p)}
                style={{ display:"flex", alignItems:"center", gap:12, cursor:"pointer",
                  background: i===0 ? "rgba(249,115,22,0.06)" : "rgba(255,255,255,0.02)",
                  border:`1px solid ${i===0?"rgba(249,115,22,0.2)":"#1e293b"}`,
                  borderRadius:12, padding:"14px 16px", marginBottom:10,
                  transition:"border-color 0.15s" }}
                onMouseOver={e => e.currentTarget.style.borderColor = p.color+"66"}
                onMouseOut={e => e.currentTarget.style.borderColor = i===0?"rgba(249,115,22,0.2)":"#1e293b"}
              >
                <div style={{ color:i===0?"#f97316":"#334155", fontSize:18, fontWeight:900,
                  width:28, textAlign:"center" }}>
                  {i===0?"🥇":i===1?"🥈":i===2?"🥉":`#${i+1}`}
                </div>
                <PlayerBadge player={p} />
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:16, color:i===0?"#fff":"#cbd5e1" }}>{p.name}</div>
                  <div style={{ color:"#475569", fontSize:11, marginTop:2 }}>
                    {p.count} find{p.count!==1?"s":""} · best: +{p.best}
                  </div>
                </div>
                <div style={{ fontWeight:900, fontSize:26, color:i===0?"#f97316":"#64748b",
                  fontFamily:"'Courier Prime',monospace" }}>{p.total}</div>
                <div style={{ color:"#334155", fontSize:12 }}>›</div>
              </div>
            ))}
            {leaderboard.every(p => p.total===0) && (
              <div style={{ color:"#334155", textAlign:"center", marginTop:40, fontSize:13 }}>
                No finds yet. Be the first! 🎲
              </div>
            )}
          </div>
        )}

        {/* ── SUBMIT ── */}
        {tab==="submit" && (
          <div>
            <div style={{ color:"#475569", fontSize:11, letterSpacing:3, marginBottom:20 }}>LOG A FIND</div>

            <div style={{ marginBottom:16 }}>
              <label style={S.label}>WHO FOUND IT?</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {players.map(p => (
                  <button key={p.id} onClick={() => setSelPlayer(p.id)} style={{
                    padding:"8px 14px", borderRadius:20,
                    border:`1.5px solid ${selPlayer===p.id?p.color:"#1e293b"}`,
                    background: selPlayer===p.id ? p.color+"22" : "transparent",
                    color: selPlayer===p.id ? p.color : "#475569",
                    fontSize:13, cursor:"pointer", fontFamily:"inherit",
                    display:"flex", alignItems:"center", gap:6, transition:"all 0.15s",
                  }}>
                    {p.emoji} {p.name}
                  </button>
                ))}
              </div>
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
                CATEGORY <span style={{ color:"#334155", letterSpacing:0,
                  textTransform:"none", fontSize:10, fontWeight:400 }}>· optional</span>
              </label>
              <select value={category} onChange={e => setCategory(e.target.value)}
                style={{ ...S.input, width:"100%", cursor:"pointer" }}>
                <option value="">— skip —</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div style={{ marginBottom:16 }}>
              <label style={S.label}>
                PROOF PHOTO <span style={{ color:"#ef4444" }}>* required</span>
                <span style={{ color:"#334155", marginLeft:8, letterSpacing:0,
                  textTransform:"none", fontSize:10, fontWeight:400 }}>· expires 48h after submit</span>
              </label>
              {!imagePreviewUrl ? (
                <div onClick={() => fileInputRef.current?.click()}
                  style={{ border:"2px dashed #1e293b", borderRadius:12, padding:"28px 16px",
                    textAlign:"center", cursor:"pointer", color:"#475569", fontSize:13,
                    transition:"all 0.15s" }}
                  onMouseOver={e => e.currentTarget.style.borderColor="#f97316"}
                  onMouseOut={e => e.currentTarget.style.borderColor="#1e293b"}>
                  <div style={{ fontSize:32, marginBottom:8 }}>📷</div>
                  Tap to attach screenshot or photo
                </div>
              ) : (
                <div style={{ position:"relative", borderRadius:12, overflow:"hidden",
                  border:"1px solid rgba(249,115,22,0.3)" }}>
                  <img src={imagePreviewUrl} alt="preview"
                    style={{ width:"100%", display:"block", maxHeight:240, objectFit:"cover" }} />
                  <button onClick={clearImage} style={{ position:"absolute", top:8, right:8,
                    background:"rgba(0,0,0,0.7)", border:"none", borderRadius:"50%",
                    width:28, height:28, color:"#fff", fontSize:14,
                    cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
                  <div style={{ position:"absolute", bottom:0, left:0, right:0,
                    background:"rgba(0,0,0,0.65)", padding:"5px 10px",
                    fontSize:10, color:"#94a3b8", letterSpacing:1 }}>
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
                placeholder="Where / context…"
                style={{ ...S.input, width:"100%" }} />
            </div>

            <ScorePreview score={preview} />

            <button onClick={handleSubmit} disabled={submitting} style={{
              width:"100%", marginTop:16, padding:"15px",
              background: submitting ? "#7c3d10" : "linear-gradient(135deg,#f97316,#ea580c)",
              border:"none", borderRadius:12, color:"#fff",
              fontSize:15, fontWeight:900, letterSpacing:2,
              cursor: submitting ? "not-allowed" : "pointer", fontFamily:"inherit",
              boxShadow:"0 4px 20px rgba(249,115,22,0.3)", transition:"all 0.15s",
            }}>
              {submitting ? "SAVING…" : "SUBMIT FIND"}
            </button>

            {submitError && (
              <div style={{ marginTop:12, color:"#f43f5e", fontSize:13, textAlign:"center" }}>
                {submitError}
              </div>
            )}
          </div>
        )}

        {/* ── FEED ── */}
        {tab==="feed" && (
          <div>
            <div style={{ color:"#475569", fontSize:11, letterSpacing:3, marginBottom:20 }}>
              RECENT FINDS · {submissions.length} TOTAL
            </div>
            {submissions.length===0 && (
              <div style={{ color:"#334155", textAlign:"center", marginTop:40, fontSize:13 }}>No finds yet!</div>
            )}
            {submissions.slice(0, 40).map(s => {
              const player = players.find(p => p.id===s.playerId) || { name:"?", emoji:"?", color:"#666" };
              const dt = new Date(s.timestamp);
              return (
                <div key={s.id} style={{ ...S.card, borderLeft:`3px solid ${player.color}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:18 }}>{player.emoji}</span>
                      <div>
                        <span style={{ color:player.color, fontWeight:700, fontSize:13 }}>{player.name}</span>
                        {s.category && (
                          <span style={{ color:"#334155", fontSize:11, marginLeft:8 }}>{s.category}</span>
                        )}
                      </div>
                    </div>
                    <span style={{ color:"#f97316", fontWeight:900, fontSize:22,
                      fontFamily:"'Courier Prime',monospace" }}>+{s.score}</span>
                  </div>
                  <div style={{ marginTop:8, fontFamily:"'Courier Prime',monospace",
                    fontSize:22, color:"#e2e8f0", letterSpacing:3 }}>{s.raw}</div>
                  <div style={{ marginTop:4, color:"#f97316", fontSize:12 }}>{s.scoreDetail?.base?.name}</div>
                  {s.scoreDetail?.bonuses?.length > 0 && (
                    <div style={{ marginTop:3, color:"#fbbf24", fontSize:11 }}>
                      {s.scoreDetail.bonuses.map(b => b.label).join(" · ")}
                    </div>
                  )}
                  <ProofImage imageData={s.imageData} timestamp={s.timestamp} hadImage={!!s.hasImage} />
                  {s.note && (
                    <div style={{ marginTop:6, color:"#475569", fontSize:12, fontStyle:"italic" }}>"{s.note}"</div>
                  )}
                  <div style={{ marginTop:6, color:"#1e293b", fontSize:11 }}>
                    {dt.toLocaleDateString()} {dt.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── RULES ── */}
        {tab==="rules" && <RulesTab hofList={hofList} />}

        {/* ── ADMIN ── */}
        {tab==="admin" && (
          <div>
            <div style={{ color:"#475569", fontSize:11, letterSpacing:3, marginBottom:20 }}>SETTINGS</div>
            <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
              {[["players","👥 Players"],["hof","🏆 Hall of Fame"],["birthdays","🎂 Birthdays"]].map(([id, label]) => (
                <button key={id} onClick={() => setAdminSection(id)} style={{
                  padding:"7px 14px", borderRadius:20,
                  border:`1px solid ${adminSection===id?"#f97316":"#1e293b"}`,
                  background: adminSection===id ? "rgba(249,115,22,0.1)" : "transparent",
                  color: adminSection===id ? "#f97316" : "#475569",
                  fontSize:12, cursor:"pointer", fontFamily:"inherit",
                }}>{label}</button>
              ))}
            </div>

            {adminSection==="players" && (
              <div>
                {players.map(p => (
                  <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10,
                    padding:"10px 14px", borderRadius:10, marginBottom:8,
                    background:"rgba(255,255,255,0.02)", border:"1px solid #1e293b" }}>
                    <PlayerBadge player={p} />
                    <span style={{ flex:1, color:"#cbd5e1" }}>{p.name}</span>
                    <span style={{ color:"#334155", fontSize:12 }}>
                      {submissions.filter(s => s.playerId===p.id).length} finds
                    </span>
                  </div>
                ))}
                <button onClick={() => setShowAddPlayer(true)} style={{
                  width:"100%", marginTop:12, padding:"12px",
                  background:"transparent", border:"1px dashed #1e293b",
                  borderRadius:10, color:"#475569", fontSize:13,
                  cursor:"pointer", fontFamily:"inherit",
                  transition:"all 0.15s"
                }}
                  onMouseOver={e => { e.currentTarget.style.borderColor="#f97316"; e.currentTarget.style.color="#f97316"; }}
                  onMouseOut={e => { e.currentTarget.style.borderColor="#1e293b"; e.currentTarget.style.color="#475569"; }}
                >+ Add Player</button>
              </div>
            )}

            {adminSection==="hof" && (
              <div>
                <div style={{ color:"#64748b", fontSize:11, marginBottom:12 }}>Each earns +40 bonus points</div>
                {hofList.map((h, i) => (
                  <div key={i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
                    padding:"9px 14px", borderRadius:10, marginBottom:6,
                    background:"rgba(255,255,255,0.02)", border:"1px solid #1e293b" }}>
                    <span style={{ color:"#fbbf24", fontFamily:"'Courier Prime',monospace", letterSpacing:2 }}>{h.number}</span>
                    <span style={{ color:"#64748b", fontSize:12 }}>{h.label}</span>
                  </div>
                ))}
                <div style={{ marginTop:16, display:"flex", gap:8, flexWrap:"wrap" }}>
                  <input value={newHof} onChange={e => setNewHof(e.target.value)}
                    placeholder="Number"
                    style={{ ...S.input, flex:1, minWidth:90 }} />
                  <input value={newHofLabel} onChange={e => setNewHofLabel(e.target.value)}
                    placeholder="Label"
                    style={{ ...S.input, flex:2, minWidth:120 }} />
                  <button onClick={addHof} style={S.addBtn}>Add</button>
                </div>
              </div>
            )}

            {adminSection==="birthdays" && (
              <div>
                <div style={{ color:"#64748b", fontSize:11, marginBottom:4 }}>Birthday bonus (+25 pts) fires only when:</div>
                <div style={{ color:"#334155", fontSize:11, marginBottom:16, lineHeight:1.7 }}>
                  1) Today IS that person's birthday<br/>
                  2) The submission is exactly their MM/DD digits (nothing extra)
                </div>
                {players.map(p => {
                  const bday = birthdays[p.id] || { month:1, day:1 };
                  const numStyle = { width:44, background:"#0d0d16", border:"1px solid #1e293b",
                    borderRadius:8, padding:"6px 8px", color:"#e2e8f0",
                    fontSize:13, fontFamily:"inherit", outline:"none", textAlign:"center" };
                  return (
                    <div key={p.id} style={{ display:"flex", alignItems:"center", gap:10,
                      padding:"10px 14px", borderRadius:10, marginBottom:8,
                      background:"rgba(255,255,255,0.02)", border:"1px solid #1e293b" }}>
                      <span style={{ fontSize:16 }}>{p.emoji}</span>
                      <span style={{ flex:1, color:"#cbd5e1", fontSize:13 }}>{p.name}</span>
                      <input type="number" min="1" max="12" value={bday.month} style={numStyle}
                        onChange={e => setBirthdays(prev => ({...prev,[p.id]:{...bday,month:parseInt(e.target.value)||1}}))} />
                      <span style={{ color:"#334155" }}>/</span>
                      <input type="number" min="1" max="31" value={bday.day} style={numStyle}
                        onChange={e => setBirthdays(prev => ({...prev,[p.id]:{...bday,day:parseInt(e.target.value)||1}}))} />
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop:32, borderTop:"1px solid #1e293b", paddingTop:20 }}>
              <div style={{ color:"#334155", fontSize:11, letterSpacing:2, marginBottom:12 }}>DANGER ZONE</div>
              <button onClick={async () => {
                if (window.confirm("Reset ALL scores and submissions? Players and settings stay. Cannot be undone.")) {
                  const snap = await getDocs(collection(db, "submissions"));
                  const batch = writeBatch(db);
                  snap.docs.forEach(d => batch.delete(d.ref));
                  await batch.commit();
                }
              }} style={{ width:"100%", padding:"11px", background:"transparent",
                border:"1px solid #7f1d1d", borderRadius:10, color:"#ef4444",
                fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
                Reset All Scores
              </button>
            </div>
          </div>
        )}
      </div>
      <div style={{ height:20 }} />
    </div>
  );
}
