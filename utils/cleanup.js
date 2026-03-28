async function runCleanup(client) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;

    const channels = await guild.channels.fetch();

    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const channel of channels.values()) {
      if (!channel || !channel.name) continue;

      // Clean up closed ticket channels
      if (channel.name.startsWith('closed-')) {
        const messages = await channel.messages.fetch({ limit: 1 }).catch(() => null);
        if (!messages) continue;

        const lastMessage = messages.first();
        const lastActivity = lastMessage ? lastMessage.createdTimestamp : channel.createdTimestamp;

        if (now - lastActivity > maxAge) {
          console.log(`🧹 Deleting old channel: ${channel.name}`);
          await channel.delete().catch(console.error);
        }
      }
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

module.exports = { runCleanup };
