// One saved project: load it (restores the week + its graphics) or delete it.
//   GET    /api/projects/:id  -> { project: { id, title, inputs, plan, created_at } }
//   DELETE /api/projects/:id  -> remove it
// Scoped to the signed-in user so nobody can read another account's projects.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/store";
import { userIdFromRequest } from "@/lib/auth-server";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await userIdFromRequest(req);
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await ctx.params;
    const c = db();
    if (!c) return NextResponse.json({ error: "persistence not configured" }, { status: 500 });
    const { data, error } = await c.from("plans")
      .select("id, title, inputs, plan, created_at")
      .eq("id", id).eq("user_id", userId).single();
    if (error || !data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ project: data });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const userId = await userIdFromRequest(req);
    if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    const { id } = await ctx.params;
    const c = db();
    if (!c) return NextResponse.json({ error: "persistence not configured" }, { status: 500 });
    const { error } = await c.from("plans").delete().eq("id", id).eq("user_id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
