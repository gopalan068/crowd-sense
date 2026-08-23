/**
 * backend/src/services/groqPlaybookService.js
 * Proxy wrapper delegating to geminiPlaybookService.js for Gemini LLM migration.
 */
'use strict';

module.exports = require('./geminiPlaybookService');
