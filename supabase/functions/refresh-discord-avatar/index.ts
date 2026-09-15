import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "https://callofblock.com",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function response(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
}

function discordIdentity(user: { identities?: Array<{ provider?: string; identity_data?: Record<string, unknown> }> }) {
    return user.identities?.find((identity) => identity.provider === "discord")?.identity_data || {};
}

function defaultAvatarUrl(discordId: string, discriminator: string) {
    if (/^\d{4}$/.test(discriminator) && discriminator !== "0000") {
        return `https://cdn.discordapp.com/embed/avatars/${Number(discriminator) % 5}.png`;
    }
    try {
        return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(discordId) >> 22n) % 6n)}.png`;
    } catch (_error) {
        return "https://cdn.discordapp.com/embed/avatars/0.png";
    }
}

function avatarUrl(user: { id: string; avatar?: string | null; discriminator?: string | null }) {
    const hash = String(user.avatar || "").trim();
    if (!hash) return defaultAvatarUrl(user.id, String(user.discriminator || ""));
    const extension = hash.startsWith("a_") ? "gif" : "webp";
    return `https://cdn.discordapp.com/avatars/${user.id}/${hash}.${extension}?size=256`;
}

Deno.serve(async (request) => {
    if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (request.method !== "POST") return response({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const discordBotToken = Deno.env.get("DISCORD_BOT_TOKEN") || "";
    const authorization = request.headers.get("Authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    if (!supabaseUrl || !serviceRoleKey || !discordBotToken || !token) {
        return response({ error: "Avatar refresh is not configured" }, 503);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });
    const userResult = await admin.auth.getUser(token);
    const authUser = userResult.data.user;
    if (userResult.error || !authUser) return response({ error: "Your login session is no longer valid." }, 401);

    const identity = discordIdentity(authUser);
    const discordId = String(identity.provider_id || identity.sub || identity.id || "").trim();
    if (!/^\d{5,32}$/.test(discordId)) return response({ error: "A Discord identity is required." }, 400);

    let discordResponse: Response;
    try {
        discordResponse = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
            headers: { Authorization: `Bot ${discordBotToken}` },
            signal: AbortSignal.timeout(3_500)
        });
    } catch (error) {
        console.error("Discord avatar lookup did not complete", error instanceof Error ? error.message : error);
        return response({ error: "Discord avatar lookup timed out" }, 504);
    }
    if (!discordResponse.ok) {
        console.error("Discord avatar lookup failed", discordResponse.status);
        return response({ error: "Discord avatar lookup failed" }, 502);
    }

    const discordUser = await discordResponse.json() as {
        id: string;
        avatar?: string | null;
        discriminator?: string | null;
    };
    if (discordUser.id !== discordId) return response({ error: "Discord returned an invalid account." }, 502);

    const currentAvatarUrl = avatarUrl(discordUser);
    const update = await admin
        .from("profiles")
        .update({ avatar_url: currentAvatarUrl })
        .eq("id", authUser.id)
        .eq("discord_id", discordId)
        .select("id, avatar_url")
        .maybeSingle();
    if (update.error) {
        console.error("Discord avatar profile update failed", update.error.message);
        return response({ error: "Could not save the current Discord avatar." }, 500);
    }
    if (!update.data) return response({ error: "Discord profile is not initialized." }, 409);

    return response({ avatar_url: currentAvatarUrl });
});
