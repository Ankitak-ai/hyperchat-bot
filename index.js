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
require('dotenv').config();

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
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

// Bot ready
client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const guild = client.guilds.cache.first();
  const channels = await guild.channels.fetch();
  const welcome = channels.find(c => c.name === 'welcome');

  if (welcome) {
    const messages = await welcome.messages.fetch({ limit: 10 });
    const alreadyPosted = messages.some(m => m.author.id === client.user.id);

    if (!alreadyPosted) {
      const embed = new EmbedBuilder()
        .setTitle('Welcome to HyperChat! 🎉')
        .setDescription(
          'HyperChat is a platform for creators.\n\n' +
          '**Want to join as a creator?** Click the button below to apply.\n' +
          '**Need help?** Open a support ticket.'
        )
        .setColor(0x5865f2);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('apply_creator')
          .setLabel('Apply as Creator')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('get_support')
          .setLabel('Get Support')
          .setStyle(ButtonStyle.Secondary)
      );

      await welcome.send({ embeds: [embed], components: [row] });
    }
  }
});

// Guest role on join + welcome message
client.on('guildMemberAdd', async (member) => {
  try {
    const guestRole = member.guild.roles.cache.get(process.env.GUEST_ROLE_ID);
    if (guestRole) {
      await member.roles.add(guestRole);
    }

    await log(client, 'Member Joined', `**${member.user.username}** (${member.id}) joined the server and was assigned Guest role.`, 0x57f287);

    const welcomeChannel = member.guild.channels.cache.find(c => c.name === 'welcome');
    if (!welcomeChannel) return;

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('apply_creator')
        .setLabel('Apply as Creator')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('get_support')
        .setLabel('Get Support')
        .setStyle(ButtonStyle.Secondary)
    );

    await welcomeChannel.send({
      content: `👋 Welcome <@${member.id}> to **HyperChat**!\n\n` +
        `To get started, click **Apply as Creator** to apply.\n` +
        `Need help? Click **Get Support** to open a ticket.`,
      components: [row],
    });
  } catch (error) {
    console.error('Error on member join:', error);
  }
});

// Member leave log
client.on('guildMemberRemove', async (member) => {
  try {
    await log(client, 'Member Left', `**${member.user.username}** (${member.id}) left the server.`, 0xff0000);
  } catch (error) {
    console.error('Error on member leave:', error);
  }
});

// Handle interactions
client.on('interactionCreate', async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'apply') {
        await applyCommand(interaction);
      } else if (interaction.commandName === 'activate') {
        await activateCommand(interaction);
      }
    }

    // Button interactions
    if (interaction.isButton()) {
      if (interaction.customId === 'apply_creator') {
        const modal = new ModalBuilder()
          .setCustomId('apply_modal')
          .setTitle('Apply as Creator');

        const fullName = new TextInputBuilder()
          .setCustomId('full_name')
          .setLabel('Full Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('John Doe')
          .setRequired(true);

        const youtubeUrl = new TextInputBuilder()
          .setCustomId('youtube_url')
          .setLabel('YouTube Channel URL')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('https://youtube.com/@yourchannel')
          .setRequired(true);

        const instagramHandle = new TextInputBuilder()
          .setCustomId('instagram_handle')
          .setLabel('Instagram Handle')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('@yourhandle')
          .setRequired(true);

        const contentNiche = new TextInputBuilder()
          .setCustomId('content_niche')
          .setLabel('Content Niche/Category')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('Gaming, Lifestyle, Tech, etc.')
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(fullName),
          new ActionRowBuilder().addComponents(youtubeUrl),
          new ActionRowBuilder().addComponents(instagramHandle),
          new ActionRowBuilder().addComponents(contentNiche),
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId === 'get_support') {
        return ticketHandler.createTicket(interaction);
      }

      if (
        interaction.customId.startsWith('approve_') ||
        interaction.customId.startsWith('reject_')
      ) {
        return approvalHandler(interaction);
      }

      if (interaction.customId.startsWith('close_ticket_')) {
        return ticketHandler.closeTicket(interaction);
      }

      // Time slot selection — fetches guild explicitly since interaction comes from DM
      if (interaction.customId.startsWith('slot_')) {
        const parts = interaction.customId.split('_');
        const userId = parts[1];
        const slot = parts[2];

        const slotLabels = {
          morning: 'Morning (9AM - 12PM)',
          afternoon: 'Afternoon (12PM - 3PM)',
          evening: 'Evening (3PM - 6PM)',
          night: 'Night (6PM - 9PM)',
        };

        const guild = client.guilds.cache.first();
        const member = await guild.members.fetch(userId).catch(() => null);

        if (member) {
          const scheduledRole = guild.roles.cache.get(process.env.SCHEDULED_ROLE_ID);
          const creatorPendingRole = guild.roles.cache.get(process.env.CREATOR_PENDING_ROLE_ID);
          if (scheduledRole) await member.roles.add(scheduledRole).catch(console.error);
          if (creatorPendingRole && member.roles.cache.has(creatorPendingRole.id)) {
            await member.roles.remove(creatorPendingRole).catch(console.error);
          }
        }

        const schedulingChannel = await client.channels.fetch(process.env.SCHEDULING_CHANNEL_ID);

        const embed = new EmbedBuilder()
          .setTitle('📅 New Scheduling Request')
          .setColor(0x57f287)
          .addFields(
            { name: 'User', value: `<@${userId}>`, inline: true },
            { name: 'Preferred Time Slot', value: slotLabels[slot], inline: true },
            { name: 'Available Days', value: 'Any day (Mon - Sun)', inline: true },
          )
          .setTimestamp();

        await schedulingChannel.send({ embeds: [embed] });

        await log(client, 'Call Scheduled', `**${member?.user.username || userId}** selected **${slotLabels[slot]}** for their onboarding call.`, 0x57f287);

        await interaction.update({
          content: `✅ Thanks! Your preferred slot **${slotLabels[slot]}** has been noted. Our team will reach out soon!`,
          components: [],
        });
      }
    }

    // Modal submit
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'apply_modal') {
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
    }

  } catch (error) {
    console.error('Interaction error:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({
        content: '❌ Something went wrong. Please try again.',
      });
    } else {
      await interaction.reply({
        content: '❌ Something went wrong. Please try again.',
        flags: 64,
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
