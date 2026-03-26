const supabase = require('../supabase');

module.exports = async (interaction) => {
  await interaction.deferReply({ ephemeral: true });

  // Check if user has Admin role
  const member = interaction.member;
  const adminRole = interaction.guild.roles.cache.find(r => r.name === 'Admin');

  if (!member.roles.cache.has(adminRole.id)) {
    return interaction.editReply({
      content: '❌ You do not have permission to use this command.',
    });
  }

  const targetUser = interaction.options.getUser('user');
  const targetMember = await interaction.guild.members.fetch(targetUser.id);

  if (!targetMember) {
    return interaction.editReply({
      content: '❌ User not found in this server.',
    });
  }

  // Check application status in DB
  const { data: application, error } = await supabase
    .from('creator_applications')
    .select('id, status')
    .eq('discord_id', targetUser.id)
    .eq('status', 'approved_pending')
    .single();

  if (error || !application) {
    return interaction.editReply({
      content: '❌ No approved pending application found for this user.',
    });
  }

  // Fetch roles
  const creatorRole = interaction.guild.roles.cache.get(process.env.CREATOR_ROLE_ID);
  const creatorPendingRole = interaction.guild.roles.cache.get(process.env.CREATOR_PENDING_ROLE_ID);

  if (!creatorRole || !creatorPendingRole) {
    return interaction.editReply({
      content: '❌ Could not find required roles. Please check role configuration.',
    });
  }

  // Swap roles
  await targetMember.roles.remove(creatorPendingRole);
  await targetMember.roles.add(creatorRole);

  // Update DB status to approved
  await supabase
    .from('creator_applications')
    .update({ status: 'approved' })
    .eq('id', application.id);

  // DM the user
  try {
    await targetUser.send(
      '🎉 Congratulations! Your HyperChat creator account has been fully activated. Welcome to the team!'
    );
  } catch {
    console.warn(`Could not DM user ${targetUser.username} — DMs may be disabled.`);
  }

  await interaction.editReply({
    content: `✅ Successfully activated ${targetUser.username} as a Creator!`,
  });
};
