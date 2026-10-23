// Generic CRUD helpers shared by every LEADOS module API route. Keeping the
// plumbing in one place means every route behaves identically (list newest
// first, create with returning(), delete by id) and new modules reuse it
// instead of re-implementing persistence.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";

// Using `any` for the table/column parameters here is intentional: this file
// is infrastructure plumbing shared across ~25 differently-shaped tables.
// Each call site is still fully typed because the caller passes a concrete
// Drizzle table imported from src/db/schema.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function listRows(table: any, orderColumn: any): Promise<any[]> {
  const query = db.select().from(table).orderBy(orderColumn);
  const rows = (await query) as unknown as any[];
  return rows;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function createRow(table: any, values: Record<string, unknown>): Promise<any> {
  const query = db.insert(table).values(values).returning();
  const rows = (await query) as unknown as any[];
  return rows[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function updateRow(table: any, idColumn: any, id: number, values: Record<string, unknown>): Promise<any> {
  const query = db.update(table).set(values).where(eq(idColumn, id)).returning();
  const rows = (await query) as unknown as any[];
  return rows[0];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deleteRow(table: any, idColumn: any, id: number): Promise<void> {
  await db.delete(table).where(eq(idColumn, id));
}

export function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found") {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function ok<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}
