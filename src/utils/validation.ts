/**
 * Input validation utilities for security
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates a string input for basic security
 */
export function validateString(
  input: string | undefined | null,
  fieldName: string,
  options: {
    required?: boolean;
    maxLength?: number;
    minLength?: number;
    allowEmpty?: boolean;
  } = {}
): string {
  const { required = true, maxLength = 1000, minLength = 0, allowEmpty = true } = options;

  // Check for null/undefined
  if (input === null || input === undefined) {
    if (required) {
      throw new ValidationError(`${fieldName} is required`);
    }
    return '';
  }

  // Convert to string if not already
  const str = String(input);

  // Check if empty
  if (!allowEmpty && str.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`);
  }

  // Check length constraints
  if (str.length < minLength) {
    throw new ValidationError(`${fieldName} must be at least ${minLength} characters`);
  }

  if (str.length > maxLength) {
    throw new ValidationError(`${fieldName} exceeds maximum length of ${maxLength} characters`);
  }

  // Basic XSS prevention - remove potentially dangerous characters
  const cleaned = str.replace(/[<>]/g, '');

  return cleaned;
}

/**
 * Validates a Firebase document ID
 */
export function validateDocumentId(id: string, fieldName: string = 'Document ID'): string {
  const validated = validateString(id, fieldName, {
    required: true,
    maxLength: 100,
    minLength: 1,
    allowEmpty: false
  });

  // Firebase document ID restrictions
  if (!/^[a-zA-Z0-9_-]+$/.test(validated)) {
    throw new ValidationError(`${fieldName} contains invalid characters. Only alphanumeric, underscore, and hyphen allowed`);
  }

  return validated;
}

/**
 * Validates an email address
 */
export function validateEmail(email: string): string {
  const validated = validateString(email, 'Email', {
    required: true,
    maxLength: 254,
    allowEmpty: false
  });

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(validated)) {
    throw new ValidationError('Invalid email format');
  }

  return validated.toLowerCase().trim();
}

/**
 * Validates a numeric input
 */
export function validateNumber(
  input: number | string | undefined | null,
  fieldName: string,
  options: {
    required?: boolean;
    min?: number;
    max?: number;
    integer?: boolean;
  } = {}
): number {
  const { required = true, min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, integer = false } = options;

  if (input === null || input === undefined) {
    if (required) {
      throw new ValidationError(`${fieldName} is required`);
    }
    return 0;
  }

  const num = Number(input);

  if (isNaN(num)) {
    throw new ValidationError(`${fieldName} must be a valid number`);
  }

  if (integer && !Number.isInteger(num)) {
    throw new ValidationError(`${fieldName} must be an integer`);
  }

  if (num < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`);
  }

  if (num > max) {
    throw new ValidationError(`${fieldName} must not exceed ${max}`);
  }

  return num;
}

/**
 * Validates an array of strings
 */
export function validateStringArray(
  input: string[] | undefined | null,
  fieldName: string,
  options: {
    required?: boolean;
    maxItems?: number;
    maxItemLength?: number;
  } = {}
): string[] {
  const { required = true, maxItems = 100, maxItemLength = 500 } = options;

  if (input === null || input === undefined) {
    if (required) {
      throw new ValidationError(`${fieldName} is required`);
    }
    return [];
  }

  if (!Array.isArray(input)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }

  if (input.length > maxItems) {
    throw new ValidationError(`${fieldName} cannot have more than ${maxItems} items`);
  }

  return input.map((item, index) =>
    validateString(item, `${fieldName}[${index}]`, {
      required: true,
      maxLength: maxItemLength,
      allowEmpty: false
    })
  );
}

/**
 * Sanitizes HTML content
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}