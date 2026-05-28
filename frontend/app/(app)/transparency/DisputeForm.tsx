"use client";

/**
 * DisputeForm — client island for filing a dispute (FR-T4).
 * Posts to POST /api/dispute and shows the tracking ID on success.
 */

import { useState, type FormEvent } from "react";
import { Button, Panel, Pill } from "@/components/ui";

type DisputeKind = "score" | "payout" | "data" | "other";

interface FormState {
  kind: DisputeKind;
  message: string;
  wallet: string;
  matchday: string;
  contestId: string;
}

type SubmitStatus =
  | { type: "idle" }
  | { type: "loading" }
  | { type: "success"; id: string }
  | { type: "error"; message: string };

const KIND_LABELS: Record<DisputeKind, string> = {
  score: "Score dispute",
  payout: "Payout dispute",
  data: "Data / match events issue",
  other: "Other",
};

const INPUT_BASE =
  "w-full rounded-sm border border-line-2 bg-paper-2 px-3 py-2 text-sm text-ink " +
  "placeholder:text-muted transition-colors duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt " +
  "hover:border-ink-2";

export function DisputeForm() {
  const [form, setForm] = useState<FormState>({
    kind: "score",
    message: "",
    wallet: "",
    matchday: "",
    contestId: "",
  });
  const [status, setStatus] = useState<SubmitStatus>({ type: "idle" });

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (status.type === "loading") return;

    const message = form.message.trim();
    if (message.length < 1 || message.length > 4000) {
      setStatus({ type: "error", message: "Message must be between 1 and 4 000 characters." });
      return;
    }

    setStatus({ type: "loading" });

    const body: Record<string, unknown> = {
      kind: form.kind,
      message,
    };
    if (form.wallet.trim()) body.wallet = form.wallet.trim();
    if (form.matchday.trim()) body.matchday = Number(form.matchday.trim());
    if (form.contestId.trim()) body.contestId = form.contestId.trim();

    try {
      const res = await fetch("/api/dispute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) {
        setStatus({ type: "error", message: json.error ?? `Server error (${res.status})` });
        return;
      }
      setStatus({ type: "success", id: json.id ?? "(unknown)" });
      setForm({ kind: "score", message: "", wallet: "", matchday: "", contestId: "" });
    } catch (err) {
      setStatus({
        type: "error",
        message: err instanceof Error ? err.message : "Network error — please try again.",
      });
    }
  }

  if (status.type === "success") {
    return (
      <Panel variant="sunken" className="p-5 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Pill tone="ok">Filed</Pill>
          <span className="text-sm font-semibold text-ink">Dispute filed successfully</span>
        </div>
        <p className="text-xs text-ink-2">
          Your tracking ID is:{" "}
          <code className="font-mono text-xs break-all text-ink">{status.id}</code>
        </p>
        <p className="text-xs text-muted">
          Keep this ID when following up. The team reviews disputes within 72 hours.
        </p>
        <button
          type="button"
          onClick={() => setStatus({ type: "idle" })}
          className="mt-1 text-xs text-cobalt-ink underline decoration-cobalt/40 hover:decoration-cobalt transition-colors duration-150 self-start"
        >
          File another dispute
        </button>
      </Panel>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {status.type === "error" && (
        <div
          role="alert"
          className="rounded-sm border border-danger/40 bg-danger/8 px-4 py-3 text-sm text-danger"
        >
          {status.message}
        </div>
      )}

      {/* Kind */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="kind" className="text-sm font-medium text-ink">
          Dispute type <span aria-hidden="true">*</span>
        </label>
        <select
          id="kind"
          name="kind"
          value={form.kind}
          onChange={handleChange}
          className={INPUT_BASE}
          required
        >
          {(Object.keys(KIND_LABELS) as DisputeKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </div>

      {/* Message */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="message" className="text-sm font-medium text-ink">
          Description <span aria-hidden="true">*</span>
          <span className="ml-2 text-xs text-muted font-normal">
            ({form.message.length} / 4 000)
          </span>
        </label>
        <textarea
          id="message"
          name="message"
          value={form.message}
          onChange={handleChange}
          rows={5}
          maxLength={4000}
          required
          placeholder="Describe the issue in detail — include matchday, wallet, expected vs actual values, and any transaction hashes."
          className={INPUT_BASE + " resize-y"}
        />
      </div>

      {/* Optional: wallet */}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="wallet" className="text-sm font-medium text-ink">
          Your wallet address{" "}
          <span className="text-xs text-muted font-normal">(optional)</span>
        </label>
        <input
          id="wallet"
          type="text"
          name="wallet"
          value={form.wallet}
          onChange={handleChange}
          placeholder="0x…"
          className={INPUT_BASE + " font-mono"}
        />
      </div>

      {/* Optional: matchday + contestId */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="matchday" className="text-sm font-medium text-ink">
            Matchday{" "}
            <span className="text-xs text-muted font-normal">(optional)</span>
          </label>
          <input
            id="matchday"
            type="number"
            name="matchday"
            value={form.matchday}
            onChange={handleChange}
            min={1}
            placeholder="e.g. 1"
            className={INPUT_BASE}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="contestId" className="text-sm font-medium text-ink">
            Contest ID{" "}
            <span className="text-xs text-muted font-normal">(optional)</span>
          </label>
          <input
            id="contestId"
            type="text"
            name="contestId"
            value={form.contestId}
            onChange={handleChange}
            placeholder="e.g. 42"
            className={INPUT_BASE}
          />
        </div>
      </div>

      <Button
        type="submit"
        variant="primary"
        size="md"
        loading={status.type === "loading"}
        className="self-start"
      >
        {status.type === "loading" ? "Filing…" : "Submit dispute"}
      </Button>
    </form>
  );
}
