export const ext = globalThis.browser ?? globalThis.chrome;

export function call(api, method, ...args) {
  return new Promise((resolve, reject) => {
    api[method](...args, (result) => {
      const error = ext.runtime?.lastError;
      if (error) {
        reject(new Error(error.message));
      } else {
        resolve(result);
      }
    });
  });
}

export async function getStorage(keys = null) {
  if (ext.storage.local.get.length === 1) {
    return ext.storage.local.get(keys);
  }
  return call(ext.storage.local, "get", keys);
}

export async function setStorage(values) {
  if (ext.storage.local.set.length === 1) {
    return ext.storage.local.set(values);
  }
  return call(ext.storage.local, "set", values);
}

export async function queryTabs(query) {
  if (ext.tabs.query.length === 1) {
    return ext.tabs.query(query);
  }
  return call(ext.tabs, "query", query);
}

export async function createTab(createProperties) {
  if (ext.tabs.create.length === 1) {
    return ext.tabs.create(createProperties);
  }
  return call(ext.tabs, "create", createProperties);
}
