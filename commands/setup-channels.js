const { ChannelType, PermissionFlagsBits } = require('discord.js');
const supabase = require('../supabase');
const { log } = require('../utils/logger');

module.exports = async (interaction) => {
  await interaction.deferReply({ flags: 64 });

  const member = interaction.member;
  const adminRole = interaction.guild.roles.cache.find(r => r.name === 'Admin');

  if (!member.roles.cache.has(adminRole.id)) {
    return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
  }

  const { data: creators, error } = await supabase
    .from('creator_applications')
    .select('discord_id, username')
    .eq('status', 'approved');

  if (error || !creators || creators.length === 0) {
    return interaction.editReply({ content: '❌ No activated creators found.' });
  }

  const creatorCategory = process.env.CREATOR_CATEGORY_ID;
  let created = 0;
  let skipped = 0;

  for (const creator of creators) {
    const existing = interaction.guild.channels.cache.find(
      c => c.name === `hc-${creator.username}`
    );
    if (existing) { skipped++; continue; }

    const creatorMember = await interaction.guild.members.fetch(creator.discord_id).catch(() => null);
    if (!creatorMember) { skipped++; continue; }

    try {
      const creatorChannel = await interaction.guild.channels.create({
        name: `hc-${creator.username}`,
        type: ChannelType.GuildText,
        parent: creatorCategory,
        permissionOverwrites: [
          { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
          {
            id: creator.discord_id,
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
        `👋 Hey <@${creator.discord_id}>! Welcome to your private HyperChat channel.\n\n` +
        `This is your dedicated space to connect with the HyperChat team. Use this channel for:\n` +
        `📌 Setup help\n` +
        `🐛 Issues or bugs\n` +
        `💡 Feature requests\n` +
        `📢 Important updates from the team\n\n` +
        `Welcome aboard! 🚀`
      );

      created++;
    } catch (err) {
      console.error(`Failed to create channel for ${creator.username}:`, err);
      skipped++;
    }
  }

  await log(
    interaction.client,
    'Setup Channels',
    `Bulk channel creation by **${interaction.user.username}**.\nCreated: ${created} | Skipped: ${skipped}`,
    0x57f287
  );

  return interaction.editReply({
    content: `✅ Done! Created **${created}** channels, skipped **${skipped}** (already exist or user left).`,
  });
};
