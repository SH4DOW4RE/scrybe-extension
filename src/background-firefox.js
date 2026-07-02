const ext = globalThis.browser ?? globalThis.chrome;
const encoder = new TextEncoder();

ext.history.onVisited.addListener((visit) => {
  saveHistoryVisit(visit).catch((error) => {
    console.warn("Scrybe failed to save history visit", error);
  });
});

async function saveHistoryVisit(visit) {
  const state = await getStorage(null);
  if (!state.masterKey || !visit.url?.startsWith("http")) {
    return;
  }

  const item = {
    id: randomId("hist"),
    title: visit.title || new URL(visit.url).hostname,
    url: visit.url,
    faviconUrl: await resolveFavicon(visit.url),
    visitedAt: visit.lastVisitTime || Date.now(),
  };
  const history = [item, ...(state.history || [])].slice(0, 500);
  await setStorage({ history });
  await uploadItem("history", item, state);
}

async function uploadItem(collection, item, state) {
  const envelope = await encryptJson(state.masterKey, item);
  const backendUrl = state.backendUrl || await defaultBackendUrl();
  let response;
  try {
    response = await fetch(`${backendUrl}/v1/items/${collection}/${encodeURIComponent(item.id)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${state.deviceId}.${state.deviceSecret}`,
      },
      body: JSON.stringify({
        ...envelope,
        revision: item.visitedAt || item.createdAt || Date.now(),
      }),
    });
  } catch {
    await queuePendingChange({ type: "upsert", collection, id: item.id, at: Date.now() });
    return;
  }
  if (!response.ok) {
    const body = await response.text();
    if (response.status >= 500) {
      await queuePendingChange({ type: "upsert", collection, id: item.id, at: Date.now() });
      return;
    }
    if (response.status === 401 && body.includes("invalid_token")) {
      await disconnectLocal(state.backendUrl);
    }
    throw new Error(body || `Request failed with ${response.status}`);
  }
  await clearPendingChange(collection, item.id);
  await setStorage({ syncStatus: "online", lastSyncError: null, lastSyncErrorAt: null });
}

async function queuePendingChange(change) {
  const state = await getStorage(null);
  const pendingChanges = [
    ...(state.pendingChanges || []).filter((item) => item.collection !== change.collection || item.id !== change.id),
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
  const state = await getStorage(["pendingChanges"]);
  const pendingChanges = (state.pendingChanges || []).filter((item) => item.collection !== collection || item.id !== id);
  await setStorage({ pendingChanges });
}

async function disconnectLocal(backendUrl) {
  await setStorage({
    backendUrl,
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

async function encryptJson(masterKeyRaw, value) {
  const key = await crypto.subtle.importKey("raw", fromBase64Url(masterKeyRaw), "AES-GCM", true, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext);
  return {
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    nonce: toBase64Url(nonce),
    salt: "",
  };
}

async function resolveFavicon(url) {
  try {
    return await fetchDeclaredFavicon(url) || generatedFavicon(url);
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

function randomId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}_${toBase64Url(bytes)}`;
}

function getStorage(keys) {
  if (ext.storage.local.get.length === 1) {
    return ext.storage.local.get(keys);
  }
  return new Promise((resolve, reject) => {
    ext.storage.local.get(keys, (result) => {
      const error = ext.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(result);
      }
    });
  });
}

function setStorage(values) {
  if (ext.storage.local.set.length === 1) {
    return ext.storage.local.set(values);
  }
  return new Promise((resolve, reject) => {
    ext.storage.local.set(values, () => {
      const error = ext.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve();
      }
    });
  });
}

async function defaultBackendUrl() {
  const installType = await getInstallType();
  if (installType === "development" || installType === "temporary") {
    return "http://127.0.0.1:5000";
  }
  return "https://scrybe-api.shadoweb.fr";
}

async function getInstallType() {
  if (!ext.management?.getSelf) {
    return "development";
  }
  if (ext.management.getSelf.length === 0) {
    try {
      const self = await ext.management.getSelf();
      return self.installType;
    } catch {
      return "development";
    }
  }
  return new Promise((resolve) => {
    ext.management.getSelf((self) => {
      const error = ext.runtime?.lastError;
      if (error) {
        resolve("development");
      } else {
        resolve(self.installType);
      }
    });
  });
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
