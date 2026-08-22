const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = async (interaction) => {
  // 1. Permission Check
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({
      content: '❌ You must be an Administrator to use this command.',
      flags: 64,
    });
  }

  // 2. Get announcement message
  const message = interaction.options.getString('message', true);

  // 3. Use TEST channel if available, otherwise use real announcements channel
  const announcementChannelId =
    process.env.TEST_ANNOUNCEMENTS_CHANNEL_ID ||
    process.env.ANNOUNCEMENTS_CHANNEL_ID;

  if (!announcementChannelId) {
    return interaction.reply({
      content: '❌ Announcement channel ID is missing from `.env`.',
      flags: 64,
    });
  }

  // 4. Fetch channel
  const channel = await interaction.client.channels
    .fetch(announcementChannelId)
    .catch(() => null);

  if (!channel || !channel.isTextBased()) {
    return interaction.reply({
      content: '❌ Could not find the announcement channel.',
      flags: 64,
    });
  }

  // 5. Build announcement embed
  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setDescription(message)
    .setFooter({
      text: `📢 Announcement by ${interaction.user.username}`,
      iconURL: interaction.user.displayAvatarURL(),
    })
    .setTimestamp();

  // 6. Send announcement
  await channel.send({
    content: '@everyone',
    embeds: [embed],
  });

  // 7. Confirm to admin
  const isTest = Boolean(
    process.env.TEST_ANNOUNCEMENTS_CHANNEL_ID &&
    process.env.TEST_ANNOUNCEMENTS_CHANNEL_ID === announcementChannelId
  );

  return interaction.reply({
    content: isTest
      ? `🧪 Test announcement posted to <#${channel.id}>!`
      : `✅ Announcement posted to <#${channel.id}>!`,
    flags: 64,
  });
};
