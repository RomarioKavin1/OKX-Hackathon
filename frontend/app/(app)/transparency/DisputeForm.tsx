"use client";

/**
 * DisputeForm — client island for filing a dispute (FR-T4).
 * Posts to POST /api/dispute and shows the tracking ID on success.
 */

import { useState, type FormEvent } from "react";

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
      <div className="rounded-lg border border-green-600/50 bg-green-600/10 p-5 text-sm text-green-800 dark:text-green-200">
        <p className="font-semibold mb-1">Dispute filed successfully</p>
        <p>
          Your tracking ID is:{" "}
          <code className="font-mono text-xs break-all">{status.id}</code>
        </p>
        <p className="mt-2 opacity-80">
          Keep this ID when following up. The team reviews disputes within 72 hours.
        </p>
        <button
          type="button"
          onClick={() => setStatus({ type: "idle" })}
          className="mt-3 text-xs underline opacity-70 hover:opacity-100"
        >
          File another dispute
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {status.type === "error" && (
        <div
          role="alert"
          className="rounded border border-red-600/50 bg-red-600/10 px-4 py-3 text-sm text-red-800 dark:text-red-200"
        >
          {status.message}
        </div>
      )}

      {/* Kind */}
      <div className="flex flex-col gap-1">
        <label htmlFor="kind" className="text-sm font-medium">
          Dispute type <span aria-hidden="true">*</span>
        </label>
        <select
          id="kind"
          name="kind"
          value={form.kind}
          onChange={handleChange}
          className="rounded border border-border bg-background px-3 py-2 text-sm"
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
      <div className="flex flex-col gap-1">
        <label htmlFor="message" className="text-sm font-medium">
          Description <span aria-hidden="true">*</span>
          <span className="ml-2 text-xs opacity-60 font-normal">
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
          className="rounded border border-border bg-background px-3 py-2 text-sm resize-y"
        />
      </div>

      {/* Optional: wallet */}
      <div className="flex flex-col gap-1">
        <label htmlFor="wallet" className="text-sm font-medium">
          Your wallet address{" "}
          <span className="text-xs opacity-60 font-normal">(optional)</span>
        </label>
        <input
          id="wallet"
          type="text"
          name="wallet"
          value={form.wallet}
          onChange={handleChange}
          placeholder="0x…"
          className="rounded border border-border bg-background px-3 py-2 font-mono text-sm"
        />
      </div>

      {/* Optional: matchday + contestId */}
      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="matchday" className="text-sm font-medium">
            Matchday{" "}
            <span className="text-xs opacity-60 font-normal">(optional)</span>
          </label>
          <input
            id="matchday"
            type="number"
            name="matchday"
            value={form.matchday}
            onChange={handleChange}
            min={1}
            placeholder="e.g. 1"
            className="rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="contestId" className="text-sm font-medium">
            Contest ID{" "}
            <span className="text-xs opacity-60 font-normal">(optional)</span>
          </label>
          <input
            id="contestId"
            type="text"
            name="contestId"
            value={form.contestId}
            onChange={handleChange}
            placeholder="e.g. 42"
            className="rounded border border-border bg-background px-3 py-2 text-sm"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={status.type === "loading"}
        className="rounded bg-[var(--pitch-green)] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 self-start"
      >
        {status.type === "loading" ? "Filing…" : "Submit dispute"}
      </button>
    </form>
  );
}
