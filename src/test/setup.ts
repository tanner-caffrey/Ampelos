/**
 * Vitest Global Test Setup
 *
 * This file runs before all tests to set up global mocks and configuration.
 */

import { vi } from 'vitest';

// Mock console methods to reduce noise during tests (optional - can be removed)
// vi.spyOn(console, 'log').mockImplementation(() => {});
// vi.spyOn(console, 'debug').mockImplementation(() => {});

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LETTA_SERVER_URL = 'http://localhost:8283';
