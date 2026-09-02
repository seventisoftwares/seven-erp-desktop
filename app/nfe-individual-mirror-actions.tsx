"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DraftRef = {
  id: string;
  nfeNumber?: number | null;
  nfeSeries?: number | null;
  recipientName?: string | null;
};

function sameTargets(left: Element[], right: Element[]) {
  return left.length === right.length && left.every((node, index) => node === right[index]);
}

function selectMirrorDocument(draftId: string) {
  const apply = () => {
    const select = document.querySelector(".nfe-mirror-controls select") as HTMLSelectElement | null;
    if (!select) return false;
    const exists = Array.from(select.options).some((option) => option.value === draftId);
    if (!exists) return false;
    select.value = draftId;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  if (apply()) return;
  const startedAt = Date.now();
  const observer = new MutationObserver(() => {
    if (apply() || Date.now() - startedAt > 5000) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.setTimeout(() => observer.disconnect(), 5200);
}

export default function NfeIndividualMirrorActions() {
  const [targets, setTargets] = useState<Element[]>([]);
  const [drafts, setDrafts] = useState<DraftRef[]>([]);
  const lastRefreshKey = useRef("");

  const refreshDrafts = async () => {
    try {
      const response = await fetch("/api/nfe-drafts");
      const data = await response.json();
      if (!response.ok) return;
      setDrafts(Array.isArray(data.drafts) ? data.drafts : []);
    } catch {
      // O botão individual é auxiliar e não deve interferir no emissor fiscal.
    }
  };

  useEffect(() => {
    const sync = () => {
      const next = Array.from(document.querySelectorAll(".nfe-classic-list .nfe-classic-table tbody tr .classic-actions"));
      setTargets((current) => sameTargets(current, next) ? current : next);
      const key = next.map((node) => `${(node.parentElement?.parentElement as HTMLElement | null)?.rowIndex ?? ""}`).join(":");
      if (next.length && key !== lastRefreshKey.current) {
        lastRefreshKey.current = key;
        void refreshDrafts();
      }
      if (!next.length) lastRefreshKey.current = "";
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (targets.length && drafts.length !== targets.length) void refreshDrafts();
  }, [targets.length]);

  const openIndividualMirror = (draft: DraftRef) => {
    const launcher = document.querySelector(".nfe-mirror-launcher") as HTMLButtonElement | null;
    if (!launcher) return;
    launcher.click();
    selectMirrorDocument(draft.id);
  };

  return <>{targets.map((target, index) => {
    const draft = drafts[index];
    if (!draft) return null;
    const label = draft.nfeNumber ? `NF-e ${String(draft.nfeNumber).padStart(9, "0")}` : "rascunho";
    return createPortal(
      <button
        type="button"
        className="nfe-individual-mirror-button"
        title={`Ver espelho individual de ${label}${draft.recipientName ? ` · ${draft.recipientName}` : ""}`}
        onClick={() => openIndividualMirror(draft)}
      >
        Espelho
      </button>,
      target,
      `nfe-mirror-${draft.id}`,
    );
  })}</>;
}
