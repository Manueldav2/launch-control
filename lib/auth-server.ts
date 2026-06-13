// Resolve the signed-in user from a request's Bearer token, server-side. The
// service client validates the JWT and returns the user, so project routes can
// scope rows to the owner. Returns null when unauthenticated.
import type { NextRequest } from "next/server";
import { db } from "./store";

export async function userIdFromRequest(req: NextRequest): Promise<string | null> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const c = db();
  if (!c) return null;
  try {
    const { data, error } = await c.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user.id;
  } catch { return null; }
}
