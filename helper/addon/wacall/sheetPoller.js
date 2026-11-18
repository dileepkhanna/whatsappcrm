// ─────────────────────────────────────────────────────────────────────────────
// Google Sheet poller for Lead Auto-Call (intake option A).
//
// The user publishes their Google Sheet as CSV
//   File → Share → Publish to web → (sheet) → CSV
// and pastes that public CSV URL in the Lead Auto-Call settings. We poll it on
// an interval, detect rows we haven't seen yet (tracked by sheet_last_row), turn
// each new row into a lead, and hand it to the auto-call engine.
//
// We use the published-CSV approach on purpose: it needs no Google API key,
// OAuth, or service account — the single biggest friction point of the Sheets
// API — while still giving near-real-time intake for ad-campaign lead forms
// that dump into a sheet (via Google Lead Form / Zapier / Make).
//
// Column mapping is forgiving: we look for common header names (name, phone,
// mobile, number, email) case-insensitively; every other column is preserved in
// the lead's `extra` JSON so nothing the customer submitted is lost.
// ─────────────────────────────────────────────────────────────────────────────

const axios = require("axios");
const stream = require("stream");
const csv = require("csv-parser");
const { query } = require("../../../database/dbpromise.js");
const leadStore = require("./leadStore.js");
const leadCaller = require("./leadCaller.js");

let pollTimer = null;

function parseCsvBuffer(buf) {
  return new Promise((resolve) => {
    const rows = [];
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buf);
    bufferStream
      .pipe(csv())
      .on("data", (d) => rows.push(d))
      .on("end", () => resolve(rows))
      .on("error", () => resolve([]));
  });
}

// Normalize a published-sheet URL. Accepts either an already-CSV export URL or a
// normal edit URL, converting the latter to the CSV export form when possible.
function toCsvUrl(url) {
  if (!url) return null;
  if (url.includes("output=csv") || url.includes("/export?format=csv")) return url;
  // https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<GID>
  const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) {
    const id = m[1];
    const gidMatch = url.match(/[#&?]gid=(\d+)/);
    const gid = gidMatch ? gidMatch[1] : "0";
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
  }
  return url;
}

function pick(row, keys) {
  const lower = {};
  for (const k of Object.keys(row)) lower[k.trim().toLowerCase()] = row[k];
  for (const key of keys) {
    const v = lower[key];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

const PHONE_KEYS = ["mobile", "phone", "number", "phone number", "contact", "whatsapp"];

// Fetch a sheet URL once and report what we can see, without saving anything.
// Used by the "Test Sheet Connection" button so the user gets a precise reason
// when something is off (private sheet, wrong tab, no phone column, empty, ...).
async function testSheet(rawUrl) {
  const csvUrl = toCsvUrl(rawUrl);
  if (!csvUrl) return { ok: false, msg: "No URL provided" };

  let res;
  try {
    res = await axios.get(csvUrl, { responseType: "arraybuffer", timeout: 20000 });
  } catch (err) {
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      return {
        ok: false,
        csvUrl,
        msg: "Google refused access (sheet is private). Set sharing to 'Anyone with the link → Viewer', or publish it (File → Share → Publish to web → CSV).",
      };
    }
    return { ok: false, csvUrl, msg: `Could not fetch the sheet: ${err.message}` };
  }

  const text = Buffer.from(res.data).toString("utf8");
  // If Google returned an HTML login/permission page instead of CSV, detect it.
  if (/^\s*<(!doctype|html)/i.test(text)) {
    return {
      ok: false,
      csvUrl,
      msg: "Got a Google login/permission page instead of data. The sheet is not publicly viewable. Set sharing to 'Anyone with the link → Viewer'.",
    };
  }

  const rows = await parseCsvBuffer(Buffer.from(res.data));
  if (!rows.length) {
    return { ok: false, csvUrl, msg: "The sheet is reachable but has no data rows (only a header, or empty)." };
  }

  const columns = Object.keys(rows[0]).map((c) => c.trim());
  const phoneVal = pick(rows[0], PHONE_KEYS);
  if (!phoneVal) {
    return {
      ok: false,
      csvUrl,
      rowCount: rows.length,
      columns,
      msg: `Reachable with ${rows.length} row(s), but no phone/mobile column found. Rename a column to "phone" or "mobile". Columns seen: ${columns.join(", ")}`,
    };
  }

  return {
    ok: true,
    csvUrl,
    rowCount: rows.length,
    columns,
    sample: { name: pick(rows[0], ["name", "full name", "first name"]), phone: phoneVal },
    msg: `Success — ${rows.length} row(s) found. Columns: ${columns.join(", ")}.`,
  };
}

async function pollUserSheet(settings) {
  const uid = settings.uid;
  const csvUrl = toCsvUrl(settings.sheet_url);
  if (!csvUrl) return;

  let res;
  try {
    // Cache-bust: Google's published CSV is served through a CDN that can cache
    // for a few minutes. A changing query param + no-cache headers reduce the
    // delay before a freshly-added row becomes visible.
    const bust = (csvUrl.includes("?") ? "&" : "?") + "_ts=" + Date.now();
    res = await axios.get(csvUrl + bust, {
      responseType: "arraybuffer",
      timeout: 20000,
      headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
    });
  } catch (err) {
    console.error(`[wa-call][sheet] fetch failed for uid ${uid}:`, err.message);
    return { imported: 0, seen: 0, error: err.message };
  }

  const rows = await parseCsvBuffer(Buffer.from(res.data));
  if (!rows.length) return { imported: 0, seen: 0 };

  // Content-based detection: scan EVERY row and rely on insertLead's phone
  // de-dupe (unique per uid+mobile). This is robust against row re-ordering,
  // deletions, and header changes — unlike a brittle row-index cursor. New
  // phone numbers become new leads and auto-call; rows already seen are skipped.
  let imported = 0;
  for (const row of rows) {
    const mobile = pick(row, ["mobile", "phone", "number", "phone number", "phone_number", "contact", "whatsapp"]);
    if (!mobile) continue;
    const name = pick(row, ["name", "full name", "fullname", "first name"]);
    const email = pick(row, ["email", "e-mail", "mail"]);

    const { lead, isNew } = await leadStore.insertLead(uid, {
      name,
      mobile,
      email,
      source: "google_sheet",
      extra: row,
    });
    if (isNew && lead) {
      imported += 1;
      console.log(`[wa-call][sheet] new lead from sheet: ${name || ""} ${mobile} (uid ${uid}) → triggering auto-call`);
      leadCaller.onNewLead(uid, lead).catch((e) =>
        console.error("[wa-call][sheet] onNewLead error:", e.message),
      );
    }
  }

  if (imported > 0) {
    console.log(`[wa-call][sheet] uid ${uid}: imported ${imported} new lead(s) from the sheet`);
  }
  // Record the last poll outcome so the UI can show "last checked … · saw N · imported M".
  try {
    await leadStore.recordPoll(uid, { seen: rows.length, imported });
  } catch (_) {}
  return { imported, seen: rows.length };
}

async function pollAllSheets() {
  try {
    await leadStore.ensureTables();
    const settingsRows = await query(
      `SELECT * FROM wa_call_lead_settings WHERE sheet_enabled = 1 AND sheet_url IS NOT NULL AND sheet_url <> ''`,
    );
    if (!settingsRows.length) {
      console.log("[wa-call][sheet] tick: no users have sheet polling enabled (turn ON 'Poll a published Google Sheet' + Save).");
      return;
    }
    console.log(`[wa-call][sheet] tick: polling ${settingsRows.length} sheet(s)…`);
    for (const s of settingsRows) {
      const r = await pollUserSheet(s).catch((e) => {
        console.error("[wa-call][sheet] pollUserSheet error:", e.message);
        return null;
      });
      if (r) {
        console.log(`[wa-call][sheet] uid ${s.uid}: saw ${r.seen} row(s), imported ${r.imported} new.`);
      }
    }
  } catch (err) {
    console.error("[wa-call][sheet] pollAllSheets error:", err.message);
  }
}

// Start the global poller (called once from app.js). Runs every minute; each
// user row is only fetched when due based on its own sheet_poll_minutes — but
// to keep it simple we poll every enabled sheet each tick (1 min) which is fine
// for the small number of published sheets in practice.
function startSheetPoller() {
  if (pollTimer) return;
  const INTERVAL = 30 * 1000; // check every 30s for faster lead pickup
  pollTimer = setInterval(pollAllSheets, INTERVAL);
  // Kick one off shortly after boot.
  setTimeout(pollAllSheets, 10 * 1000);
  console.log("📄 Lead Auto-Call Google-Sheet poller started (30s interval)");
}

function stopSheetPoller() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

module.exports = { startSheetPoller, stopSheetPoller, pollAllSheets, pollUserSheet, toCsvUrl, testSheet };
