import { createTab, queryTabs, setStorage } from "./browser.js";
import { request } from "./api.js";
import { unwrapMasterKey, wrapMasterKey } from "./crypto.js";
import {
  browserName,
  clearHistory,
  createAccount,
  createRecovery,
  deleteBookmark,
  deleteHistoryEntry,
  disconnectLocal,
  listDevices,
  loadState,
  renameBookmark,
  recoverAccount,
  revokeDevice,
  saveBookmark,
  saveSettings,
  syncNow,
} from "./storage.js";

const nodes = {
  accountStatus: document.querySelector("#accountStatus"),
  setupPanel: document.querySelector("#setupPanel"),
  onboardingRecoveryPanel: document.querySelector("#onboardingRecoveryPanel"),
  onboardingRecoveryCode: document.querySelector("#onboardingRecoveryCode"),
  onboardingDoneButton: document.querySelector("#onboardingDoneButton"),
  appPanel: document.querySelector("#appPanel"),
  newAccountButton: document.querySelector("#newAccountButton"),
  claimForm: document.querySelector("#claimForm"),
  pairCodeInput: document.querySelector("#pairCodeInput"),
  recoveryForm: document.querySelector("#recoveryForm"),
  recoveryCodeInput: document.querySelector("#recoveryCodeInput"),
  syncButton: document.querySelector("#syncButton"),
  saveBookmarkButton: document.querySelector("#saveBookmarkButton"),
  clearHistoryButton: document.querySelector("#clearHistoryButton"),
  bookmarksList: document.querySelector("#bookmarksList"),
  historyList: document.querySelector("#historyList"),
  settingsForm: document.querySelector("#settingsForm"),
  backendUrlInput: document.querySelector("#backendUrlInput"),
  pairButton: document.querySelector("#pairButton"),
  pairCode: document.querySelector("#pairCode"),
  recoveryButton: document.querySelector("#recoveryButton"),
  recoveryCode: document.querySelector("#recoveryCode"),
  refreshDevicesButton: document.querySelector("#refreshDevicesButton"),
  devicesList: document.querySelector("#devicesList"),
  message: document.querySelector("#message"),
  confirmDialog: document.querySelector("#confirmDialog"),
  confirmTitle: document.querySelector("#confirmTitle"),
  confirmText: document.querySelector("#confirmText"),
  confirmOkButton: document.querySelector("#confirmOkButton"),
  confirmCancelButton: document.querySelector("#confirmCancelButton"),
};

let currentState = await loadState();
let devicesState = { devices: [], currentDeviceId: null };
let onboardingRecoveryCode = null;
render(currentState);

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`#${tab.dataset.tab}`).classList.add("active");
    if (tab.dataset.tab === "settings" && currentState.accountId) {
      run(refreshDevices);
    }
  });
});

nodes.newAccountButton.addEventListener("click", () => run(async () => {
  const created = await createAccount();
  currentState = created.state;
  onboardingRecoveryCode = created.recoveryCode;
  render(currentState);
  message("Account created. Save your recovery code.");
}));

nodes.syncButton.addEventListener("click", () => run(async () => {
  currentState = await syncNow();
  render(currentState);
  message("Synced.");
}));

nodes.saveBookmarkButton.addEventListener("click", () => run(async () => {
  const [tab] = await queryTabs({ active: true, currentWindow: true });
  if (!tab?.url?.startsWith("http")) {
    throw new Error("The current tab cannot be bookmarked.");
  }
  await saveBookmark(tab);
  currentState = await loadState();
  render(currentState);
  message("Bookmark saved.");
}));

nodes.clearHistoryButton.addEventListener("click", () => run(async () => {
  const confirmed = await confirmAction({
    title: "Clear history?",
    text: "This deletes every Scrybe history entry on this account. It is not reversible.",
    okText: "Clear history",
  });
  if (!confirmed) {
    return;
  }
  await clearHistory();
  currentState = await loadState();
  render(currentState);
  message("History cleared.");
}));

nodes.settingsForm.addEventListener("submit", (event) => run(async () => {
  event.preventDefault();
  await saveSettings({ backendUrl: nodes.backendUrlInput.value.trim() });
  currentState = await loadState();
  render(currentState);
  message("Settings saved.");
}));

nodes.pairButton.addEventListener("click", () => run(async () => {
  if (!currentState.masterKey) {
    throw new Error("Create an account first.");
  }
  const pairing = await request("/v1/pairing", { method: "POST", body: "{}" });
  const bootstrap = await wrapMasterKey(currentState.masterKey, pairing.code);
  await request(`/v1/pairing/${pairing.pairingId}/bootstrap`, {
    method: "POST",
    body: JSON.stringify({ bootstrap }),
  });
  nodes.pairCode.textContent = pairing.code;
  nodes.pairCode.classList.remove("hidden");
  message("Use this code on the new browser within five minutes.");
}));

nodes.claimForm.addEventListener("submit", (event) => run(async () => {
  event.preventDefault();
  const code = nodes.pairCodeInput.value.trim();
  const claimed = await request("/v1/pairing/claim", {
    method: "POST",
    body: JSON.stringify({ code, deviceName: browserName() }),
  });
  const masterKey = await unwrapMasterKey(code, claimed.bootstrap);
  await setStorage({
    accountId: claimed.accountId,
    deviceId: claimed.deviceId,
    deviceSecret: claimed.deviceSecret,
    masterKey,
    bookmarks: [],
    history: [],
    lastSyncAt: 0,
  });
  currentState = await syncNow();
  nodes.pairCodeInput.value = "";
  render(currentState);
  message("Browser paired.");
}));

nodes.recoveryForm.addEventListener("submit", (event) => run(async () => {
  event.preventDefault();
  const code = nodes.recoveryCodeInput.value.trim();
  if (!code) {
    throw new Error("Enter your recovery code.");
  }
  currentState = await recoverAccount(code);
  nodes.recoveryCodeInput.value = "";
  render(currentState);
  message("Account recovered.");
}));

nodes.refreshDevicesButton.addEventListener("click", () => run(async () => {
  await refreshDevices();
  message("Browser list refreshed.");
}));

nodes.recoveryButton.addEventListener("click", () => run(async () => {
  const confirmed = await confirmAction({
    title: "Replace recovery code?",
    text: "This invalidates the old recovery code. Only the new code shown next will recover this account.",
    okText: "Replace code",
  });
  if (!confirmed) {
    return;
  }
  const code = await createRecovery();
  nodes.recoveryCode.textContent = code;
  nodes.recoveryCode.classList.remove("hidden");
  message("Recovery code created.");
}));

nodes.onboardingDoneButton.addEventListener("click", () => {
  onboardingRecoveryCode = null;
  render(currentState);
  message("Recovery code saved.");
});

function render(state) {
  const connected = Boolean(state.accountId && state.masterKey);
  const showingOnboardingRecovery = connected && Boolean(onboardingRecoveryCode);
  const pendingCount = state.pendingChanges?.length || 0;
  document.body.classList.toggle("connected", connected && !showingOnboardingRecovery);
  if (!connected) {
    nodes.accountStatus.textContent = "No account";
  } else if (state.syncStatus === "offline") {
    nodes.accountStatus.textContent = pendingCount
      ? `Backend unreachable - ${pendingCount} pending`
      : "Backend unreachable";
  } else {
    nodes.accountStatus.textContent = `Connected: ${state.accountId.slice(0, 13)}...`;
  }
  nodes.setupPanel.classList.toggle("hidden", connected);
  nodes.onboardingRecoveryPanel.classList.toggle("hidden", !showingOnboardingRecovery);
  nodes.appPanel.classList.toggle("hidden", !connected || showingOnboardingRecovery);
  nodes.syncButton.classList.toggle("hidden", !connected || showingOnboardingRecovery);
  nodes.onboardingRecoveryCode.textContent = onboardingRecoveryCode || "";
  nodes.syncButton.disabled = !connected;
  nodes.saveBookmarkButton.disabled = !connected;
  nodes.clearHistoryButton.disabled = !connected || state.history.length === 0;
  nodes.pairButton.disabled = !connected;
  nodes.recoveryButton.disabled = !connected;
  nodes.refreshDevicesButton.disabled = !connected;
  nodes.backendUrlInput.value = state.backendUrl || "http://127.0.0.1:5000";
  renderList(nodes.bookmarksList, state.bookmarks, "bookmarks", "No bookmarks yet.");
  renderList(nodes.historyList, state.history, "history", "No history saved yet.");
  renderDevices();
  if (connected && state.syncStatus === "offline" && !nodes.message.textContent) {
    message(
      pendingCount
        ? `Backend unreachable. ${pendingCount} local change${pendingCount === 1 ? "" : "s"} will sync later.`
        : "Backend unreachable. Local data is still available.",
      true,
    );
  }
}

function renderList(container, items, collection, emptyText) {
  container.textContent = "";
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = emptyText;
    container.append(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement("div");
    row.className = "item";
    if (collection === "history") {
      row.classList.add("history-entry");
    }

    const main = document.createElement("button");
    main.className = "item-main";
    main.title = item.title || item.url;
    main.addEventListener("click", () => createTab({ url: item.url }));

    const favicon = document.createElement("img");
    favicon.className = "favicon";
    favicon.alt = "";
    favicon.src = item.faviconUrl || "";

    const body = document.createElement("div");
    body.className = "item-body";
    const title = document.createElement("div");
    title.className = "item-title";
    title.textContent = item.title || item.url;
    const url = document.createElement("div");
    url.className = "item-url";
    url.textContent = item.url;
    body.append(title, url);

    if (item.visitedAt) {
      const time = document.createElement("div");
      time.className = "time";
      time.textContent = new Date(item.visitedAt).toLocaleString();
      body.append(time);
    }

    main.append(favicon, body);
    row.append(main);

    const actions = document.createElement("div");
    actions.className = "item-actions";
    if (collection === "bookmarks") {
      const edit = document.createElement("button");
      edit.className = "small-button";
      edit.textContent = "Rename";
      edit.addEventListener("click", () => run(async () => {
        const nextTitle = prompt("Bookmark name", item.title || "");
        if (nextTitle === null) {
          return;
        }
        await renameBookmark(item.id, nextTitle);
        currentState = await loadState();
        render(currentState);
        message("Bookmark renamed.");
      }));
      actions.append(edit);
    }
    const remove = document.createElement("button");
    remove.className = "small-button danger";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => run(async () => {
      if (collection === "bookmarks") {
        await deleteBookmark(item.id);
        message("Bookmark deleted.");
      } else {
        await deleteHistoryEntry(item.id);
        message("History entry deleted.");
      }
      currentState = await loadState();
      render(currentState);
    }));
    actions.append(remove);
    row.append(actions);
    container.append(row);
  }
}

async function refreshDevices() {
  if (!currentState.accountId) {
    devicesState = { devices: [], currentDeviceId: null };
    return;
  }
  devicesState = await listDevices();
  renderDevices();
}

function renderDevices() {
  nodes.devicesList.textContent = "";
  if (!currentState.accountId) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Create or pair an account first.";
    nodes.devicesList.append(empty);
    return;
  }
  if (!devicesState.devices.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "Refresh to show paired browsers.";
    nodes.devicesList.append(empty);
    return;
  }
  for (const device of devicesState.devices) {
    const row = document.createElement("div");
    row.className = "device-row";
    const body = document.createElement("div");
    body.className = "item-body";
    const name = document.createElement("div");
    name.className = "item-title";
    name.textContent = `${device.name}${device.current ? " (this browser)" : ""}`;
    const seen = document.createElement("div");
    seen.className = "item-url";
    seen.textContent = `Last seen ${new Date(device.lastSeenAt).toLocaleString()}`;
    body.append(name, seen);

    const disconnect = document.createElement("button");
    disconnect.className = "small-button danger";
    disconnect.textContent = "Disconnect";
    disconnect.addEventListener("click", () => run(async () => {
      const confirmed = await confirmAction({
        title: "Disconnect browser?",
        text: device.current
          ? "This disconnects the current browser from Scrybe. Local encrypted account keys will be removed."
          : "This browser will no longer be able to sync this account.",
        okText: "Disconnect",
      });
      if (!confirmed) {
        return;
      }
      await revokeDevice(device.id);
      if (device.current) {
        await disconnectLocal();
        devicesState = { devices: [], currentDeviceId: null };
      } else {
        await refreshDevices();
      }
      currentState = await loadState();
      render(currentState);
      message("Browser disconnected.");
    }));

    row.append(body, disconnect);
    nodes.devicesList.append(row);
  }
}

function confirmAction({ title, text, okText }) {
  if (typeof nodes.confirmDialog.showModal !== "function") {
    return Promise.resolve(confirm(text));
  }
  nodes.confirmTitle.textContent = title;
  nodes.confirmText.textContent = text;
  nodes.confirmOkButton.textContent = okText;
  nodes.confirmCancelButton.disabled = false;
  nodes.confirmOkButton.disabled = false;
  nodes.confirmDialog.showModal();
  return new Promise((resolve) => {
    nodes.confirmDialog.addEventListener("close", () => {
      resolve(nodes.confirmDialog.returnValue === "ok");
    }, { once: true });
  });
}

async function run(task) {
  setBusy(true);
  try {
    await task();
  } catch (error) {
    message(error.message, true);
    if (error.code === "invalid_token") {
      onboardingRecoveryCode = null;
      devicesState = { devices: [], currentDeviceId: null };
      currentState = await loadState();
    }
  } finally {
    setBusy(false);
    render(currentState);
  }
}

function setBusy(busy) {
  document.querySelectorAll("button").forEach((button) => {
    if (button.closest("dialog")) {
      return;
    }
    button.disabled = busy;
  });
}

function message(text, isError = false) {
  const pendingCount = currentState.pendingChanges?.length || 0;
  if (!isError && currentState.syncStatus === "offline") {
    nodes.message.textContent = pendingCount
      ? `${text} Backend unreachable; ${pendingCount} local change${pendingCount === 1 ? "" : "s"} will sync later.`
      : `${text} Backend unreachable; local data is still available.`;
  } else {
    nodes.message.textContent = text;
  }
  nodes.message.classList.toggle("error", isError);
}
