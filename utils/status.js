const { EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');
const https = require('https');

let statusMessageId = null;
const LAUNCH_DATE = new Date('2025-12-01');

const statusEmoji = {
  operational: '🟢',
  degraded: '🟡',
  outage: '🔴',
};

const severityEmoji = {
  minor: '🟡',
  major: '🟠',
  critical: '🔴',
};

const serviceLabels = {
  bot: '🤖 Bot',
  database: '🗄️ Database',
  website: '🌐 Website',
  tts_audio: '🔊 TTS / Audio',
  onscreen_alerts: '📺 Onscreen Alerts',
  razorpay: '💳 Razorpay Payments',
};

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

async function pingWebsite(url) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = https.get(url, (res) => {
      const ping = Date.now() - start;
      resolve({ online: res.statusCode < 500, ping });
    });
    req.on('error', () => resolve({ online: false, ping: null }));
    req.setTimeout(5000, () => {
      req.destroy();
      resolve({ online: false, ping: null });
    });
  });
}

async function getServiceStatuses() {
  const { data } = await supabase
    .from('system_status')
    .select('service, status, message');
  return data || [];
}

async function getActiveIncidents() {
  const { data } = await supabase
    .from('incidents')
    .select('title, severity, status, created_at')
    .neq('status', 'resolved')
    .order('created_at', { ascending: false });
  return data || [];
}

async function getUpcomingMaintenance() {
  const { data } = await supabase
    .from('maintenance')
    .select('title, scheduled_at, duration_minutes')
    .gte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });
  return data || [];
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

    const [dbPing, websitePing, services, incidents, maintenance] = await Promise.all([
      getSupabaseStatus(),
      pingWebsite('https://hyperchat.space/'),
      getServiceStatuses(),
      getActiveIncidents(),
      getUpcomingMaintenance(),
    ]);

    const allOperational = services.every(s => s.status === 'operational') && dbPing.online && websitePing.online;

    const fields = [];

    for (const svc of services) {
      const emoji = statusEmoji[svc.status] || '⚪';
      const label = serviceLabels[svc.service] || svc.service;
      let value = `\`${emoji} ${svc.status.charAt(0).toUpperCase() + svc.status.slice(1)}\``;
      if (svc.message) value += `\n${svc.message}`;

      // Override with live ping for database
      if (svc.service === 'database') {
        value = dbPing.online ? `\`🟢 Online · ${dbPing.ping}ms\`` : '`🔴 Offline`';
      }

      // Override with live ping for website
      if (svc.service === 'website') {
        value = websitePing.online
          ? `\`🟢 Online · ${websitePing.ping}ms\``
          : '`🔴 Offline`';
      }

      fields.push({ name: label, value, inline: true });
    }

    // Uptime fields
    fields.push(
      { name: '⏱️ Bot Uptime', value: `\`${getBotUptime()}\``, inline: true },
      { name: '🚀 Since Launch', value: `\`${getDaysSinceLaunch()} days\``, inline: true },
      { name: '\u200b', value: '\u200b', inline: true },
    );

    // Incidents
    const incidentValue = incidents.length > 0
      ? incidents.map(i => `${severityEmoji[i.severity]} **${i.title}** — ${i.status}`).join('\n')
      : 'No active incidents';
    fields.push({ name: '🔔 Incidents', value: incidentValue, inline: false });

    // Maintenance
    const maintenanceValue = maintenance.length > 0
      ? maintenance.map(m => {
          const date = new Date(m.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
          return `🔧 **${m.title}** — ${date} IST${m.duration_minutes ? ` (${m.duration_minutes} mins)` : ''}`;
        }).join('\n')
      : 'No scheduled maintenance';
    fields.push({ name: '🔧 Maintenance', value: maintenanceValue, inline: false });

    const embed = new EmbedBuilder()
      .setTitle('HyperChat System Status')
      .setDescription(allOperational
        ? '```\n✅  All systems operational\n```'
        : '```\n⚠️  Some systems experiencing issues\n```')
      .setColor(allOperational ? 0x57f287 : 0xed4245)
      .addFields(fields)
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
