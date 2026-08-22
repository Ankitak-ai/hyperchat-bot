const {
  EmbedBuilder,
  PermissionFlagsBits,
  ModalBuilder,
  ActionRowBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

module.exports = async (interaction) => {
  /* ---------- /announce SLASH COMMAND -> OPEN MODAL ---------- */
  if (interaction.isChatInputCommand()) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ You must be an Administrator to use this command.',
        flags: 64,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId('announce_modal')
      .setTitle('Create Announcement');

    const titleInput = new TextInputBuilder()
      .setCustomId('announcement_title')
      .setLabel('Title (optional, plain text)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(256)
      .setPlaceholder('e.g. Donation Alerts Just Got a Major Upgrade!');

    const bodyInput = new TextInputBuilder()
      .setCustomId('announcement_body')
      .setLabel('Announcement (multi-line supported)')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true)
      .setMaxLength(4000)
      .setPlaceholder('Type or paste your announcement here...\nYou can use line breaks, **bold**, *italic*, etc.');

    const pingInput = new TextInputBuilder()
      .setCustomId('announcement_ping')
      .setLabel('Ping (everyone / here / none)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(10)
      .setPlaceholder('Default: everyone');

    modal.addComponents(
      new ActionRowBuilder().addComponents(titleInput),
      new ActionRowBuilder().addComponents(bodyInput),
      new ActionRowBuilder().addComponents(pingInput)
    );

    return interaction.showModal(modal);
  }

  /* ---------- MODAL SUBMIT -> POST ANNOUNCEMENT ---------- */
  if (interaction.isModalSubmit()) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '❌ You must be an Administrator to use this command.',
        flags: 64,
      });
    }

    await interaction.deferReply({ flags: 64 });

    const title = (interaction.fields.getTextInputValue('announcement_title') || '').trim();
    const body = interaction.fields.getTextInputValue('announcement_body');
    const pingRaw = (interaction.fields.getTextInputValue('announcement_ping') || '').trim().toLowerCase();

    // Decide the ping. Default is @everyone
    let pingContent = '@everyone';
    if (pingRaw === 'here') pingContent = '@here';
    if (pingRaw === 'none' || pingRaw === 'no' || pingRaw === 'off') pingContent = null;

    const isTest = Boolean(process.env.TEST_ANNOUNCEMENTS_CHANNEL_ID);
    const announcementChannelId =
      process.env.TEST_ANNOUNCEMENTS_CHANNEL_ID || process.env.ANNOUNCEMENTS_CHANNEL_ID;

    if (!announcementChannelId) {
      return interaction.editReply({
        content: '❌ Announcement channel ID is missing from `.env`.',
      });
    }

    const channel = await interaction.client.channels
      .fetch(announcementChannelId)
      .catch(() => null);

    if (!channel || !channel.isTextBased()) {
      return interaction.editReply({
        content: '❌ Could not find the announcement channel.',
      });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setDescription(body)
      .setFooter({
        text: `📢 Announcement by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL(),
      })
      .setTimestamp();

    if (title) embed.setTitle(title);

    await channel.send({
      content: pingContent || undefined,
      embeds: [embed],
    });

    return interaction.editReply({
      content: isTest
        ? `🧪 Test announcement posted to <#${channel.id}>!`
        : `✅ Announcement posted to <#${channel.id}>!`,
    });
  }
};
