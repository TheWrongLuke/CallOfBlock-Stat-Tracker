const TICKET_COLUMNS = [
    "id",
    "created_by",
    "category",
    "title",
    "description",
    "context_area",
    "map_name",
    "weapon_or_item",
    "match_id",
    "reproduction_steps",
    "expected_result",
    "actual_result",
    "severity",
    "status",
    "external_media_url",
    "assigned_admin",
    "created_at",
    "updated_at",
    "closed_at"
].join(", ");

const MESSAGE_COLUMNS =
    "id, ticket_id, author_id, message, is_staff_reply, is_private_staff_note, created_at, updated_at";
const HISTORY_COLUMNS = "id, ticket_id, changed_by, action, old_value, new_value, created_at";

export function createFeedbackApi(client) {
    if (!client) throw new Error("A Supabase client is required.");

    return {
        async listOwnTickets(userId) {
            return client
                .from("feedback_tickets")
                .select(TICKET_COLUMNS)
                .eq("created_by", userId)
                .order("updated_at", { ascending: false })
                .limit(200);
        },

        async listAdminTickets() {
            return client
                .from("feedback_tickets")
                .select(TICKET_COLUMNS)
                .order("updated_at", { ascending: false })
                .limit(500);
        },

        async getTicket(ticketId) {
            return client.from("feedback_tickets").select(TICKET_COLUMNS).eq("id", ticketId).maybeSingle();
        },

        async createTicket(value, userId, ticketId) {
            return client
                .from("feedback_tickets")
                .insert({
                    ...(ticketId ? { id: ticketId } : {}),
                    created_by: userId,
                    category: value.category,
                    title: value.title,
                    description: value.description,
                    context_area: value.contextArea,
                    map_name: value.mapName,
                    weapon_or_item: value.weaponOrItem,
                    match_id: value.matchId,
                    reproduction_steps: value.reproductionSteps,
                    expected_result: value.expectedResult,
                    actual_result: value.actualResult,
                    severity: value.severity,
                    status: "open",
                    external_media_url: value.externalMediaUrl,
                    assigned_admin: null,
                    closed_at: null
                })
                .select(TICKET_COLUMNS)
                .single();
        },

        async listMessages(ticketId) {
            return client
                .from("feedback_ticket_messages")
                .select(MESSAGE_COLUMNS)
                .eq("ticket_id", ticketId)
                .order("created_at", { ascending: true });
        },

        async addMessage(ticketId, authorId, message, { staff = false, privateNote = false } = {}) {
            return client
                .from("feedback_ticket_messages")
                .insert({
                    ticket_id: ticketId,
                    author_id: authorId,
                    message,
                    is_staff_reply: Boolean(staff),
                    is_private_staff_note: Boolean(privateNote)
                })
                .select(MESSAGE_COLUMNS)
                .single();
        },

        async updateTicket(ticketId, patch) {
            const allowed = {};
            if (Object.hasOwn(patch, "status")) allowed.status = patch.status;
            if (Object.hasOwn(patch, "severity")) allowed.severity = patch.severity;
            if (Object.hasOwn(patch, "assignedAdmin")) allowed.assigned_admin = patch.assignedAdmin || null;
            return client.from("feedback_tickets").update(allowed).eq("id", ticketId).select(TICKET_COLUMNS).single();
        },

        async listHistory(ticketId) {
            return client
                .from("feedback_ticket_history")
                .select(HISTORY_COLUMNS)
                .eq("ticket_id", ticketId)
                .order("created_at", { ascending: false });
        },

        async listAdmins() {
            return client
                .from("profiles")
                .select("id, username, display_name, avatar_url, discord_id, minecraft_player_name")
                .eq("is_admin", true)
                .order("username", { ascending: true });
        },

        async getReporter(userId) {
            return client
                .from("profiles")
                .select(
                    "id, username, display_name, avatar_url, discord_id, minecraft_player_name, minecraft_player_id, minecraft_player_uuid, created_at"
                )
                .eq("id", userId)
                .maybeSingle();
        },

        async listAdminDocumentation() {
            return client
                .from("admin_documentation_sections")
                .select("id, title, summary, entries, sort_order, updated_at")
                .eq("active", true)
                .order("sort_order", { ascending: true });
        }
    };
}
