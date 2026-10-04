import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabaseServiceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

// Client-side Supabase client singleton
let browserClient: ReturnType<typeof createClient> | null = null;

export const getSupabaseBrowserClient = () => {
  if (browserClient) return browserClient;
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("Supabase client environment variables are missing.");
    return null;
  }
  browserClient = createClient(supabaseUrl, supabaseAnonKey);
  return browserClient;
};

// Server-side broadcast helper
export async function broadcastTelemetryEvent(payload: Record<string, unknown>) {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("[Telemetry] Supabase credentials not set, realtime broadcast skipped.");
    return;
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const channel = supabase.channel("telemetry-stream");

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        supabase.removeChannel(channel);
        resolve();
      }, 3000);

      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel
            .send({
              type: "broadcast",
              event: "live_event",
              payload,
            })
            .finally(() => {
              clearTimeout(timeout);
              supabase.removeChannel(channel);
              resolve();
            });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timeout);
          supabase.removeChannel(channel);
          resolve();
        }
      });
    });
  } catch (err) {
    console.error("[Telemetry] Realtime broadcast error:", err);
  }
}
