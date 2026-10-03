const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { log } = require('../utils/logger');

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

  // Give them the Creator role so they can see the category
  const creatorRole = interaction.guild.roles.cache.get(process.env.CREATOR_ROLE_ID);
  if (creatorRole && !targetMember.roles.cache.has(creatorRole.id)) {
    await targetMember.roles.add(creatorRole).catch(console.error);
  }

  // Sanitized username for channel name
  const safeUsername = targetUser.username
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 90);

  // Resolve the "creators-chat" category
  const creatorsChatCategory =
    interaction.guild.channels.cache.get(process.env.CREATORS_CHAT_CATEGORY_ID) ||
    interaction.guild.channels.cache.find(
      c => c.type === ChannelType.GuildCategory && c.name === 'creators-chat'
    );

  let creatorChannel;
  try {
    creatorChannel = await interaction.guild.channels.create({
      name: `hc-${safeUsername}`,
      type: ChannelType.GuildText,
      parent: creatorsChatCategory ? creatorsChatCategory.id : process.env.CREATOR_CATEGORY_ID,
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

  // Send the welcome message (wrapped so a failure here is visible, not silent)
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
