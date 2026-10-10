const fs = require('fs');
const path = require('path');

/**
 * Read auction timing values fresh from the .env file on every call.
 * This ensures that changes to .env are reflected immediately
 * without needing to restart the server.
 */
const getAuctionTimings = () => {
  try {
    const envPath = path.resolve(__dirname, '..', '..', '..', '.env');
    const envContent = fs.readFileSync(envPath, 'utf8');

    let bidWaitHours = 72;   // default fallback
    let paymentHours = 72;   // default fallback

    for (const line of envContent.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;

      const [key, ...rest] = trimmed.split('=');
      const value = rest.join('=').trim();

      if (key.trim() === 'AUCTION_BID_WAIT_HOURS') {
        const parsed = parseFloat(value);
        if (!isNaN(parsed) && parsed > 0) bidWaitHours = parsed;
      }
      if (key.trim() === 'AUCTION_PAYMENT_HOURS') {
        const parsed = parseFloat(value);
        if (!isNaN(parsed) && parsed > 0) paymentHours = parsed;
      }
    }

    return { bidWaitHours, paymentHours };
  } catch (err) {
    console.error('Error reading .env for auction timings:', err.message);
    // Fall back to process.env (loaded at startup)
    return {
      bidWaitHours: parseFloat(process.env.AUCTION_BID_WAIT_HOURS) || 72,
      paymentHours: parseFloat(process.env.AUCTION_PAYMENT_HOURS) || 72,
    };
  }
};

module.exports = { getAuctionTimings };
