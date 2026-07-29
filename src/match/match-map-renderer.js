import { mapCoordinateToPercent } from "./match-telemetry-normalizer.js";

const SVG_NS = "http://www.w3.org/2000/svg";
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
    constructor(container, telemetry, getPlayerPresentation = () => ({})) {
        this.container = container;
        this.telemetry = telemetry;
        this.getPlayerPresentation = getPlayerPresentation;
        this.playerMarkers = new Map();
        this.vehicleMarkers = new Map();
        this.playerStates = new Map();
        this.vehicleStates = new Map();
        this.currentEvents = [];
        this.lockedPlayerId = "";
        this.lockedVehicleId = "";
        this.handleKeyDown = (event) => {
            if (event.key === "Escape") this.closeTooltip();
        };
        this.renderBase();
    }

    update(snapshot, events = [], currentEventId = "") {
        if (!snapshot) return;
        this.currentEvents = events;
        this.playerStates = new Map(snapshot.players.map((player) => [player.playerId, player]));
        this.vehicleStates = new Map(snapshot.vehicles.map((vehicle) => [vehicle.vehicleId, vehicle]));
        const activeEvent = events.find((event) => event.eventId === currentEventId) || events.at(-1) || null;
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
            updateMeter(marker.querySelector("[data-marker-health]"), state.health, state.maxHealth);
            updateMeter(marker.querySelector("[data-marker-armor]"), state.armor, 20);
            marker.setAttribute("aria-label", this.playerTooltipText(participant, state));
        }

        this.updateVehicles(snapshot.vehicles);
        this.updateZone(snapshot.zone);
        this.updateScore(snapshot.scores);
        this.updateEventLines(events, activeEvent);
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
    }

    createPlayerMarker(participant) {
        const presentation = this.getPlayerPresentation(participant.playerId, participant) || {};
        const marker = document.createElement("button");
        marker.type = "button";
        marker.className = `tactical-player-marker team-${safeClass(teamClass(participant.teamId))}`;
        marker.dataset.tacticalPlayer = participant.playerId;
        marker.setAttribute("aria-pressed", "false");
        marker.title = "";

        const icon = document.createElement("span");
        icon.className = "tactical-player-icon";
        if (presentation.avatarUrl) {
            const image = document.createElement("img");
            image.src = presentation.avatarUrl;
            image.alt = "";
            image.loading = "lazy";
            image.referrerPolicy = "no-referrer";
            image.addEventListener("error", () => image.remove(), { once: true });
            icon.append(image);
        }
        const initials = document.createElement("span");
        initials.textContent = initialsFor(presentation.name || participant.name);
        icon.append(initials);
        marker.append(icon);

        const label = document.createElement("span");
        label.className = "tactical-player-name";
        label.textContent = presentation.name || participant.name;
        marker.append(label);

        const meters = document.createElement("span");
        meters.className = "tactical-marker-meters";
        meters.innerHTML = `
            <span class="tactical-health-track"><span data-marker-health></span></span>
            <span class="tactical-armor-track"><span data-marker-armor></span></span>
        `;
        marker.append(meters);
        this.playerLayer.append(marker);
        this.playerMarkers.set(participant.playerId, marker);
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

    updateEventLines(events, activeEvent) {
        this.lines.replaceChildren();
        const event =
            activeEvent ||
            events.find((candidate) => candidate.type === "elimination") ||
            events.find((candidate) => candidate.type === "damage" || candidate.type === "engagement_start");
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

        if (event.type === "elimination" && event.distance3d !== null) {
            const label = document.createElementNS(SVG_NS, "text");
            label.setAttribute("x", String(((startPoint.x + endPoint.x) / 2) * 10));
            label.setAttribute("y", String(((startPoint.y + endPoint.y) / 2) * 10));
            const altitude =
                event.verticalDifference === null
                    ? ""
                    : ` ${event.verticalDifference >= 0 ? "up" : "down"} ${round(Math.abs(event.verticalDifference))}`;
            label.textContent = `${round(event.distance3d)} blocks${altitude}`;
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
        const heading = document.createElement("strong");
        heading.textContent = presentation.name || participant.name;
        const details = document.createElement("span");
        details.textContent = this.playerTooltipText(participant, state);
        this.tooltip.append(heading, details);
        if (event?.weaponLabel || event?.weaponId) {
            const weapon = document.createElement("span");
            weapon.textContent = `Weapon: ${event.weaponLabel || labelFromId(event.weaponId)}`;
            this.tooltip.append(weapon);
        }
        const distance = event?.distance3d ?? event?.horizontalDistance;
        if (distance !== null && distance !== undefined) {
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
        return `${teamLabel(participant.teamId)}, ${health}, ${armor}, X ${round(state.x)}, Y ${round(state.y)}, Z ${round(state.z)}, ${status}${vehicle}`;
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

function updateMeter(element, value, maximum) {
    if (!element) return;
    const normalized = value === null || !(maximum > 0) ? 0 : Math.min(100, Math.max(0, (value / maximum) * 100));
    element.style.width = `${normalized}%`;
    element.parentElement?.classList.toggle("is-unavailable", value === null);
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
