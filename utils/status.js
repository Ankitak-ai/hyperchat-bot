const { EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

let statusMessageId = null;

async function getSupabaseStatus() {
  try {
    const start = Date.now();
    await supabase.from('creator_applications').select('id').limit(1);
    const ping = Date.now() - start;
    return { online: true, ping };
  } catch {
    return { online: false, ping: null };
  }
}

function getUptimeString() {
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

async function updateStatus(client) {
  try {
    const statusChannel = await client.channels.fetch(process.env.STATUS_CHANNEL_ID);
    if (!statusChannel) return;

    const dbStatus = await getSupabaseStatus();

    const embed = new EmbedBuilder()
      .setTitle('📊 HyperChat System Status')
      .setColor(dbStatus.online ? 0x57f287 : 0xff0000)
      .addFields(
        {
          name: '🤖 Bot',
          value: '🟢 Online',
          inline: true,
        },
        {
          name: '🗄️ Database',
          value: dbStatus.online ? `🟢 Online (${dbStatus.ping}ms)` : '🔴 Offline',
          inline: true,
        },
        {
          name: '⏱️ Uptime',
          value: getUptimeString(),
          inline: true,
        },
        {
          name: '🔔 Incidents',
          value: 'No active incidents',
          inline: false,
        },
        {
          name: '🔧 Maintenance',
          value: 'No scheduled maintenance',
          inline: false,
        },
      )
      .setFooter({ text: 'Last updated' })
      .setTimestamp();

    if (statusMessageId) {
      try {
        const existing = await statusChannel.messages.fetch(statusMessageId);
        await existing.edit({ embeds: [embed] });
        return;
      } catch {
        statusMessageId = null;
      }
    }

    // Post new status message
    const messages = await statusChannel.messages.fetch({ limit: 10 });
    const botMessage = messages.find(m => m.author.id === client.user.id);

    if (botMessage) {
      statusMessageId = botMessage.id;
      await botMessage.edit({ embeds: [embed] });
    } else {
      const sent = await statusChannel.send({ embeds: [embed] });
      statusMessageId = sent.id;
    }
  } catch (err) {
    console.error('Status update error:', err);
  }
}

module.exports = { updateStatus };
