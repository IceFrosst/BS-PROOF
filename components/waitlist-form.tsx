"use client";

/*
 * The QR-code landing action: leave an email, get told what happens next.
 *
 * Someone scans the roll-up banner at the stand, and this is the first thing
 * they touch — often one-handed, on a phone, while somebody is talking to
 * them. That sets every decision here:
 *
 * - ONE field and one button. No name, no company, no "how did you hear about
 *   us". Each extra field is a person who does not finish.
 * - type="email" with inputMode and autoComplete, so phones show the right
 *   keyboard and offer the address they already have saved.
 * - The submit button never disappears while the request is in flight; it goes
 *   busy and stays put, because a control that vanishes under your thumb reads
 *   as a crash.
 * - Signing up twice is a SUCCESS state. A second scan says "you are already
 *   on the list", never a red error.
 *
 * The server does the validating (lib/waitlist/email.ts) and this shows the
 * message it returns verbatim, so there is one set of rules rather than two
 * that drift.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";

type Phase = "idle" | "sending" | "joined" | "already" | "error" | "unavailable";

interface WaitlistResponse {
  status?: string;
  error?: string;
}

export function WaitlistForm({ source = "qr" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const inputId = useId();
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (phase === "sending") return;
      setPhase("sending");
      setMessage(null);

      let payload: WaitlistResponse = {};
      let ok = false;
      try {
        const response = await fetch("/api/waitlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, source }),
        });
        ok = response.ok;
        payload = (await response.json()) as WaitlistResponse;
      } catch {
        if (!mounted.current) return;
        // Offline, or the stand's wifi dropped mid-request. Name that, rather
        // than blaming the address they just typed.
        setPhase("error");
        setMessage("That did not send — check the connection and try again.");
        return;
      }
      if (!mounted.current) return;

      if (ok && payload.status === "joined") {
        setPhase("joined");
        setEmail("");
        return;
      }
      if (ok && payload.status === "already_joined") {
        setPhase("already");
        setEmail("");
        return;
      }
      if (payload.status === "waitlist_unavailable") {
        setPhase("unavailable");
        return;
      }
      setPhase("error");
      setMessage(payload.error ?? "That did not send. Try again in a moment.");
    },
    [email, phase, source],
  );

  if (phase === "joined" || phase === "already") {
    return (
      <div className="waitlist waitlist-done" role="status">
        <p className="waitlist-done-head">
          {phase === "joined" ? "You're on the list." : "You're already on the list."}
        </p>
        <p className="waitlist-done-note">
          {phase === "joined"
            ? "We'll email you once, when scanning opens. Not a newsletter."
            : "No need to sign up twice — we still have your address."}
        </p>
        <button
          type="button"
          className="waitlist-again"
          onClick={() => {
            setPhase("idle");
            setMessage(null);
          }}
        >
          Add another address
        </button>
      </div>
    );
  }

  return (
    <form className="waitlist" onSubmit={submit} noValidate>
      <label className="waitlist-label" htmlFor={inputId}>
        Get early access
      </label>
      {/* With the scanner hidden this paragraph is the ONLY thing telling a
          visitor what they are joining, so it says what the product does
          rather than that it is coming. The differentiator is the second
          sentence: everyone else scores the ingredient. */}
      <p className="waitlist-copy">
        We read a supplement label and score that <em>exact</em> product against the clinical
        trials &mdash; its ingredient, its form and its dose, not just the ingredient everyone else
        scores. Leave your email and we&rsquo;ll tell you the moment it opens.
      </p>
      <div className="waitlist-row">
        <input
          id={inputId}
          className="waitlist-input"
          type="email"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@university.edu"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          aria-describedby={message ? `${inputId}-msg` : undefined}
          aria-invalid={phase === "error" || undefined}
          disabled={phase === "sending"}
        />
        <button type="submit" className="button button-light waitlist-submit" disabled={phase === "sending"}>
          {phase === "sending" ? "Sending…" : "Join"}
        </button>
      </div>

      {/* aria-live so a screen reader hears the outcome without moving focus,
          which would yank the keyboard away mid-typing on a phone. */}
      <p
        id={`${inputId}-msg`}
        className={`waitlist-msg${phase === "error" || phase === "unavailable" ? " waitlist-msg-bad" : ""}`}
        role="status"
        aria-live="polite"
      >
        {phase === "unavailable"
          ? "The waitlist is not switched on yet — grab us at the stand instead."
          : message ?? ""}
      </p>
    </form>
  );
}
