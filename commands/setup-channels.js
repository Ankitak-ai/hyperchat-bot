const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { log } = require('../utils/logger');

module.exports = async (interaction) => {
  await interaction.deferReply({ flags: 64 });

  const member = interaction.member;
  const adminRole = interaction.guild.roles.cache.find(r => r.name === 'Admin');

  if (!member.roles.cache.has(adminRole.id)) {
    return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
  }

  const targetUser = interaction.options.getUser('user');
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (!targetMember) {
    return interaction.editReply({ content: '❌ User not found in this server.' });
  }

  const channelName = `hc-${targetUser.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

  const existing = interaction.guild.channels.cache.find(c => c.name === channelName);
  if (existing) {
    return interaction.editReply({ content: `❌ Channel already exists: <#${existing.id}>` });
  }

  const creatorChannel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: process.env.CREATOR_CATEGORY_ID,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: targetUser.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: interaction.guild.members.me.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory],
      },
    ],
  });

  if (adminRole) {
    await creatorChannel.permissionOverwrites.create(adminRole, {
      ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
    });
  }

  await creatorChannel.send(
    `👋 Hey <@${targetUser.id}>! Welcome to your private HyperChat channel.\n\n` +
    `This is your dedicated space to connect with the HyperChat team. Use this channel for:\n` +
    `📌 Setup help\n` +
    `🐛 Issues or bugs\n` +
    `💡 Feature requests\n` +
    `📢 Important updates from the team\n\n` +
    `Welcome aboard! 🚀`
  );

  await log(
    interaction.client,
    'Channel Created',
    `Private channel created for **${targetUser.username}** by **${interaction.user.username}**.\nChannel: <#${creatorChannel.id}>`,
    0x57f287
  );

  return interaction.editReply({
    content: `✅ Created private channel for ${targetUser.username}: <#${creatorChannel.id}>`,
  });
};
