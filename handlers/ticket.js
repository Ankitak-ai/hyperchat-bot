const { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  // Creates a new support ticket channel
  async createTicket(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.user.username;
    const userId = interaction.user.id;
    const guild = interaction.guild;

    // Check if ticket already exists
    const existing = guild.channels.cache.find(
      c => c.name === `ticket-${username}` || c.name === `closed-${username}`
    );

    if (existing) {
      return interaction.editReply({
        content: '❌ You already have an open ticket. Please use your existing ticket channel.',
      });
    }

    // Create ticket channel inside SUPPORT category
    const ticketChannel = await guild.channels.create({
      name: `ticket-${username}`,
      parent: process.env.SUPPORT_CATEGORY_ID,
      permissionOverwrites: [
        {
          // Block everyone
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        {
          // Allow the user
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          // Allow the bot
          id: guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    // Post close button in ticket channel
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`close_ticket_${userId}`)
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `👋 Hey <@${userId}>! Support team will be with you shortly.\nClick the button below to close this ticket when you're done.`,
      components: [row],
    });

    return interaction.editReply({
      content: `✅ Your ticket has been created! Head over to <#${ticketChannel.id}>`,
    });
  },

  // Closes an existing support ticket channel
  async closeTicket(interaction) {
    await interaction.deferReply({ flags: 64 });

    const channel = interaction.channel;
    const username = channel.name.replace('ticket-', '');

    // Remove all permission overwrites except bot
    await channel.permissionOverwrites.set([
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: interaction.guild.members.me.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
      },
    ]);

    // Rename to closed-*
    await channel.setName(`closed-${username}`);

    await channel.send('🔒 This ticket has been closed.');

    await interaction.editReply({ content: '✅ Ticket has been closed.' });
  },
    // Rename to closed-*
    await channel.setName(`closed-${username}`);

    await interaction.editReply({
      content: '✅ Ticket has been closed.',
    });

    // Send closed message in channel
    await channel.send('🔒 This ticket has been closed.');
  },
};
