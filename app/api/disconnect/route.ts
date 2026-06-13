// POST /api/disconnect { platform }  (or { accountId })
// Removes that platform's account from the Zernio profile so the user can
// connect a different one. New file in the engine lane (additive) to back the
// Channels hub Disconnect button.
import { NextRequest, NextResponse } from "next/server";
import { resolveProfileId, listAccounts } from "@/lib/zernio";

const BASE = process.env.ZERNIO_BASE_URL || "https://zernio.com/api";
const TO_ZERNIO: Record<string, string> = { x: "twitter", linkedin: "linkedin", instagram: "instagram", facebook: "facebook", tiktok: "tiktok" };

function authHeaders(): Record<string, string> {
  const k = process.env.ZERNIO_API_KEY;
  if (!k) throw new Error("ZERNIO_API_KEY is not set");
  return { Authorization: `Bearer ${k}`, "Content-Type": "application/json" };
}

export async function POST(req: NextRequest) {
  try {
    const { platform, accountId } = await req.json();
    const profileId = await resolveProfileId();
    let aid = accountId as string | undefined;
    if (!aid && platform) {
      const accounts = await listAccounts(profileId);
      const want = TO_ZERNIO[platform] || platform;
      const m = accounts.find((a: any) => a.platform === want || a.channel === platform || a.channel === want);
      aid = m?.accountId || m?._id || m?.id;
    }
    if (!aid) return NextResponse.json({ ok: false, error: "no connected account for that platform" }, { status: 400 });
    const r = await fetch(`${BASE}/v1/accounts/${aid}`, { method: "DELETE", headers: authHeaders() });
    if (!r.ok) return NextResponse.json({ ok: false, error: `zernio ${r.status}` }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
