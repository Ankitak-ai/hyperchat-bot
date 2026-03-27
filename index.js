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

// Welcome new members
client.on('guildMemberAdd', async (member) => {
  try {
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
    console.error('Error sending welcome message:', error);
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

        const whyJoin = new TextInputBuilder()
          .setCustomId('why_join')
          .setLabel('Why do you want to join HyperChat?')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('Tell us why you want to be a HyperChat creator...')
          .setMinLength(30)
          .setMaxLength(500)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(fullName),
          new ActionRowBuilder().addComponents(youtubeUrl),
          new ActionRowBuilder().addComponents(instagramHandle),
          new ActionRowBuilder().addComponents(contentNiche),
          new ActionRowBuilder().addComponents(whyJoin),
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
    }

    // Modal submit
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'apply_modal') {
        const fullName = interaction.fields.getTextInputValue('full_name');
        const youtubeUrl = interaction.fields.getTextInputValue('youtube_url');
        const instagramHandle = interaction.fields.getTextInputValue('instagram_handle');
        const contentNiche = interaction.fields.getTextInputValue('content_niche');
        const whyJoin = interaction.fields.getTextInputValue('why_join');

        interaction.options = {
          getString: () =>
            `Full Name: ${fullName}\nYouTube: ${youtubeUrl}\nInstagram: ${instagramHandle}\nNiche: ${contentNiche}\nWhy Join: ${whyJoin}`,
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
