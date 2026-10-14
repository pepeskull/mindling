// Production has its own gate and identity authentication; Gemini stays server-only.
module.exports = require('../src/server/learning.cjs').createHandler({ mode: 'production' });
