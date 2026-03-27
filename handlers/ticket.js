const {
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { log } = require('../utils/logger');

module.exports = {
  async createTicket(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.user.username;
    const userId = interaction.user.id;
    const guild = interaction.guild;

    const existing = guild.channels.cache.find(
      (c) =>
        c.name === `ticket-${username}` || c.name === `closed-${username}`
    );

    if (existing) {
      return interaction.editReply({
        content: '❌ You already have a ticket.',
      });
    }

    const channel = await guild.channels.create({
      name: `ticket-${username}`,
      parent: process.env.SUPPORT_CATEGORY_ID,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: userId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
          ],
        },
        {
          id: guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
          ],
        },
      ],
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      content: `Support ticket for <@${userId}>`,
      components: [row],
    });

    await log(
      interaction.client,
      'Ticket Created',
      `<@${userId}> opened a ticket`,
      0x5865f2
    );

    return interaction.editReply({
      content: '✅ Ticket created.',
    });
  },

  async closeTicket(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const channel = interaction.channel;

    await channel.setName(`closed-${channel.name}`);
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      ViewChannel: false,
    });

    await log(
      interaction.client,
      'Ticket Closed',
      `Channel ${channel.name} closed`,
      0xff0000
    );

    setTimeout(async () => {
      await channel.delete().catch(console.error);
    }, 1000 * 60 * 60 * 6); // 6 hours

    return interaction.editReply({
      content: '✅ Ticket closed. It will be deleted in 6 hours.',
    });
  },
};
