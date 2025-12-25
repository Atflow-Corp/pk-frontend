/**
 * snake_case ↔ camelCase 변환 유틸리티
 */

/**
 * 문자열을 camelCase로 변환
 * 예: "user_name" -> "userName"
 */
export const toCamelCase = (str: string): string => {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
};

/**
 * 문자열을 snake_case로 변환
 * 예: "userName" -> "user_name"
 */
export const toSnakeCase = (str: string): string => {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
};

/**
 * 객체의 모든 키를 camelCase로 변환 (재귀적)
 */
export const toCamelCaseKeys = <T = unknown>(obj: unknown): T => {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(toCamelCaseKeys) as T;
  }

  if (typeof obj !== "object") {
    return obj as T;
  }

  return Object.keys(obj as Record<string, unknown>).reduce((acc, key) => {
    const camelKey = toCamelCase(key);
    acc[camelKey] = toCamelCaseKeys((obj as Record<string, unknown>)[key]);
    return acc;
  }, {} as Record<string, unknown>) as T;
};

/**
 * 객체의 모든 키를 snake_case로 변환 (재귀적)
 */
export const toSnakeCaseKeys = <T = unknown>(obj: unknown): T => {
  if (obj === null || obj === undefined) {
    return obj as T;
  }

  if (Array.isArray(obj)) {
    return obj.map(toSnakeCaseKeys) as T;
  }

  if (typeof obj !== "object") {
    return obj as T;
  }

  return Object.keys(obj as Record<string, unknown>).reduce((acc, key) => {
    const snakeKey = toSnakeCase(key);
    acc[snakeKey] = toSnakeCaseKeys((obj as Record<string, unknown>)[key]);
    return acc;
  }, {} as Record<string, unknown>) as T;
};
