const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const supabase = require('../supabase');

module.exports = async (interaction) => {
  const customId = interaction.customId;
  const isApprove = customId.startsWith('approve_');
  const isReject = customId.startsWith('reject_');

  if (!isApprove && !isReject) return;

  const discordId = customId.split('_')[1];

  await interaction.deferReply({ flags: 64 });

  const { data: application, error } = await supabase
    .from('creator_applications')
    .select('id, status, username')
    .eq('discord_id', discordId)
    .eq('status', 'pending')
    .single();

  if (error || !application) {
    return interaction.editReply({
      content: '❌ This application has already been reviewed or no longer exists.',
    });
  }

  if (isApprove) {
    const member = await interaction.guild.members.fetch(discordId).catch(() => null);

    if (!member) {
      return interaction.editReply({
        content: '❌ User is no longer in the server.',
      });
    }

    const creatorPendingRole = interaction.guild.roles.cache.get(
      process.env.CREATOR_PENDING_ROLE_ID
    );

    if (!creatorPendingRole) {
      return interaction.editReply({
        content: '❌ Creator Pending role not found. Please check role configuration.',
      });
    }

    await member.roles.add(creatorPendingRole);

    await supabase
      .from('creator_applications')
      .update({ status: 'approved_pending' })
      .eq('id', application.id);

    try {
      const timeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`slot_${discordId}_morning`)
          .setLabel('Morning (9AM - 12PM)')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`slot_${discordId}_afternoon`)
          .setLabel('Afternoon (12PM - 3PM)')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`slot_${discordId}_evening`)
          .setLabel('Evening (3PM - 6PM)')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`slot_${discordId}_night`)
          .setLabel('Night (6PM - 9PM)')
          .setStyle(ButtonStyle.Primary),
      );

      await member.user.send({
        content:
          '🎉 Congratulations! Your HyperChat creator application has been approved!\n\n' +
          'To complete your onboarding, we need to schedule a call with you.\n' +
          '**Please select your preferred time slot:**\n\n' +
          '> Available any day (Monday - Sunday)',
        components: [timeRow],
      });
    } catch {
      console.warn(`Could not DM user ${application.username} — DMs may be disabled.`);
    }

    await interaction.message.edit({
      content: `✅ Approved by ${interaction.user.username} — awaiting scheduling`,
      components: [],
    });

    return interaction.editReply({
      content: `✅ Successfully approved ${application.username}! They have been DM'd to pick a time slot.`,
    });
  }

  if (isReject) {
    await supabase
      .from('creator_applications')
      .update({ status: 'rejected' })
      .eq('id', application.id);

    const member = await interaction.guild.members.fetch(discordId).catch(() => null);
    if (member) {
      try {
        await member.user.send(
          '❌ Unfortunately your HyperChat creator application has been rejected. You may apply again in the future.'
        );
      } catch {
        console.warn(`Could not DM user ${application.username} — DMs may be disabled.`);
      }
    }

    await interaction.message.edit({
      content: `❌ Rejected by ${interaction.user.username}`,
      components: [],
    });

    return interaction.editReply({
      content: `✅ Application from ${application.username} has been rejected.`,
    });
  }
};
