const { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
  async createTicket(interaction) {
    await interaction.deferReply({ flags: 64 });

    const username = interaction.user.username;
    const userId = interaction.user.id;
    const guild = interaction.guild;

    const existing = guild.channels.cache.find(
      c => c.name === `ticket-${username}`
    );

    if (existing) {
      return interaction.editReply({
        content: '❌ You already have an open ticket. Please use your existing ticket channel.',
      });
    }

    const ticketChannel = await guild.channels.create({
      name: `ticket-${username}`,
      parent: process.env.SUPPORT_CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        {
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
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

  async closeTicket(interaction) {
    await interaction.deferReply({ flags: 64 });

    const channel = interaction.channel;
    const username = channel.name.replace('ticket-', '');

    await channel.permissionOverwrites.set([
      {
        id: interaction.guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
      },
      {
        id: interaction.guild.members.me.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ManageChannels,
        ],
      },
    ]);

    await channel.setName(`closed-${username}`);
    await channel.send('🔒 This ticket has been closed.');
    await interaction.editReply({ content: '✅ Ticket has been closed.' });
  },
};
