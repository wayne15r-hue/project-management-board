// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const auth = vi.hoisted(() => ({ signUp: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), getUser: vi.fn(), push: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ auth }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: auth.push, refresh: auth.refresh }) }));
import SignupPage from "@/app/(auth)/signup/page";
import ResetPasswordPage from "@/app/(auth)/reset-password/page";
import UpdatePasswordPage from "@/app/(auth)/update-password/page";
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });
function signupForm() {
  render(<SignupPage />);
  fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "User" } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "u@example.test" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Password12!" } });
  fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Password12!" } });
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
}
describe("account lifecycle", () => {
  it("asks users to confirm signup email when no session is returned", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null, user: { id: "u" } }, error: null });
    signupForm();
    await screen.findByText(/check your email/i);
    expect(auth.push).not.toHaveBeenCalled();
    expect(auth.signUp.mock.calls[0][0].options.emailRedirectTo).toMatch(/\/callback\?next=%2Fdashboard$/);
  });
  it("opens dashboard only for immediate signup sessions", async () => {
    auth.signUp.mockResolvedValue({ data: { session: { access_token: "session" }, user: { id: "u" } }, error: null });
    signupForm(); await waitFor(() => expect(auth.push).toHaveBeenCalledWith("/dashboard"));
  });
  it("requests a recovery email with the callback update destination", async () => {
    auth.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
    render(<ResetPasswordPage />);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "u@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
    await screen.findByText(/check your email/i);
    expect(auth.resetPasswordForEmail.mock.calls[0]).toEqual(["u@example.test", { redirectTo: `${window.location.origin}/callback?next=%2Fupdate-password` }]);
  });
  it("shows an expired recovery link and does not accept password changes without a session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: null }, error: { message: "Expired" } });
    render(<UpdatePasswordPage />);
    await screen.findByText(/expired or invalid/i);
    expect(screen.queryByRole("button", { name: "Update password" })).toBeNull();
  });
  it("updates the password for a valid recovery session", async () => {
    auth.getUser.mockResolvedValue({ data: { user: { id: "u" } }, error: null });
    auth.updateUser.mockResolvedValue({ data: {}, error: null });
    render(<UpdatePasswordPage />);
    fireEvent.change(await screen.findByLabelText("New password"), { target: { value: "Password12!" } });
    fireEvent.change(screen.getByLabelText("Confirm password"), { target: { value: "Password12!" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(auth.push).toHaveBeenCalledWith("/dashboard"));
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "Password12!" });
  });
});
