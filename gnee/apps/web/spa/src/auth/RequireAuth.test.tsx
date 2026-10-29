import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RequireAuth } from "./RequireAuth";
import { useAuth } from "./AuthContext";

vi.mock("./AuthContext");

describe("RequireAuth", () => {
  it("triggers login() and shows a placeholder when there's no user", async () => {
    const login = vi.fn();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login,
      logout: vi.fn(),
      getAccessToken: () => null,
    } as any);

    render(
      <RequireAuth>
        <p>protected content</p>
      </RequireAuth>
    );

    expect(screen.getByText("Signing in…")).toBeInTheDocument();
    await waitFor(() => expect(login).toHaveBeenCalled());
  });

  it("renders children once a user is present", () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { profile: { sub: "user-123" } },
      isLoading: false,
      login: vi.fn(),
      logout: vi.fn(),
      getAccessToken: () => "token",
    } as any);

    render(
      <RequireAuth>
        <p>protected content</p>
      </RequireAuth>
    );

    expect(screen.getByText("protected content")).toBeInTheDocument();
  });
});
