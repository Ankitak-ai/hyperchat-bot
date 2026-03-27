const supabase = require('../supabase');
const { log } = require('../utils/logger');
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

module.exports = async (interaction) => {
  // If triggered via slash (fallback)
  if (interaction.isChatInputCommand()) {
    return interaction.reply({
      content: 'Use the Apply button in #welcome.',
      ephemeral: true,
    });
  }

  // If triggered via button → show modal
  if (interaction.isButton() && interaction.customId === 'start_apply') {
    const modal = new ModalBuilder()
      .setCustomId('apply_modal')
      .setTitle('HyperChat Creator Application');

    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('Your Name')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const youtubeInput = new TextInputBuilder()
      .setCustomId('youtube')
      .setLabel('YouTube Channel')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const instagramInput = new TextInputBuilder()
      .setCustomId('instagram')
      .setLabel('Instagram Handle')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const nicheInput = new TextInputBuilder()
      .setCustomId('niche')
      .setLabel('Your Content Niche')
      .setStyle(TextInputStyle.Paragraph)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(youtubeInput),
      new ActionRowBuilder().addComponents(instagramInput),
      new ActionRowBuilder().addComponents(nicheInput)
    );

    return interaction.showModal(modal);
  }

  // Modal submission
  if (interaction.isModalSubmit() && interaction.customId === 'apply_modal') {
    await interaction.deferReply({ ephemeral: true });

    const discordId = interaction.user.id;
    const username = interaction.user.username;

    const name = interaction.fields.getTextInputValue('name');
    const youtube = interaction.fields.getTextInputValue('youtube');
    const instagram = interaction.fields.getTextInputValue('instagram');
    const niche = interaction.fields.getTextInputValue('niche');

    const details = `
Name: ${name}
YouTube: ${youtube}
Instagram: ${instagram}
Niche: ${niche}
`;

    // Rate limit
    const { data: recent } = await supabase
      .from('creator_applications')
      .select('created_at, status')
      .eq('discord_id', discordId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (recent) {
      if (['pending', 'approved_pending'].includes(recent.status)) {
        return interaction.editReply({
          content: '❌ You already have an active application.',
        });
      }

      if (recent.status === 'rejected') {
        const hoursSince =
          (Date.now() - new Date(recent.created_at)) / (1000 * 60 * 60);
        if (hoursSince < 24) {
          return interaction.editReply({
            content: '❌ You can reapply after 24 hours.',
          });
        }
      }
    }

    const { error } = await supabase
      .from('creator_applications')
      .insert({
        discord_id: discordId,
        username,
        details,
        status: 'pending',
      });

    if (error) {
      await log(
        interaction.client,
        'Application Error',
        `${username} failed: ${error.message}`,
        0xff0000
      );
      return interaction.editReply({
        content: '❌ Submission failed.',
      });
    }

    // Assign Guest role
    const guestRole = interaction.guild.roles.cache.get(
      process.env.GUEST_ROLE_ID
    );
    if (guestRole && !interaction.member.roles.cache.has(guestRole.id)) {
      await interaction.member.roles.add(guestRole);
    }

    // Send to applications channel
    const channel = await interaction.client.channels.fetch(
      process.env.APPLICATION_CHANNEL_ID
    );

    const embed = new EmbedBuilder()
      .setTitle('New Creator Application')
      .setColor(0x5865f2)
      .setDescription(details)
      .addFields(
        { name: 'Username', value: username, inline: true },
        { name: 'Discord ID', value: discordId, inline: true }
      )
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`approve_${discordId}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`reject_${discordId}`)
        .setLabel('Reject')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      embeds: [embed],
      components: [row],
    });

    await log(
      interaction.client,
      'Application Submitted',
      `${username} applied`,
      0x5865f2
    );

    return interaction.editReply({
      content: '✅ Application submitted successfully.',
    });
  }
};
