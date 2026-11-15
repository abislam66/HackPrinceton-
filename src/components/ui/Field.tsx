import { useId, type ComponentProps } from "react";
import { cx } from "@/lib/cx";

type Base = {
  /** Always shown, in sentence case. A placeholder is not a label. */
  label: string;
  /** Shown under the field, and marks it invalid. Say what to fix. */
  error?: string;
};

type InputProps = Base & { multiline?: false } & Omit<ComponentProps<"input">, "id">;
type TextareaProps = Base & { multiline: true } & Omit<ComponentProps<"textarea">, "id">;

export type FieldProps = InputProps | TextareaProps;

/** A labelled text field: a 13 px/500 label over a 16 px input (no iOS zoom). Pass `multiline` for a textarea. */
export function Field(props: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const { label, error, className, multiline, ...rest } = props;
  const shared = {
    id,
    className: cx("app-input", className),
    "aria-invalid": error ? true : undefined,
    "aria-describedby": cx(rest["aria-describedby"], error && errId) || undefined,
  };

  return (
    <div className="app-field">
      <label className="app-field-label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea {...(rest as ComponentProps<"textarea">)} {...shared} />
      ) : (
        <input {...(rest as ComponentProps<"input">)} {...shared} />
      )}
      {error ? (
        <p id={errId} className="app-field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
