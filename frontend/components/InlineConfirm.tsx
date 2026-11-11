"use client";
import { translate as tr } from "../lib/i18n";

// Keep confirmation at the action that triggered it, inside the current row/card.
export function confirmInline(message: string): Promise<boolean> {
    return new Promise(resolve => {
        const target = document.activeElement as HTMLElement | null;
        const box = document.createElement("span");
        box.className = "inline-flex flex-wrap items-center gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-slate-800";
        box.setAttribute("role", "group");
        const text = document.createElement("span");
        text.textContent = tr(message);
        box.append(text);
        let done = false;
        function finish(value: boolean) { if (done)
            return; done = true; box.remove(); resolve(value); }
        for (const [label, value] of [[tr("Xác nhận"), true], [tr("Hủy"), false]] as const) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = label;
            button.className = "rounded border bg-white px-2 py-1";
            button.onclick = e => { e.preventDefault(); e.stopPropagation(); finish(value); };
            box.append(button);
        }
        if (!target || target === document.body) {
            finish(false);
            return;
        }
        target.insertAdjacentElement("afterend", box);
        (box.querySelector("button") as HTMLButtonElement)?.focus();
    });
}
