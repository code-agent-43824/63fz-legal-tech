import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PASSWORD_PREFIX = "scrypt-v1";
const KEY_LENGTH = 64;
export const MIN_EDITORIAL_PASSWORD_LENGTH = 12;

export async function hashEditorialPassword(password: string) {
  assertEditorialPassword(password);
  const salt = randomBytes(16);
  const derivedKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `${PASSWORD_PREFIX}$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyEditorialPassword(password: string, encodedHash: string) {
  const [prefix, saltText, keyText] = encodedHash.split("$");
  if (prefix !== PASSWORD_PREFIX || !saltText || !keyText) {
    return false;
  }

  try {
    const salt = Buffer.from(saltText, "base64url");
    const expectedKey = Buffer.from(keyText, "base64url");
    if (salt.length !== 16 || expectedKey.length !== KEY_LENGTH) {
      return false;
    }
    const actualKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
    return timingSafeEqual(actualKey, expectedKey);
  } catch {
    return false;
  }
}

export function assertEditorialPassword(password: string) {
  if (password.length < MIN_EDITORIAL_PASSWORD_LENGTH || password.length > 200) {
    throw new Error(`Password must be between ${MIN_EDITORIAL_PASSWORD_LENGTH} and 200 characters`);
  }
}
