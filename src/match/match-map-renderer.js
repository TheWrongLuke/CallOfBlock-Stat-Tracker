import { mapCoordinateToPercent } from "./match-telemetry-normalizer.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const CURRENT_ICON_SIZE_PX = 34;
const DEFAULT_MARKER_OPTIONS = Object.freeze({
    size: 2,
    showIcons: true,
    showNames: true
});
const TEAM_COLORS = ["#7ec8ff", "#81d66d", "#ffcb6b", "#ff7f76", "#c79bff", "#65d8cb", "#ff9f62", "#f58fca"];
const VEHICLE_LABELS = new Map([
    ["ah-64", "AH-64"],
    ["ah_6", "AH-6"],
    ["bmp_2", "BMP-2"],
    ["gepard-1a2", "Gepard 1A2"],
    ["lav_150", "LAV-150"],
    ["m1a1abrams", "M1A1 Abrams"],
    ["m3a3-bradley", "M3A3 Bradley"],
    ["mh_60m", "MH-60M"],
    ["mle_1934", "MLE 1934"],
    ["prism_tank", "Prism Tank"],
    ["speedboat", "Speedboat"],
    ["t_90", "T-90"],
    ["tos", "TOS"],
    ["uh_60", "UH-60"]
]);

export class MatchMapRenderer {
    constructor(container, telemetry, getPlayerPresentation = () => ({}), markerOptions = {}) {
        this.container = container;
        this.telemetry = telemetry;
        this.getPlayerPresentation = getPlayerPresentation;
        this.markerOptions = normalizeMarkerOptions(markerOptions);
        this.playerMarkers = new Map();
        this.vehicleMarkers = new Map();
        this.playerStates = new Map();
        this.vehicleStates = new Map();
        this.currentEvents = [];
        this.currentTimeMs = 0;
        this.lockedPlayerId = "";
        this.lockedVehicleId = "";
        this.resizeObserver = null;
        this.handleResize = () => this.applyMarkerOptions();
        this.handleKeyDown = (event) => {
            if (event.key === "Escape") this.closeTooltip();
        };
        this.renderBase();
    }

    update(snapshot, events = [], currentEventId = "", combatEvent = null) {
        if (!snapshot) return;
        this.currentEvents =
            combatEvent && !events.some((event) => event.eventId === combatEvent.eventId)
                ? [...events, combatEvent].sort((a, b) => a.timeMs - b.timeMs)
                : events;
        this.currentTimeMs = snapshot.timeMs;
        this.playerStates = new Map(snapshot.players.map((player) => [player.playerId, player]));
        this.vehicleStates = new Map(snapshot.vehicles.map((vehicle) => [vehicle.vehicleId, vehicle]));
        const selectedEvent = events.find((event) => event.eventId === currentEventId) || null;
        const activeEvent = selectedEvent || combatEvent || events.at(-1) || null;
        const selectedCombatEvent =
            selectedEvent && (selectedEvent.type === "damage" || selectedEvent.type === "elimination")
                ? selectedEvent
                : null;
        const highlighted = new Set(
            events.flatMap((event) => [
                event.attackerId,
                event.killerId,
                event.victimId,
                ...(event.participantIds || [])
            ])
        );

        for (const participant of this.telemetry.participants) {
            const state = this.playerStates.get(participant.playerId);
            const marker = this.playerMarkers.get(participant.playerId);
            if (!marker) continue;
            marker.hidden = !state;
            if (!state) continue;
            const point = mapCoordinateToPercent(this.telemetry.map, state.x, state.z);
            marker.hidden = !point;
            if (!point) continue;
            marker.style.setProperty("--map-x", `${point.x}%`);
            marker.style.setProperty("--map-y", `${point.y}%`);
            marker.classList.toggle("is-eliminated", !state.alive);
            marker.classList.toggle("is-disconnected", !state.connected);
            marker.classList.toggle("is-in-vehicle", Boolean(state.vehicleId));
            marker.classList.toggle("is-combatant", highlighted.has(participant.playerId));
            marker.classList.toggle(
                "is-killer",
                activeEvent?.killerId === participant.playerId || activeEvent?.attackerId === participant.playerId
            );
            marker.classList.toggle("is-victim", activeEvent?.victimId === participant.playerId);
            marker.classList.toggle(
                "is-mvp",
                activeEvent?.type === "match_end" && this.telemetry.result?.mvp?.playerId === participant.playerId
            );
            marker.setAttribute("aria-label", this.playerTooltipText(participant, state));
        }

        this.updateVehicles(snapshot.vehicles);
        this.updateZone(snapshot.zone);
        this.updateScore(snapshot.scores);
        this.updateEventLines(selectedCombatEvent || combatEvent);
        if (this.lockedPlayerId) this.showTooltip(this.lockedPlayerId);
        else if (this.lockedVehicleId) this.showVehicleTooltip(this.lockedVehicleId);
    }

    closeTooltip() {
        this.lockedPlayerId = "";
        this.lockedVehicleId = "";
        this.tooltip.hidden = true;
        this.playerMarkers.forEach((marker) => marker.setAttribute("aria-pressed", "false"));
        this.vehicleMarkers.forEach((marker) => marker.setAttribute("aria-pressed", "false"));
    }

    destroy() {
        document.removeEventListener("keydown", this.handleKeyDown);
        this.resizeObserver?.disconnect();
        globalThis.removeEventListener?.("resize", this.handleResize);
        this.container.replaceChildren();
        this.playerMarkers.clear();
        this.vehicleMarkers.clear();
    }

    renderBase() {
        this.container.replaceChildren();
        this.stage = document.createElement("div");
        this.stage.className = "tactical-map-stage";
        this.stage.tabIndex = 0;
        this.stage.setAttribute("aria-label", `${this.telemetry.map.label} tactical playback map`);

        if (this.telemetry.map.imageUrl) {
            const image = document.createElement("img");
            image.className = "tactical-map-image";
            image.src = this.telemetry.map.imageUrl;
            image.alt = `${this.telemetry.map.label} tactical map`;
            image.decoding = "async";
            const applyImageAspectRatio = () => {
                const width = Number(this.telemetry.map.imageWidth) || image.naturalWidth;
                const height = Number(this.telemetry.map.imageHeight) || image.naturalHeight;
                if (width > 0 && height > 0) this.stage.style.aspectRatio = `${width} / ${height}`;
            };
            image.addEventListener("load", applyImageAspectRatio, { once: true });
            this.stage.append(image);
            applyImageAspectRatio();
            if (!this.telemetry.map.calibrated) {
                const status = document.createElement("span");
                status.className = "tactical-map-calibration-status";
                status.textContent = "Approximate playback - map uncalibrated";
                this.stage.append(status);
            }
        } else {
            const grid = document.createElement("div");
            grid.className = "tactical-map-grid";
            grid.setAttribute("aria-label", "Coordinate grid fallback");
            grid.innerHTML = `
                <span class="grid-north">N</span>
                <span class="grid-east">E</span>
                <span class="grid-south">S</span>
                <span class="grid-west">W</span>
                <span class="grid-fallback-label">Approximate playback - map uncalibrated</span>
            `;
            this.stage.append(grid);
        }

        this.zone = document.createElement("div");
        this.zone.className = "tactical-zone";
        this.zone.hidden = true;
        this.zoneLabel = document.createElement("span");
        this.zone.append(this.zoneLabel);
        this.stage.append(this.zone);

        this.lines = document.createElementNS(SVG_NS, "svg");
        this.lines.classList.add("tactical-event-lines");
        this.lines.setAttribute("viewBox", "0 0 1000 1000");
        this.lines.setAttribute("preserveAspectRatio", "none");
        this.lines.setAttribute("aria-hidden", "true");
        this.stage.append(this.lines);

        this.vehicleLayer = document.createElement("div");
        this.vehicleLayer.className = "tactical-vehicle-layer";
        this.stage.append(this.vehicleLayer);
        this.playerLayer = document.createElement("div");
        this.playerLayer.className = "tactical-player-layer";
        this.stage.append(this.playerLayer);

        for (const participant of this.telemetry.participants) this.createPlayerMarker(participant);

        this.score = document.createElement("div");
        this.score.className = "tactical-score";
        this.score.hidden = true;
        this.stage.append(this.score);

        this.tooltip = document.createElement("aside");
        this.tooltip.className = "tactical-marker-tooltip";
        this.tooltip.hidden = true;
        this.tooltip.setAttribute("aria-live", "polite");
        this.stage.append(this.tooltip);

        this.stage.addEventListener("click", (event) => {
            const vehicleMarker = event.target.closest("[data-tactical-vehicle]");
            if (vehicleMarker) {
                const vehicleId = vehicleMarker.dataset.tacticalVehicle;
                this.lockedPlayerId = "";
                this.lockedVehicleId = this.lockedVehicleId === vehicleId ? "" : vehicleId;
                this.playerMarkers.forEach((item) => item.setAttribute("aria-pressed", "false"));
                this.vehicleMarkers.forEach((item, id) => {
                    item.setAttribute("aria-pressed", String(id === this.lockedVehicleId));
                });
                if (this.lockedVehicleId) this.showVehicleTooltip(this.lockedVehicleId);
                else this.closeTooltip();
                return;
            }
            const marker = event.target.closest("[data-tactical-player]");
            if (marker) {
                const playerId = marker.dataset.tacticalPlayer;
                this.lockedVehicleId = "";
                this.lockedPlayerId = this.lockedPlayerId === playerId ? "" : playerId;
                this.vehicleMarkers.forEach((item) => item.setAttribute("aria-pressed", "false"));
                this.playerMarkers.forEach((item, id) => {
                    item.setAttribute("aria-pressed", String(id === this.lockedPlayerId));
                });
                if (this.lockedPlayerId) this.showTooltip(this.lockedPlayerId);
                else this.closeTooltip();
                return;
            }
            if (!event.target.closest(".tactical-marker-tooltip")) this.closeTooltip();
        });
        document.addEventListener("keydown", this.handleKeyDown);
        this.container.append(this.stage);
        this.observeStageSize();
        this.applyMarkerOptions();
    }

    createPlayerMarker(participant) {
        const presentation = this.getPlayerPresentation(participant.playerId, participant) || {};
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = `tactical-player-marker team-${safeClass(teamClass(participant.teamId))}`;
        marker.dataset.tacticalPlayer = participant.playerId;
        marker.setAttribute("aria-pressed", "false");
        marker.title = "";
        marker.style.setProperty("--player-marker-color", teamColor(participant.teamId || participant.playerId));

        marker.append(createPlayerAvatar(presentation, participant, "tactical-player-icon"));

        const label = document.createElement("span");
        label.className = "tactical-player-name";
        label.textContent = presentation.name || participant.name;
        marker.append(label);
        this.playerLayer.append(marker);
        this.playerMarkers.set(participant.playerId, marker);
    }

    setMarkerOptions(value) {
        this.markerOptions = normalizeMarkerOptions({ ...this.markerOptions, ...value });
        this.applyMarkerOptions();
    }

    getMarkerOptions() {
        return { ...this.markerOptions };
    }

    observeStageSize() {
        if (typeof ResizeObserver === "function") {
            this.resizeObserver = new ResizeObserver(this.handleResize);
            this.resizeObserver.observe(this.stage);
            return;
        }
        globalThis.addEventListener?.("resize", this.handleResize);
    }

    applyMarkerOptions() {
        if (!this.stage) return;
        const xSpan = Math.abs(Number(this.telemetry.map.worldMaxX) - Number(this.telemetry.map.worldMinX));
        const zSpan = Math.abs(Number(this.telemetry.map.worldMaxZ) - Number(this.telemetry.map.worldMinZ));
        const xScale = xSpan > 0 ? this.stage.clientWidth / xSpan : 1;
        const zScale = zSpan > 0 ? this.stage.clientHeight / zSpan : xScale;
        const blockScale = Math.max(0.1, Math.min(xScale || 1, zScale || xScale || 1));
        const linearStep = Math.max(0, (CURRENT_ICON_SIZE_PX - blockScale) / 3);
        const iconSize = blockScale + linearStep * this.markerOptions.size;
        const dotSize = blockScale * (1 + (9 * this.markerOptions.size) / 4);
        this.stage.style.setProperty("--tactical-player-icon-size", `${round(iconSize)}px`);
        this.stage.style.setProperty("--tactical-player-dot-size", `${dotSize}px`);
        this.stage.style.setProperty("--tactical-vehicle-marker-size", `${round(iconSize)}px`);
        this.stage.classList.toggle("show-player-icons", this.markerOptions.showIcons);
        this.stage.classList.toggle("show-player-names", this.markerOptions.showNames);
    }

    updateVehicles(vehicles) {
        const visibleIds = new Set();
        for (const vehicle of vehicles || []) {
            const point = mapCoordinateToPercent(this.telemetry.map, vehicle.x, vehicle.z);
            if (!point) continue;
            visibleIds.add(vehicle.vehicleId);
            let marker = this.vehicleMarkers.get(vehicle.vehicleId);
            if (!marker) {
                marker = document.createElement("button");
                marker.type = "button";
                marker.className = "tactical-vehicle-marker";
                marker.dataset.tacticalVehicle = vehicle.vehicleId;
                marker.setAttribute("aria-pressed", "false");
                this.vehicleLayer.append(marker);
                this.vehicleMarkers.set(vehicle.vehicleId, marker);
            }
            marker.textContent = vehicleGlyph(vehicle.vehicleType);
            marker.hidden = false;
            marker.style.setProperty("--map-x", `${point.x}%`);
            marker.style.setProperty("--map-y", `${point.y}%`);
            marker.classList.toggle("is-destroyed", vehicle.destroyed);
            marker.setAttribute(
                "aria-label",
                `${labelFromId(vehicle.vehicleType)} at X ${round(vehicle.x)}, Y ${round(vehicle.y)}, Z ${round(vehicle.z)}${vehicle.destroyed ? ", destroyed" : ""}`
            );
        }
        this.vehicleMarkers.forEach((marker, id) => {
            marker.hidden = !visibleIds.has(id);
        });
    }

    updateZone(zone) {
        if (!zone) {
            this.zone.hidden = true;
            return;
        }
        const point = mapCoordinateToPercent(this.telemetry.map, zone.centerX, zone.centerZ);
        const xSpan = Number(this.telemetry.map.worldMaxX) - Number(this.telemetry.map.worldMinX);
        const zSpan = Number(this.telemetry.map.worldMaxZ) - Number(this.telemetry.map.worldMinZ);
        if (!point || !(xSpan > 0) || !(zSpan > 0)) {
            this.zone.hidden = true;
            return;
        }
        this.zone.hidden = false;
        this.zone.style.setProperty("--zone-x", `${point.x}%`);
        this.zone.style.setProperty("--zone-y", `${point.y}%`);
        this.zone.style.setProperty("--zone-width", `${(zone.radius * 2 * 100) / xSpan}%`);
        this.zone.style.setProperty("--zone-height", `${(zone.radius * 2 * 100) / zSpan}%`);
        this.zoneLabel.textContent = `Zone ${zone.phase ?? "?"}`;
        this.zone.setAttribute(
            "aria-label",
            `Zone phase ${zone.phase ?? "unavailable"}, radius ${round(zone.radius)} blocks`
        );
    }

    updateScore(scores) {
        if (!scores) {
            this.score.hidden = true;
            return;
        }
        this.score.hidden = false;
        if (scores.red !== null && scores.blue !== null) {
            this.score.textContent = `Red ${scores.red} - ${scores.blue} Blue${scores.target !== null ? ` / ${scores.target}` : ""}`;
            return;
        }
        const ranking = Object.entries(scores.players || {}).sort((a, b) => b[1] - a[1]);
        this.score.textContent = ranking.length
            ? `${this.playerName(ranking[0][0])}: ${ranking[0][1]}${scores.target !== null ? ` / ${scores.target}` : ""}`
            : `Target ${scores.target ?? "unavailable"}`;
    }

    updateEventLines(event) {
        this.lines.replaceChildren();
        if (!event) return;
        const start =
            event.killerPosition ||
            event.attackerPosition ||
            this.positionForPlayer(event.killerId || event.attackerId);
        const end = event.victimPosition || this.positionForPlayer(event.victimId);
        if (!start || !end) return;
        const startPoint = mapCoordinateToPercent(this.telemetry.map, start.x, start.z);
        const endPoint = mapCoordinateToPercent(this.telemetry.map, end.x, end.z);
        if (!startPoint || !endPoint) return;

        const line = document.createElementNS(SVG_NS, "line");
        line.setAttribute("x1", String(startPoint.x * 10));
        line.setAttribute("y1", String(startPoint.y * 10));
        line.setAttribute("x2", String(endPoint.x * 10));
        line.setAttribute("y2", String(endPoint.y * 10));
        line.classList.add(event.type === "elimination" ? "kill-line" : "engagement-line");
        this.lines.append(line);

        const distance = eventDistance3d(event, start, end);
        if (distance !== null) {
            const label = document.createElementNS(SVG_NS, "text");
            label.setAttribute("x", String(((startPoint.x + endPoint.x) / 2) * 10));
            label.setAttribute("y", String(((startPoint.y + endPoint.y) / 2) * 10));
            label.textContent = `${round(distance)} blocks`;
            this.lines.append(label);
        }
    }

    showTooltip(playerId) {
        const participant = this.telemetry.participants.find((item) => item.playerId === playerId);
        const state = this.playerStates.get(playerId);
        if (!participant || !state) return;
        const presentation = this.getPlayerPresentation(playerId, participant) || {};
        const playerEvents = this.currentEvents.filter(
            (item) => item.attackerId === playerId || item.killerId === playerId || item.victimId === playerId
        );
        const event = playerEvents.find((item) => item.type === "elimination") || playerEvents[0];
        this.tooltip.replaceChildren();
        const identity = document.createElement("div");
        identity.className = "tactical-tooltip-player";
        identity.append(createPlayerAvatar(presentation, participant, "tactical-tooltip-avatar"));
        const nameTag = document.createElement("div");
        const heading = document.createElement("strong");
        heading.textContent = presentation.name || participant.name;
        const team = document.createElement("small");
        team.textContent = teamLabel(participant.teamId);
        nameTag.append(heading, team);
        identity.append(nameTag);

        const status = !state.connected ? "Disconnected" : state.alive ? "Alive" : "Eliminated";
        const vitals = document.createElement("span");
        const health =
            state.health === null
                ? "HP unavailable"
                : `${round(state.health)}${state.maxHealth === null ? "" : ` / ${round(state.maxHealth)}`} HP`;
        const armor = state.armor === null ? "armor unavailable" : `${round(state.armor)} armor`;
        vitals.textContent = `${status} - ${health} - ${armor}`;
        const position = document.createElement("span");
        position.textContent = `X ${round(state.x)}, Y ${round(state.y)}, Z ${round(state.z)}`;
        const kd = this.playerKDAt(playerId);
        const currentKd = document.createElement("span");
        currentKd.textContent = `Current K/D: ${kd.kills} / ${kd.deaths}`;
        this.tooltip.append(identity, vitals, position, currentKd);
        const vehicleState = state.vehicleId ? this.vehicleStates.get(state.vehicleId) : null;
        if (vehicleState) {
            const vehicle = document.createElement("span");
            vehicle.textContent = `Vehicle: ${labelFromId(vehicleState.vehicleType)}`;
            this.tooltip.append(vehicle);
        }
        if (event?.weaponLabel || event?.weaponId) {
            const weapon = document.createElement("span");
            weapon.textContent = `Weapon: ${event.weaponLabel || labelFromId(event.weaponId)}`;
            this.tooltip.append(weapon);
        }
        const distance = eventDistance3d(event);
        if (distance !== null) {
            const range = document.createElement("span");
            range.textContent = `Shot range: ${round(distance)} blocks`;
            this.tooltip.append(range);
        }
        this.tooltip.hidden = false;
    }

    showVehicleTooltip(vehicleId) {
        const vehicle = this.vehicleStates.get(vehicleId);
        if (!vehicle) {
            this.closeTooltip();
            return;
        }
        this.tooltip.replaceChildren();
        const heading = document.createElement("strong");
        heading.textContent = labelFromId(vehicle.vehicleType);
        const condition = document.createElement("span");
        const health =
            vehicle.health === null
                ? "Health unavailable"
                : `${round(vehicle.health)}${vehicle.maxHealth === null ? "" : ` / ${round(vehicle.maxHealth)}`} HP`;
        condition.textContent = `${vehicle.destroyed ? "Destroyed" : health} - X ${round(vehicle.x)}, Y ${round(vehicle.y)}, Z ${round(vehicle.z)}`;
        this.tooltip.append(heading, condition);
        if (vehicle.occupantPlayerIds.length) {
            const occupants = document.createElement("span");
            occupants.textContent = `Occupants: ${vehicle.occupantPlayerIds.map((id) => this.playerName(id)).join(", ")}`;
            this.tooltip.append(occupants);
        }
        this.tooltip.hidden = false;
    }

    playerTooltipText(participant, state) {
        const status = !state.connected ? "Disconnected" : state.alive ? "Alive" : "Eliminated";
        const health = state.health === null ? "HP unavailable" : `${round(state.health)} HP`;
        const armor = state.armor === null ? "armor unavailable" : `${round(state.armor)} armor`;
        const vehicleState = state.vehicleId ? this.vehicleStates.get(state.vehicleId) : null;
        const vehicle = vehicleState ? `, in ${labelFromId(vehicleState.vehicleType)}` : "";
        const kd = this.playerKDAt(participant.playerId);
        return `${teamLabel(participant.teamId)}, ${health}, ${armor}, X ${round(state.x)}, Y ${round(state.y)}, Z ${round(state.z)}, ${status}, current K/D ${kd.kills}/${kd.deaths}${vehicle}`;
    }

    playerKDAt(playerId) {
        let kills = 0;
        let deaths = 0;
        for (const event of this.telemetry.events) {
            if (event.timeMs > this.currentTimeMs) break;
            if (event.type !== "elimination") continue;
            if (event.killerId === playerId) kills++;
            if (event.victimId === playerId) deaths++;
        }
        return { kills, deaths };
    }

    positionForPlayer(playerId) {
        const state = this.playerStates.get(playerId);
        return state ? { x: state.x, y: state.y, z: state.z } : null;
    }

    playerName(playerId) {
        const participant = this.telemetry.participants.find((item) => item.playerId === playerId);
        const presentation = this.getPlayerPresentation(playerId, participant) || {};
        return presentation.name || participant?.name || "Player";
    }
}

function createPlayerAvatar(presentation, participant, className) {
    const avatar = document.createElement("span");
    avatar.className = className;
    const initials = document.createElement("span");
    initials.className = "tactical-player-initials";
    initials.textContent = initialsFor(presentation.name || participant.name);
    avatar.append(initials);
    if (presentation.avatarUrl) {
        const image = document.createElement("img");
        image.src = presentation.avatarUrl;
        image.alt = "";
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        image.addEventListener("error", () => image.remove(), { once: true });
        avatar.prepend(image);
    }
    return avatar;
}

function normalizeMarkerOptions(value = {}) {
    const rawSize = Number(value.size);
    return {
        size: Number.isFinite(rawSize) ? Math.max(0, Math.min(4, Math.round(rawSize))) : DEFAULT_MARKER_OPTIONS.size,
        showIcons: value.showIcons === undefined ? DEFAULT_MARKER_OPTIONS.showIcons : value.showIcons === true,
        showNames: value.showNames === undefined ? DEFAULT_MARKER_OPTIONS.showNames : value.showNames === true
    };
}

function eventDistance3d(event, start = event?.killerPosition || event?.attackerPosition, end = event?.victimPosition) {
    if (typeof event?.distance3d === "number" && Number.isFinite(event.distance3d)) return event.distance3d;
    if (!start || !end) return null;
    const values = [start.x, start.y, start.z, end.x, end.y, end.z].map(Number);
    if (!values.every(Number.isFinite)) return null;
    return Math.hypot(values[0] - values[3], values[1] - values[4], values[2] - values[5]);
}

function teamColor(value) {
    const text = String(value || "solo");
    let hash = 0;
    for (let index = 0; index < text.length; index++) hash = (hash * 31 + text.charCodeAt(index)) | 0;
    return TEAM_COLORS[Math.abs(hash) % TEAM_COLORS.length];
}

function initialsFor(name) {
    return (
        String(name || "?")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase() || "?"
    );
}

function vehicleGlyph(type) {
    const value = String(type || "").toLowerCase();
    const id = value.split(":").pop() || value;
    const compact = id.replace(/[^a-z0-9]+/g, "");
    if (value.includes("helicopter") || value.includes("chopper") || /^(?:ah|ka|mh|mi|rah|uh)\d/.test(compact)) {
        return "H";
    }
    if (
        value.includes("aircraft") ||
        value.includes("plane") ||
        /^(?:a10|b2|f14|f15|f16|f18|mig|su25|su27|v22)/.test(compact)
    ) {
        return "P";
    }
    if (
        value.includes("tank") ||
        value.includes("apc") ||
        /(?:abrams|bradley|bmp\d|gepard|lav\d|pantsir|t90|type63)/.test(compact)
    ) {
        return "T";
    }
    if (value.includes("artillery") || /^(?:mle1934|mk42|plz|tos)/.test(compact)) {
        return "A";
    }
    if (value.includes("car") || value.includes("truck") || value.includes("jeep") || value.includes("humvee")) {
        return "C";
    }
    if (value.includes("boat") || value.includes("ship")) return "B";
    return "V";
}

function labelFromId(value) {
    const id = String(value || "Vehicle")
        .split(":")
        .pop();
    return (
        VEHICLE_LABELS.get(id.toLowerCase()) ||
        id.replaceAll(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    );
}

function safeClass(value) {
    return String(value || "solo")
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-");
}

function teamClass(value) {
    const team = String(value || "").trim();
    if (!team || /^solo(?:[-_: ].*|$)/i.test(team)) return "solo";
    const numbered = /^team[-_: ]?(\d+)$/i.exec(team);
    return numbered ? `team-${numbered[1]}` : "team";
}

function teamLabel(value) {
    const team = String(value || "").trim();
    if (!team || /^solo(?:[-_: ].*|$)/i.test(team)) return "Solo";
    const numbered = /^team[-_: ]?(\d+)$/i.exec(team);
    if (numbered) return `Team ${numbered[1]}`;
    if (looksLikeUuid(team)) return "Team";
    return labelFromId(team);
}

function looksLikeUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function round(value) {
    return Math.round(Number(value) * 10) / 10;
}
