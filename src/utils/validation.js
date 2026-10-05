import { MAX_PROJECT_NAME } from '../constants.js';

export function validateProjectName(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Give your project a name.');
  }
  const name = value.trim();
  if (name.length > MAX_PROJECT_NAME) {
    throw new Error(`Project names can have up to ${MAX_PROJECT_NAME} characters.`);
  }
  return name;
}

export function isTimestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

export function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
