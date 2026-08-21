/**
 * backend/src/services/notifications.js
 * Twilio SMS / WhatsApp Dispatch Integration with UI Demo Fallback.
 *
 * Implements Section 8 blueprint requirement:
 *   Builds a demo mode fallback that fakes delivery in the UI when Twilio credentials
 *   or venue wifi are unavailable.
 */
'use strict';

const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM = process.env.TWILIO_PHONE_NUMBER;

let twilioClient = null;
if (TWILIO_SID && TWILIO_AUTH) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(TWILIO_SID, TWILIO_AUTH);
    console.log('[Notification] Twilio SMS client initialized.');
  } catch (err) {
    console.warn('[Notification] Twilio package not available, falling back to UI Demo Mode.');
  }
}

/**
 * Dispatch emergency notification over Twilio or UI Fallback Logger.
 * @param {Object} options - { to, message, zone_id, is_panic }
 * @returns {Promise<Object>}
 */
async function sendEmergencyNotification({ to = '+15005550006', message, zone_id, is_panic = false }) {
  const timestamp = new Date().toISOString();

  if (twilioClient && TWILIO_FROM) {
    try {
      const res = await twilioClient.messages.create({
        body: message,
        from: TWILIO_FROM,
        to,
      });
      console.log(`[Notification] Twilio SMS dispatched SID=${res.sid}`);
      return {
        status: 'sent',
        channel: 'twilio_sms',
        sid: res.sid,
        timestamp,
        is_simulation: false,
      };
    } catch (err) {
      console.warn('[Notification] Twilio dispatch failed, falling back to UI Demo Mode:', err.message);
    }
  }

  // UI Demo Mode Fallback (Not optional per Section 8 blueprint)
  console.log(`[Notification Demo Mode] SIMULATED DISPATCH: zone=${zone_id} msg="${message}"`);
  return {
    status: 'simulated_demo_mode',
    channel: 'ui_mock_toast',
    message,
    zone_id,
    timestamp,
    is_simulation: true,
  };
}

module.exports = {
  sendEmergencyNotification,
};
