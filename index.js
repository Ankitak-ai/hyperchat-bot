require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const applyCommand = require('./commands/apply');
const activateCommand = require('./commands/activate');
const approvalHandler = require('./handlers/approval');
const ticketHandler = require('./handlers/ticket');
const { log } = require('./utils/logger');
const { checkRateLimit, formatTime } = require('./utils/rateLimit');
const { runCleanup } = require('./utils/cleanup');
const { updateStatus } = require('./utils/status');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

/* -------------------- ENV VALIDATION -------------------- */

const requiredEnv = [
  'DISCORD_TOKEN',
  'CLIENT_ID',
  'GUILD_ID',
  'APPLICATION_CHANNEL_ID',
  'SUPPORT_CATEGORY_ID',
  'CREATOR_ROLE_ID',
  'CREATOR_PENDING_ROLE_ID',
  'LOGS_CHANNEL_ID',
  'ANNOUNCEMENTS_CHANNEL_ID',
  'GUEST_ROLE_ID',
  'SCHEDULED_ROLE_ID',
  'SCHEDULING_CHANNEL_ID',
  'ONBOARDING_CATEGORY_ID',
  'STATUS_CHANNEL_ID',
];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.error(`Missing ENV: ${key}`);
    process.exit(1);
  }
});

/* -------------------- READY -------------------- */

client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const welcomeChannel = guild.channels.cache.find((c) => c.name === 'welcome');

  if (welcomeChannel) {
    const messages = await welcomeChannel.messages.fetch({ limit: 10 });
    const exists = messages.find((m) => m.author.id === client.user.id && m.components.length > 0);

    if (!exists) {
      const embed = new EmbedBuilder()
        .setTitle('🚀 Welcome to HyperChat')
        .setDescription('Apply to become a creator or get support below.')
        .setColor(0x5865f2);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('start_apply').setLabel('Apply as Creator').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('create_ticket').setLabel('Get Support').setStyle(ButtonStyle.Secondary)
      );

      await welcomeChannel.send({ embeds: [embed], components: [row] });
    }
  }

  // Status + cleanup always run regardless
  await updateStatus(client);
  setInterval(() => updateStatus(client), 5 * 60 * 1000);
  setInterval(() => runCleanup(client), 6 * 60 * 60 * 1000);
});

/* -------------------- INTERACTION ROUTER -------------------- */

client.on('interactionCreate', async (interaction) => {
  try {
    /* ---------- SLASH COMMANDS ---------- */
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'apply') return applyCommand(interaction);
      if (interaction.commandName === 'activate') return activateCommand(interaction);
    }

    /* ---------- MODAL SUBMIT ---------- */
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'apply_modal') {
        return applyCommand(interaction);
      }

      if (interaction.customId.startsWith('schedule_modal_')) {
        const userId = interaction.customId.replace('schedule_modal_', '');
        const date = interaction.fields.getTextInputValue('preferred_date');
        const time = interaction.fields.getTextInputValue('preferred_time');

        await interaction.deferReply({ flags: 64 });

        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const member = await guild.members.fetch(userId).catch(() => null);

        if (member) {
          const scheduledRole = guild.roles.cache.get(process.env.SCHEDULED_ROLE_ID);
          if (scheduledRole && !member.roles.cache.has(scheduledRole.id)) {
            await member.roles.add(scheduledRole);
          }
        }

        const schedulingChannel = await client.channels.fetch(process.env.SCHEDULING_CHANNEL_ID);

        await schedulingChannel.send({
          embeds: [{
            title: '📅 New Onboarding Call Request',
            color: 0x5865f2,
            fields: [
              { name: 'User', value: `<@${userId}>`, inline: true },
              { name: 'Date', value: date, inline: true },
              { name: 'Time (IST)', value: time, inline: true },
            ],
            timestamp: new Date(),
          }],
        });

        await log(client, 'Call Scheduled', `<@${userId}> requested a call on ${date} at ${time} IST`, 0x00ff00);

        return interaction.editReply({ content: '✅ Your onboarding call has been scheduled! Our team will confirm shortly.' });
      }
    }

    /* ---------- BUTTONS ---------- */
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === 'start_apply') {
        const remaining = checkRateLimit(interaction.user.id, 'apply', 60 * 1000);
        if (remaining) {
          return interaction.reply({
            content: `⏳ Please wait **${formatTime(remaining)}** before applying again.`,
            flags: 64,
          });
        }
        return applyCommand(interaction);
      }

      if (id === 'create_ticket') {
        const remaining = checkRateLimit(interaction.user.id, 'ticket', 30 * 1000);
        if (remaining) {
          return interaction.reply({
            content: `⏳ Please wait **${formatTime(remaining)}** before opening another ticket.`,
            flags: 64,
          });
        }
        return ticketHandler.createTicket(interaction);
      }

      if (id.startsWith('close_ticket')) return ticketHandler.closeTicket(interaction);
      if (id.startsWith('approve_') || id.startsWith('reject_')) return approvalHandler(interaction);
      if (id.startsWith('close_onboarding_')) return closeOnboarding(interaction);

      if (id.startsWith('schedule_')) {
        const userId = id.replace('schedule_', '');

        if (interaction.user.id !== userId) {
          return interaction.reply({ content: '❌ This button is not for you.', flags: 64 });
        }

        const modal = new ModalBuilder()
          .setCustomId(`schedule_modal_${userId}`)
          .setTitle('Schedule Your Onboarding Call');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('preferred_date')
              .setLabel('Preferred Date (e.g. 28 March 2026)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('preferred_time')
              .setLabel('Preferred Time IST (e.g. 3:00 PM)')
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          ),
        );

        return interaction.showModal(modal);
      }
    }

  } catch (error) {
    console.error('Interaction error:', error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '❌ Something went wrong. Please try again.' });
      } else {
        await interaction.reply({ content: '❌ Something went wrong. Please try again.', flags: 64 });
      }
    } catch {}
    await log(client, 'Error', `Interaction failed: ${error.message}`, 0xff0000);
  }
});

/* -------------------- CLOSE ONBOARDING -------------------- */

async function closeOnboarding(interaction) {
  await interaction.deferReply({ flags: 64 });
  const channel = interaction.channel;

  await channel.send('✅ Onboarding channel closed. Deleting in 10 seconds...');
  await log(interaction.client, 'Onboarding Closed', `${channel.name} closed by **${interaction.user.username}**.`, 0xffa500);
  await interaction.editReply({ content: '✅ Onboarding channel will be deleted shortly.' });

  setTimeout(async () => {
    await channel.delete().catch(console.error);
  }, 10_000);
}

/* -------------------- MEMBER JOIN -------------------- */

client.on('guildMemberAdd', async (member) => {
  console.log(`guildMemberAdd fired: ${member.user.username}`);
  try {
    const guestRole = member.guild.roles.cache.get(process.env.GUEST_ROLE_ID);
    if (guestRole) await member.roles.add(guestRole).catch(console.error);

    const welcomeChannel = member.guild.channels.cache.find(c => c.name === 'welcome');
    if (!welcomeChannel) return;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start_apply').setLabel('Apply as Creator').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('create_ticket').setLabel('Get Support').setStyle(ButtonStyle.Secondary)
    );

    await welcomeChannel.send({
      content: `👋 Welcome <@${member.id}> to **HyperChat**! Click below to get started.`,
      components: [row],
    });

    await log(client, 'Member Joined', `<@${member.id}> joined the server.`, 0x57f287);
  } catch (err) {
    console.error('guildMemberAdd error:', err);
  }
});

/* -------------------- START -------------------- */

client.login(process.env.DISCORD_TOKEN);
