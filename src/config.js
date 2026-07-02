import { call, ext } from "./browser.js";

export const LOCAL_BACKEND_URL = "http://127.0.0.1:5000";
export const PRODUCTION_BACKEND_URL = "https://scrybe-api.shadoweb.fr";

export async function defaultBackendUrl() {
  const installType = await getInstallType();
  if (installType === "development" || installType === "temporary") {
    return LOCAL_BACKEND_URL;
  }
  return PRODUCTION_BACKEND_URL;
}

async function getInstallType() {
  if (!ext.management?.getSelf) {
    return "development";
  }
  try {
    const self = ext.management.getSelf.length === 0
      ? await ext.management.getSelf()
      : await call(ext.management, "getSelf");
    return self.installType;
  } catch {
    return "development";
  }
}
