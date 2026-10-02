const lastContent = new WeakMap();

// Keep the dialog/backdrop alive during asynchronous refreshes: recreating them
// restarts the entrance animation and loses the user's scroll/focus position.
export function updateDrawerContent(host, markup) {
    const cached = lastContent.get(host);
    if (host.firstElementChild && cached?.markup === markup && cached.root === host.firstElementChild) return;
    const template = document.createElement("template");
    template.innerHTML = markup;
    const previous = host.querySelector(".profile-drawer");
    const next = template.content.querySelector(".profile-drawer");
    const sameView = previous && next && previous.className === next.className;
    const focused = previous?.contains(document.activeElement) ? document.activeElement : null;
    const focusAttribute = focused
        ? [...focused.attributes].find((attribute) => attribute.name.startsWith("data-") || attribute.name === "id")
        : null;
    if (sameView) {
        const scrollTop = previous.scrollTop;
        previous.replaceChildren(...next.childNodes);
        previous.scrollTop = scrollTop;
        if (focusAttribute) {
            const selector = `[${focusAttribute.name}="${CSS.escape(focusAttribute.value)}"]`;
            previous.querySelector(selector)?.focus({ preventScroll: true });
        }
    } else host.replaceChildren(template.content);
    lastContent.set(host, { markup, root: host.firstElementChild });
}

export function renderProfileDrawerActions(admin) {
    return `<div class="profile-drawer-actions ${admin ? "admin" : ""}">
        <a class="profile-drawer-customize" href="/account/">Customize profile</a>
        <a class="profile-drawer-support" href="/feedback/">Feedback &amp; support</a>
        ${
            admin
                ? `<a class="profile-drawer-tickets" href="/admin/matches/">Match administration</a>
        <a class="profile-drawer-tickets" href="/admin/community/">Playtest administration</a>
        <a class="profile-drawer-tickets" href="/admin/tickets/">Ticket dashboard</a>
        <a class="profile-drawer-progression" href="/admin/progression/">Progression &amp; missions</a>
        <a class="profile-drawer-docs" href="/admin/docs/">Admin documentation</a>
        <a class="profile-drawer-store" href="/admin/catalog/">Catalog administration</a>`
                : ""
        }
    </div>`;
}
