import { renderAccountProgress } from "../core/account-view.js";
import { animateXpReward, cancelXpOrbs, captureXpOrigin, xpOrbAmounts } from "../features/xp-orbs.js";

const host = document.querySelector("[data-xp-preview]");
const button = document.getElementById("preview-claim");
const status = document.getElementById("preview-status");
const starting = document.getElementById("starting-xp");
const reward = document.getElementById("reward-xp");
const step = document.getElementById("orb-step");
let generation = 0;

function reset() {
    generation++;
    cancelXpOrbs();
    host.innerHTML = renderAccountProgress(Number(starting.value));
    button.disabled = false;
    status.textContent = "";
}

button.addEventListener("click", async () => {
    reset();
    const current = generation;
    const before = Math.max(0, Number(starting.value) || 0);
    const amount = Math.max(0, Math.min(20000, Number(reward.value) || 0));
    const unit = Number(step.value);
    host.innerHTML = renderAccountProgress(before + amount);
    button.disabled = true;
    status.textContent = xpOrbAmounts(amount, unit)
        .map((xp) => `+${xp}`)
        .join(" / ");
    await animateXpReward({ origin: captureXpOrigin(button), before, after: before + amount, step: unit });
    if (current === generation) button.disabled = false;
});
document.getElementById("preview-reset").addEventListener("click", reset);
for (const input of [starting, reward, step]) input.addEventListener("change", reset);
reset();
