const DRAWER_NONE = "none";
const DRAWER_TYPES = new Set(["profile", "notifications"]);

let controller = null;

export function getDrawerController() {
    if (!controller) controller = createDrawerController();
    return controller;
}

function createDrawerController() {
    const renderers = new Map();
    const subscribers = new Set();
    let active = DRAWER_NONE;
    let version = 0;

    const api = {
        register(type, renderer) {
            assertType(type);
            if (typeof renderer !== "function") throw new TypeError(`Drawer renderer for ${type} must be a function.`);
            renderers.set(type, renderer);
            if (active === type) renderActive();
            return () => {
                if (renderers.get(type) !== renderer) return;
                renderers.delete(type);
                if (active === type) api.close(type);
            };
        },
        subscribe(listener) {
            if (typeof listener !== "function") return () => {};
            subscribers.add(listener);
            return () => subscribers.delete(listener);
        },
        open(type) {
            assertType(type);
            const previous = active;
            if (active !== type) {
                active = type;
                version += 1;
            }
            renderActive();
            notify(previous);
            return version;
        },
        close(type = "") {
            if (type && active !== type) return false;
            if (active === DRAWER_NONE) return false;
            const previous = active;
            active = DRAWER_NONE;
            version += 1;
            renderActive();
            notify(previous);
            return true;
        },
        refresh(type = active) {
            if (type !== active || active === DRAWER_NONE) return false;
            renderActive();
            return true;
        },
        getActive() {
            return active;
        },
        isActive(type) {
            return active === type;
        },
        getVersion() {
            return version;
        },
        isCurrent(type, expectedVersion) {
            return active === type && version === expectedVersion;
        }
    };

    function renderActive() {
        const host = drawerHost();
        document.body.classList.toggle("account-drawer-open", active !== DRAWER_NONE);
        if (active === DRAWER_NONE) {
            host.innerHTML = "";
            delete host.dataset.drawerType;
            return;
        }
        host.dataset.drawerType = active;
        const renderer = renderers.get(active);
        if (!renderer) {
            host.innerHTML = "";
            return;
        }
        renderer({ host, type: active, version, close: () => api.close(active) });
    }

    function notify(previous) {
        const detail = { active, previous, version };
        subscribers.forEach((listener) => listener(detail));
        document.dispatchEvent(new CustomEvent("cob:drawer-change", { detail }));
        if (active === "profile" && previous !== active) {
            document.dispatchEvent(new CustomEvent("cob:account-panel-open", { detail }));
        } else if (active === "notifications" && previous !== active) {
            document.dispatchEvent(new CustomEvent("cob:notification-panel-open", { detail }));
        }
    }

    return api;
}

function drawerHost() {
    let host = document.getElementById("account-side-panel-host");
    if (!host) {
        host = document.createElement("div");
        host.id = "account-side-panel-host";
        document.body.appendChild(host);
    }
    return host;
}

function assertType(type) {
    if (!DRAWER_TYPES.has(type)) throw new TypeError(`Unknown drawer type: ${type}`);
}
