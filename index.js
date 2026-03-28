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
  if (!welcomeChannel) return;

  const messages = await welcomeChannel.messages.fetch({ limit: 10 });
  const exists = messages.find((m) => m.author.id === client.user.id && m.components.length > 0);
  if (exists) return;

  const embed = new EmbedBuilder()
    .setTitle('🚀 Welcome to HyperChat')
    .setDescription('Apply to become a creator or get support below.')
    .setColor(0x5865f2);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('start_apply').setLabel('Apply as Creator').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('create_ticket').setLabel('Get Support').setStyle(ButtonStyle.Secondary)
  );

  await welcomeChannel.send({ embeds: [embed], components: [row] });
});

/* -------------------- INTERACTION ROUTER -------------------- */

client.on('interactionCreate', async (interaction) => {
  try {
    /* ---------- SLASH COMMANDS ---------- */
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'apply') return applyCommand(interaction);
      if (interaction.commandName === 'activate') return activateCommand(interaction);
    }

    /* ---------- BUTTONS ---------- */
    if (interaction.isButton()) {
      const id = interaction.customId;

      if (id === 'start_apply') {
        const modal = new ModalBuilder()
          .setCustomId('apply_modal')
          .setTitle('Apply as Creator');

        modal.addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('full_name')
              .setLabel('Full Name')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('John Doe')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('youtube_url')
              .setLabel('YouTube Channel URL')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('https://youtube.com/@yourchannel')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('instagram_handle')
              .setLabel('Instagram Handle')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('@yourhandle')
              .setRequired(true)
          ),
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('content_niche')
              .setLabel('Content Niche/Category')
              .setStyle(TextInputStyle.Short)
              .setPlaceholder('Gaming, Lifestyle, Tech, etc.')
              .setRequired(true)
          ),
        );

        return interaction.showModal(modal);
      }

      if (id === 'create_ticket') return ticketHandler.createTicket(interaction);
      if (id.startsWith('close_ticket')) return ticketHandler.closeTicket(interaction);
      if (id.startsWith('approve_') || id.startsWith('reject_')) return approvalHandler(interaction);

      if (id.startsWith('slot_')) {
        await interaction.deferReply({ ephemeral: true });

        const [_, userId, slot] = id.split('_');

        if (interaction.user.id !== userId) {
          return interaction.editReply({ content: '❌ This button is not for you.' });
        }

        const member = await interaction.guild.members.fetch(userId);
        const scheduledRole = interaction.guild.roles.cache.get(process.env.SCHEDULED_ROLE_ID);
        if (scheduledRole && !member.roles.cache.has(scheduledRole.id)) {
          await member.roles.add(scheduledRole);
        }

        const schedulingChannel = await interaction.client.channels.fetch(process.env.SCHEDULING_CHANNEL_ID);

        const slotMap = {
          morning: 'Morning (9AM - 12PM)',
          afternoon: 'Afternoon (12PM - 3PM)',
          evening: 'Evening (3PM - 6PM)',
          night: 'Night (6PM - 9PM)',
        };

        await schedulingChannel.send({
          embeds: [{
            title: '📅 New Scheduling Request',
            color: 0x5865f2,
            fields: [
              { name: 'User', value: `<@${userId}>`, inline: true },
              { name: 'Preferred Time Slot', value: slotMap[slot], inline: true },
              { name: 'Available Days', value: 'Any day (Mon - Sun)' },
            ],
            timestamp: new Date(),
          }],
        });

        await log(interaction.client, 'Scheduling Selected', `<@${userId}> selected ${slotMap[slot]}`, 0x00ff00);
        return interaction.editReply({ content: '✅ Your time slot has been recorded.' });
      }
    }

    /* ---------- MODAL SUBMIT ---------- */
    if (interaction.isModalSubmit() && interaction.customId === 'apply_modal') {
      const fullName = interaction.fields.getTextInputValue('full_name');
      const youtubeUrl = interaction.fields.getTextInputValue('youtube_url');
      const instagramHandle = interaction.fields.getTextInputValue('instagram_handle');
      const contentNiche = interaction.fields.getTextInputValue('content_niche');

      interaction.options = {
        getString: () =>
          `Full Name: ${fullName}\nYouTube: ${youtubeUrl}\nInstagram: ${instagramHandle}\nNiche: ${contentNiche}`,
      };

      return applyCommand(interaction);
    }

  } catch (error) {
    console.error('Interaction error:', error);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '❌ Something went wrong. Please try again.' });
      } else {
        await interaction.reply({ content: '❌ Something went wrong. Please try again.', ephemeral: true });
      }
    } catch {}
    await log(client, 'Error', `Interaction failed: ${error.message}`, 0xff0000);
  }
});

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
