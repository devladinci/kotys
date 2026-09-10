import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UserInputForm } from "./UserInputForm";
import type { InputRequest } from "@kotys/contracts";

const CHOICE_REQUEST: InputRequest = {
  id: 1,
  title: "Which case is 'puellam'?",
  description: "Pick the Latin case.",
  fields: [
    {
      id: "answer",
      kind: "choice",
      options: [
        { value: "A", label: "Nominative" },
        { value: "B", label: "Accusative" },
      ],
    },
  ],
};

const TEXT_REQUEST: InputRequest = {
  id: 2,
  title: "Translate the sentence",
  fields: [
    { id: "translation", kind: "text", placeholder: "Your translation" },
  ],
};

describe("UserInputForm", () => {
  it("renders title, description, and field labels", () => {
    render(
      <UserInputForm
        request={CHOICE_REQUEST}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText("Which case is 'puellam'?")).toBeInTheDocument();
    expect(screen.getByText("Pick the Latin case.")).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Nominative" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Accusative" }),
    ).toBeInTheDocument();
  });

  it("submit is disabled until a required choice is picked", async () => {
    const onSubmit = vi.fn();
    render(
      <UserInputForm
        request={CHOICE_REQUEST}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    const submit = screen.getByRole("button", { name: "Submit" });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: "Accusative" }));
    expect(submit).toBeEnabled();
    await userEvent.click(submit);
    expect(onSubmit).toHaveBeenCalledWith({ answer: "B" });
  });

  it("a field marked optional does not block submit", async () => {
    const onSubmit = vi.fn();
    render(
      <UserInputForm
        request={{
          id: 3,
          title: "Optional note",
          fields: [{ id: "note", kind: "text", required: false }],
        }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith({});
  });

  it("typing into a text field flows into the answers map", async () => {
    const onSubmit = vi.fn();
    render(
      <UserInputForm
        request={TEXT_REQUEST}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.type(
      screen.getByPlaceholderText("Your translation"),
      "The girl",
    );
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith({ translation: "The girl" });
  });

  it("Enter in a single-line input submits", async () => {
    const onSubmit = vi.fn();
    render(
      <UserInputForm
        request={TEXT_REQUEST}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    const input = screen.getByPlaceholderText("Your translation");
    await userEvent.type(input, "The girl{Enter}");
    expect(onSubmit).toHaveBeenCalledWith({ translation: "The girl" });
  });

  it("Enter without modifier in a multiline textarea does not submit", async () => {
    const onSubmit = vi.fn();
    render(
      <UserInputForm
        request={{
          id: 4,
          title: "Longer translation",
          fields: [{ id: "t", kind: "text", multiline: true }],
        }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.type(
      screen.getByRole("textbox"),
      "line one{Enter}line two",
    );
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(onSubmit).toHaveBeenCalledWith({ t: "line one\nline two" });
  });

  it("cancel calls onCancel", async () => {
    const onCancel = vi.fn();
    render(
      <UserInputForm
        request={TEXT_REQUEST}
        onSubmit={vi.fn()}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("uses the request's custom button labels", () => {
    render(
      <UserInputForm
        request={{
          ...TEXT_REQUEST,
          submitLabel: "Answer",
          cancelLabel: "Skip",
        }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Answer" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skip" })).toBeInTheDocument();
  });
});
