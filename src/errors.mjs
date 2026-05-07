/**
 * Error classes for Regolo API handling
 */

// Base error class for Regolo API errors
export class RegoloApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'RegoloApiError';
    this.statusCode = statusCode;
  }
}

// Timeout-specific error
export class TimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

// Rate limit error from Regolo API
export class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded') {
    super(message);
    this.name = 'RateLimitError';
  }
}

// Map HTTP status codes to user-friendly messages
export const errorMessages = {
  401: 'Invalid API key',
  429: 'Rate limit exceeded',
  500: 'Server error',
  timeout: 'Model timed out (30s)'
};

/**
 * Get user-friendly error message from HTTP status or error type
 */
export function getUserFriendlyError(statusOrError) {
  if (statusOrError === 'timeout') {
    return errorMessages.timeout;
  }
  return errorMessages[statusOrError] || 'Unknown error';
}