import { getStorage, setStorage } from "./browser.js";
import { defaultBackendUrl } from "./config.js";

export async function request(path, options = {}) {
  const state = await getStorage(["backendUrl", "deviceId", "deviceSecret"]);
  const backendUrl = state.backendUrl || await defaultBackendUrl();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.deviceId && state.deviceSecret) {
    headers.Authorization = `Bearer ${state.deviceId}.${state.deviceSecret}`;
  }
  let response;
  try {
    response = await fetch(`${backendUrl}${path}`, {
      ...options,
      headers,
    });
  } catch (cause) {
    await setStorage({
      syncStatus: "offline",
      lastSyncError: "backend_unreachable",
      lastSyncErrorAt: Date.now(),
    });
    const error = new Error("Cannot reach the Scrybe backend. Your local data is kept and will sync when the backend is reachable again.");
    error.code = "backend_unreachable";
    error.cause = cause;
    throw error;
  }
  const text = await response.text();
  const body = parseBody(text);
  if (response.status >= 500) {
    await setStorage({
      syncStatus: "offline",
      lastSyncError: "backend_unreachable",
      lastSyncErrorAt: Date.now(),
    });
    const error = new Error("The Scrybe backend is temporarily unavailable. Your local data is kept and will sync when the backend is reachable again.");
    error.code = "backend_unreachable";
    throw error;
  }
  if (!response.ok) {
    if (body.error === "invalid_token") {
      await disconnectLocal(state.backendUrl);
    }
    const error = new Error(errorMessage(body, response.status));
    error.code = body.error;
    throw error;
  }
  await setStorage({
    syncStatus: "online",
    lastSyncError: null,
    lastSyncErrorAt: null,
  });
  return body;
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

function parseBody(text) {
  if (!text) {
    return {};
  }
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function errorMessage(body, status) {
  if (body.error === "pairing_not_ready") {
    return "This pairing code is expired, already used, or not ready yet.";
  }
  if (body.error === "invalid_code") {
    return "Enter a valid pairing code.";
  }
  if (body.error === "invalid_recovery_code") {
    return "Enter a valid recovery code.";
  }
  if (body.error === "recovery_not_found") {
    return "This recovery code was not found.";
  }
  if (body.error === "invalid_token") {
    return "This browser is no longer authorized to sync.";
  }
  return body.error || body.message || `Request failed with ${status}`;
}
