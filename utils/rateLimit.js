const cooldowns = new Map();

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

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

module.exports = { checkRateLimit, formatTime };
