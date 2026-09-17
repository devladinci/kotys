import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock(
  "@kotys/client",
  async () => await import("../../../test/mocks/client"),
);
const { rpc, initTestClients } = await import("../../../test/mocks/rpc");
const { KotysProviderForTest } = await import("../../../test/platform");
const SkillsSettings = (await import(".")).default;

const listing = (name: string) => ({
  name,
  description: `${name} description`,
  source: "user" as const,
  enabled: true,
  userInvocable: true,
  modelInvocable: true,
});

const detail = ({ name }: { name: string }) =>
  Promise.resolve({
    name,
    description: `${name} description`,
    disableModelInvocation: false,
    userInvocable: true,
    body: `${name} instructions`,
  });

const bodyField = () =>
  screen.getByLabelText("Skill body") as HTMLTextAreaElement;

beforeEach(async () => {
  vi.clearAllMocks();
  await initTestClients();
  vi.mocked(rpc.skills.list).mockResolvedValue([
    listing("alpha"),
    listing("beta"),
  ]);
  vi.mocked(rpc.skills.get).mockImplementation(detail as never);
  render(
    <KotysProviderForTest>
      <SkillsSettings />
    </KotysProviderForTest>,
  );
});

const openBetaAfterAlpha = async () => {
  await userEvent.click(await screen.findByLabelText("Edit alpha"));
  await waitFor(() => expect(bodyField().value).toBe("alpha instructions"));
  await userEvent.click(screen.getByLabelText("Edit beta"));
  await waitFor(() => expect(bodyField().value).toBe("beta instructions"));
};

describe("SkillsSettings editor", () => {
  it("shows the skill that was opened last", async () => {
    await openBetaAfterAlpha();
    expect(screen.getByLabelText("Skill name")).toHaveValue("beta");
  });

  it("saves the open skill under its own name", async () => {
    await openBetaAfterAlpha();
    await userEvent.click(screen.getByText("Save"));
    expect(rpc.skills.update).toHaveBeenCalledWith(
      expect.objectContaining({
        currentName: "beta",
        name: "beta",
        body: "beta instructions",
      }),
    );
  });
});
