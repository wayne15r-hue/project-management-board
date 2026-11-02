import { NextResponse } from "next/server";
/** Keep expected workflow conflicts useful while hiding unexpected database internals. */
export function workflowError(error: { code?: string; message?: string }) {
  const status = error.code === "42501" ? 403
    : ["40001", "23514", "23505", "40P01"].includes(error.code ?? "") ? 409
    : error.code?.startsWith("22") ? 400 : 500;
  return { status, message: status === 500 ? "Unable to update workflow. Please retry." : error.message ?? "Workflow changed. Please refresh." };
}
export function workflowErrorResponse(error: { code?: string; message?: string }) {
  const result = workflowError(error);
  return NextResponse.json({ error: result.message }, { status: result.status });
}
