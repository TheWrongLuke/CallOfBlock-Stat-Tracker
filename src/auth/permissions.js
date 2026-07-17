export function isAdminProfile(profile) {
    return Boolean(profile?.is_admin);
}

export function canOpenAdminRoute({ authReady, profile }) {
    return Boolean(authReady && isAdminProfile(profile));
}
