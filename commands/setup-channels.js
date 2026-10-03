const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { log } = require('../utils/logger');

function sanitize(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 90);
}

function getAvailableCreatorsChatCategory(guild) {
  const categoryIds = [
    process.env.CREATORS_CHAT_CATEGORY_ID,
    process.env.CREATORS_CHAT_CATEGORY_ID_2,
    process.env.CREATORS_CHAT_CATEGORY_ID_3,
  ].filter(Boolean);

  if (categoryIds.length === 0) {
    guild.channels.cache
      .filter(c => c.type === ChannelType.GuildCategory && c.name.startsWith('creators-chat'))
      .forEach(c => categoryIds.push(c.id));
  }

  for (const catId of categoryIds) {
    const category = guild.channels.cache.get(catId);
    if (!category) continue;
    const childCount = guild.channels.cache.filter(ch => ch.parentId === catId).size;
    if (childCount < 50) {
      return catId;
    }
  }

  return categoryIds[0] || process.env.CREATOR_CATEGORY_ID;
}

module.exports = async (interaction) => {
  await interaction.deferReply({ flags: 64 });

  const member = interaction.member;
  const adminRole = interaction.guild.roles.cache.find(r => r.name === 'Admin');

  if (!adminRole || !member.roles.cache.has(adminRole.id)) {
    return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
  }

  const targetUser = interaction.options.getUser('user');
  if (!targetUser) {
    return interaction.editReply({ content: '❌ Please mention a user.' });
  }

  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (!targetMember) {
    return interaction.editReply({ content: '❌ User not found in this server.' });
  }

  const creatorRole = interaction.guild.roles.cache.get(process.env.CREATOR_ROLE_ID);
  if (creatorRole && !targetMember.roles.cache.has(creatorRole.id)) {
    await targetMember.roles.add(creatorRole).catch(console.error);
  }

  const safeUsername = sanitize(targetUser.username);
  const targetCategoryId = getAvailableCreatorsChatCategory(interaction.guild);

  let creatorChannel;
  try {
    creatorChannel = await interaction.guild.channels.create({
      name: `hc-${safeUsername}`,
      type: ChannelType.GuildText,
      parent: targetCategoryId,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
          id: targetUser.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
          id: interaction.guild.members.me.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    if (adminRole) {
      await creatorChannel.permissionOverwrites
        .create(adminRole, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        })
        .catch(console.error);
    }
  } catch (err) {
    console.error('Setup channel CREATE error:', err);
    return interaction.editReply({ content: `❌ Failed to create channel: ${err.message}` });
  }

  let messageSent = false;
  try {
    await creatorChannel.send(
      `👋 Hey <@${targetUser.id}>! Welcome to your private HyperChat channel.\n\n` +
      `This is your dedicated space to connect with the HyperChat team. Use this channel for:\n` +
      `📌 Setup help\n` +
      `🐛 Issues or bugs\n` +
      `💡 Feature requests\n` +
      `📢 Important updates from the team\n\n` +
      `Welcome aboard! 🚀`
    );
    messageSent = true;
  } catch (err) {
    console.error('Setup channel SEND error:', err);
    await log(
      interaction.client,
      'Channel Message Failed',
      `Created <#${creatorChannel.id}> for **${targetUser.username}** but could not send the welcome message.\n**Reason:** ${err.message}\n\n⚠️ Check the bot has **Send Messages** permission in the creators-chat category.`,
      0xffa500
    );
  }

  await log(
    interaction.client,
    'Manual Channel Setup',
    `**${interaction.user.username}** manually created a private channel for **${targetUser.username}** (${targetUser.id}).\nChannel: <#${creatorChannel.id}>`,
    0x57f287
  );

  return interaction.editReply({
    content: messageSent
      ? `✅ Created <#${creatorChannel.id}> for ${targetUser.username} and sent the welcome message.`
      : `⚠️ Created <#${creatorChannel.id}> for ${targetUser.username}, but the welcome message failed to send (check bot permissions / logs).`,
  });
};
