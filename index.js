const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
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
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Send welcome message to new members
client.on('guildMemberAdd', async (member) => {
  try {
    const welcomeChannel = member.guild.channels.cache.find(c => c.name === 'welcome');
    if (!welcomeChannel) return;

    await welcomeChannel.send({
      content: `👋 Welcome <@${member.id}> to **HyperChat**!\n\n` +
        `To get started, click the **Apply as Creator** button above to apply.\n` +
        `Need help? Click **Get Support** to open a ticket.`
    });
  } catch (error) {
    console.error('Error sending welcome message:', error);
  }
});

  // Post welcome message in #welcome channel
  const welcomeChannel = await client.channels.fetch(
    process.env.APPLICATION_CHANNEL_ID
  ).catch(() => null);

  // We fetch the welcome channel separately
  const guild = client.guilds.cache.first();
  const channels = await guild.channels.fetch();
  const welcome = channels.find(c => c.name === 'welcome');

  if (welcome) {
    // Check if welcome message already exists
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

// Handle slash commands
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
      // Welcome buttons
      if (interaction.customId === 'apply_creator') {
        return interaction.reply({
          content: '📝 To apply, use the `/apply` command and tell us about yourself!\nExample: `/apply details: I am a content creator with 10k followers...`',
          ephemeral: true,
        });
      }

      if (interaction.customId === 'get_support') {
        return ticketHandler.createTicket(interaction);
      }

      // Approval buttons
      if (
        interaction.customId.startsWith('approve_') ||
        interaction.customId.startsWith('reject_')
      ) {
        return approvalHandler(interaction);
      }

      // Close ticket button
      if (interaction.customId.startsWith('close_ticket_')) {
        return ticketHandler.closeTicket(interaction);
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
        ephemeral: true,
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
