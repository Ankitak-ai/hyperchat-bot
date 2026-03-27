const { EmbedBuilder } = require('discord.js');

async function log(client, action, details, color = 0x5865f2) {
  try {
    const logsChannel = await client.channels.fetch(process.env.LOGS_CHANNEL_ID);
    
    const embed = new EmbedBuilder()
      .setTitle(`📋 ${action}`)
      .setColor(color)
      .setDescription(details)
      .setTimestamp();

    await logsChannel.send({ embeds: [embed] });
  } catch (err) {
    console.error('Logger error:', err);
  }
}

module.exports = { log };
