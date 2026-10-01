export const ADMIN_ROUTES = Object.freeze({
    "admin-matches": "/admin/matches/",
    "admin-tickets": "/admin/tickets/",
    "admin-progression": "/admin/progression/",
    "community-dates": "/admin/community/",
    "community-admin": "/admin/community/",
    "admin-help": "/admin/docs/",
    store: "/admin/catalog/"
});
export const ADMIN_VIEWS = Object.freeze({
    "admin-matches": "adminMatches",
    "admin-tickets": "adminTickets",
    "admin-progression": "adminProgression",
    "admin-community": "communityAdmin",
    "admin-docs": "adminHelp",
    "admin-catalog": "store"
});
export function adminRedirect(route, pathname, hash = "") {
    const destination = ADMIN_ROUTES[route];
    if (!destination || pathname.replace(/\/+$/, "") === destination.replace(/\/+$/, "")) return null;
    const canonicalHash = hash === `#${route}` || hash === `#view=${route}` ? "" : hash;
    return destination + canonicalHash;
}
