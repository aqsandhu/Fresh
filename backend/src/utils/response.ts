// ============================================================================
// API RESPONSE HELPERS
// ============================================================================

import { Response } from 'express';
import { ApiResponse } from '../types';

// Success response
export const successResponse = <T>(
  res: Response,
  data: T,
  message: string = 'Success',
  statusCode: number = 200,
  meta?: any
): void => {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
  };
  
  if (meta) {
    response.meta = meta;
  }
  
  res.status(statusCode).json(response);
};

// Error response
export const errorResponse = (
  res: Response,
  message: string = 'Error',
  statusCode: number = 500,
  error?: any
): void => {
  const response: ApiResponse = {
    success: false,
    message,
  };
  
  if (error && process.env.NODE_ENV !== 'production') {
    response.error = error;
  }
  
  res.status(statusCode).json(response);
};

// Pagination response
export const paginatedResponse = <T>(
  res: Response,
  data: T[],
  page: number,
  limit: number,
  total: number,
  message: string = 'Success'
): void => {
  const totalPages = Math.ceil(total / limit);
  
  successResponse(res, data, message, 200, {
    page,
    limit,
    total,
    totalPages,
  });
};

// Common response helpers
export const createdResponse = <T>(res: Response, data: T, message: string = 'Created'): void => {
  successResponse(res, data, message, 201);
};

export const noContentResponse = (res: Response): void => {
  res.status(204).send();
};

export const badRequestResponse = (res: Response, message: string, error?: any): void => {
  errorResponse(res, message, 400, error);
};

export const unauthorizedResponse = (res: Response, message: string = 'Unauthorized'): void => {
  errorResponse(res, message, 401);
};

export const forbiddenResponse = (res: Response, message: string = 'Forbidden'): void => {
  errorResponse(res, message, 403);
};

export const notFoundResponse = (res: Response, message: string = 'Not found'): void => {
  errorResponse(res, message, 404);
};

export const conflictResponse = (res: Response, message: string): void => {
  errorResponse(res, message, 409);
};

export const validationErrorResponse = (res: Response, errors: any[]): void => {
  errorResponse(res, 'Validation failed', 422, errors);
};

export const tooManyRequestsResponse = (res: Response, message: string = 'Too many requests'): void => {
  errorResponse(res, message, 429);
};
