import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RequireAuth } from "./RequireAuth";
import { useAuth } from "./AuthContext";

vi.mock("./AuthContext");

describe("RequireAuth", () => {
  it("triggers login() and shows a placeholder when there's no user", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login,
      logout: vi.fn(),
      getAccessToken: async () => undefined,
    } as any);

    render(
      <RequireAuth>
        <p>protected content</p>
      </RequireAuth>
    );

    expect(screen.getByText("Signing in…")).toBeInTheDocument();
    // Remembers where to come back to after the IdP round-trip.
    await waitFor(() => expect(login).toHaveBeenCalledWith("/"));
  });

  it("renders children once a user is present", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { profile: { sub: "user-123" } },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: async () => "token",
    } as any);

    render(
      <RequireAuth>
        <p>protected content</p>
      </RequireAuth>
    );

    expect(screen.getByText("protected content")).toBeInTheDocument();
  });
});
