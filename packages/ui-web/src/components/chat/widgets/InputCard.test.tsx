import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { InputWidget } from "@kotys/contracts";
import InputCard from "./InputCard";

const widget = (partial: Partial<InputWidget>): InputWidget => ({
  kind: "input",
  title: "Which case is 'puellam'?",
  fields: [
    {
      id: "answer",
      kind: "choice",
      label: "Case",
      options: [
        { value: "A", label: "Nominative" },
        { value: "B", label: "Accusative" },
      ],
    },
  ],
  answers: { answer: "B" },
  ...partial,
});

describe("InputCard", () => {
  it("renders the question and the option label for a choice answer", () => {
    render(<InputCard widget={widget({})} />);
    expect(screen.getByText("Which case is 'puellam'?")).toBeInTheDocument();
    expect(screen.getByText("Case")).toBeInTheDocument();
    expect(screen.getByText("Accusative")).toBeInTheDocument();
  });

  it("falls back to the raw value when no option matches", () => {
    render(<InputCard widget={widget({ answers: { answer: "X" } })} />);
    expect(screen.getByText("X")).toBeInTheDocument();
  });

  it("marks a form that was never answered", () => {
    render(<InputCard widget={widget({ answers: null })} />);
    expect(screen.getByText("No answer")).toBeInTheDocument();
  });

  it("renders a text answer verbatim", () => {
    render(
      <InputCard
        widget={widget({
          fields: [{ id: "a", kind: "text", label: "Translation" }],
          answers: { a: "Rosa puellās amat." },
        })}
      />,
    );
    expect(screen.getByText("Rosa puellās amat.")).toBeInTheDocument();
  });
});
