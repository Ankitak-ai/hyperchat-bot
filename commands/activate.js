const supabase = require('../supabase');
const { log } = require('../utils/logger');

module.exports = async (interaction) => {
  await interaction.deferReply({ flags: 64 });

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
  const scheduledRole = interaction.guild.roles.cache.get(process.env.SCHEDULED_ROLE_ID);
  const guestRole = interaction.guild.roles.cache.get(process.env.GUEST_ROLE_ID);

  if (!creatorRole || !creatorPendingRole) {
    return interaction.editReply({
      content: '❌ Could not find required roles. Please check role configuration.',
    });
  }

  // Remove all previous roles and assign Creator
  if (creatorPendingRole && targetMember.roles.cache.has(creatorPendingRole.id)) {
    await targetMember.roles.remove(creatorPendingRole);
  }
  if (scheduledRole && targetMember.roles.cache.has(scheduledRole.id)) {
    await targetMember.roles.remove(scheduledRole);
  }
  if (guestRole && targetMember.roles.cache.has(guestRole.id)) {
    await targetMember.roles.remove(guestRole);
  }
  await targetMember.roles.add(creatorRole);

  // Update DB status to approved
  await supabase
    .from('creator_applications')
    .update({ status: 'approved' })
    .eq('id', application.id);

  // DM the user
  try {
    await targetUser.send(
      '🎉 Congratulations! Your HyperChat creator account has been fully activated!\n\n' +
      'You now have access to:\n' +
      '🎙️ **Creator Lounge** — voice channel for creators\n' +
      '📢 **#announcements** — stay updated with HyperChat news\n' +
      '🎫 **Support tickets** — get help anytime\n\n' +
      'Welcome to the team!'
    );
  } catch {
    console.warn(`Could not DM user ${targetUser.username} — DMs may be disabled.`);
  }

  // Log
  await log(interaction.client, 'Creator Activated', `**${targetUser.username}** (${targetUser.id}) was fully activated as a Creator by **${interaction.user.username}**.`, 0x57f287);

  await interaction.editReply({
    content: `✅ Successfully activated ${targetUser.username} as a Creator!`,
  });
};
