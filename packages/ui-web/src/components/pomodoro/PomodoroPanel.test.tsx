import {
  describe,
  expect,
  it,
  beforeEach,
  vi,
  type MockedFunction,
} from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { PomodoroSessionRecord } from "@kotys/contracts";

vi.mock("@kotys/client", async () => await import("../../test/mocks/client"));
const { rpc } = await import("../../test/mocks/rpc");

const PomodoroPanel = (await import("./PomodoroPanel")).default;
const PomodoroChip = (await import("./PomodoroChip")).default;
const { usePomodoroStore } = await import("@kotys/core");
const { useTodoStore } = await import("@kotys/core");

const rpcPomodoroPause = rpc.pomodoro.pause as MockedFunction<
  typeof rpc.pomodoro.pause
>;
const rpcPomodoroStop = rpc.pomodoro.stop as MockedFunction<
  typeof rpc.pomodoro.stop
>;

const makeSession = (
  overrides: Partial<PomodoroSessionRecord> = {},
): PomodoroSessionRecord =>
  ({
    id: 1,
    chat_id: null,
    todo_id: null,
    task: "Open PRs Awaiting Your Review",
    duration_seconds: 1500,
    break_seconds: 300,
    started_at: 1_700_000_000,
    ended_at: null,
    completed_at: null,
    status: "running",
    phase: "focus",
    ends_at: null,
    cycles: 4,
    cycles_completed: 1,
    updated_at: 1_700_000_000,
    remaining_at_pause: null,
    ...overrides,
  }) as PomodoroSessionRecord;

beforeEach(async () => {
  vi.clearAllMocks();
  const { initTestClients } = await import("../../test/mocks/rpc");
  await initTestClients();
  usePomodoroStore.setState({
    session: null,
    phase: "focus",
    remaining: 0,
    collapsed: false,
    history: [],
    error: null,
    defaultDuration: 25,
    defaultBreak: 5,
  });
  useTodoStore.setState({ sidebarOpen: true });
});

describe("PomodoroPanel", () => {
  it("costs the rail one row when there is no session", () => {
    render(<PomodoroPanel />);
    expect(screen.getByRole("button", { name: /start focus/i })).toBeTruthy();
    // The default is stated on the row, so starting needs no form for the
    // common case of "just give me the usual".
    expect(screen.getByText("25m")).toBeTruthy();
    expect(screen.queryByText("00:00")).toBeNull();
  });

  it("shows phase, time and cycle progress while running", () => {
    usePomodoroStore.setState({
      session: makeSession(),
      phase: "focus",
      remaining: 1493,
    });
    render(<PomodoroPanel />);
    expect(screen.getByText("24:53")).toBeTruthy();
    // The phase names the section; it is not repeated inside the card.
    expect(screen.getAllByText("Focus")).toHaveLength(1);
    // Cycle 2 is in progress, so it counts.
    expect(screen.getByText("2 of 4")).toBeTruthy();
    expect(screen.getByText("Open PRs Awaiting Your Review")).toBeTruthy();
  });

  it("counts only banked cycles during a break", () => {
    usePomodoroStore.setState({
      session: makeSession({ phase: "break", cycles_completed: 2 }),
      phase: "break",
      remaining: 252,
    });
    render(<PomodoroPanel />);
    expect(screen.getByText("Break")).toBeTruthy();
    expect(screen.getByText("2 of 4")).toBeTruthy();
    expect(screen.getByRole("button", { name: /skip break/i })).toBeTruthy();
  });

  it("hides cycle chrome for a single-cycle session", () => {
    usePomodoroStore.setState({
      session: makeSession({ cycles: 1, cycles_completed: 0 }),
      remaining: 1500,
    });
    render(<PomodoroPanel />);
    expect(screen.queryByText(/of 1/)).toBeNull();
  });

  it("keeps a running timer on screen when collapsed", async () => {
    const user = userEvent.setup();
    usePomodoroStore.setState({
      session: makeSession(),
      phase: "focus",
      remaining: 1493,
    });
    render(<PomodoroPanel />);

    await user.click(
      screen.getByRole("button", { name: /collapse focus timer/i }),
    );

    // The whole point of the docked panel: collapsing frees space without
    // hiding a live session, which is what closing the old widget did.
    expect(screen.getByText("24:53")).toBeTruthy();
    expect(screen.getByText("Focus")).toBeTruthy();
    expect(screen.getByText("2/4")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  });

  it("makes the whole row the disclosure, not just the chevron", async () => {
    const user = userEvent.setup();
    usePomodoroStore.setState({
      session: makeSession(),
      remaining: 1493,
      collapsed: true,
    });
    render(<PomodoroPanel />);

    const row = screen.getByRole("button", { name: /expand focus timer/i });
    expect(row.getAttribute("aria-expanded")).toBe("false");
    // The chevron repeats the row for the pointer; it must not surface as a
    // second control to assistive tech.
    expect(
      screen.getAllByRole("button", { name: /expand focus timer/i }),
    ).toHaveLength(1);

    await user.click(row);
    expect(usePomodoroStore.getState().collapsed).toBe(false);
  });

  it("treats the idle row as a disclosure that opens the form", async () => {
    const user = userEvent.setup();
    render(<PomodoroPanel />);

    const row = screen.getByRole("button", { name: /start focus/i });
    expect(row.getAttribute("aria-expanded")).toBe("false");

    await user.click(row);
    expect(screen.getByLabelText("Task (optional)")).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: /cancel new session/i })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("stops the session from the expanded panel", async () => {
    const user = userEvent.setup();
    rpcPomodoroStop.mockResolvedValue(
      makeSession({ status: "cancelled", ended_at: 1_700_000_900 }),
    );
    usePomodoroStore.setState({ session: makeSession(), remaining: 1493 });
    render(<PomodoroPanel />);

    await user.click(screen.getByRole("button", { name: "Stop" }));
    expect(rpcPomodoroStop).toHaveBeenCalled();
  });

  it("pauses from the collapsed strip", async () => {
    const user = userEvent.setup();
    rpcPomodoroPause.mockResolvedValue(
      makeSession({ status: "paused", remaining_at_pause: 1493 }),
    );
    usePomodoroStore.setState({
      session: makeSession(),
      remaining: 1493,
      collapsed: true,
    });
    render(<PomodoroPanel />);

    await user.click(screen.getByRole("button", { name: "Pause" }));
    expect(rpcPomodoroPause).toHaveBeenCalled();
  });
});

describe("PomodoroChip", () => {
  it("stays out of the way while the rail is open", () => {
    usePomodoroStore.setState({ session: makeSession(), remaining: 1493 });
    useTodoStore.setState({ sidebarOpen: true });
    const { container } = render(<PomodoroChip />);
    expect(container.firstChild).toBeNull();
  });

  it("carries the timer into the header when the rail is closed", () => {
    usePomodoroStore.setState({ session: makeSession(), remaining: 1493 });
    useTodoStore.setState({ sidebarOpen: false });
    render(<PomodoroChip />);
    expect(screen.getByText("24:53")).toBeTruthy();
    expect(screen.getByText("2/4")).toBeTruthy();
  });

  it("shows nothing when no session is live", () => {
    useTodoStore.setState({ sidebarOpen: false });
    const { container } = render(<PomodoroChip />);
    expect(container.firstChild).toBeNull();
  });

  it("reopens the rail and expands the panel when clicked", async () => {
    const user = userEvent.setup();
    usePomodoroStore.setState({
      session: makeSession(),
      remaining: 1493,
      collapsed: true,
    });
    useTodoStore.setState({ sidebarOpen: false });
    render(<PomodoroChip />);

    await user.click(screen.getByRole("button"));
    expect(useTodoStore.getState().sidebarOpen).toBe(true);
    expect(usePomodoroStore.getState().collapsed).toBe(false);
  });
});
