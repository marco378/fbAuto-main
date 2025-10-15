// src/services/cookieService.js
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";

// --- Encryption configuration ---
const ENCRYPTION_KEY = "p9x6JfWq2Lz4Hr8Ct1VmYb7Ne3QaXd5R"; // 32 chars = 32 bytes
const ALGORITHM = "aes-256-gcm";

// --- Encrypt cookie data ---
const encryptCookies = (cookieData) => {
  try {
    const iv = crypto.randomBytes(16); // 16-byte IV for GCM
    const key = Buffer.from(ENCRYPTION_KEY, "utf8");
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    cipher.setAAD(Buffer.from("cookies", "utf8"));

    let encrypted = cipher.update(JSON.stringify(cookieData), "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
    };
  } catch (error) {
    console.error("❌ Cookie encryption error:", error);
    throw new Error("Failed to encrypt cookies");
  }
};

// --- Decrypt cookie data ---
const decryptCookies = (encryptedData) => {
  try {
    const { encrypted, iv, authTag } = encryptedData;
    const key = Buffer.from(ENCRYPTION_KEY, "utf8");

    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(iv, "hex")
    );

    decipher.setAAD(Buffer.from("cookies", "utf8"));
    decipher.setAuthTag(Buffer.from(authTag, "hex"));

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
  } catch (error) {
    console.error("❌ Cookie decryption error:", error);
    throw new Error("Failed to decrypt cookies");
  }
};

// --- Cookie Service ---
export class CookieService {
  static async saveCookies(email, cookies, metadata = {}) {
    try {
      console.log(`🍪 Saving cookies for ${email} to database...`);

      // Only Facebook cookies
      const facebookCookies = cookies.filter((cookie) =>
        cookie.domain.includes("facebook.com")
      );

      if (facebookCookies.length === 0) {
        throw new Error("No Facebook cookies found to save");
      }

      // Default expiry = 30 days or earliest cookie expiry
      const now = new Date();
      let expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      for (const cookie of facebookCookies) {
        if (cookie.expires && cookie.expires > 0) {
          const cookieExpiry = new Date(cookie.expires * 1000);
          if (cookieExpiry < expiresAt) {
            expiresAt = cookieExpiry;
          }
        }
      }

      // Encrypt cookies
      const encryptedCookies = encryptCookies(facebookCookies);

      // Save to DB
      const savedCookies = await prisma.facebookCookies.upsert({
        where: { email },
        update: {
          cookies: encryptedCookies,
          isValid: true,
          lastUsed: now,
          expiresAt,
          userAgent: metadata.userAgent || null,
          ipAddress: metadata.ipAddress || null,
          updatedAt: now,
        },
        create: {
          email,
          cookies: encryptedCookies,
          isValid: true,
          lastUsed: now,
          expiresAt,
          userAgent: metadata.userAgent || null,
          ipAddress: metadata.ipAddress || null,
        },
      });

      console.log(`✅ Saved ${facebookCookies.length} cookies for ${email}`);
      return savedCookies;
    } catch (error) {
      console.error(`❌ Failed to save cookies for ${email}:`, error);
      throw error;
    }
  }

  static async loadCookies(email) {
    try {
      console.log(`🍪 Loading cookies for ${email} from database...`);

      const cookieRecord = await prisma.facebookCookies.findUnique({
        where: { email },
      });

      if (!cookieRecord) {
        console.log(`🍪 No saved cookies found for ${email}`);
        return null;
      }

      const now = new Date();
      if (cookieRecord.expiresAt && cookieRecord.expiresAt < now) {
        console.log(`🍪 Cookies expired for ${email}, removing...`);
        await this.invalidateCookies(email);
        return null;
      }

      if (!cookieRecord.isValid) {
        console.log(`🍪 Cookies marked as invalid for ${email}`);
        return null;
      }

      const cookies = decryptCookies(cookieRecord.cookies);

      await prisma.facebookCookies.update({
        where: { email },
        data: { lastUsed: now },
      });

      console.log(`✅ Loaded ${cookies.length} cookies for ${email}`);
      return cookies;
    } catch (error) {
      console.error(`❌ Failed to load cookies for ${email}:`, error);
      return null;
    }
  }

  static async validateCookies(email) {
    try {
      const cookieRecord = await prisma.facebookCookies.findUnique({
        where: { email },
        select: { isValid: true, expiresAt: true, lastUsed: true },
      });

      if (!cookieRecord) return { valid: false, reason: "No cookies found" };
      if (!cookieRecord.isValid)
        return { valid: false, reason: "Cookies marked invalid" };

      const now = new Date();
      if (cookieRecord.expiresAt && cookieRecord.expiresAt < now) {
        await this.invalidateCookies(email);
        return { valid: false, reason: "Cookies expired" };
      }

      return {
        valid: true,
        lastUsed: cookieRecord.lastUsed,
        expiresAt: cookieRecord.expiresAt,
      };
    } catch (error) {
      console.error(`❌ Cookie validation error for ${email}:`, error);
      return { valid: false, reason: "Validation error" };
    }
  }

  static async invalidateCookies(email) {
    try {
      await prisma.facebookCookies.update({
        where: { email },
        data: { isValid: false },
      });
      console.log(`❌ Invalidated cookies for ${email}`);
    } catch (error) {
      console.error(`❌ Failed to invalidate cookies for ${email}:`, error);
    }
  }

  static async deleteCookies(email) {
    try {
      await prisma.facebookCookies.delete({ where: { email } });
      console.log(`🗑️ Deleted cookies for ${email}`);
    } catch (error) {
      console.error(`❌ Failed to delete cookies for ${email}:`, error);
    }
  }

  static async getUsersWithValidCookies() {
    try {
      const now = new Date();
      const validCookies = await prisma.facebookCookies.findMany({
        where: {
          isValid: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { email: true, lastUsed: true, expiresAt: true },
        orderBy: { lastUsed: "desc" },
      });
      return validCookies;
    } catch (error) {
      console.error("❌ Failed to get users with valid cookies:", error);
      return [];
    }
  }

  static async cleanupExpiredCookies() {
    try {
      const now = new Date();
      const result = await prisma.facebookCookies.deleteMany({
        where: {
          OR: [{ isValid: false }, { expiresAt: { lt: now } }],
        },
      });

      console.log(`🧹 Cleaned up ${result.count} expired cookie records`);
      return result.count;
    } catch (error) {
      console.error("❌ Cookie cleanup error:", error);
      return 0;
    }
  }
}

export default CookieService;
