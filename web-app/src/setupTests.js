import '@testing-library/jest-dom';
import { TextDecoder, TextEncoder } from 'util';

// React Router 7 uses the Encoding API. Node provides the implementation, but
// jsdom does not expose it by default.
globalThis.TextEncoder = TextEncoder;
globalThis.TextDecoder = TextDecoder;
