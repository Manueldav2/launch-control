// A user's saved launch weeks.
//   POST { inputs, plan, title? }  -> save a project (scoped to the signed-in user)
//   GET                            -> list the user's projects (newest first)
// Auth is the Bearer access token from the browser session. The saved plan JSON
// already carries the rendered media URLs, so reopening a project restores the
// week AND its graphics.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/store";
import { userIdFromRequest } from "@/lib/auth-server";

export async function POST(req: NextRequest) {
  try {
    const userId = await userIdFromRequest(req);
    if (!userId) return NextResponse.json({ error: "sign in to save projects" }, { status: 401 });
    const c = db();
    if (!c) return NextResponse.json({ error: "persistence not configured" }, { status: 500 });
    const { inputs, plan, title } = await req.json();
    if (!plan) return NextResponse.json({ error: "plan required" }, { status: 400 });
    const name = (title || inputs?.goal || plan?.brand?.name || "Untitled launch").toString().slice(0, 120);
    const { data, error } = await c.from("plans")
      .insert({ user_id: userId, org: userId, inputs: inputs || {}, plan, title: name })
      .select("id").single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: (data as { id: string }).id, title: name });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const userId = await userIdFromRequest(req);
    if (!userId) return NextResponse.json({ projects: [] });
    const c = db();
    if (!c) return NextResponse.json({ projects: [] });
    const { data } = await c.from("plans")
      .select("id, title, inputs, created_at")
      .eq("user_id", userId).order("created_at", { ascending: false }).limit(60);
    return NextResponse.json({ projects: data || [] });
  } catch (e: any) {
    return NextResponse.json({ projects: [], error: String(e?.message || e) });
  }
}
