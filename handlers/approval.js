const supabase = require('../supabase');

module.exports = async (interaction) => {
  const customId = interaction.customId;
  const isApprove = customId.startsWith('approve_');
  const isReject = customId.startsWith('reject_');

  if (!isApprove && !isReject) return;

  const discordId = customId.split('_')[1];

  await interaction.deferReply({ ephemeral: true });

  // Fetch application — only allow if status is still pending (race condition guard)
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
    // Fetch member
    const member = await interaction.guild.members.fetch(discordId).catch(() => null);

    if (!member) {
      return interaction.editReply({
        content: '❌ User is no longer in the server.',
      });
    }

    // Fetch Creator Pending role
    const creatorPendingRole = interaction.guild.roles.cache.get(
      process.env.CREATOR_PENDING_ROLE_ID
    );

    if (!creatorPendingRole) {
      return interaction.editReply({
        content: '❌ Creator Pending role not found. Please check role configuration.',
      });
    }

    // Add Creator Pending role
    await member.roles.add(creatorPendingRole);

    // Update DB status to approved_pending
    await supabase
      .from('creator_applications')
      .update({ status: 'approved_pending' })
      .eq('id', application.id);

    // DM the user
    try {
      await member.user.send(
        '✅ Your HyperChat creator application has been approved! An admin will activate your account shortly.'
      );
    } catch {
      console.warn(`Could not DM user ${application.username} — DMs may be disabled.`);
    }

    // Update the embed message to show approved
    await interaction.message.edit({
      content: `✅ Approved by ${interaction.user.username}`,
      components: [],
    });

    return interaction.editReply({
      content: `✅ Successfully approved ${application.username}!`,
    });
  }

  if (isReject) {
    // Update DB status to rejected
    await supabase
      .from('creator_applications')
      .update({ status: 'rejected' })
      .eq('id', application.id);

    // DM the user
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

    // Update the embed message to show rejected
    await interaction.message.edit({
      content: `❌ Rejected by ${interaction.user.username}`,
      components: [],
    });

    return interaction.editReply({
      content: `✅ Application from ${application.username} has been rejected.`,
    });
  }
};
