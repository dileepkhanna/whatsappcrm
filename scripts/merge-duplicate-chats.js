#!/usr/bin/env node
/**
 * ─────────────────────────────────────────────────────────────────────────────
 * One-time cleanup: merge duplicate WhatsApp chats caused by inconsistent phone
 * normalization (a bare 10-digit number vs the same number with country code).
 *
 * Example duplicate pair for one contact + one user:
 *   meta_9949512262_<uid>     (bare, created by an old outgoing path)
 *   meta_919949512262_<uid>   (padded, created by the inbound webhook)
 *
 * The code fix (functions/phone.js used everywhere) stops NEW duplicates. This
 * script cleans up the rows that already exist.
 *
 * What it does, per (uid, origin/prefix, normalized-phone) group that has >1 chat:
 *   1. Picks a "canonical" survivor — the chat whose phone digits are already
 *      fully normalized (country-code padded). If none is normalized, it keeps
 *      the oldest row and renames its chat_id to the normalized form.
 *   2. Repoints every beta_conversation row from the duplicate chat_ids to the
 *      survivor's chat_id.
 *   3. Merges useful fields onto the survivor (max unread_count, keep any
 *      chat_label / chat_note / assigned_agent that the survivor is missing,
 *      newest last_message by updatedAt) and normalizes its sender_mobile.
 *   4. Deletes the duplicate beta_chats rows.
 *
 * SAFETY:
 *   • Runs inside a transaction — all-or-nothing.
 *   • Defaults to DRY RUN. Pass --commit to actually write.
 *   • BACK UP beta_chats and beta_conversation before running with --commit.
 *
 * USAGE (from project root):
 *   node scripts/merge-duplicate-chats.js            # dry run, shows what it WOULD do
 *   node scripts/merge-duplicate-chats.js --commit   # actually merge
 * ─────────────────────────────────────────────────────────────────────────────
 */

const { query } = require("../database/dbpromise.js");
const { normalizePhone } = require("../functions/phone.js");

const COMMIT = process.argv.includes("--commit");

// ── Parse a chat_id into { prefix, phoneDigits } ──────────────────────────────
// Formats:
//   meta_<digits>_<uid>
//   <instanceNumber>_<digits>_<uid>   (QR)
// The uid is known from the row, so we strip the trailing "_<uid>" first, then
// split the remainder into prefix + phone. Instagram chats ("ig_...") and any
// id that doesn't contain a phone segment are skipped.
function parseChatId(chatId, uid) {
  if (typeof chatId !== "string") return null;
  const suffix = `_${uid}`;
  if (!chatId.endsWith(suffix)) return null;
  const head = chatId.slice(0, -suffix.length); // "meta_<digits>" or "<inst>_<digits>"
  const underscore = head.indexOf("_");
  if (underscore === -1) return null;
  const prefix = head.slice(0, underscore); // "meta" or the instance number
  const phone = head.slice(underscore + 1); // the phone segment (may contain more underscores → reject)
  if (!phone || phone.includes("_")) return null;
  if (!/^\d+$/.test(phone)) return null; // must be pure digits (skips ig_/random ids)
  return { prefix, phoneDigits: phone };
}

function rebuildChatId(prefix, normalizedDigits, uid) {
  return `${prefix}_${normalizedDigits}_${uid}`;
}

async function main() {
  console.log("─".repeat(70));
  console.log(
    `Duplicate-chat merge — ${COMMIT ? "COMMIT MODE (will write)" : "DRY RUN (no changes)"}`
  );
  console.log("─".repeat(70));

  const chats = await query(
    `SELECT id, uid, chat_id, sender_mobile, sender_name, last_message,
            chat_label, chat_note, assigned_agent, unread_count, origin,
            origin_instance_id, profile, kanban_order, createdAt, updatedAt
       FROM beta_chats`
  );

  // Group by uid + prefix + normalized phone.
  const groups = new Map();
  let skipped = 0;
  for (const chat of chats) {
    const parsed = parseChatId(chat.chat_id, chat.uid);
    if (!parsed) {
      skipped++;
      continue;
    }
    const normalized = normalizePhone(parsed.phoneDigits);
    const key = `${chat.uid}|${parsed.prefix}|${normalized}`;
    if (!groups.has(key)) groups.set(key, { normalized, prefix: parsed.prefix, uid: chat.uid, rows: [] });
    groups.get(key).rows.push({ ...chat, _phoneDigits: parsed.phoneDigits, _normalized: normalized });
  }

  const dupeGroups = [...groups.values()].filter((g) => g.rows.length > 1);

  console.log(`Scanned ${chats.length} chats (${skipped} non-phone/ig skipped).`);
  console.log(`Found ${dupeGroups.length} duplicate group(s) to merge.\n`);

  if (dupeGroups.length === 0) {
    console.log("Nothing to merge. ✅");
    return;
  }

  let mergedGroups = 0;
  let deletedChats = 0;
  let movedConversations = 0;

  for (const group of dupeGroups) {
    const { normalized, prefix, uid, rows } = group;
    const survivorChatId = rebuildChatId(prefix, normalized, uid);

    // Prefer an existing row that already has the normalized chat_id; else the
    // oldest row becomes the survivor (and gets renamed to the normalized id).
    let survivor =
      rows.find((r) => r.chat_id === survivorChatId) ||
      rows.slice().sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];

    const losers = rows.filter((r) => r.id !== survivor.id);

    // Choose the newest last_message across the group (by updatedAt).
    const newest = rows
      .slice()
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))[0];

    const mergedUnread = rows.reduce((sum, r) => sum + (Number(r.unread_count) || 0), 0);
    const mergedLabel = survivor.chat_label || rows.find((r) => r.chat_label)?.chat_label || null;
    const mergedNote = survivor.chat_note || rows.find((r) => r.chat_note)?.chat_note || null;
    const mergedAgent = survivor.assigned_agent || rows.find((r) => r.assigned_agent)?.assigned_agent || null;
    const mergedName = survivor.sender_name && survivor.sender_name !== survivor._phoneDigits
      ? survivor.sender_name
      : rows.find((r) => r.sender_name && r.sender_name !== r._phoneDigits)?.sender_name || survivor.sender_name;

    console.log(`• ${uid} / ${prefix} / ${normalized}`);
    console.log(`    survivor: ${survivor.chat_id}${survivor.chat_id === survivorChatId ? "" : `  → rename to ${survivorChatId}`}`);
    losers.forEach((l) => console.log(`    merge  <- ${l.chat_id} (id ${l.id})`));
    console.log(`    unread: ${mergedUnread}, last_message from: ${newest.chat_id}`);

    if (!COMMIT) {
      mergedGroups++;
      deletedChats += losers.length;
      continue;
    }

    // ── Perform the merge in a transaction ──
    await query("START TRANSACTION");
    try {
      // 1. Repoint conversations from every loser to the survivor chat_id.
      for (const loser of losers) {
        const r = await query(
          `UPDATE beta_conversation SET chat_id = ? WHERE chat_id = ? AND uid = ?`,
          [survivorChatId, loser.chat_id, uid]
        );
        movedConversations += r?.affectedRows || 0;
      }
      // If the survivor itself is being renamed, move its own conversations too.
      if (survivor.chat_id !== survivorChatId) {
        const r = await query(
          `UPDATE beta_conversation SET chat_id = ? WHERE chat_id = ? AND uid = ?`,
          [survivorChatId, survivor.chat_id, uid]
        );
        movedConversations += r?.affectedRows || 0;
      }

      // 2. Update the survivor row with merged fields + normalized identifiers.
      await query(
        `UPDATE beta_chats
            SET chat_id = ?, sender_mobile = ?, sender_name = ?,
                last_message = ?, unread_count = ?, chat_label = ?,
                chat_note = ?, assigned_agent = ?, updatedAt = ?
          WHERE id = ?`,
        [
          survivorChatId,
          normalized,
          mergedName,
          newest.last_message,
          mergedUnread,
          mergedLabel,
          mergedNote,
          mergedAgent,
          newest.updatedAt,
          survivor.id,
        ]
      );

      // 3. Delete the loser chat rows.
      for (const loser of losers) {
        await query(`DELETE FROM beta_chats WHERE id = ?`, [loser.id]);
        deletedChats++;
      }

      await query("COMMIT");
      mergedGroups++;
    } catch (err) {
      await query("ROLLBACK");
      console.error(`    ❌ merge failed for ${uid}/${normalized}, rolled back:`, err.message);
    }
  }

  console.log("\n" + "─".repeat(70));
  if (COMMIT) {
    console.log(`✅ Done. Merged ${mergedGroups} group(s), deleted ${deletedChats} duplicate chat row(s), moved ${movedConversations} conversation row(s).`);
  } else {
    console.log(`DRY RUN complete. Would merge ${mergedGroups} group(s) and delete ${deletedChats} duplicate chat row(s).`);
    console.log(`Re-run with --commit to apply (back up beta_chats + beta_conversation first).`);
  }
  console.log("─".repeat(70));
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
