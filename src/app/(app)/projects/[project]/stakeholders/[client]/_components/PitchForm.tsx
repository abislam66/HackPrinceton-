"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import type { Pitch } from "@/features/pitch/schema";
import { savePitch } from "@/features/workspace/actions";

type EditableField = "teaserLine" | "headline" | "problem" | "solution" | "acrossProject";

const FIELDS: { key: EditableField; label: string; multiline: boolean }[] = [
  { key: "teaserLine", label: "Teaser line", multiline: false },
  { key: "headline", label: "Headline", multiline: false },
  { key: "problem", label: "Problem", multiline: true },
  { key: "solution", label: "Solution", multiline: true },
  { key: "acrossProject", label: "Across the project", multiline: true },
];

export function PitchForm({ clientId, pitch, readOnly }: { clientId: string; pitch: Pitch; readOnly: boolean }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<EditableField, string>>(() => ({
    teaserLine: pitch.teaserLine,
    headline: pitch.headline,
    problem: pitch.problem,
    solution: pitch.solution,
    acrossProject: pitch.acrossProject,
  }));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => clearTimeout(timer.current ?? undefined), []);

  const save = () => {
    setError(null);
    startTransition(async () => {
      // shotCaptions are not edited here; they go back unchanged.
      const result = await savePitch(clientId, { ...pitch, ...values, shotCaptions: pitch.shotCaptions });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSaved(true);
      clearTimeout(timer.current ?? undefined);
      timer.current = setTimeout(() => setSaved(false), 1500);
      router.refresh();
    });
  };

  const disabled = readOnly || pending;

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault();
        if (!readOnly) save();
      }}
    >
      {readOnly ? <p className="tm-text--s tm-muted mb-6">Sent proposals can&apos;t be edited.</p> : null}
      {FIELDS.map(({ key, label, multiline }) =>
        multiline ? (
          <Field
            key={key}
            label={label}
            multiline
            rows={4}
            value={values[key]}
            disabled={disabled}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        ) : (
          <Field
            key={key}
            label={label}
            value={values[key]}
            disabled={disabled}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
        ),
      )}
      {error ? (
        <p role="alert" className="tm-text--s mt-4 text-halt">
          {error}
        </p>
      ) : null}
      {readOnly ? null : (
        <div className="mt-6" aria-live="polite">
          <Button type="submit" variant="ghost" compact arrow={false} disabled={pending}>
            {pending ? "Saving" : saved ? "Saved" : "Save changes"}
          </Button>
        </div>
      )}
    </form>
  );
}
