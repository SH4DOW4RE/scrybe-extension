import { getStorage, setStorage } from "./browser.js";
import {
  createRecoveryCode,
  decryptJson,
  encryptJson,
  randomId,
  recoveryCodeHash,
  unwrapMasterKey,
  wrapMasterKey,
} from "./crypto.js";
import { request } from "./api.js";
import { defaultBackendUrl } from "./config.js";

const DEFAULT_STATE = {
  bookmarks: [],
  history: [],
  lastSyncAt: 0,
  pendingChanges: [],
  syncStatus: "unknown",
  lastSyncError: null,
  lastSyncErrorAt: null,
};

export async function loadState() {
  const state = await getStorage(null);
  return {
    ...DEFAULT_STATE,
    ...state,
    backendUrl: state.backendUrl || await defaultBackendUrl(),
  };
}

export async function saveSettings(settings) {
  await setStorage(settings);
}

export async function disconnectLocal() {
  const state = await getStorage(["backendUrl"]);
  await setStorage({
    backendUrl: state.backendUrl,
    accountId: null,
    deviceId: null,
    deviceSecret: null,
    masterKey: null,
    bookmarks: [],
    history: [],
    lastSyncAt: 0,
    pendingChanges: [],
    syncStatus: "unknown",
    lastSyncError: null,
    lastSyncErrorAt: null,
  });
}

export async function createAccount() {
  const account = await request("/v1/accounts", {
    method: "POST",
    body: JSON.stringify({ deviceName: browserName() }),
  });
  const { createMasterKey } = await import("./crypto.js");
  const masterKey = await createMasterKey();
  await setStorage({
    accountId: account.accountId,
    deviceId: account.deviceId,
    deviceSecret: account.deviceSecret,
    masterKey,
    bookmarks: [],
    history: [],
    lastSyncAt: 0,
    pendingChanges: [],
    syncStatus: "online",
    lastSyncError: null,
    lastSyncErrorAt: null,
  });
  const recoveryCode = await createRecovery();
  return {
    state: await loadState(),
    recoveryCode,
  };
}

export async function saveBookmark(tab) {
  const state = await loadState();
  assertReady(state);
  const url = tab.url;
  const bookmark = {
    id: randomId("bm"),
    title: tab.title || new URL(url).hostname,
    url,
    faviconUrl: await resolveFavicon(tab),
    createdAt: Date.now(),
  };
  const bookmarks = [bookmark, ...state.bookmarks.filter((item) => item.url !== url)];
  await setStorage({ bookmarks });
  await uploadItemOrQueue("bookmarks", bookmark, state.masterKey);
  return bookmark;
}

export async function renameBookmark(id, title) {
  const state = await loadState();
  assertReady(state);
  const bookmark = state.bookmarks.find((item) => item.id === id);
  if (!bookmark) {
    throw new Error("Bookmark not found.");
  }
  const renamed = { ...bookmark, title: title.trim() || bookmark.title, updatedAt: Date.now() };
  const bookmarks = state.bookmarks.map((item) => (item.id === id ? renamed : item));
  await setStorage({ bookmarks });
  await uploadItemOrQueue("bookmarks", renamed, state.masterKey);
}

export async function deleteBookmark(id) {
  const state = await loadState();
  assertReady(state);
  await setStorage({ bookmarks: state.bookmarks.filter((item) => item.id !== id) });
  await deleteRemoteItemOrQueue("bookmarks", id);
}

export async function deleteHistoryEntry(id) {
  const state = await loadState();
  assertReady(state);
  await setStorage({ history: state.history.filter((item) => item.id !== id) });
  await deleteRemoteItemOrQueue("history", id);
}

export async function clearHistory() {
  const state = await loadState();
  assertReady(state);
  const ids = state.history.map((item) => item.id);
  await setStorage({ history: [] });
  await Promise.all(ids.map((id) => deleteRemoteItemOrQueue("history", id)));
}

export async function saveHistoryVisit(visit) {
  const state = await loadState();
  if (!state.masterKey || !visit.url?.startsWith("http")) {
    return;
  }
  const item = {
    id: randomId("hist"),
    title: visit.title || new URL(visit.url).hostname,
    url: visit.url,
    faviconUrl: await resolveFavicon(visit),
    visitedAt: visit.lastVisitTime || Date.now(),
  };
  const history = [item, ...state.history].slice(0, 500);
  await setStorage({ history });
  await uploadItemOrQueue("history", item, state.masterKey);
}

export async function syncNow() {
  const state = await loadState();
  assertReady(state);
  await flushPendingChanges(state);
  const refreshedState = await loadState();
  const synced = await request(`/v1/sync?since=${refreshedState.lastSyncAt || 0}`);
  const next = {
    bookmarks: [...refreshedState.bookmarks],
    history: [...refreshedState.history],
  };
  for (const item of synced.items) {
    const collection = item.collection;
    if (item.deleted) {
      next[collection] = next[collection].filter((entry) => entry.id !== item.item_id);
      continue;
    }
    const decrypted = await decryptJson(refreshedState.masterKey, item);
    next[collection] = [decrypted, ...next[collection].filter((entry) => entry.id !== decrypted.id)];
  }
  next.history = next.history
    .sort((a, b) => (b.visitedAt || b.createdAt) - (a.visitedAt || a.createdAt))
    .slice(0, 500);
  next.bookmarks = next.bookmarks.sort((a, b) => b.createdAt - a.createdAt);
  await setStorage({ ...next, lastSyncAt: synced.serverTime });
  return loadState();
}

export async function uploadItem(collection, item, masterKey) {
  const envelope = await encryptJson(masterKey, item);
  await request(`/v1/items/${collection}/${encodeURIComponent(item.id)}`, {
    method: "PUT",
    body: JSON.stringify({ ...envelope, revision: item.visitedAt || item.createdAt || Date.now() }),
  });
}

export async function deleteRemoteItem(collection, id) {
  await request(`/v1/items/${collection}/${encodeURIComponent(id)}?revision=${Date.now()}`, {
    method: "DELETE",
  });
}

async function uploadItemOrQueue(collection, item, masterKey) {
  try {
    await uploadItem(collection, item, masterKey);
    await clearPendingChange(collection, item.id);
  } catch (error) {
    if (error.code !== "backend_unreachable") {
      throw error;
    }
    await queuePendingChange({ type: "upsert", collection, id: item.id, at: Date.now() });
  }
}

async function deleteRemoteItemOrQueue(collection, id) {
  try {
    await deleteRemoteItem(collection, id);
    await clearPendingChange(collection, id);
  } catch (error) {
    if (error.code !== "backend_unreachable") {
      throw error;
    }
    await queuePendingChange({ type: "delete", collection, id, at: Date.now() });
  }
}

async function queuePendingChange(change) {
  const state = await loadState();
  const pendingChanges = [
    ...state.pendingChanges.filter((item) => item.collection !== change.collection || item.id !== change.id),
    change,
  ];
  await setStorage({
    pendingChanges,
    syncStatus: "offline",
    lastSyncError: "backend_unreachable",
    lastSyncErrorAt: Date.now(),
  });
}

async function clearPendingChange(collection, id) {
  const state = await loadState();
  const pendingChanges = state.pendingChanges.filter((item) => item.collection !== collection || item.id !== id);
  await setStorage({ pendingChanges });
}

async function flushPendingChanges(state) {
  if (!state.pendingChanges.length) {
    return;
  }
  for (const change of state.pendingChanges) {
    const latest = await loadState();
    if (change.type === "delete") {
      await deleteRemoteItem(change.collection, change.id);
      await clearPendingChange(change.collection, change.id);
      continue;
    }
    const item = latest[change.collection].find((entry) => entry.id === change.id);
    if (!item) {
      await deleteRemoteItem(change.collection, change.id);
    } else {
      await uploadItem(change.collection, item, latest.masterKey);
    }
    await clearPendingChange(change.collection, change.id);
  }
}

export async function listDevices() {
  return request("/v1/devices");
}

export async function revokeDevice(id) {
  await request(`/v1/devices/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function createRecovery() {
  const state = await loadState();
  assertReady(state);
  const code = createRecoveryCode();
  const bootstrap = await wrapMasterKey(state.masterKey, code);
  await request("/v1/recovery", {
    method: "PUT",
    body: JSON.stringify({
      codeHash: await recoveryCodeHash(code),
      bootstrap,
    }),
  });
  return code;
}

export async function recoverAccount(code) {
  const recovered = await request("/v1/recovery/claim", {
    method: "POST",
    body: JSON.stringify({ code, deviceName: browserName() }),
  });
  const masterKey = await unwrapMasterKey(code, recovered.bootstrap);
  await setStorage({
    accountId: recovered.accountId,
    deviceId: recovered.deviceId,
    deviceSecret: recovered.deviceSecret,
    masterKey,
    bookmarks: [],
    history: [],
    lastSyncAt: 0,
    pendingChanges: [],
    syncStatus: "online",
    lastSyncError: null,
    lastSyncErrorAt: null,
  });
  return syncNow();
}

export function browserName() {
  const userAgent = navigator.userAgent;
  if (userAgent.includes("Firefox")) {
    return "Firefox";
  }
  if (userAgent.includes("Edg/")) {
    return "Microsoft Edge";
  }
  if (userAgent.includes("OPR/")) {
    return "Opera";
  }
  if (userAgent.includes("Chrome")) {
    return "Chrome";
  }
  if (userAgent.includes("Safari")) {
    return "Safari";
  }
  return "Unknown browser";
}

async function resolveFavicon(tab) {
  if (tab.favIconUrl) {
    return tab.favIconUrl;
  }
  try {
    return await fetchDeclaredFavicon(tab.url) || generatedFavicon(tab.url);
  } catch {
    return "";
  }
}

async function fetchDeclaredFavicon(pageUrl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(pageUrl, {
      credentials: "omit",
      redirect: "follow",
      signal: controller.signal,
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.toLowerCase().includes("html")) {
      return "";
    }
    return iconFromHtml(await response.text(), response.url || pageUrl);
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

function iconFromHtml(html, pageUrl) {
  const links = html.match(/<link\b[^>]*>/gi) || [];
  for (const link of links) {
    const attrs = attributesFromTag(link);
    const rel = (attrs.rel || "").toLowerCase();
    if (!attrs.href || !rel.includes("icon")) {
      continue;
    }
    try {
      return new URL(attrs.href, pageUrl).href;
    } catch {
      return "";
    }
  }
  return "";
}

function attributesFromTag(tag) {
  const attrs = {};
  const attrPattern = /([a-zA-Z:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  for (const match of tag.matchAll(attrPattern)) {
    attrs[match[1].toLowerCase()] = match[2] || match[3] || match[4] || "";
  }
  return attrs;
}

function generatedFavicon(pageUrl) {
  const hostname = new URL(pageUrl).hostname.replace(/^www\./, "");
  const letter = (hostname.match(/[a-z0-9]/i)?.[0] || "?").toUpperCase();
  const hue = hashString(hostname) % 360;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="hsl(${hue} 58% 34%)"/>
      <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
        fill="#eef5ff" font-family="Arial, sans-serif" font-size="34" font-weight="700">${letter}</text>
    </svg>
  `;
  return `data:image/svg+xml,${encodeURIComponent(svg.trim())}`;
}

function hashString(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function assertReady(state) {
  if (!state.accountId || !state.deviceId || !state.deviceSecret || !state.masterKey) {
    throw new Error("Create or pair an account first.");
  }
}
