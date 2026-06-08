const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { log } = require('../utils/logger');

module.exports = async (interaction) => {
  await interaction.deferReply({ flags: 64 });

  const member = interaction.member;
  const adminRole = interaction.guild.roles.cache.find(r => r.name === 'Admin');

  if (!member.roles.cache.has(adminRole.id)) {
    return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
  }

  const creatorRole = interaction.guild.roles.cache.get(process.env.CREATOR_ROLE_ID);
  if (!creatorRole) {
    return interaction.editReply({ content: '❌ Creator role not found.' });
  }

  // Fetch all members with Creator role
  await interaction.guild.members.fetch();
  const creators = interaction.guild.members.cache.filter(m => m.roles.cache.has(creatorRole.id));

  if (creators.size === 0) {
    return interaction.editReply({ content: '❌ No creators found.' });
  }

  const creatorCategory = process.env.CREATOR_CATEGORY_ID;
  let created = 0;
  let skipped = 0;

  for (const [, creatorMember] of creators) {
    const username = creatorMember.user.username;
    const channelName = `hc-${username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Skip if channel already exists
    const existing = interaction.guild.channels.cache.find(c => c.name === channelName);
    if (existing) { skipped++; continue; }

    try {
      const creatorChannel = await interaction.guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: creatorCategory,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: creatorMember.id,
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
        `👋 Hey <@${creatorMember.id}>! Welcome to your private HyperChat channel.\n\n` +
        `This is your dedicated space to connect with the HyperChat team. Use this channel for:\n` +
        `📌 Setup help\n` +
        `🐛 Issues or bugs\n` +
        `💡 Feature requests\n` +
        `📢 Important updates from the team\n\n` +
        `Welcome aboard! 🚀`
      );

      created++;
    } catch (err) {
      console.error(`Failed to create channel for ${username}:`, err);
      skipped++;
    }
  }

  await log(
    interaction.client,
    'Setup Channels',
    `Bulk channel creation by **${interaction.user.username}**.\nCreated: **${created}** | Skipped: **${skipped}**`,
    0x57f287
  );

  return interaction.editReply({
    content: `✅ Done! Created **${created}** channels, skipped **${skipped}** (already exist or failed).`,
  });
};
