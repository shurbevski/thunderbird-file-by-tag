"use strict";

// File by Tag
// A tag named "Announcements/Chourei" files a message into the folder whose
// path is Announcements/Chourei in the message's own account.
//   one matching tag    -> move there
//   nested tags         -> only the innermost counts ("System" + "System/Logs"
//                          -> System/Logs)
//   several leaves      -> copy to all but the last, move to the last
//   no tags             -> the folder where the rest of its thread lives
//                          (found via In-Reply-To / References)
//   none of the above   -> normal Archive
// A tag that looks like one of yours but has no folder leaves the message
// in place and is reported, so nothing is filed somewhere unexpected.

const BUILTIN_TAGS = new Set(["$label1", "$label2", "$label3", "$label4", "$label5"]);

const norm = (p) => (p || "").replace(/^\/+|\/+$/g, "");

function notify(message) {
  return messenger.notifications.create({
    type: "basic",
    title: "File by Tag",
    message,
    iconUrl: "icons/icon-64.png",
  });
}

// Read every page of a MessageList.
async function* allMessages(listPromise) {
  let page = await listPromise;
  for (const m of page.messages) yield m;
  while (page.id) {
    page = await messenger.messages.continueList(page.id);
    for (const m of page.messages) yield m;
  }
}

async function collect(listPromise) {
  const out = [];
  for await (const m of allMessages(listPromise)) out.push(m);
  return out;
}

// Messages selected in the mail tab, or the one shown in a message tab/window.
async function messagesForTab(tab) {
  try {
    const list = await collect(messenger.mailTabs.getSelectedMessages(tab?.id));
    if (list.length) return list;
  } catch (e) {
    // Not a mail tab; fall through.
  }
  try {
    const shown = await messenger.messageDisplay.getDisplayedMessages(tab?.id);
    return shown.messages ?? shown; // MessageList in MV3
  } catch (e) {
    return [];
  }
}

const folderCache = new Map(); // accountId -> Map(normalized path -> MailFolder)

async function foldersOf(accountId) {
  if (!folderCache.has(accountId)) {
    const byPath = new Map();
    for (const f of await messenger.folders.query({ accountId })) {
      byPath.set(norm(f.path), f);
    }
    folderCache.set(accountId, byPath);
  }
  return folderCache.get(accountId);
}

const log = (...args) => console.info("File by Tag:", ...args);

// Folders that never count as "where the thread lives".
const IGNORED_USES = new Set(["inbox", "drafts", "sent", "trash", "templates", "junk", "outbox"]);
const MAX_REFS = 30; // how many earlier messages of a thread to look up

function headerValues(headers, name) {
  for (const [k, v] of Object.entries(headers || {})) {
    if (k.toLowerCase() === name) return Array.isArray(v) ? v : [v];
  }
  return [];
}

// Message-IDs this message replies to, newest first, without <>.
async function threadRefs(msg) {
  const full = await messenger.messages.getFull(msg.id, { decodeContent: false });
  const text = [...headerValues(full.headers, "in-reply-to"),
                ...headerValues(full.headers, "references").reverse()].join(" ");
  const ids = [];
  for (const m of text.matchAll(/<([^<>\s]+)>/g)) {
    if (!ids.includes(m[1]) && m[1] !== msg.headerMessageId) ids.push(m[1]);
  }
  return ids.slice(0, MAX_REFS);
}

// The folder holding the most recent earlier message of msg's thread,
// or null. Archive folders are used only if nothing better is found.
async function threadFolder(msg) {
  const refs = await threadRefs(msg);
  let archiveFallback = null;
  for (const ref of refs) {
    const found = await collect(messenger.messages.query({
      headerMessageId: ref,
      accountId: msg.folder.accountId,
    }));
    for (const m of found) {
      const f = m.folder;
      if (!f || f.isVirtual) continue;
      const uses = f.specialUse || [];
      if (uses.some((u) => IGNORED_USES.has(u)) || /^\/?INBOX$/i.test(f.path)) continue;
      if (f.id === msg.folder.id) return f; // already with its thread
      if (uses.includes("archives") || /^\/?Archives?(\/|$)/i.test(f.path)) {
        archiveFallback ??= f;
        continue;
      }
      return f;
    }
  }
  return archiveFallback;
}

function push(map, key, id) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(id);
}

async function fileMessages(messages) {
  if (!messages.length) {
    notify("No message selected.");
    return;
  }
  folderCache.clear(); // folder ids change when folders are renamed

  const tags = await messenger.messages.tags.list();
  const tagName = new Map(tags.map((t) => [t.key, t.tag]));
  const tagRank = new Map(tags.map((t, i) => [t.key, i])); // Settings order

  const copies = new Map(); // folderId -> [messageId]
  const moves = new Map();  // folderId -> [messageId]
  const archive = [];
  const byThread = []; // untagged messages: try their thread's folder
  const missing = new Set();
  let skipped = 0;

  for (const msg of messages) {
    if (!msg.folder || !msg.folder.accountId) { skipped++; continue; }
    const byPath = await foldersOf(msg.folder.accountId);

    const keys = [...(msg.tags || [])].sort((a, b) =>
      (tagRank.get(a) ?? Infinity) - (tagRank.get(b) ?? Infinity));

    const dests = [];
    let unmatched = false;
    for (const key of keys) {
      if (BUILTIN_TAGS.has(key)) continue;
      const name = tagName.get(key) ?? key;
      const folder = byPath.get(norm(name));
      if (!folder) { missing.add(name); unmatched = true; continue; }
      if (!dests.some((d) => d.id === folder.id)) dests.push(folder);
    }

    // Drop every folder that is an ancestor of another destination, so
    // "System" + "System/Logs" files only into System/Logs.
    const paths = dests.map((d) => norm(d.path));
    const leaves = dests.filter((d, i) =>
      !paths.some((p, j) => j !== i && p.startsWith(paths[i] + "/")));
    dests.splice(0, dests.length, ...leaves);

    if (!dests.length) {
      if (unmatched) { skipped++; log(msg.subject, "-> left (tag without folder)"); }
      else byThread.push(msg);        // untagged or only built-in tags
      continue;
    }

    log(msg.subject, "-> by tag:", dests.map((d) => d.path).join(", "));
    const here = dests.findIndex((d) => d.id === msg.folder.id);
    if (here >= 0) {
      // Already sits in one of its folders: copy to the others, leave it.
      for (const d of dests) if (d.id !== msg.folder.id) push(copies, d.id, msg.id);
      continue;
    }
    for (const d of dests.slice(0, -1)) push(copies, d.id, msg.id);
    push(moves, dests[dests.length - 1].id, msg.id);
  }

  let threaded = 0;
  for (const msg of byThread) {
    let folder = null;
    try {
      folder = await threadFolder(msg);
    } catch (e) {
      console.warn("File by Tag: thread lookup failed for", msg.subject, e);
    }
    if (folder && folder.id === msg.folder.id) {
      log(msg.subject, "-> left (already in its thread's folder)");
    } else if (folder) {
      log(msg.subject, "-> by thread:", folder.path);
      push(moves, folder.id, msg.id);
      threaded++;
    } else {
      log(msg.subject, "-> archive");
      archive.push(msg.id);
    }
  }

  let copied = 0, moved = 0;
  for (const [folderId, ids] of copies) {
    await messenger.messages.copy(ids, folderId, { isUserAction: true });
    copied += ids.length;
  }
  for (const [folderId, ids] of moves) {
    await messenger.messages.move(ids, folderId, { isUserAction: true });
    moved += ids.length;
  }
  if (archive.length) await messenger.messages.archive(archive);

  if (missing.size) {
    notify(`No folder found for tag(s): ${[...missing].join(", ")}. ` +
      `${skipped} message(s) left in place. Filed ${moved}, copied ${copied}, archived ${archive.length}.`);
  }
}

async function run(tab, preselected) {
  try {
    const messages = preselected ?? (await messagesForTab(tab));
    await fileMessages(messages);
  } catch (e) {
    console.error("File by Tag:", e);
    notify(`Error: ${e.message}`);
  }
}

messenger.commands.onCommand.addListener((command, tab) => {
  if (command === "file-by-tag") run(tab);
});

messenger.action.onClicked.addListener((tab) => run(tab));
messenger.messageDisplayAction.onClicked.addListener((tab) => run(tab));

messenger.runtime.onInstalled.addListener(() => {
  messenger.menus.create({
    id: "file-by-tag",
    title: "File by tag",
    contexts: ["message_list"],
  });
});

messenger.menus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "file-by-tag") return;
  const preselected = info.selectedMessages ? await collect(Promise.resolve(info.selectedMessages)) : undefined;
  run(tab, preselected);
});
