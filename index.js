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

        const detailsInput = new TextInputBuilder()
          .setCustomId('apply_details')
          .setLabel('Tell us about yourself')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder('I am a content creator with 10k followers...')
          .setMinLength(50)
          .setMaxLength(1000)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(detailsInput));
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
        interaction.options = {
          getString: () => interaction.fields.getTextInputValue('apply_details')
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
