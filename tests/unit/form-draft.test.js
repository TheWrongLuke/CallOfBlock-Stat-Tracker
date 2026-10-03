import { expect, it } from "vitest";
import { captureFormDraft, captureAccountDraft, restoreFormDraft } from "../../src/core/form-draft.js";

it("restores every badge checkbox independently after a rejected profile save", () => {
    const form = {
        elements: [
            { name: "displayName", type: "text", value: "Draft name" },
            { name: "selectedBadges", type: "checkbox", value: "first", checked: true },
            { name: "selectedBadges", type: "checkbox", value: "second", checked: false }
        ]
    };
    const draft = captureFormDraft(form);
    const refreshed = {
        elements: form.elements.map((input) => ({
            ...input,
            checked: false,
            value: input.type === "text" ? "Saved name" : input.value
        }))
    };
    restoreFormDraft(refreshed, draft);
    expect(refreshed.elements.map((input) => input.value)).toEqual(["Draft name", "first", "second"]);
    expect(refreshed.elements.slice(1).map((input) => input.checked)).toEqual([true, false]);
    restoreFormDraft(null, draft);
});

it("preserves hidden customization selections without copying unrelated hidden identifiers", () => {
    const names = ["avatarSource", "profileBackground", "pfpBorder", "profileTitle", "csrf"];
    const form = { elements: names.map((name) => ({ name, type: "hidden", value: `draft-${name}` })) };
    expect(captureFormDraft(form)).toEqual([]);
    const draft = captureAccountDraft(form);
    expect(draft.map((input) => input.name)).toEqual(names.slice(0, 4));
    const refreshed = { elements: names.map((name) => ({ name, type: "hidden", value: "saved" })) };
    restoreFormDraft(refreshed, draft);
    expect(refreshed.elements.map((input) => input.value)).toEqual([
        ...names.slice(0, 4).map((name) => `draft-${name}`),
        "saved"
    ]);
});
