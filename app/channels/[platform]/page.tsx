"use client";

/**
 * /channels/x · /channels/linkedin · /channels/instagram
 * Scroll the generated week's posts inside each platform's real environment.
 * Reads the live plan (localStorage) with a demo-week fallback.
 */

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { WeekPlan, Platform } from "@/lib/types";
import { ChannelEnvironment } from "../ChannelEnvironment";
import { loadPlanLocal, DEMO_WEEK } from "../../calendar/plan-store";

const VALID: Platform[] = ["x", "linkedin", "instagram"];

export default function ChannelPage() {
  const params = useParams<{ platform: string }>();
  const platform = params?.platform as Platform;
  const [plan, setPlan] = useState<WeekPlan | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPlan(loadPlanLocal() || DEMO_WEEK);
    setReady(true);
  }, []);

  if (!VALID.includes(platform)) {
    return (
      <div style={{ padding: "64px 24px", textAlign: "center", color: "var(--muted)" }}>
        <h1 className="serif" style={{ fontSize: 24, color: "var(--ink)" }}>Unknown channel</h1>
        <p style={{ marginTop: 8 }}>
          Try{" "}
          {VALID.map((p, i) => (
            <span key={p}>
              <Link href={`/channels/${p}`} style={{ color: "var(--clay-deep)", fontWeight: 600 }}>{p}</Link>
              {i < VALID.length - 1 ? ", " : ""}
            </span>
          ))}
          .
        </p>
      </div>
    );
  }

  if (!ready || !plan) return <div style={{ padding: 40, color: "var(--muted)" }}>Loading…</div>;

  return <ChannelEnvironment platform={platform} plan={plan} />;
}
