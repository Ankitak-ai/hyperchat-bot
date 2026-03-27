const { PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { log } = require('../utils/logger');

// Auto-delete closed tickets after 24 hours
const AUTO_DELETE_HOURS = 24;

module.exports = {
  async createTicket(interaction) {
    await interaction.deferReply({ flags: 64 });

    const username = interaction.user.username;
    const userId = interaction.user.id;
    const guild = interaction.guild;

    // Check if ticket already exists
    const existing = guild.channels.cache.find(
      c => c.name === `ticket-${username}`
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

    // Log
    await log(interaction.client, 'Ticket Opened', `**${username}** (${userId}) opened a support ticket → <#${ticketChannel.id}>`, 0x5865f2);

    return interaction.editReply({
      content: `✅ Your ticket has been created! Head over to <#${ticketChannel.id}>`,
    });
  },

  async closeTicket(interaction) {
    await interaction.deferReply({ flags: 64 });

    const channel = interaction.channel;
    const username = channel.name.replace('ticket-', '');
    const userId = interaction.user.id;

    // Lock the channel
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

    // Rename to closed-*
    await channel.setName(`closed-${username}`);
    await channel.send(`🔒 This ticket has been closed by <@${userId}>.\n⏳ This channel will be automatically deleted in **${AUTO_DELETE_HOURS} hours**.`);

    await interaction.editReply({ content: '✅ Ticket has been closed.' });

    // Log
    await log(interaction.client, 'Ticket Closed', `**${username}**'s ticket was closed by **${interaction.user.username}**.\nAuto-deleting in ${AUTO_DELETE_HOURS} hours.`, 0xffa500);

    // Auto-delete after X hours
    setTimeout(async () => {
      try {
        await channel.delete();
        await log(interaction.client, 'Ticket Deleted', `**${username}**'s closed ticket was automatically deleted.`, 0xff0000);
      } catch (err) {
        console.error('Failed to auto-delete ticket:', err);
      }
    }, AUTO_DELETE_HOURS * 60 * 60 * 1000);
  },
};
