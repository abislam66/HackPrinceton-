import { useId, type ComponentProps } from "react";

type Base = {
  /** Always shown. A placeholder is not a label. */
  label: string;
  /** Shown under the field, and marks it invalid. Say what to fix. */
  error?: string;
};

type InputProps = Base & { multiline?: false } & Omit<ComponentProps<"input">, "id">;
type TextareaProps = Base & { multiline: true } & Omit<ComponentProps<"textarea">, "id">;

/** A labeled text field. Pass `multiline` for a textarea. */
export function Field(props: InputProps | TextareaProps) {
  const id = useId();
  const errId = `${id}-err`;
  const { label, error, className, multiline, ...rest } = props;
  const described = error ? errId : undefined;
  const cls = ["tm-input", className ?? ""].filter(Boolean).join(" ");

  return (
    <div className={error ? "tm-field tm-field--invalid" : "tm-field"}>
      <label className="tm-field__label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} className={cls} aria-invalid={error ? true : undefined} aria-describedby={described} {...(rest as ComponentProps<"textarea">)} />
      ) : (
        <input id={id} className={cls} aria-invalid={error ? true : undefined} aria-describedby={described} {...(rest as ComponentProps<"input">)} />
      )}
      {error ? (
        <p id={errId} className="tm-field__err">
          {error}
        </p>
      ) : null}
    </div>
  );
}
