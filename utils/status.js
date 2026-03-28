const { EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

let statusMessageId = null;

const LAUNCH_DATE = new Date('2025-12-01');

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

function getBotUptime() {
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor((uptime % 86400) / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  return `${days}d ${hours}h ${minutes}m`;
}

function getDaysSinceLaunch() {
  const now = new Date();
  const diff = now - LAUNCH_DATE;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

async function updateStatus(client) {
  try {
    const statusChannel = await client.channels.fetch(process.env.STATUS_CHANNEL_ID);
    if (!statusChannel) return;

    const dbStatus = await getSupabaseStatus();
    const allOnline = dbStatus.online;

    const embed = new EmbedBuilder()
      .setTitle('HyperChat System Status')
      .setDescription(
        allOnline
          ? '```\n✅  All systems operational\n```'
          : '```\n⚠️  Some systems experiencing issues\n```'
      )
      .setColor(allOnline ? 0x57f287 : 0xed4245)
      .addFields(
        {
          name: '🤖 Bot Status',
          value: '```\n🟢 Online\n```',
          inline: true,
        },
        {
          name: '🗄️ Database',
          value: dbStatus.online
            ? `\`\`\`\n🟢 Online · ${dbStatus.ping}ms\n\`\`\``
            : '```\n🔴 Offline\n```',
          inline: true,
        },
        {
          name: '⏱️ Bot Uptime',
          value: `\`\`\`\n${getBotUptime()}\n\`\`\``,
          inline: true,
        },
        {
          name: '🚀 Since Launch',
          value: `\`\`\`\n${getDaysSinceLaunch()} days\n\`\`\``,
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
