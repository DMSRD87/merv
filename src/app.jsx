import { useState, useEffect, useRef } from "react";

// ============================================================
// MERV --- client config. Everything client-specific lives HERE.
// Values come from Vercel environment variables when set;
// otherwise the defaults below (Ross Stafford Plumbing) apply.
// List variables are comma-separated strings in Vercel.
// ============================================================
const env = import.meta.env || {};
const list = (v, fallback) => (v ? String(v).split(",").map(s => s.trim()).filter(Boolean) : fallback);

const CFG = {
  businessName: env.VITE_BUSINESS_NAME || "Ross Stafford Plumbing",
  appName: env.VITE_APP_NAME || "RSP Job Sheets",
  adminPin: env.VITE_ADMIN_PIN || "1234",
  storagePrefix: env.VITE_STORAGE_PREFIX || "rsp",
  supabaseUrl: env.VITE_SUPABASE_URL || "https://ljwmxrgfjcfjsixvhaln.supabase.co",
  supabaseKey: env.VITE_SUPABASE_KEY || "sb_publishable_qJck3L8wcINTLfCeAKE-rQ_j6o4FKyD",
  jobsTable: env.VITE_JOBS_TABLE || "rsp-jobsheets",
  partsTable: env.VITE_PARTS_TABLE || "rsp-parts",
  crew: list(env.VITE_CREW, ["Ross", "Ethan", "Raf", "Hector", "Other"]),
  rateKeys: list(env.VITE_RATE_KEYS, ["R", "E", "Raf", "H"]),
  suppliers: list(env.VITE_SUPPLIERS, ["Norms", "Steeline", "Reece", "Bunnings", "Banner", "Shed Stock", "Other"]),
  extraMaterials: list(env.VITE_EXTRA_MATERIALS, ["Screws","Silicone","Threadtape","Lockseal","Oxy/Welding Rod","Rivets","Nail Gun","PVC Glue","PVC Primer","Paste","Saddles","Other"]),
  quickParts: list(env.VITE_QUICK_PARTS, ["PVC Pipe 15mm","PVC Pipe 20mm","PVC Pipe 25mm","PVC Pipe 32mm","PVC Pipe 40mm","PVC Pipe 50mm","PVC Pipe 65mm","PVC Pipe 80mm","PVC Pipe 100mm","PVC Elbow 90°","PVC Elbow 45°","PVC Tee","PVC Coupling","PVC End Cap","PVC Reducer","PVC Flange","Push-Fit Fitting","CPVC Pipe","Poly Pipe","Custom..."]),
  quickPartsLabel: env.VITE_QUICK_PARTS_LABEL || "PVC / Fittings",
  partCategories: list(env.VITE_PART_CATEGORIES, ["Copper", "PVC / Poly", "Fittings", "Valves & Taps", "Consumables", "Other"]),
  smsBooking: env.VITE_SMS_BOOKING || "Hi {name}, {business} here — you're booked in for {date}. Any dramas, just reply to this message.",
  smsOnTheWay: env.VITE_SMS_OTW || "Hi {name}, {business} is on the way — we'll be there in 30-45 minutes.",
};

const SUPABASE_URL = CFG.supabaseUrl;
const SUPABASE_KEY = CFG.supabaseKey;
const TABLE = CFG.jobsTable;
const ADMIN_PIN = CFG.adminPin;
const HEADERS = {
  "apikey": SUPABASE_KEY,
  "Authorization": `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
  "Prefer": "return=representation",
};

const DARK = {
  bg: "#0d1620", surface: "#131d27", border: "#1e2a38",
  text: "#e8edf2", muted: "#7a90a4", accent: "#F47C2B", blue: "#3a7bd5",
  green: "#22c55e", purple: "#a855f7", orange: "#f97316", inputBg: "#131d27", cardBg: "#131d27",
  dangerBg: "#2a1818", dangerText: "#e05252", dangerBorder: "#3a2020", selectBg: "#0d1620",
};
const LIGHT = {
  bg: "#f0f4f8", surface: "#ffffff", border: "#d1dce8",
  text: "#1a2535", muted: "#6b7f96", accent: "#F47C2B", blue: "#2563eb",
  green: "#16a34a", purple: "#9333ea", orange: "#ea580c", inputBg: "#ffffff", cardBg: "#ffffff",
  dangerBg: "#fff0f0", dangerText: "#dc2626", dangerBorder: "#fecaca", selectBg: "#ffffff",
};

const PLUMBERS = CFG.crew;
const LABOUR_RATE_KEYS = CFG.rateKeys;
const RATE_KEY_FOR = Object.fromEntries(PLUMBERS.map((p, i) => [p, LABOUR_RATE_KEYS[i] || null]));
const emptyRates = () => Object.fromEntries(LABOUR_RATE_KEYS.map(k => [k, ""]));
const emptyHours = () => Object.fromEntries(PLUMBERS.map(p => [p, ""]));

// --- Client SMS: opens the phone's own Messages app with the text pre-filled.
// Sent from the tradie's real number; nothing is sent until they hit send.
const fmtNiceDate = (iso) => {
  if (!iso) return "";
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
  } catch { return iso; }
};
const smsHref = (phone, body) => {
  const num = String(phone || "").replace(/[^\d+]/g, "");
  const sep = /iPad|iPhone|iPod/.test(navigator.userAgent) ? "&" : "?";
  return `sms:${num}${sep}body=${encodeURIComponent(body)}`;
};
const fillTemplate = (tpl, job) => tpl
  .replace("{name}", (job.clientName || "").split(" ")[0] || "there")
  .replace("{business}", CFG.businessName)
  .replace("{date}", fmtNiceDate(job.jobDate));
const ACCOUNT_SUPPLIERS = CFG.suppliers;
const EXTRA_MATERIALS = CFG.extraMaterials;
const PVC_TYPES = CFG.quickParts;
const DAYS_OF_WEEK = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

function genResRef(firstName, lastName, seq) {
  const f = (firstName || "").replace(/[^a-zA-Z]/g, "");
  const l = (lastName || "").replace(/[^a-zA-Z]/g, "");
  if (!f || !l) return "";
  return f.slice(0,1).toUpperCase() + f.slice(1,2).toLowerCase() +
         l.slice(0,1).toUpperCase() + l.slice(1,3).toLowerCase() +
         String(seq).padStart(4, "0");
}

function genComRef(companyName, jobAddress) {
  const words = (companyName || "").replace(/[^a-zA-Z\s]/g, "").trim().split(/\s+/).filter(Boolean);
  const w1 = words[0] || ""; const w2 = words[1] || words[0] || "";
  const compPart = w1.slice(0,1).toUpperCase() + w1.slice(1,2).toLowerCase() +
                   w2.slice(0,1).toUpperCase() + w2.slice(1,2).toLowerCase();
  const addrMatch = (jobAddress || "").match(/^(\d+)\s+([a-zA-Z]+)/);
  const addrPart = addrMatch ? addrMatch[1] + addrMatch[2].slice(0,1).toUpperCase() + addrMatch[2].slice(1,3).toLowerCase() : "";
  return compPart + (addrPart || "Ref");
}

const toDb = (job) => ({
  client_name: job.clientName, job_address: job.jobAddress,
  phone: job.phone, email: job.email, job_date: job.jobDate || null,
  ongoing_job: job.ongoingJob, labour_rates: job.labourRates,
  times_worked: job.timesWorked, job_description: job.jobDescription,
  materials_on_account: job.materialsOnAccount, additional_materials: job.additionalMaterials,
  parts: job.parts, shed_stock: job.shedStock, total_chargeout: job.totalChargeout,
  notes: job.notes, created_at: job.createdAt, first_name: job.firstName,
  last_name: job.lastName, client_ref: job.clientRef, job_status: job.jobStatus,
  client_type: job.clientType, company_name: job.companyName,
  daily_entries: job.dailyEntries, supplier_invoices: job.supplierInvoices,
  charged_out_date: job.chargedOutDate || null,
  deleted: job.deleted || false,
  last_edited_at: new Date().toISOString(),
});

const fromDb = (row) => ({
  id: row.id, firstName: row.first_name || "", lastName: row.last_name || "",
  clientRef: row.client_ref || "", clientName: row.client_name || "",
  clientType: row.client_type || "residential", companyName: row.company_name || "",
  jobAddress: row.job_address || "", phone: row.phone || "", email: row.email || "",
  jobDate: row.job_date || new Date().toISOString().split("T")[0],
  ongoingJob: row.ongoing_job || false,
  labourRates: row.labour_rates || emptyRates(),
  timesWorked: row.times_worked || emptyHours(),
  dailyEntries: row.daily_entries || [], supplierInvoices: row.supplier_invoices || {},
  jobDescription: row.job_description || "", materialsOnAccount: row.materials_on_account || [],
  additionalMaterials: row.additional_materials || [], parts: row.parts || [],
  shedStock: row.shed_stock || [], totalChargeout: row.total_chargeout || "",
  notes: row.notes || "", createdAt: row.created_at || new Date().toISOString(),
  jobStatus: row.job_status || "ongoing",
  chargedOutDate: row.charged_out_date || null,
  deleted: row.deleted || false,
  lastEditedAt: row.last_edited_at || null,
});

function newJob() {
  return {
    id: null, firstName: "", lastName: "", clientRef: "", clientName: "",
    clientType: "residential", companyName: "", jobAddress: "", phone: "", email: "",
    jobDate: new Date().toISOString().split("T")[0], ongoingJob: false,
    labourRates: emptyRates(),
    timesWorked: emptyHours(),
    dailyEntries: [], supplierInvoices: {}, jobDescription: "",
    materialsOnAccount: [], additionalMaterials: [], parts: [], shedStock: [],
    totalChargeout: "", notes: "", createdAt: new Date().toISOString(), jobStatus: "ongoing",
  };
}

async function dbGetAll() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?select=*&order=created_at.desc`, { headers: HEADERS });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).map(fromDb);
}
async function dbInsert(job) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, { method: "POST", headers: HEADERS, body: JSON.stringify(toDb(job)) });
  if (!res.ok) throw new Error(await res.text());
  return fromDb((await res.json())[0]);
}
async function dbUpdate(job) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${job.id}`, { method: "PATCH", headers: HEADERS, body: JSON.stringify(toDb(job)) });
  if (!res.ok) throw new Error(await res.text());
  return fromDb((await res.json())[0]);
}
async function dbDelete(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${id}`, { method: "DELETE", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) throw new Error(await res.text());
}
async function dbGetOne(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${id}&select=*`, { headers: HEADERS });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows.length ? fromDb(rows[0]) : null;
}
// Autosave patch for drafts ONLY. The URL filter means the database itself refuses
// this write if the record is no longer a draft (someone promoted it) or was deleted.
// A stale phone physically cannot overwrite a real job through this path.
async function dbPatchDraft(job) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}?id=eq.${job.id}&job_status=eq.draft&deleted=eq.false`, {
    method: "PATCH", headers: HEADERS, body: JSON.stringify(toDb({ ...job, jobStatus: "draft" })),
  });
  if (!res.ok) throw new Error(await res.text());
  const rows = await res.json();
  return rows.length ? fromDb(rows[0]) : null; // null = no longer a draft, stop autosaving
}

// ---- Parts Library ----
const PARTS_TABLE = CFG.partsTable;
const PART_CATEGORIES = CFG.partCategories;

const partFromDb = (row) => ({ id: row.id, name: row.name || "", price: row.price || "", category: row.category || "Other", lastUsedAt: row.last_used_at || null, approved: !!row.approved });

async function dbGetParts() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${PARTS_TABLE}?select=*&order=name.asc`, { headers: HEADERS });
  if (!res.ok) throw new Error(await res.text());
  return (await res.json()).map(partFromDb);
}
async function dbInsertPart(p) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${PARTS_TABLE}`, { method: "POST", headers: HEADERS, body: JSON.stringify({ name: p.name, price: p.price || null, category: p.category || "Other", approved: p.approved === true, last_used_at: new Date().toISOString() }) });
  if (!res.ok) throw new Error(await res.text());
  return partFromDb((await res.json())[0]);
}
async function dbUpdatePart(id, fields) {
  const body = {};
  if (fields.name !== undefined) body.name = fields.name;
  if (fields.price !== undefined) body.price = fields.price;
  if (fields.category !== undefined) body.category = fields.category;
  if (fields.approved !== undefined) body.approved = fields.approved;
  body.last_used_at = new Date().toISOString();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${PARTS_TABLE}?id=eq.${id}`, { method: "PATCH", headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await res.text());
  return partFromDb((await res.json())[0]);
}
async function dbDeletePart(id) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${PARTS_TABLE}?id=eq.${id}`, { method: "DELETE", headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } });
  if (!res.ok) throw new Error(await res.text());
}

// ---- UI ----
const Lbl = ({ children, t, required }) => (
  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: t.accent, textTransform: "uppercase", marginBottom: 6, display: "flex", gap: 4 }}>
    {children}{required && <span style={{ color: "#e05252" }}>*</span>}
  </div>
);
const Field = ({ label, children, t, required }) => <div style={{ marginBottom: 18 }}><Lbl t={t} required={required}>{label}</Lbl>{children}</div>;
const Inp = ({ value, onChange, placeholder, type = "text", style = {}, t, error }) => (
  <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    style={{ width: "100%", background: t.inputBg, border: `1.5px solid ${error ? "#e05252" : t.border}`, borderRadius: 8, padding: "10px 12px", color: t.text, fontFamily: "inherit", fontSize: 15, outline: "none", boxSizing: "border-box", ...style }} />
);
const Txa = ({ value, onChange, placeholder, rows = 3, t }) => (
  <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    style={{ width: "100%", background: t.inputBg, border: `1.5px solid ${t.border}`, borderRadius: 8, padding: "10px 12px", color: t.text, fontFamily: "inherit", fontSize: 15, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
);
const Sec = ({ title, children, t, accent }) => (
  <div style={{ marginBottom: 24 }}>
    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: 2, color: accent || t.blue, textTransform: "uppercase", borderBottom: `1px solid ${t.border}`, paddingBottom: 6, marginBottom: 16 }}>{title}</div>
    {children}
  </div>
);
const Btn = ({ children, onClick, variant = "primary", style = {}, t, disabled }) => {
  const v = {
    primary: { background: t.accent, color: "#fff", border: "none" },
    secondary: { background: t.border, color: t.muted, border: "none" },
    danger: { background: t.dangerBg, color: t.dangerText, border: `1px solid ${t.dangerBorder}` },
    ghost: { background: "transparent", color: t.blue, border: `1px solid ${t.blue}` },
    success: { background: t.green, color: "#fff", border: "none" },
    purple: { background: t.purple, color: "#fff", border: "none" },
  }[variant];
  return <button onClick={onClick} disabled={disabled} style={{ padding: "10px 20px", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 14, opacity: disabled ? 0.6 : 1, ...v, ...style }}>{children}</button>;
};
const ChipSelect = ({ options, selected, onChange, accent, t }) => {
  const toggle = opt => selected.includes(opt) ? onChange(selected.filter(o => o !== opt)) : onChange([...selected, opt]);
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {options.map(opt => (
        <button key={opt} onClick={() => toggle(opt)} style={{ padding: "7px 14px", borderRadius: 20, border: `2px solid ${selected.includes(opt) ? accent : t.border}`, background: selected.includes(opt) ? accent + "22" : t.surface, color: selected.includes(opt) ? accent : t.muted, fontFamily: "inherit", fontWeight: 600, fontSize: 13, cursor: "pointer", transition: "all 0.15s" }}>{opt}</button>
      ))}
    </div>
  );
};

function PartsEntry({ items, onChange, t, library = [], adminUnlocked = false, onNewPartCaptured }) {
  const [np, setNp] = useState({ name: "", qty: "", price: "" });
  const [pvcType, setPvcType] = useState("");
  const [pvcCustom, setPvcCustom] = useState("");
  const [mode, setMode] = useState("custom");
  const [catFilter, setCatFilter] = useState("All");

  const updateItem = (id, field, val) => onChange(items.map(p => p.id === id ? { ...p, [field]: val } : p));
  const add = () => {
    const name = mode === "pvc" ? (pvcType === "Custom..." ? pvcCustom : pvcType) : np.name;
    if (!name) return;
    onChange([...items, { id: Date.now().toString(), name, qty: np.qty, price: np.price }]);
    // Unknown part names get quietly queued for admin review — no effort from the user
    if (onNewPartCaptured) onNewPartCaptured(name, np.price);
    setNp({ name: "", qty: "", price: "" }); setPvcType(""); setPvcCustom("");
  };
  const total = items.reduce((s, p) => s + (parseFloat(p.price)||0)*(parseFloat(p.qty)||1), 0);

  // Library typeahead: approved parts only — the dropdown is the boss's curated list
  const approvedLib = library.filter(p => p.approved);
  const q = np.name.trim().toLowerCase();
  const cats = ["All", ...new Set(approvedLib.map(p => p.category || "Other"))];
  const suggestions = q.length >= 2
    ? approvedLib.filter(p => p.name.toLowerCase().includes(q) && (catFilter === "All" || (p.category || "Other") === catFilter)).slice(0, 6)
    : [];
  const knownName = q.length >= 2 && library.some(p => p.name.trim().toLowerCase() === q);
  const pickSuggestion = (p) => setNp(prev => ({ ...prev, name: p.name, price: p.price || "" }));

  return (
    <div>
      {items.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          {items.map(p => (
            <div key={p.id} style={{ padding: "10px 12px", background: t.surface, borderRadius: 8, marginBottom: 6, border: `1.5px solid ${t.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ color: t.text, fontWeight: 600, fontSize: 14 }}>{p.name}</div>
                <button onClick={() => onChange(items.filter(x => x.id !== p.id))} style={{ background: "none", border: "none", color: t.dangerText, cursor: "pointer", fontSize: 18, padding: 4 }}>×</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: adminUnlocked ? "1fr 1fr" : "1fr", gap: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: t.muted, fontWeight: 700, marginBottom: 3 }}>QTY</div>
                  <input type="number" value={p.qty} onChange={e => updateItem(p.id, "qty", e.target.value)} placeholder="Qty"
                    style={{ width: "100%", background: t.inputBg, border: `1.5px solid ${t.border}`, borderRadius: 6, padding: "6px 10px", color: t.text, fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
                </div>
                {adminUnlocked && (
                  <div>
                    <div style={{ fontSize: 10, color: t.muted, fontWeight: 700, marginBottom: 3 }}>$ EACH</div>
                    <input type="number" value={p.price} onChange={e => updateItem(p.id, "price", e.target.value)} placeholder="Price"
                      style={{ width: "100%", background: t.inputBg, border: `1.5px solid ${t.border}`, borderRadius: 6, padding: "6px 10px", color: t.accent, fontFamily: "inherit", fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
                  </div>
                )}
              </div>
              {adminUnlocked && (
                <div style={{ fontSize: 12, color: t.muted, marginTop: 6, textAlign: "right" }}>
                  Line total: <span style={{ color: t.accent, fontWeight: 700 }}>${((parseFloat(p.qty)||1)*(parseFloat(p.price)||0)).toFixed(2)}</span>
                </div>
              )}
            </div>
          ))}
          {adminUnlocked && (
            <div style={{ padding: "8px 12px", background: t.surface, borderRadius: 8, color: t.muted, fontSize: 13, border: `1.5px solid ${t.border}` }}>Subtotal: <span style={{ color: t.accent, fontWeight: 700 }}>${total.toFixed(2)}</span></div>
          )}
        </div>
      )}
      <div style={{ background: t.surface, borderRadius: 10, padding: 14, border: `1.5px solid ${t.border}` }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <Btn onClick={() => setMode("custom")} variant={mode === "custom" ? "primary" : "secondary"} style={{ flex: 1, padding: "8px" }} t={t}>Custom</Btn>
          <Btn onClick={() => setMode("pvc")} variant={mode === "pvc" ? "primary" : "secondary"} style={{ flex: 1, padding: "8px" }} t={t}>{CFG.quickPartsLabel}</Btn>
        </div>
        {mode === "pvc" ? (
          <div style={{ marginBottom: 10 }}>
            <select value={pvcType} onChange={e => setPvcType(e.target.value)} style={{ width: "100%", background: t.selectBg, border: `1.5px solid ${t.border}`, borderRadius: 8, padding: "10px 12px", color: pvcType ? t.text : t.muted, fontFamily: "inherit", fontSize: 14, marginBottom: 8, outline: "none" }}>
              <option value="">Select part / fitting...</option>
              {PVC_TYPES.map(ty => <option key={ty} value={ty}>{ty}</option>)}
            </select>
            {pvcType === "Custom..." && <Inp value={pvcCustom} onChange={setPvcCustom} placeholder="Describe part..." style={{ marginBottom: 8 }} t={t} />}
          </div>
        ) : (
          <div style={{ marginBottom: 8 }}>
            <Inp value={np.name} onChange={v => setNp({ ...np, name: v })} placeholder="Item name / description" t={t} />
            {q.length >= 3 && suggestions.length === 0 && !knownName && (
              <div style={{ marginTop: 4, fontSize: 11, color: t.muted }}>➕ Not in the library yet — it'll be sent for review when you add it</div>
            )}
            {suggestions.length > 0 && (
              <div style={{ marginTop: 6 }}>
                {cats.length > 2 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                    {cats.map(c => (
                      <button key={c} onClick={() => setCatFilter(c)} style={{ padding: "3px 10px", borderRadius: 12, border: `1px solid ${catFilter === c ? t.blue : t.border}`, background: catFilter === c ? t.blue + "22" : "transparent", color: catFilter === c ? t.blue : t.muted, fontFamily: "inherit", fontWeight: 600, fontSize: 11, cursor: "pointer" }}>{c}</button>
                    ))}
                  </div>
                )}
                <div style={{ border: `1.5px solid ${t.blue}44`, borderRadius: 8, overflow: "hidden" }}>
                  {suggestions.map(p => (
                    <button key={p.id} onClick={() => pickSuggestion(p)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "9px 12px", background: t.inputBg, border: "none", borderBottom: `1px solid ${t.border}`, fontFamily: "inherit", fontSize: 14, color: t.text, cursor: "pointer", textAlign: "left" }}>
                      <span>{p.name}</span>
                      <span style={{ fontSize: 11, color: t.muted }}>{p.category || "Other"}{adminUnlocked && p.price ? ` · $${p.price}` : ""}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: adminUnlocked ? "1fr 1fr" : "1fr", gap: 8, marginBottom: 10 }}>
          <Inp value={np.qty} onChange={v => setNp({ ...np, qty: v })} placeholder="Qty" type="number" t={t} />
          {adminUnlocked && <Inp value={np.price} onChange={v => setNp({ ...np, price: v })} placeholder="$ each" type="number" t={t} />}
        </div>
        <Btn onClick={add} style={{ width: "100%" }} t={t}>+ Add Item</Btn>
      </div>
    </div>
  );
}

function DailyTimesheet({ entries, onChange, labourRates, t }) {
  const addDay = () => onChange([...entries, { id: Date.now().toString(), date: new Date().toISOString().split("T")[0], day: "", hours: emptyHours() }]);
  const removeDay = id => onChange(entries.filter(e => e.id !== id));
  const updateDay = (id, field, val) => onChange(entries.map(e => e.id === id ? { ...e, [field]: val } : e));
  const updateHours = (id, name, val) => onChange(entries.map(e => e.id === id ? { ...e, hours: { ...e.hours, [name]: val } } : e));
  const totalPerPerson = PLUMBERS.reduce((acc, p) => { acc[p] = entries.reduce((s, e) => s + (parseFloat(e.hours[p]) || 0), 0); return acc; }, {});
  const totalLabour = PLUMBERS.reduce((s, p) => {
    const k = RATE_KEY_FOR[p] || null;
    return s + (k ? parseFloat(labourRates[k]) || 0 : 0) * totalPerPerson[p];
  }, 0);
  return (
    <div>
      {entries.map((entry, idx) => (
        <div key={entry.id} style={{ background: t.surface, borderRadius: 10, padding: 14, marginBottom: 10, border: `1.5px solid ${t.border}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.blue }}>DAY {idx + 1}</div>
            <button onClick={() => removeDay(entry.id)} style={{ background: "none", border: "none", color: t.dangerText, cursor: "pointer", fontSize: 13, fontWeight: 700 }}>× Remove</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: t.muted, marginBottom: 4, fontWeight: 700 }}>DATE</div>
              <Inp value={entry.date} onChange={v => updateDay(entry.id, "date", v)} type="date" t={t} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: t.muted, marginBottom: 4, fontWeight: 700 }}>DAY</div>
              <select value={entry.day} onChange={e => updateDay(entry.id, "day", e.target.value)} style={{ width: "100%", background: t.selectBg, border: `1.5px solid ${t.border}`, borderRadius: 8, padding: "10px 12px", color: entry.day ? t.text : t.muted, fontFamily: "inherit", fontSize: 14, outline: "none" }}>
                <option value="">Day...</option>
                {DAYS_OF_WEEK.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {PLUMBERS.map(p => (
              <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, background: t.bg, borderRadius: 8, padding: "8px 12px", border: `1.5px solid ${t.border}` }}>
                <span style={{ fontSize: 13, color: t.text, fontWeight: 700, minWidth: 50 }}>{p}</span>
                <input type="number" placeholder="hrs" value={entry.hours[p]} onChange={e => updateHours(entry.id, p, e.target.value)}
                  style={{ background: "none", border: "none", color: t.accent, fontFamily: "inherit", fontSize: 15, fontWeight: 700, width: "100%", outline: "none" }} />
              </div>
            ))}
          </div>
        </div>
      ))}
      <Btn onClick={addDay} variant="ghost" style={{ width: "100%", marginBottom: 12 }} t={t}>+ Add Day</Btn>
      {entries.length > 0 && (
        <div style={{ background: t.surface, borderRadius: 8, padding: 12, border: `1.5px solid ${t.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: t.blue, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>Labour Summary</div>
          {PLUMBERS.filter(p => totalPerPerson[p] > 0).map(p => {
            const k = RATE_KEY_FOR[p] || null;
            const rate = k ? parseFloat(labourRates[k]) || 0 : 0;
            return (
              <div key={p} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: `1px solid ${t.border}` }}>
                <span style={{ color: t.text, fontSize: 13 }}>{p} — {totalPerPerson[p]}hrs</span>
                <span style={{ color: t.accent, fontWeight: 700, fontSize: 13 }}>${(totalPerPerson[p] * rate).toFixed(2)}</span>
              </div>
            );
          })}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ color: t.text, fontWeight: 700 }}>Labour Total</span>
            <span style={{ color: t.accent, fontWeight: 900, fontSize: 16 }}>${totalLabour.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SupplierInvoices({ selected, invoices, onChange, t }) {
  const addInvoice = (supplier) => onChange({ ...invoices, [supplier]: [...(invoices[supplier] || []), { id: Date.now().toString(), amount: "", note: "" }] });
  const removeInvoice = (supplier, id) => onChange({ ...invoices, [supplier]: (invoices[supplier] || []).filter(i => i.id !== id) });
  const updateInvoice = (supplier, id, field, val) => onChange({ ...invoices, [supplier]: (invoices[supplier] || []).map(i => i.id === id ? { ...i, [field]: val } : i) });
  const supplierTotal = (supplier) => (invoices[supplier] || []).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
  const grandTotal = selected.reduce((s, sup) => s + supplierTotal(sup), 0);
  if (selected.length === 0) return <div style={{ color: t.muted, fontSize: 13 }}>Select suppliers above to enter invoices.</div>;
  return (
    <div>
      {selected.map(supplier => (
        <div key={supplier} style={{ background: t.surface, borderRadius: 10, padding: 14, marginBottom: 12, border: `1.5px solid ${t.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.blue, textTransform: "uppercase" }}>{supplier}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.accent }}>Total: ${supplierTotal(supplier).toFixed(2)}</div>
          </div>
          {(invoices[supplier] || []).map((inv, idx) => (
            <div key={inv.id} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 12, color: t.muted, minWidth: 20 }}>#{idx + 1}</div>
              <Inp value={inv.note} onChange={v => updateInvoice(supplier, inv.id, "note", v)} placeholder="Note (optional)" t={t} style={{ flex: 2 }} />
              <Inp value={inv.amount} onChange={v => updateInvoice(supplier, inv.id, "amount", v)} placeholder="$" type="number" t={t} style={{ flex: 1 }} />
              <button onClick={() => removeInvoice(supplier, inv.id)} style={{ background: "none", border: "none", color: t.dangerText, cursor: "pointer", fontSize: 18, padding: 4 }}>×</button>
            </div>
          ))}
          <Btn onClick={() => addInvoice(supplier)} variant="ghost" style={{ width: "100%", padding: "8px", fontSize: 13 }} t={t}>+ Add Invoice</Btn>
        </div>
      ))}
      {selected.length > 1 && (
        <div style={{ padding: "10px 14px", background: t.blue + "18", borderRadius: 8, border: `1px solid ${t.blue}44`, display: "flex", justifyContent: "space-between" }}>
          <span style={{ color: t.blue, fontWeight: 700 }}>All Suppliers Total</span>
          <span style={{ color: t.blue, fontWeight: 900, fontSize: 16 }}>${grandTotal.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

function PinModal({ onSuccess, onCancel, t, message }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const check = () => { if (pin === ADMIN_PIN) onSuccess(); else { setErr(true); setPin(""); } };
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: t.surface, borderRadius: 16, padding: 28, width: "100%", maxWidth: 320, border: `1.5px solid ${t.border}` }}>
        <div style={{ fontSize: 18, fontWeight: 900, color: t.text, marginBottom: 6 }}>🔒 Admin Only</div>
        <div style={{ fontSize: 14, color: t.muted, marginBottom: 20 }}>{message || "Enter PIN to continue."}</div>
        <Inp value={pin} onChange={setPin} placeholder="Enter PIN" type="password" t={t} error={err} />
        {err && <div style={{ color: "#e05252", fontSize: 13, marginTop: 6 }}>Incorrect PIN</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <Btn onClick={onCancel} variant="secondary" style={{ flex: 1 }} t={t}>Cancel</Btn>
          <Btn onClick={check} style={{ flex: 1 }} t={t}>Unlock</Btn>
        </div>
      </div>
    </div>
  );
}

// Status config
const STATUS_CONFIG = {
  draft:      { label: "📝 Draft",       color: "accent", next: null,         nextLabel: null,                    pinRequired: false },
  ongoing:    { label: "🔧 Ongoing",     color: "blue",   next: "completed",  nextLabel: "✅ Mark Completed",     pinRequired: false },
  completed:  { label: "✅ Completed",   color: "green",  next: "admin",      nextLabel: "📋 Move to Admin",      pinRequired: false },
  admin:      { label: "📋 Admin",       color: "orange", next: "chargedout", nextLabel: "💰 Mark Charged Out",   pinRequired: true  },
  chargedout: { label: "💰 Charged Out", color: "purple", next: null,         nextLabel: null,                    pinRequired: true  },
};

// ---- JOB FORM ----
function JobForm({ job, onChange, onSave, onCancel, isNew, saving, t, allJobs, adminUnlocked = false, partsLibrary = [], onNewPartCaptured }) {
  const [errors, setErrors] = useState({});
  const [draftAvailable, setDraftAvailable] = useState(null);
  const set = f => v => onChange({ ...job, [f]: v });
  const isCommercial = job.clientType === "commercial";

  // ---- Device-local draft autosave ----
  // Saves typing to THIS device only, every change. Never writes to the shared
  // database on its own — that only happens on a deliberate Save. This protects
  // against lost typing (phone dies, accidental back) without any risk of a
  // stale device overwriting live data.
  const draftKey = `${CFG.storagePrefix}_draft_${job.id || "new"}`;

  // On opening the form, check if a draft exists for this job
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const draft = JSON.parse(raw);
        // Only offer if the draft is meaningfully different from what's loaded
        if (JSON.stringify(draft) !== JSON.stringify(job)) setDraftAvailable(draft);
        else localStorage.removeItem(draftKey);
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save draft on every change (debounced lightly via effect batching)
  useEffect(() => {
    if (draftAvailable) return; // don't overwrite a pending restore offer
    try { localStorage.setItem(draftKey, JSON.stringify(job)); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job]);

  const restoreDraft = () => { onChange(draftAvailable); setDraftAvailable(null); };
  const discardDraft = () => { try { localStorage.removeItem(draftKey); } catch {} setDraftAvailable(null); };

  const setFirst = v => {
    const updated = { ...job, firstName: v, clientName: `${v} ${job.lastName}`.trim() };
    const seq = (() => { const ref = genResRef(v, job.lastName, 1).slice(0,-4); return allJobs.filter(j => j.clientRef?.startsWith(ref) && j.id !== job.id).length + 1; })();
    updated.clientRef = genResRef(v, job.lastName, seq);
    onChange(updated);
  };
  const setLast = v => {
    const updated = { ...job, lastName: v, clientName: `${job.firstName} ${v}`.trim() };
    const seq = (() => { const ref = genResRef(job.firstName, v, 1).slice(0,-4); return allJobs.filter(j => j.clientRef?.startsWith(ref) && j.id !== job.id).length + 1; })();
    updated.clientRef = genResRef(job.firstName, v, seq);
    onChange(updated);
  };
  const setCompany = v => onChange({ ...job, companyName: v, clientName: v, clientRef: genComRef(v, job.jobAddress) });
  const setJobAddress = v => onChange({ ...job, jobAddress: v, clientRef: isCommercial ? genComRef(job.companyName, v) : job.clientRef });
  const setClientType = v => onChange({ ...job, clientType: v, clientRef: "", firstName: "", lastName: "", companyName: "", clientName: "" });

  const totalLabour = PLUMBERS.reduce((s, p) => {
    const k = RATE_KEY_FOR[p] || null;
    const hrs = job.dailyEntries.reduce((h, e) => h + (parseFloat(e.hours[p]) || 0), 0);
    return s + (k ? parseFloat(job.labourRates[k]) || 0 : 0) * hrs;
  }, 0);
  const totalParts = (job.parts||[]).reduce((s, p) => s + (parseFloat(p.price)||0)*(parseFloat(p.qty)||1), 0);
  const totalInvoices = job.materialsOnAccount.reduce((s, sup) => s + (job.supplierInvoices[sup] || []).reduce((ss, i) => ss + (parseFloat(i.amount)||0), 0), 0);
  const auto = (totalLabour + totalParts + totalInvoices).toFixed(2);

  const validate = () => {
    const e = {};
    if (isCommercial) { if (!job.companyName?.trim()) e.companyName = true; if (!job.jobAddress?.trim()) e.jobAddress = true; }
    else { if (!job.firstName?.trim()) e.firstName = true; if (!job.lastName?.trim()) e.lastName = true; }
    if (!job.jobDate) e.jobDate = true;
    if (job.dailyEntries.length === 0) e.days = true;
    else if (!job.dailyEntries.some(e => PLUMBERS.some(p => parseFloat(e.hours[p]) > 0))) e.hours = true;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const statusColor = t[STATUS_CONFIG[job.jobStatus]?.color] || t.blue;

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 22, padding: 0 }}>←</button>
        <div style={{ fontSize: 20, fontWeight: 900, color: t.text }}>{isNew ? "New Job Sheet" : "Edit Job Sheet"}</div>
      </div>

      {draftAvailable && (
        <div style={{ marginBottom: 20, padding: "12px 16px", background: t.blue + "18", borderRadius: 10, border: `1.5px solid ${t.blue}44` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.blue, marginBottom: 8 }}>📝 Unsaved draft found on this device</div>
          <div style={{ fontSize: 13, color: t.muted, marginBottom: 10 }}>Looks like you were working on this job sheet and didn't save. Want to pick up where you left off?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={restoreDraft} style={{ flex: 1, background: t.blue, color: "#fff", border: "none", borderRadius: 8, padding: "8px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Restore Draft</button>
            <button onClick={discardDraft} style={{ flex: 1, background: t.border, color: t.muted, border: "none", borderRadius: 8, padding: "8px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Discard</button>
          </div>
        </div>
      )}

      <Sec title="Job Status" t={t} accent={statusColor}>
        {job.jobStatus === "draft" && (
          <div style={{ marginBottom: 10, padding: "8px 12px", background: t.accent + "18", borderRadius: 8, fontSize: 13, color: t.accent, fontWeight: 600 }}>
            📝 This is an unsaved draft — hit Save and it'll file as Ongoing (or pick a status below).
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.entries(STATUS_CONFIG).filter(([key]) => key !== "draft").map(([key, cfg]) => (
            <button key={key} onClick={() => set("jobStatus")(key)} style={{ flex: 1, minWidth: 100, padding: "10px 8px", borderRadius: 10, border: `2px solid ${job.jobStatus === key ? t[cfg.color] : t.border}`, background: job.jobStatus === key ? t[cfg.color] + "22" : t.surface, color: job.jobStatus === key ? t[cfg.color] : t.muted, fontFamily: "inherit", fontWeight: 800, fontSize: 12, cursor: "pointer", textTransform: "uppercase", letterSpacing: 0.5 }}>
              {cfg.label}
            </button>
          ))}
        </div>
      </Sec>

      <Sec title="Client Details" t={t}>
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {["residential", "commercial"].map(type => (
            <button key={type} onClick={() => setClientType(type)} style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${job.clientType === type ? t.accent : t.border}`, background: job.clientType === type ? t.accent + "22" : t.surface, color: job.clientType === type ? t.accent : t.muted, fontFamily: "inherit", fontWeight: 800, fontSize: 13, cursor: "pointer", textTransform: "uppercase" }}>
              {type === "residential" ? "🏠 Residential" : "🏢 Commercial"}
            </button>
          ))}
        </div>
        {isCommercial ? (
          <Field label="Company Name" t={t} required>
            <Inp value={job.companyName} onChange={setCompany} placeholder="e.g. Complete Real Estate" t={t} error={errors.companyName} />
            {errors.companyName && <div style={{ color: "#e05252", fontSize: 12, marginTop: 4 }}>Required</div>}
          </Field>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <Field label="First Name" t={t} required>
              <Inp value={job.firstName} onChange={setFirst} placeholder="Dale" t={t} error={errors.firstName} />
              {errors.firstName && <div style={{ color: "#e05252", fontSize: 12, marginTop: 4 }}>Required</div>}
            </Field>
            <Field label="Last Name" t={t} required>
              <Inp value={job.lastName} onChange={setLast} placeholder="Murphy" t={t} error={errors.lastName} />
              {errors.lastName && <div style={{ color: "#e05252", fontSize: 12, marginTop: 4 }}>Required</div>}
            </Field>
          </div>
        )}
        {job.clientRef && (
          <div style={{ marginBottom: 16, padding: "10px 14px", background: t.blue + "18", borderRadius: 8, border: `1px solid ${t.blue}44`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: t.blue, textTransform: "uppercase", marginBottom: 2 }}>Job Reference</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: t.blue }}>{job.clientRef}</div>
            </div>
            <div style={{ fontSize: 28 }}>🏷️</div>
          </div>
        )}
        <Field label="Phone" t={t}><Inp value={job.phone} onChange={set("phone")} placeholder="04xx..." type="tel" t={t} /></Field>
        <Field label="Job Address" t={t} required={isCommercial}>
          <Inp value={job.jobAddress} onChange={setJobAddress} placeholder="Street address" t={t} error={errors.jobAddress} />
          {errors.jobAddress && <div style={{ color: "#e05252", fontSize: 12, marginTop: 4 }}>Required for commercial jobs</div>}
        </Field>
        <Field label="Email" t={t}><Inp value={job.email} onChange={set("email")} placeholder="email@..." type="email" t={t} /></Field>
      </Sec>

      <Sec title="Job Details" t={t}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
          <Field label="Job Date" t={t} required>
            <Inp value={job.jobDate} onChange={set("jobDate")} type="date" t={t} error={errors.jobDate} />
          </Field>
          <Field label="Ongoing?" t={t}>
            <div style={{ paddingTop: 4 }}>
              <button onClick={() => set("ongoingJob")(!job.ongoingJob)} style={{ padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, background: job.ongoingJob ? t.accent : t.border, color: job.ongoingJob ? "#fff" : t.muted }}>{job.ongoingJob ? "YES" : "NO"}</button>
            </div>
          </Field>
        </div>
        <Field label="Job Description" t={t}><Txa value={job.jobDescription} onChange={set("jobDescription")} placeholder="Describe the work done..." rows={4} t={t} /></Field>
      </Sec>

      <Sec title="Labour" t={t}>
        <div style={{ marginBottom: 16 }}>
          <Lbl t={t}>Chargeout Rates ($/hr)</Lbl>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(LABOUR_RATE_KEYS.length, 4)}, 1fr)`, gap: 8 }}>
            {LABOUR_RATE_KEYS.map(k => (
              <div key={k}>
                <div style={{ fontSize: 11, color: t.muted, marginBottom: 4, textAlign: "center" }}>{k}</div>
                <Inp value={job.labourRates[k]} onChange={v => onChange({ ...job, labourRates: { ...job.labourRates, [k]: v } })} placeholder="$" style={{ textAlign: "center" }} t={t} />
              </div>
            ))}
          </div>
        </div>
        <Lbl t={t} required>Daily Time Entries</Lbl>
        {errors.days && <div style={{ color: "#e05252", fontSize: 13, marginBottom: 8, fontWeight: 600 }}>⚠️ Add at least one day</div>}
        {errors.hours && <div style={{ color: "#e05252", fontSize: 13, marginBottom: 8, fontWeight: 600 }}>⚠️ At least one person must have hours entered</div>}
        <DailyTimesheet entries={job.dailyEntries} onChange={set("dailyEntries")} labourRates={job.labourRates} t={t} />
      </Sec>

      <Sec title="Materials on Account" t={t}>
        <Lbl t={t}>Supplier (tap to select)</Lbl>
        <ChipSelect options={ACCOUNT_SUPPLIERS} selected={job.materialsOnAccount} onChange={set("materialsOnAccount")} accent={t.blue} t={t} />
      </Sec>

      {job.materialsOnAccount.length > 0 && (
        <Sec title="Supplier Invoices" t={t} accent={t.purple}>
          <SupplierInvoices selected={job.materialsOnAccount} invoices={job.supplierInvoices} onChange={set("supplierInvoices")} t={t} />
        </Sec>
      )}

      <Sec title="Additional Materials Used" t={t}>
        <ChipSelect options={EXTRA_MATERIALS} selected={job.additionalMaterials} onChange={set("additionalMaterials")} accent={t.accent} t={t} />
      </Sec>

      <Sec title="Parts Used" t={t}>
        <PartsEntry items={job.parts} onChange={set("parts")} t={t} library={partsLibrary} adminUnlocked={adminUnlocked} onNewPartCaptured={onNewPartCaptured} />
      </Sec>

      <Sec title="Totals & Notes" t={t}>
        <Field label="Total Chargeout Price" t={t}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Inp value={job.totalChargeout} onChange={set("totalChargeout")} placeholder="$ total" type="number" t={t} />
            {parseFloat(auto) > 0 && <Btn onClick={() => set("totalChargeout")(auto)} variant="ghost" style={{ whiteSpace: "nowrap", fontSize: 12 }} t={t}>Use ${auto}</Btn>}
          </div>
          {parseFloat(auto) > 0 && adminUnlocked && <div style={{ fontSize: 12, color: t.muted, marginTop: 4 }}>Labour ${totalLabour.toFixed(2)} + Parts ${totalParts.toFixed(2)} + Invoices ${totalInvoices.toFixed(2)} = <span style={{ color: t.accent }}>${auto}</span></div>}
        </Field>
        <Field label="Notes" t={t}><Txa value={job.notes} onChange={set("notes")} placeholder="Additional notes, warranty items..." rows={5} t={t} /></Field>
      </Sec>

      {Object.keys(errors).length > 0 && <div style={{ marginBottom: 16, padding: "12px 16px", background: "#fff0f0", borderRadius: 8, border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, fontWeight: 600 }}>⚠️ Please fill in all required fields before saving.</div>}

      <div style={{ display: "flex", gap: 10 }}>
        <Btn onClick={onCancel} variant="secondary" style={{ flex: 1 }} t={t} disabled={saving}>Cancel</Btn>
        <Btn onClick={() => { if (validate()) { try { localStorage.removeItem(draftKey); localStorage.removeItem(CFG.storagePrefix + "_draft_new"); } catch {} onSave(); } }} style={{ flex: 2 }} t={t} disabled={saving}>{saving ? "Saving..." : "💾 Save Job Sheet"}</Btn>
      </div>
    </div>
  );
}

// ---- JOB VIEW ----
function JobView({ job, onRequestEdit, onRequestStatus, onBack, onDelete, deleting, t, adminUnlocked = false }) {
  const Row = ({ label, value }) => value ? (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: t.accent, fontWeight: 800, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
      <div style={{ color: t.text, fontSize: 15 }}>{value}</div>
    </div>
  ) : null;

  const cfg = STATUS_CONFIG[job.jobStatus] || STATUS_CONFIG.ongoing;
  const statusColor = t[cfg.color] || t.blue;
  const totalInvoices = job.materialsOnAccount.reduce((s, sup) => s + (job.supplierInvoices?.[sup] || []).reduce((ss, i) => ss + (parseFloat(i.amount)||0), 0), 0);

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 22, padding: 0 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: t.text }}>{job.clientName || "Unnamed"}</div>
          <div style={{ fontSize: 13, color: t.muted }}>{job.jobDate} · {job.clientType === "commercial" ? "🏢" : "🏠"}</div>
        </div>
        <Btn onClick={onRequestEdit} variant="ghost" style={{ padding: "6px 14px" }} t={t}>{job.jobStatus !== "ongoing" ? "🔒 Edit" : "Edit"}</Btn>
      </div>

      {/* Status + next action */}
      <div style={{ marginBottom: 20, padding: "12px 16px", background: statusColor + "18", borderRadius: 10, border: `1.5px solid ${statusColor}44`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: statusColor, textTransform: "uppercase" }}>{cfg.label}</div>
          {job.jobStatus !== "ongoing" && <div style={{ fontSize: 12, color: t.muted }}>PIN to edit</div>}
        </div>
        {cfg.next && (
          <button onClick={onRequestStatus} style={{ background: statusColor, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>
            {cfg.nextLabel}
          </button>
        )}
      </div>

      {job.clientRef && (
        <div style={{ marginBottom: 20, padding: "10px 14px", background: t.blue + "18", borderRadius: 8, border: `1px solid ${t.blue}44` }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: t.blue, textTransform: "uppercase", marginBottom: 2 }}>Job Reference</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: t.blue }}>{job.clientRef}</div>
        </div>
      )}

      <Sec title="Client" t={t}>
        <Row label="Name" value={job.clientName} />
        <Row label="Phone" value={job.phone} />
        <Row label="Job Address" value={job.jobAddress} />
        <Row label="Email" value={job.email} />
        {job.phone && (
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <a href={smsHref(job.phone, fillTemplate(CFG.smsBooking, job))}
               style={{ flex: 1, minWidth: 150, textAlign: "center", textDecoration: "none", padding: "11px 12px", borderRadius: 8, fontSize: 14, fontWeight: 700, background: t.blue + "22", color: t.blue, border: `1px solid ${t.blue}55` }}>
              📅 Text booking confirmation
            </a>
            <a href={smsHref(job.phone, fillTemplate(CFG.smsOnTheWay, job))}
               style={{ flex: 1, minWidth: 150, textAlign: "center", textDecoration: "none", padding: "11px 12px", borderRadius: 8, fontSize: 14, fontWeight: 700, background: t.green + "22", color: t.green, border: `1px solid ${t.green}55` }}>
              🚗 Text "on the way"
            </a>
          </div>
        )}
      </Sec>

      {job.jobDescription && <Sec title="Job Description" t={t}><div style={{ color: t.text, fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{job.jobDescription}</div></Sec>}

      {job.dailyEntries?.length > 0 && (
        <Sec title="Labour" t={t}>
          {job.dailyEntries.map((entry, idx) => {
            const anyHours = PLUMBERS.some(p => parseFloat(entry.hours[p]) > 0);
            if (!anyHours) return null;
            return (
              <div key={entry.id} style={{ marginBottom: 10, padding: "10px 12px", background: t.surface, borderRadius: 8, border: `1.5px solid ${t.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: t.blue, marginBottom: 6 }}>DAY {idx+1} — {entry.day} {entry.date}</div>
                {PLUMBERS.filter(p => parseFloat(entry.hours[p]) > 0).map(p => {
                  const k = RATE_KEY_FOR[p] || null;
                  const rate = k ? parseFloat(job.labourRates[k]) || 0 : 0;
                  const hrs = parseFloat(entry.hours[p]);
                  return (
                    <div key={p} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                      <span style={{ color: t.text, fontSize: 13 }}>{p} — {hrs}hrs @ ${rate}/hr</span>
                      <span style={{ color: t.accent, fontWeight: 700, fontSize: 13 }}>${(hrs * rate).toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </Sec>
      )}

      {job.materialsOnAccount?.length > 0 && (
        <Sec title="Materials on Account" t={t}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {job.materialsOnAccount.map(m => <span key={m} style={{ background: t.blue + "22", color: t.blue, border: `1px solid ${t.blue}44`, borderRadius: 20, padding: "4px 12px", fontSize: 13, fontWeight: 600 }}>{m}</span>)}
          </div>
          {totalInvoices > 0 && job.materialsOnAccount.map(supplier => {
            const invs = job.supplierInvoices?.[supplier] || [];
            if (!invs.length) return null;
            const total = invs.reduce((s, i) => s + (parseFloat(i.amount)||0), 0);
            return (
              <div key={supplier} style={{ marginBottom: 10, padding: "10px 12px", background: t.surface, borderRadius: 8, border: `1.5px solid ${t.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: t.blue, marginBottom: 6, textTransform: "uppercase" }}>{supplier}</div>
                {invs.map((inv, idx) => (
                  <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                    <span style={{ color: t.muted, fontSize: 13 }}>#{idx+1}{inv.note ? ` — ${inv.note}` : ""}</span>
                    <span style={{ color: t.text, fontWeight: 600, fontSize: 13 }}>${parseFloat(inv.amount||0).toFixed(2)}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, paddingTop: 6, borderTop: `1px solid ${t.border}` }}>
                  <span style={{ color: t.text, fontWeight: 700, fontSize: 13 }}>{supplier} Total</span>
                  <span style={{ color: t.accent, fontWeight: 700 }}>${total.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </Sec>
      )}

      {job.additionalMaterials?.length > 0 && (
        <Sec title="Additional Materials" t={t}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {job.additionalMaterials.map(m => <span key={m} style={{ background: t.accent + "22", color: t.accent, border: `1px solid ${t.accent}44`, borderRadius: 20, padding: "4px 12px", fontSize: 13, fontWeight: 600 }}>{m}</span>)}
          </div>
        </Sec>
      )}

      {job.parts?.length > 0 && (
        <Sec title="Parts Used" t={t}>
          {job.parts.map(p => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${t.border}` }}>
              <span style={{ color: t.text, fontSize: 14 }}>{p.name}</span>
              <span style={{ color: t.muted, fontSize: 13 }}>x{p.qty||1}{adminUnlocked && <> · <span style={{ color: t.accent, fontWeight: 700 }}>${((parseFloat(p.qty)||1)*(parseFloat(p.price)||0)).toFixed(2)}</span></>}</span>
            </div>
          ))}
          {adminUnlocked && (
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 4 }}>
              <span style={{ color: t.muted, fontSize: 13, fontWeight: 700 }}>Parts Subtotal</span>
              <span style={{ color: t.accent, fontWeight: 700 }}>${job.parts.reduce((s,p) => s+(parseFloat(p.price)||0)*(parseFloat(p.qty)||1),0).toFixed(2)}</span>
            </div>
          )}
        </Sec>
      )}

      {job.shedStock?.length > 0 && (
        <Sec title="Shed Stock" t={t} accent={t.purple}>
          {job.shedStock.map(p => (
            <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${t.border}` }}>
              <span style={{ color: t.text, fontSize: 14 }}>{p.name}</span>
              <span style={{ color: t.muted, fontSize: 13 }}>x{p.qty||1}{adminUnlocked && <> · <span style={{ color: t.purple, fontWeight: 700 }}>${((parseFloat(p.qty)||1)*(parseFloat(p.price)||0)).toFixed(2)}</span></>}</span>
            </div>
          ))}
          {adminUnlocked && (
            <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, marginTop: 4 }}>
              <span style={{ color: t.muted, fontSize: 13, fontWeight: 700 }}>Shed Stock Subtotal</span>
              <span style={{ color: t.purple, fontWeight: 700 }}>${job.shedStock.reduce((s,p) => s+(parseFloat(p.price)||0)*(parseFloat(p.qty)||1),0).toFixed(2)}</span>
            </div>
          )}
        </Sec>
      )}

      {job.totalChargeout && (
        <div style={{ background: t.accent + "22", border: `2px solid ${t.accent}44`, borderRadius: 12, padding: "16px 20px", marginBottom: 24, textAlign: "center" }}>
          <div style={{ fontSize: 12, color: t.accent, fontWeight: 800, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Total Chargeout</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: t.accent }}>${parseFloat(job.totalChargeout).toFixed(2)}</div>
        </div>
      )}

      {job.notes && <Sec title="Notes" t={t}><div style={{ color: t.text, fontSize: 15, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{job.notes}</div></Sec>}
      <Btn onClick={onDelete} variant="danger" style={{ width: "100%" }} t={t} disabled={deleting}>{deleting ? "Moving..." : "🗑️ Move to Recently Deleted"}</Btn>
    </div>
  );
}

function AdminPinEntry({ t, onSuccess, onCancel }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const check = () => { if (pin === ADMIN_PIN) onSuccess(); else { setErr(true); setPin(""); } };
  return (
    <>
      <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="Enter PIN"
        style={{ width: "100%", background: t.inputBg, border: `1.5px solid ${err ? "#e05252" : t.border}`, borderRadius: 8, padding: "10px 12px", color: t.text, fontFamily: "inherit", fontSize: 15, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
      {err && <div style={{ color: "#e05252", fontSize: 13, marginBottom: 8 }}>Incorrect PIN</div>}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: t.border, color: t.muted, fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
        <button onClick={check} style={{ flex: 1, padding: "10px", borderRadius: 8, border: "none", background: t.accent, color: "#fff", fontFamily: "inherit", fontWeight: 700, cursor: "pointer" }}>Unlock</button>
      </div>
    </>
  );
}

// ---- JOB LIST ----
function JobList({ jobs, onNew, onSelect, t, adminUnlocked, setAdminUnlocked, collapsed, setCollapsed, onRestore, onPermanentDelete, onOpenLibrary, pendingPartsCount = 0 }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("newest");
  const [showAdminPin, setShowAdminPin] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState({});
  const toggleCollapse = key => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));

  const matches = (job) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [job.clientName, job.clientRef, job.jobAddress, job.companyName, job.jobDescription]
      .some(f => (f || "").toLowerCase().includes(q));
  };

  const sorted = (arr) => {
    const filtered = arr.filter(matches);
    if (sortBy === "newest") return filtered.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (sortBy === "oldest") return filtered.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    if (sortBy === "date") return filtered.sort((a, b) => new Date(b.jobDate) - new Date(a.jobDate));
    if (sortBy === "az") return filtered.sort((a, b) => (a.clientName || "").localeCompare(b.clientName || ""));
    return filtered;
  };

  const drafts = sorted(jobs.filter(j => j.jobStatus === "draft" && !j.deleted));
  const ongoing = sorted(jobs.filter(j => j.jobStatus === "ongoing" && !j.deleted));
  const completed = sorted(jobs.filter(j => j.jobStatus === "completed" && !j.deleted));
  const admin = sorted(jobs.filter(j => j.jobStatus === "admin" && !j.deleted));
  const chargedout = sorted(jobs.filter(j => j.jobStatus === "chargedout" && !j.deleted));
  const deleted = sorted(jobs.filter(j => j.deleted));

  // Group charged out by month
  const archiveByMonth = chargedout.reduce((acc, job) => {
    const date = job.chargedOutDate || job.jobDate || job.createdAt;
    const d = new Date(date);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
    const label = d.toLocaleString("default", { month: "long", year: "numeric" });
    if (!acc[key]) acc[key] = { label, jobs: [] };
    acc[key].jobs.push(job);
    return acc;
  }, {});
  const archiveMonths = Object.keys(archiveByMonth).sort((a, b) => b.localeCompare(a));

  const JobCard = ({ job }) => {
    const cfg = STATUS_CONFIG[job.jobStatus] || STATUS_CONFIG.ongoing;
    const statusColor = t[cfg.color] || t.blue;
    return (
      <div onClick={() => onSelect(job)} style={{ background: t.cardBg, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${t.border}`, cursor: "pointer", marginBottom: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: t.text }}>{job.clientName || "Unnamed"}</div>
              {job.clientRef && <div style={{ fontSize: 11, fontWeight: 800, color: t.blue, background: t.blue + "18", borderRadius: 10, padding: "2px 8px" }}>{job.clientRef}</div>}
              <div style={{ fontSize: 11 }}>{job.clientType === "commercial" ? "🏢" : "🏠"}</div>
            </div>
            <div style={{ fontSize: 13, color: t.muted }}>{job.jobDate}</div>
            {job.jobAddress && <div style={{ fontSize: 12, color: t.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.jobAddress}</div>}
          </div>
          <div style={{ textAlign: "right", marginLeft: 8 }}>
            {job.totalChargeout && <div style={{ fontSize: 18, fontWeight: 800, color: t.accent }}>${parseFloat(job.totalChargeout).toFixed(0)}</div>}
            <div style={{ fontSize: 11, fontWeight: 700, marginTop: 2, color: statusColor }}>{cfg.label}</div>
          </div>
        </div>
      </div>
    );
  };

  const ListSection = ({ title, color, items, sectionKey }) => {
    if (items.length === 0) return null;
    const isCollapsed = collapsed[sectionKey];
    return (
      <div style={{ marginBottom: 24 }}>
        <button onClick={() => toggleCollapse(sectionKey)}
          style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: color + "12", border: `1.5px solid ${color}33`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontFamily: "inherit", marginBottom: isCollapsed ? 0 : 12 }}>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color, textTransform: "uppercase" }}>{title} ({items.length})</span>
          <span style={{ color, fontSize: 14, fontWeight: 700 }}>{isCollapsed ? "▼" : "▲"}</span>
        </button>
        {!isCollapsed && items.map(j => <JobCard key={j.id} job={j} />)}
      </div>
    );
  };

  const total = drafts.length + ongoing.length + completed.length + admin.length + chargedout.length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: t.text }}>{CFG.appName}</div>
          <div style={{ fontSize: 13, color: t.muted }}>{jobs.length} jobs on record</div>
        </div>
        <Btn onClick={onNew} t={t}>+ New Job</Btn>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 12, position: "relative" }}>
        <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.muted, fontSize: 16 }}>🔍</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, reference, address..."
          style={{ width: "100%", background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 10, padding: "10px 12px 10px 36px", color: t.text, fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
      </div>

      {/* Sort */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {[["newest","🕐 Newest"],["oldest","🕓 Oldest"],["date","📅 Job Date"],["az","🔤 A–Z"]].map(([val, label]) => (
          <button key={val} onClick={() => setSortBy(val)} style={{ whiteSpace: "nowrap", padding: "6px 14px", borderRadius: 20, border: `1.5px solid ${sortBy === val ? t.accent : t.border}`, background: sortBy === val ? t.accent + "22" : t.surface, color: sortBy === val ? t.accent : t.muted, fontFamily: "inherit", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{label}</button>
        ))}
      </div>

      {jobs.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 20px", color: t.muted }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📋</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No jobs yet</div>
          <div style={{ fontSize: 14 }}>Tap + New Job to create your first job sheet</div>
        </div>
      ) : total === 0 && search ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: t.muted }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>No results for "{search}"</div>
        </div>
      ) : (
        <>
          {drafts.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ background: t.accent + "12", border: `1.5px solid ${t.accent}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: t.accent, textTransform: "uppercase", marginBottom: 4 }}>📝 Unsaved Drafts ({drafts.length})</div>
                <div style={{ fontSize: 12, color: t.muted }}>Job sheets started but never saved. Open one to finish it and hit Save — it'll file as Ongoing.</div>
              </div>
              {drafts.map(j => <JobCard key={j.id} job={j} />)}
            </div>
          )}
          <ListSection title="🔧 Ongoing" color={t.blue} items={ongoing} sectionKey="ongoing" />
          <ListSection title="✅ Completed" color={t.green} items={completed} sectionKey="completed" />

          {/* Admin section - PIN protected */}
          {true && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2, color: t.orange, textTransform: "uppercase" }}>
                  📋 Admin {adminUnlocked ? `(${admin.length + chargedout.length})` : "🔒"}
                </div>
                {!adminUnlocked ? (
                  <button onClick={() => setShowAdminPin(true)} style={{ background: t.orange + "22", border: `1px solid ${t.orange}44`, borderRadius: 20, padding: "4px 12px", color: t.orange, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Unlock</button>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={onOpenLibrary} style={{ background: t.blue + "22", border: `1px solid ${t.blue}44`, borderRadius: 20, padding: "4px 12px", color: t.blue, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>🧰 Parts Library{pendingPartsCount > 0 ? ` (${pendingPartsCount} pending)` : ""}</button>
                    <button onClick={() => setAdminUnlocked(false)} style={{ background: t.border, border: "none", borderRadius: 20, padding: "4px 12px", color: t.muted, fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Lock</button>
                  </div>
                )}
              </div>

              {showAdminPin && (
                <div style={{ position: "fixed", inset: 0, background: "#000a", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
                  <div style={{ background: t.surface, borderRadius: 16, padding: 28, width: "100%", maxWidth: 320, border: `1.5px solid ${t.border}` }}>
                    <div style={{ fontSize: 18, fontWeight: 900, color: t.text, marginBottom: 6 }}>🔒 Admin Access</div>
                    <div style={{ fontSize: 14, color: t.muted, marginBottom: 20 }}>Enter PIN to access admin section.</div>
                    <AdminPinEntry t={t} onSuccess={() => { setAdminUnlocked(true); setShowAdminPin(false); }} onCancel={() => setShowAdminPin(false)} />
                  </div>
                </div>
              )}

              {adminUnlocked && (
                <>
                  {admin.length > 0 && (
                    <div style={{ marginBottom: 16 }}>
                      <button onClick={() => toggleCollapse("admin")}
                        style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", background: t.orange + "12", border: `1.5px solid ${t.orange}33`, borderRadius: 10, padding: "10px 14px", cursor: "pointer", fontFamily: "inherit", marginBottom: collapsed.admin ? 0 : 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: t.orange, textTransform: "uppercase", letterSpacing: 1 }}>Pending Pricing ({admin.length})</span>
                        <span style={{ color: t.orange, fontSize: 14, fontWeight: 700 }}>{collapsed.admin ? "▼" : "▲"}</span>
                      </button>
                      {!collapsed.admin && admin.filter(matches).map(j => <JobCard key={j.id} job={j} />)}
                    </div>
                  )}

                  {/* Archive by month */}
                  {chargedout.length > 0 && (
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.purple, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>💰 Charged Out — Archive</div>
                      {archiveMonths.map(key => {
                        const { label, jobs: monthJobs } = archiveByMonth[key];
                        const isOpen = archiveOpen[key];
                        const filteredMonthJobs = monthJobs.filter(matches);
                        if (filteredMonthJobs.length === 0) return null;
                        return (
                          <div key={key} style={{ marginBottom: 10 }}>
                            <button onClick={() => setArchiveOpen(prev => ({ ...prev, [key]: !prev[key] }))}
                              style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: t.purple + "18", border: `1.5px solid ${t.purple}44`, borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}>
                              <span style={{ fontWeight: 800, color: t.purple, fontSize: 14 }}>📁 {label}</span>
                              <span style={{ color: t.purple, fontSize: 13, fontWeight: 600 }}>{filteredMonthJobs.length} job{filteredMonthJobs.length !== 1 ? "s" : ""} {isOpen ? "▲" : "▼"}</span>
                            </button>
                            {isOpen && (
                              <div style={{ paddingTop: 8 }}>
                                {filteredMonthJobs.map(j => <JobCard key={j.id} job={j} />)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Recently Deleted */}
                  {deleted.length > 0 && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: t.dangerText, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>🗑️ Recently Deleted ({deleted.length})</div>
                      {deleted.filter(matches).map(j => (
                        <div key={j.id} style={{ background: t.cardBg, borderRadius: 12, padding: "14px 16px", border: `1.5px solid ${t.dangerBorder}`, marginBottom: 10, opacity: 0.85 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 700, color: t.text }}>{j.clientName || "Unnamed"} {j.clientRef && <span style={{ fontSize: 11, color: t.muted }}>({j.clientRef})</span>}</div>
                              <div style={{ fontSize: 12, color: t.muted }}>{j.jobDate}{j.jobAddress ? ` · ${j.jobAddress}` : ""}</div>
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button onClick={() => onRestore(j)} style={{ background: t.green, color: "#fff", border: "none", borderRadius: 8, padding: "6px 12px", fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Restore</button>
                              <button onClick={() => onPermanentDelete(j)} style={{ background: t.dangerBg, color: t.dangerText, border: `1px solid ${t.dangerBorder}`, borderRadius: 8, padding: "6px 12px", fontFamily: "inherit", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Delete Forever</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- PARTS LIBRARY (admin) ----
function PartsLibrary({ parts, onBack, onUpdate, onDelete, onAdd, t }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [newPart, setNewPart] = useState({ name: "", price: "", category: "Other" });
  const [edits, setEdits] = useState({}); // id -> {name?, price?, category?}

  const pending = parts.filter(p => !p.approved);
  const approved = parts.filter(p => p.approved);

  const filtered = approved.filter(p =>
    (cat === "All" || (p.category || "Other") === cat) &&
    (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase()))
  );

  const setEdit = (id, field, val) => setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: val } }));
  const commitEdit = (p) => {
    const e = edits[p.id];
    if (!e) return;
    const changed = ("name" in e && e.name !== p.name) || ("price" in e && e.price !== p.price) || ("category" in e && e.category !== p.category);
    if (changed) onUpdate(p.id, e);
    setEdits(prev => { const n = { ...prev }; delete n[p.id]; return n; });
  };

  const approvePending = (p) => {
    const e = edits[p.id] || {};
    onUpdate(p.id, { ...e, approved: true });
    setEdits(prev => { const n = { ...prev }; delete n[p.id]; return n; });
  };

  const addNew = () => {
    if (!newPart.name.trim()) return;
    onAdd(newPart);
    setNewPart({ name: "", price: "", category: "Other" });
  };

  return (
    <div style={{ paddingBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", color: t.muted, cursor: "pointer", fontSize: 22, padding: 0 }}>←</button>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: t.text }}>🧰 Parts Library</div>
          <div style={{ fontSize: 13, color: t.muted }}>{approved.length} approved · learned from real jobs</div>
        </div>
      </div>

      {/* Pending review queue */}
      {pending.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ background: t.orange + "12", border: `1.5px solid ${t.orange}33`, borderRadius: 10, padding: "10px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, color: t.orange, textTransform: "uppercase", marginBottom: 4 }}>⏳ Pending Review ({pending.length})</div>
            <div style={{ fontSize: 12, color: t.muted }}>New parts the crew has used. Tidy the name, set the price and category, then Approve — it goes straight into everyone's dropdown.</div>
          </div>
          {pending.map(p => {
            const e = edits[p.id] || {};
            return (
              <div key={p.id} style={{ background: t.surface, borderRadius: 10, padding: 12, border: `1.5px solid ${t.orange}44`, marginBottom: 8 }}>
                <input value={"name" in e ? e.name : p.name} onChange={ev => setEdit(p.id, "name", ev.target.value)} placeholder="Part name"
                  style={{ width: "100%", background: t.inputBg, border: `1.5px solid ${t.border}`, borderRadius: 6, padding: "8px 10px", color: t.text, fontFamily: "inherit", fontSize: 14, fontWeight: 600, outline: "none", boxSizing: "border-box", marginBottom: 8 }} />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8, marginBottom: 8 }}>
                  <input type="number" value={"price" in e ? e.price : p.price} onChange={ev => setEdit(p.id, "price", ev.target.value)} placeholder="$ each"
                    style={{ background: t.inputBg, border: `1.5px solid ${t.border}`, borderRadius: 6, padding: "8px 10px", color: t.accent, fontFamily: "inherit", fontSize: 14, fontWeight: 700, outline: "none" }} />
                  <select value={"category" in e ? e.category : (p.category || "Other")} onChange={ev => setEdit(p.id, "category", ev.target.value)}
                    style={{ background: t.selectBg, border: `1.5px solid ${t.border}`, borderRadius: 6, padding: "8px 10px", color: t.text, fontFamily: "inherit", fontSize: 13, outline: "none" }}>
                    {PART_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => approvePending(p)} style={{ flex: 2, background: t.green, color: "#fff", border: "none", borderRadius: 8, padding: "9px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>✓ Approve to Library</button>
                  <button onClick={() => { if (window.confirm(`Dismiss "${p.name}"? (Job sheets aren't affected.)`)) onDelete(p.id); }} style={{ flex: 1, background: t.dangerBg, color: t.dangerText, border: `1px solid ${t.dangerBorder}`, borderRadius: 8, padding: "9px", fontFamily: "inherit", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Dismiss</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add new part */}
      <div style={{ background: t.surface, borderRadius: 10, padding: 14, border: `1.5px solid ${t.border}`, marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: t.accent, textTransform: "uppercase", marginBottom: 8 }}>Add Part Manually</div>
        <Inp value={newPart.name} onChange={v => setNewPart({ ...newPart, name: v })} placeholder="Part name" style={{ marginBottom: 8 }} t={t} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <Inp value={newPart.price} onChange={v => setNewPart({ ...newPart, price: v })} placeholder="$ each" type="number" t={t} />
          <select value={newPart.category} onChange={e => setNewPart({ ...newPart, category: e.target.value })}
            style={{ width: "100%", background: t.selectBg, border: `1.5px solid ${t.border}`, borderRadius: 8, padding: "10px 12px", color: t.text, fontFamily: "inherit", fontSize: 14, outline: "none" }}>
            {PART_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <Btn onClick={addNew} style={{ width: "100%" }} t={t}>+ Add to Library</Btn>
      </div>

      {/* Search + category filter */}
      <div style={{ marginBottom: 10, position: "relative" }}>
        <div style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: t.muted, fontSize: 16 }}>🔍</div>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search parts..."
          style={{ width: "100%", background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 10, padding: "10px 12px 10px 36px", color: t.text, fontFamily: "inherit", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, overflowX: "auto", paddingBottom: 4 }}>
        {["All", ...PART_CATEGORIES].map(c => (
          <button key={c} onClick={() => setCat(c)} style={{ whiteSpace: "nowrap", padding: "5px 12px", borderRadius: 20, border: `1.5px solid ${cat === c ? t.blue : t.border}`, background: cat === c ? t.blue + "22" : t.surface, color: cat === c ? t.blue : t.muted, fontFamily: "inherit", fontWeight: 600, fontSize: 12, cursor: "pointer" }}>{c}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: t.muted }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🧰</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{approved.length === 0 ? "Library is empty — approve pending parts or add manually to get started." : "No parts match."}</div>
        </div>
      ) : filtered.map(p => {
        const e = edits[p.id] || {};
        return (
          <div key={p.id} style={{ background: t.surface, borderRadius: 10, padding: 12, border: `1.5px solid ${t.border}`, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
              <input value={"name" in e ? e.name : p.name} onChange={ev => setEdit(p.id, "name", ev.target.value)} onBlur={() => commitEdit(p)}
                style={{ flex: 1, background: t.inputBg, border: `1.5px solid ${t.border}`, borderRadius: 6, padding: "8px 10px", color: t.text, fontFamily: "inherit", fontSize: 14, fontWeight: 600, outline: "none" }} />
              <button onClick={() => { if (window.confirm(`Delete "${p.name}" from the library? (Doesn't affect any job sheets.)`)) onDelete(p.id); }}
                style={{ background: "none", border: "none", color: t.dangerText, cursor: "pointer", fontSize: 18, padding: 4 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 8 }}>
              <input type="number" value={"price" in e ? e.price : p.price} onChange={ev => setEdit(p.id, "price", ev.target.value)} onBlur={() => commitEdit(p)} placeholder="$ each"
                style={{ background: t.inputBg, border: `1.5px solid ${t.border}`, borderRadius: 6, padding: "8px 10px", color: t.accent, fontFamily: "inherit", fontSize: 14, fontWeight: 700, outline: "none" }} />
              <select value={"category" in e ? e.category : (p.category || "Other")} onChange={ev => { setEdit(p.id, "category", ev.target.value); onUpdate(p.id, { category: ev.target.value }); }}
                style={{ background: t.selectBg, border: `1.5px solid ${t.border}`, borderRadius: 6, padding: "8px 10px", color: t.text, fontFamily: "inherit", fontSize: 13, outline: "none" }}>
                {PART_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- MAIN ----
export default function App() {
  const [screen, setScreen] = useState("list");
  const [jobs, setJobs] = useState([]);
  const [currentJob, setCurrentJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [pinAction, setPinAction] = useState(null); // "edit" | "status"
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [partsLib, setPartsLib] = useState([]);
  const [collapsed, setCollapsed] = useState({ ongoing: false, completed: false, admin: false });
  const [listScroll, setListScroll] = useState(0);
  const t = darkMode ? DARK : LIGHT;

  // Restore scroll position when returning to the list
  useEffect(() => {
    if (screen === "list" && listScroll > 0) {
      requestAnimationFrame(() => window.scrollTo(0, listScroll));
    }
  }, [screen]);

  // Open a job from the list, remembering where we were
  const openJob = (j) => {
    setListScroll(window.scrollY);
    draftStopped.current = false;
    draftIdRef.current = null;
    setCurrentJob(j);
    setScreen("view");
  };
  const backToList = () => setScreen("list");

  // ---- Shared draft autosave ----
  // NEW job sheets quietly file to the database as a "Draft" a couple of seconds
  // after meaningful typing starts, so a forgotten Save still leaves the work
  // visible to everyone. Three safety locks (lessons from the myGang wipe):
  //  1. Edits to EXISTING saved jobs are never auto-pushed — device-local only.
  //  2. Autosave skips entirely while the app is backgrounded (document.hidden).
  //  3. dbPatchDraft's URL filter means the DB refuses the write if the record
  //     is no longer a draft — a stale phone can't revert a promoted job.
  const draftTimer = useRef(null);
  const draftInserting = useRef(false);
  const draftStopped = useRef(false);
  const draftIdRef = useRef(null); // remembers the autosaved draft's DB id, in case Save races the insert

  useEffect(() => {
    if (screen !== "form" || !currentJob) return;
    // Lock 1: only new jobs / existing drafts, never real saved jobs
    const existingRecord = currentJob.id ? jobs.find(j => j.id === currentJob.id) : null;
    if (existingRecord && existingRecord.jobStatus !== "draft") return;
    if (draftStopped.current) return;
    const hasContent = `${currentJob.firstName || ""}${currentJob.lastName || ""}${currentJob.companyName || ""}`.trim().length > 1;
    if (!hasContent) return;

    clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(async () => {
      if (document.hidden) return; // Lock 2: never autosave from a backgrounded app
      try {
        if (!currentJob.id) {
          if (draftInserting.current) return;
          draftInserting.current = true;
          const saved = await dbInsert({ ...currentJob, jobStatus: "draft" });
          draftInserting.current = false;
          draftIdRef.current = saved.id;
          // this sheet now lives in the DB — clear the device-local "new job" draft
          // so it can't offer this job's data on the NEXT new sheet
          try { localStorage.removeItem(CFG.storagePrefix + "_draft_new"); } catch {}
          setJobs(prev => [saved, ...prev]);
          // merge only the id + timestamp so in-flight typing isn't clobbered
          setCurrentJob(prev => prev ? { ...prev, id: saved.id, lastEditedAt: saved.lastEditedAt } : prev);
        } else {
          const saved = await dbPatchDraft(currentJob); // Lock 3 lives in here
          if (!saved) { draftStopped.current = true; return; }
          setJobs(prev => prev.map(j => j.id === saved.id ? saved : j));
          setCurrentJob(prev => prev ? { ...prev, lastEditedAt: saved.lastEditedAt } : prev);
        }
      } catch { draftInserting.current = false; }
    }, 2000);
    return () => clearTimeout(draftTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentJob, screen]);

  useEffect(() => {
    (async () => {
      try { setJobs(await dbGetAll()); } catch { setError("Couldn't connect to database."); }
      try { setPartsLib(await dbGetParts()); } catch {} // library is optional — app works without it
      try { const dm = localStorage.getItem(CFG.storagePrefix + "_darkmode"); if (dm) setDarkMode(JSON.parse(dm)); } catch {}
      setLoading(false);
    })();
  }, []);

  const toggleDark = () => {
    const next = !darkMode; setDarkMode(next);
    try { localStorage.setItem(CFG.storagePrefix + "_darkmode", JSON.stringify(next)); } catch {}
  };

  const handleSave = async () => {
    setSaving(true); setError(null);
    // Stop the draft autosave engine so it can't race this save
    draftStopped.current = true;
    clearTimeout(draftTimer.current);
    // If an autosave insert is mid-flight, let it land so we reuse its record instead of duplicating
    for (let i = 0; i < 30 && draftInserting.current; i++) await new Promise(r => setTimeout(r, 100));
    const effectiveId = currentJob.id || draftIdRef.current;
    // A draft being properly saved gets filed as Ongoing unless the user picked a status
    const base = currentJob.jobStatus === "draft" ? { ...currentJob, jobStatus: "ongoing" } : currentJob;
    const jobToSave = { ...base, id: effectiveId };
    try {
      const isNew = !jobToSave.id;
      if (isNew) { const saved = await dbInsert(jobToSave); setJobs(prev => [saved, ...prev]); setCurrentJob(saved); }
      else {
        // Overwrite guard: check whether someone else edited this job since we opened it
        try {
          const latest = await dbGetOne(jobToSave.id);
          if (latest && latest.jobStatus !== "draft" && latest.lastEditedAt && currentJob.lastEditedAt && latest.lastEditedAt !== currentJob.lastEditedAt) {
            const proceed = window.confirm(
              "⚠️ Heads up: this job has been changed by someone else since you opened it.\n\n" +
              "Saving now will overwrite their changes with yours.\n\n" +
              "OK = save anyway (your version wins)\nCancel = don't save (go back and check first)"
            );
            if (!proceed) { setSaving(false); return; }
          }
        } catch {} // if the check itself fails, don't block the save
        const updated = await dbUpdate(jobToSave);
        setJobs(prev => prev.map(j => j.id === updated.id ? updated : j)); setCurrentJob(updated);
      }
      setScreen("view");
    } catch { setError("Save failed. Check your connection."); draftStopped.current = false; }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!window.confirm("Move this job sheet to Recently Deleted? It can be restored from the Admin section.")) return;
    setDeleting(true);
    try {
      const saved = await dbUpdate({ ...currentJob, deleted: true });
      setJobs(prev => prev.map(j => j.id === saved.id ? saved : j));
      setScreen("list");
    }
    catch { setError("Delete failed."); }
    setDeleting(false);
  };

  const handleRestore = async (job) => {
    try {
      const saved = await dbUpdate({ ...job, deleted: false });
      setJobs(prev => prev.map(j => j.id === saved.id ? saved : j));
    } catch { setError("Restore failed."); }
  };

  const handlePermanentDelete = async (job) => {
    if (!window.confirm(`PERMANENTLY delete "${job.clientName || "this job"}"? This cannot be undone.`)) return;
    try {
      await dbDelete(job.id);
      setJobs(prev => prev.filter(j => j.id !== job.id));
    } catch { setError("Permanent delete failed."); }
  };

  const handleStatusAdvance = async () => {
    const next = STATUS_CONFIG[currentJob.jobStatus]?.next;
    if (!next) return;
    const updated = {
      ...currentJob,
      jobStatus: next,
      chargedOutDate: next === "chargedout" ? new Date().toISOString().split("T")[0] : currentJob.chargedOutDate,
    };
    try {
      const saved = await dbUpdate(updated);
      setJobs(prev => prev.map(j => j.id === saved.id ? saved : j));
      setCurrentJob(saved);
      // Charge-out is when pricing is final — feed the parts library
      if (next === "chargedout") captureLibraryParts(saved);
    } catch { setError("Update failed."); }
  };

  // A part name nobody's seen before → quietly queue it for admin review
  const handleCapturePart = async (name, price) => {
    const clean = (name || "").trim();
    if (clean.length < 2) return;
    if (partsLib.some(l => l.name.trim().toLowerCase() === clean.toLowerCase())) return; // known (approved or already pending)
    try {
      const added = await dbInsertPart({ name: clean, price: price ? String(price) : "", category: "Other", approved: false });
      setPartsLib(prev => [...prev, added]);
    } catch {} // capture is best-effort, never interrupts the user
  };

  // Learn parts from a charged-out job: known approved names get the latest admin price;
  // pending names get their price filled; unknowns get queued for review
  const captureLibraryParts = async (job) => {
    const allParts = [...(job.parts || []), ...(job.shedStock || [])].filter(p => (p.name || "").trim());
    let lib = [...partsLib];
    for (const part of allParts) {
      try {
        const existing = lib.find(l => l.name.trim().toLowerCase() === part.name.trim().toLowerCase());
        if (existing) {
          if (part.price && String(part.price) !== String(existing.price)) {
            const updated = await dbUpdatePart(existing.id, { price: String(part.price) });
            lib = lib.map(l => l.id === updated.id ? updated : l);
          }
        } else {
          const added = await dbInsertPart({ name: part.name.trim(), price: part.price ? String(part.price) : "", category: "Other", approved: false });
          lib = [...lib, added];
        }
      } catch {} // never let library sync break a charge-out
    }
    setPartsLib(lib);
  };

  const handlePartUpdate = async (id, fields) => {
    try { const updated = await dbUpdatePart(id, fields); setPartsLib(prev => prev.map(p => p.id === id ? updated : p)); }
    catch { setError("Part update failed."); }
  };
  const handlePartDelete = async (id) => {
    try { await dbDeletePart(id); setPartsLib(prev => prev.filter(p => p.id !== id)); }
    catch { setError("Part delete failed."); }
  };
  const handlePartAdd = async (p) => {
    try { const added = await dbInsertPart({ ...p, approved: true }); setPartsLib(prev => [...prev, added].sort((a, b) => a.name.localeCompare(b.name))); }
    catch { setError("Part add failed."); }
  };

  const needsPin = (job) => STATUS_CONFIG[job.jobStatus]?.pinRequired === true && !adminUnlocked;

  if (loading) return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "#f0f4f8", fontFamily: "system-ui", color: "#6b7f96", gap: 12 }}>
      <div style={{ fontSize: 32 }}>🔧</div>
      <div style={{ fontWeight: 700 }}>Loading {CFG.appName}...</div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: "'DM Sans', system-ui, sans-serif", color: t.text, transition: "background 0.2s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;800;900&display=swap');
        input[type=date]::-webkit-calendar-picker-indicator,
        input[type=time]::-webkit-calendar-picker-indicator { filter: ${darkMode ? "invert(0.5)" : "none"}; }
        input::placeholder, textarea::placeholder { color: ${t.muted} !important; }
        select option { background: ${t.selectBg}; color: ${t.text}; }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>

      {pinAction && (
        <PinModal t={t}
          message={pinAction === "edit" ? "This job is locked. Enter PIN to edit." : "Enter PIN to advance job status."}
          onSuccess={() => { setAdminUnlocked(true); if (pinAction === "edit") { setPinAction(null); setScreen("form"); } else { setPinAction(null); handleStatusAdvance(); } }}
          onCancel={() => setPinAction(null)} />
      )}

      <div style={{ position: "sticky", top: 0, zIndex: 100, background: t.bg, borderBottom: `1px solid ${t.border}`, padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, color: t.muted }}>{CFG.businessName.toUpperCase()}</div>
        <button onClick={toggleDark} style={{ background: t.surface, border: `1.5px solid ${t.border}`, borderRadius: 20, padding: "6px 14px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13, color: t.muted }}>
          {darkMode ? "☀️ Light" : "🌙 Dark"}
        </button>
      </div>

      {error && <div style={{ background: "#fff0f0", borderBottom: "1px solid #fecaca", padding: "10px 16px", color: "#dc2626", fontSize: 13, fontWeight: 600, textAlign: "center" }}>⚠️ {error}</div>}

      <div style={{ padding: "20px 16px 40px", maxWidth: 480, margin: "0 auto" }}>
        {screen === "list" && <JobList jobs={jobs} onNew={() => { draftStopped.current = false; draftIdRef.current = null; setCurrentJob(newJob()); setScreen("form"); }} onSelect={openJob} t={t} adminUnlocked={adminUnlocked} setAdminUnlocked={setAdminUnlocked} collapsed={collapsed} setCollapsed={setCollapsed} onRestore={handleRestore} onPermanentDelete={handlePermanentDelete} onOpenLibrary={() => setScreen("library")} pendingPartsCount={partsLib.filter(p => !p.approved).length} />}
        {screen === "library" && <PartsLibrary parts={partsLib} onBack={() => setScreen("list")} onUpdate={handlePartUpdate} onDelete={handlePartDelete} onAdd={handlePartAdd} t={t} />}
        {screen === "form" && <JobForm job={currentJob} onChange={setCurrentJob} onSave={handleSave} onCancel={() => setScreen(currentJob?.id ? "view" : "list")} isNew={!currentJob?.id} saving={saving} t={t} allJobs={jobs} adminUnlocked={adminUnlocked} partsLibrary={partsLib} onNewPartCaptured={handleCapturePart} />}
        {screen === "view" && currentJob && (
          <JobView
            job={currentJob}
            onRequestEdit={() => needsPin(currentJob) ? setPinAction("edit") : setScreen("form")}
            onRequestStatus={() => needsPin(currentJob) ? setPinAction("status") : handleStatusAdvance()}
            onBack={backToList}
            onDelete={handleDelete}
            deleting={deleting}
            t={t}
            adminUnlocked={adminUnlocked}
          />
        )}
      </div>
    </div>
  );
}
