// helper/exchangeRate.js
// Real-time currency exchange rate helper

const fetch = require("node-fetch");
const { query } = require("../database/dbpromise");

/**
 * Get current USD to INR exchange rate from free API
 * Falls back to cached rate if API fails
 */
async function getCurrentExchangeRate() {
  try {
    // Using exchangerate-api.com (free, no API key required)
    const response = await fetch(
      "https://api.exchangerate-api.com/v4/latest/USD"
    );
    const data = await response.json();

    if (data && data.rates && data.rates.INR) {
      const rate = data.rates.INR;
      
      // Cache the rate in database for fallback
      await query(
        `UPDATE web_public SET exchange_rate = ? WHERE id = 1`,
        [rate]
      );

      console.log(`✅ Live exchange rate fetched: 1 USD = ${rate} INR`);
      return rate;
    }

    // Fallback to database if API response is invalid
    return await getCachedExchangeRate();
  } catch (error) {
    console.error("❌ Error fetching live exchange rate:", error.message);
    // Fallback to cached rate from database
    return await getCachedExchangeRate();
  }
}

/**
 * Get cached exchange rate from database
 */
async function getCachedExchangeRate() {
  try {
    const [webPublic] = await query(`SELECT exchange_rate FROM web_public WHERE id = 1`);
    
    if (webPublic && webPublic.exchange_rate) {
      const rate = parseFloat(webPublic.exchange_rate);
      console.log(`📦 Using cached exchange rate: 1 USD = ${rate} INR`);
      return rate;
    }

    // Ultimate fallback to current market rate
    console.log("⚠️ No cached rate found, using default: 83 INR");
    return 83.0;
  } catch (error) {
    console.error("❌ Error getting cached rate:", error.message);
    return 83.0; // Hardcoded fallback
  }
}

/**
 * Convert USD amount to INR using live exchange rate
 * @param {number} usdAmount - Amount in USD
 * @param {boolean} useLiveRate - Whether to fetch live rate (default: true)
 * @returns {Promise<number>} - Amount in INR
 */
async function convertUSDtoINR(usdAmount, useLiveRate = true) {
  try {
    const exchangeRate = useLiveRate
      ? await getCurrentExchangeRate()
      : await getCachedExchangeRate();

    const inrAmount = parseFloat(usdAmount) * exchangeRate;
    
    console.log(`💱 Conversion: $${usdAmount} USD = ₹${inrAmount.toFixed(2)} INR (Rate: ${exchangeRate})`);
    
    return Math.round(inrAmount); // Round to nearest rupee
  } catch (error) {
    console.error("❌ Conversion error:", error.message);
    // Fallback calculation
    return Math.round(parseFloat(usdAmount) * 83);
  }
}

/**
 * Manually set exchange rate (for admin control)
 * @param {number} rate - Exchange rate to set
 */
async function setExchangeRate(rate) {
  try {
    await query(
      `UPDATE web_public SET exchange_rate = ? WHERE id = 1`,
      [rate]
    );
    console.log(`✅ Exchange rate manually set to: 1 USD = ${rate} INR`);
    return true;
  } catch (error) {
    console.error("❌ Error setting exchange rate:", error.message);
    return false;
  }
}

/**
 * Get exchange rate info (current live vs cached)
 */
async function getExchangeRateInfo() {
  try {
    const cachedRate = await getCachedExchangeRate();
    const liveRate = await getCurrentExchangeRate();
    
    return {
      cached: cachedRate,
      live: liveRate,
      difference: Math.abs(liveRate - cachedRate).toFixed(2),
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("❌ Error getting rate info:", error.message);
    return null;
  }
}

module.exports = {
  getCurrentExchangeRate,
  getCachedExchangeRate,
  convertUSDtoINR,
  setExchangeRate,
  getExchangeRateInfo,
};
