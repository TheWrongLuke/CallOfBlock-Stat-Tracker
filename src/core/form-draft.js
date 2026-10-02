export function captureFormDraft(form) {
    return [...form.elements]
        .filter((input) => input.name && !["submit", "button", "hidden"].includes(input.type))
        .map((input) => ({
            name: input.name,
            value: input.value,
            checked: input.checked,
            files: input.files ? [...input.files] : null
        }));
}

export function restoreFormDraft(form, draft) {
    if (!form || !draft) return;
    for (const saved of draft) {
        const input = [...form.elements].find(
            (candidate) =>
                candidate.name === saved.name &&
                (!["checkbox", "radio"].includes(candidate.type) || candidate.value === saved.value)
        );
        if (!input || !("value" in input)) continue;
        if (saved.files) {
            const transfer = new DataTransfer();
            for (const file of saved.files) transfer.items.add(file);
            input.files = transfer.files;
        } else input.value = saved.value;
        if (typeof saved.checked === "boolean") input.checked = saved.checked;
    }
}
