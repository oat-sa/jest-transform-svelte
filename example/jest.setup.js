import 'jest-environment-jsdom';

// Ensure document is available
if (typeof document === 'undefined') {
    global.document = {};
}