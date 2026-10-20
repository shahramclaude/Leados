// src/lib/platform/db/usersRepository.ts

import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, type NewUser, type User } from "@/db/schema";

export async function createUser(input: NewUser): Promise<User> {
  const [row] = await db.insert(users).values(input).returning();
  return row;
}

export async function getUserById(userId: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return row;
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return row;
}

/** Dev-only listing for the demo login chooser. */
export async function listUsers(): Promise<User[]> {
  return db.select().from(users).orderBy(users.createdAt);
}

export async function updateUserPreferences(
  userId: string,
  patch: Partial<Pick<User, "locale" | "highContrast" | "textScale" | "plainLanguage">>,
): Promise<User | undefined> {
  const [row] = await db.update(users).set(patch).where(eq(users.id, userId)).returning();
  return row;
}
