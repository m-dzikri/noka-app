import { NextResponse } from "next/server";
import { logger, type Logger } from "@/lib/logger";

export interface ApiSuccessEnvelope<T> {
  ok: true;
  data: T;
}

export interface ApiErrorEnvelope {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

/**
 * Domain or request error carrying semantic HTTP status and structured API error metadata.
 */
export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Builds a standardized API success response matching API-1.
 */
export function apiOk<T>(data: T, status = 200): NextResponse<ApiSuccessEnvelope<T>> {
  return NextResponse.json({ ok: true, data }, { status });
}

/**
 * Builds a standardized API error response matching API-1.
 */
export function apiError(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse<ApiErrorEnvelope> {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code,
        message,
        ...(details !== undefined ? { details } : {}),
      },
    },
    { status },
  );
}

/**
 * Converts known and unexpected errors into sanitized HTTP error responses.
 */
export function handleApiError(error: unknown, log: Logger = logger): NextResponse<ApiErrorEnvelope> {
  if (error instanceof ApiError) {
    if (error.status >= 500) {
      log.error("api.error", {
        status: error.status,
        code: error.code,
        error,
      });
    }
    return apiError(error.status, error.code, error.message, error.details);
  }

  if (error instanceof SyntaxError) {
    return apiError(400, "INVALID_JSON", "Malformed JSON request body");
  }

  log.error("api.unhandled_error", { error });
  return apiError(500, "INTERNAL_ERROR", "Internal server error");
}

