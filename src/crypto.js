const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomId(prefix) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `${prefix}_${toBase64Url(bytes)}`;
}

export function createRecoveryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let raw = "";
  for (const byte of bytes) {
    raw += alphabet[byte % alphabet.length];
  }
  return raw.match(/.{1,4}/g).join("-");
}

export async function recoveryCodeHash(code) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(normalizeCode(code)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createMasterKey() {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  return exportKey(key);
}

export async function encryptJson(masterKeyRaw, value) {
  const key = await importKey(masterKeyRaw);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext);
  return {
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    nonce: toBase64Url(nonce),
    salt: "",
  };
}

export async function decryptJson(masterKeyRaw, envelope) {
  const key = await importKey(masterKeyRaw);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(envelope.nonce) },
    key,
    fromBase64Url(envelope.ciphertext),
  );
  return JSON.parse(decoder.decode(plaintext));
}

export async function wrapMasterKey(masterKeyRaw, code) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await keyFromCode(code, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    fromBase64Url(masterKeyRaw),
  );
  return {
    ciphertext: toBase64Url(new Uint8Array(ciphertext)),
    nonce: toBase64Url(nonce),
    salt: toBase64Url(salt),
  };
}

export async function unwrapMasterKey(code, bootstrap) {
  const key = await keyFromCode(code, fromBase64Url(bootstrap.salt));
  const raw = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(bootstrap.nonce) },
    key,
    fromBase64Url(bootstrap.ciphertext),
  );
  return toBase64Url(new Uint8Array(raw));
}

async function keyFromCode(code, salt) {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(code.replaceAll("-", "").toUpperCase()),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 250000, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function normalizeCode(code) {
  return code.replaceAll("-", "").replaceAll(" ", "").toUpperCase();
}

async function importKey(raw) {
  return crypto.subtle.importKey("raw", fromBase64Url(raw), "AES-GCM", true, ["encrypt", "decrypt"]);
}

async function exportKey(key) {
  const raw = await crypto.subtle.exportKey("raw", key);
  return toBase64Url(new Uint8Array(raw));
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
