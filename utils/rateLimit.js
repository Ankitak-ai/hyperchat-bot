const cooldowns = new Map();

/**
 * Check if a user is rate limited
 * @param {string} userId 
 * @param {string} action 
 * @param {number} limitMs - cooldown in milliseconds
 * @returns {number|null} - remaining ms if limited, null if allowed
 */
function checkRateLimit(userId, action, limitMs) {
  const key = `${userId}_${action}`;
  const now = Date.now();

  if (cooldowns.has(key)) {
    const lastUsed = cooldowns.get(key);
    const remaining = limitMs - (now - lastUsed);
    if (remaining > 0) return remaining;
  }

  cooldowns.set(key, now);
  return null;
}

/**
 * Format milliseconds to human readable
 */
function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

module.exports = { checkRateLimit, formatTime };
