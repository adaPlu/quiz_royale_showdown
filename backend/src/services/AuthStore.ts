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
  private readonly usersById = new Map<string, AuthUserRecord>();
  private readonly refreshTokens = new Map<string, string>();

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
    this.usersById.set(user.id, user);
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

  findById(userId: string): AuthUserRecord | null {
    return this.usersById.get(userId) ?? null;
  }

  storeRefreshToken(token: string, userId: string): void {
    this.refreshTokens.set(token, userId);
  }

  rotateRefreshToken(currentToken: string, nextToken: string, userId: string): boolean {
    const storedUserId = this.refreshTokens.get(currentToken);
    if (storedUserId !== userId) {
      return false;
    }

    this.refreshTokens.delete(currentToken);
    this.refreshTokens.set(nextToken, userId);
    return true;
  }

  revokeRefreshToken(token: string): void {
    this.refreshTokens.delete(token);
  }

  hasRefreshToken(token: string, userId: string): boolean {
    return this.refreshTokens.get(token) === userId;
  }
}

export const authStore = new AuthStore();
