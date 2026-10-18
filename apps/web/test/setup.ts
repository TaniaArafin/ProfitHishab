import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

// jsdom lacks the pointer-capture and scroll APIs Radix Select calls when it opens.
const elementProto = Element.prototype as unknown as Record<string, unknown>;
const missing = { hasPointerCapture: () => false, releasePointerCapture: () => {}, scrollIntoView: () => {} };
for (const [key, stub] of Object.entries(missing)) elementProto[key] ??= stub;
