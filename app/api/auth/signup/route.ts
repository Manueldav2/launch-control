// Sign up with email + password. We create the account server-side with the
// service key and email_confirm:true, so the user can log in immediately with
// no confirmation email (smooth product onboarding). The client then signs in.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/store";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "email and password required" }, { status: 400 });
    if (String(password).length < 6) return NextResponse.json({ error: "password must be at least 6 characters" }, { status: 400 });
    const c = db();
    if (!c) return NextResponse.json({ error: "auth is not configured" }, { status: 500 });

    const { data, error } = await c.auth.admin.createUser({
      email: String(email).trim().toLowerCase(),
      password: String(password),
      email_confirm: true,
    });
    if (error) {
      const msg = /already.*registered|exists/i.test(error.message) ? "That email is already registered. Log in instead." : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    return NextResponse.json({ ok: true, id: data.user?.id });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
}
