const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = async (interaction) => {
  // 1. Permission Check (Fallback in case Discord UI fails)
  if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
    return interaction.reply({ 
      content: '❌ You must be an Administrator to use this command.', 
      flags: 64 
    });
  }

  // 2. Get inputs
  const message = interaction.options.getString('message');
  
  // Use TEST channel ID for now, fallback to main ANNOUNCEMENTS_CHANNEL_ID if missing
  const announcementChannelId = process.env.TEST_ANNOUNCEMENTS_CHANNEL_ID || process.env.ANNOUNCEMENTS_CHANNEL_ID;

  if (!announcementChannelId) {
    return interaction.reply({ 
      content: '❌ Announcement channel ID is missing from your `.env` file.', 
      flags: 64 
    });
  }

  // 3. Fetch channel
  const channel = await interaction.client.channels.fetch(announcementChannelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    return interaction.reply({ 
      content: '❌ Could not find the announcement channel or it is not a text channel.', 
      flags: 64 
    });
  }

  // 4. Build Embed
  const embed = new EmbedBuilder()
    .setColor(0x5865f2) // HyperChat Blue
    .setDescription(message)
    .setFooter({ 
      text: `📢 Announcement by ${interaction.user.username}`, 
      iconURL: interaction.user.displayAvatarURL() 
    })
    .setTimestamp();

  // 5. Send message (Pings @everyone)
  await channel.send({ 
    content: '@everyone', 
    embeds: [embed] 
  });

  // 6. Confirm to admin
  return interaction.reply({ 
    content: `✅ Announcement successfully posted to <#${channel.id}>!`, 
    flags: 64 
  });
};
