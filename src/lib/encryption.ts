import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";
import { getEncryptionSecret } from "@/lib/env";

/**
 * AES-256-GCM encryption for API keys.
 * Uses ENCRYPTION_KEY or JWT_SECRET from env.
 */

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const secret = getEncryptionSecret();
  return createHash("sha256").update(secret).digest();
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");

  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const [ivHex, authTagHex, ciphertext] = encryptedText.split(":");

  if (!ivHex || !authTagHex || !ciphertext) {
    throw new Error("Invalid encrypted text format");
  }

  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return "********";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}
