import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  errors?: unknown[];
  meta?: Record<string, unknown>;
}

export function sendSuccess<T>(
  res: Response,
  message: string,
  data?: T,
  statusCode = 200,
  meta?: Record<string, unknown>
): Response {
  const response: ApiResponse<T> = { success: true, message };
  if (data !== undefined) response.data = data;
  if (meta) response.meta = meta;
  return res.status(statusCode).json(response);
}

export function sendError(
  res: Response,
  message: string,
  statusCode = 400,
  errors?: unknown[]
): Response {
  const response: ApiResponse = { success: false, message };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
}

export function sendCreated<T>(res: Response, message: string, data?: T): Response {
  return sendSuccess(res, message, data, 201);
}

export function sendUnauthorized(res: Response, message = 'Unauthorized'): Response {
  return sendError(res, message, 401);
}

export function sendForbidden(res: Response, message = 'Forbidden'): Response {
  return sendError(res, message, 403);
}

export function sendNotFound(res: Response, message = 'Resource not found'): Response {
  return sendError(res, message, 404);
}

export function sendConflict(res: Response, message: string): Response {
  return sendError(res, message, 409);
}

export function sendServerError(res: Response, message = 'Internal server error'): Response {
  return sendError(res, message, 500);
}
