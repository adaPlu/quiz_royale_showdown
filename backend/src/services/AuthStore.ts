import bcrypt from "bcrypt";
import { ulid } from "ulid";

export type AuthUserRecord = {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
};

export class AuthStore {
  private readonly usersByEmail = new Map<string, AuthUserRecord>();

  async createUser(email: string, displayName: string, password: string): Promise<AuthUserRecord> {
    const normalizedEmail = email.toLowerCase();
    if (this.usersByEmail.has(normalizedEmail)) {
      throw new Error("EMAIL_EXISTS");
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user: AuthUserRecord = {
      id: ulid(),
      email: normalizedEmail,
      displayName,
      passwordHash
    };
    this.usersByEmail.set(normalizedEmail, user);
    return user;
  }

  async verifyUser(email: string, password: string): Promise<AuthUserRecord | null> {
    const user = this.usersByEmail.get(email.toLowerCase());
    if (!user) {
      return null;
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    return matches ? user : null;
  }

  findByEmail(email: string): AuthUserRecord | null {
    return this.usersByEmail.get(email.toLowerCase()) ?? null;
  }
}

export const authStore = new AuthStore();
