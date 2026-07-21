/**
 * Mock for Baileys WhatsApp Library
 * Used in tests to avoid ES module issues
 */

module.exports = {
  default: jest.fn(() => ({
    sendMessage: jest.fn(),
    ev: {
      on: jest.fn(),
      off: jest.fn()
    }
  })),
  useMultiFileAuthState: jest.fn(),
  DisconnectReason: {
    loggedOut: 'logged_out',
    connectionClosed: 'connection_closed',
    connectionLost: 'connection_lost',
    connectionReplaced: 'connection_replaced',
    timedOut: 'timed_out',
    badSession: 'bad_session'
  },
  Browsers: {
    ubuntu: jest.fn(() => ['Ubuntu', '20.04', '1.0'])
  },
  makeInMemoryStore: jest.fn(),
  delay: jest.fn(),
  fetchLatestBaileysVersion: jest.fn(() => Promise.resolve({ version: [2, 3000, 0] }))
};
