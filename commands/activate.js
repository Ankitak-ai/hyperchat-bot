const supabase = require('../supabase');
const { log } = require('../utils/logger');
const { EmbedBuilder } = require('discord.js');

module.exports = async (interaction) => {
  await interaction.deferReply({ flags: 64 });

  const member = interaction.member;
  const adminRole = interaction.guild.roles.cache.find(r => r.name === 'Admin');

  if (!member.roles.cache.has(adminRole.id)) {
    return interaction.editReply({ content: '❌ You do not have permission to use this command.' });
  }

  const targetUser = interaction.options.getUser('user');
  const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

  if (!targetMember) {
    return interaction.editReply({ content: '❌ User not found in this server.' });
  }

  const { data: application, error } = await supabase
    .from('creator_applications')
    .select('id, status, username')
    .eq('discord_id', targetUser.id)
    .eq('status', 'approved_pending')
    .single();

  if (error || !application) {
    return interaction.editReply({ content: '❌ No approved pending application found for this user.' });
  }

  const creatorRole = interaction.guild.roles.cache.get(process.env.CREATOR_ROLE_ID);
  const creatorPendingRole = interaction.guild.roles.cache.get(process.env.CREATOR_PENDING_ROLE_ID);
  const scheduledRole = interaction.guild.roles.cache.get(process.env.SCHEDULED_ROLE_ID);
  const guestRole = interaction.guild.roles.cache.get(process.env.GUEST_ROLE_ID);

  if (!creatorRole || !creatorPendingRole) {
    return interaction.editReply({ content: '❌ Could not find required roles.' });
  }

  if (creatorPendingRole && targetMember.roles.cache.has(creatorPendingRole.id)) await targetMember.roles.remove(creatorPendingRole);
  if (scheduledRole && targetMember.roles.cache.has(scheduledRole.id)) await targetMember.roles.remove(scheduledRole);
  if (guestRole && targetMember.roles.cache.has(guestRole.id)) await targetMember.roles.remove(guestRole);
  await targetMember.roles.add(creatorRole);

  await supabase
    .from('creator_applications')
    .update({ status: 'approved' })
    .eq('id', application.id);

  // Delete onboarding channels if exist
  const onboardingText = interaction.guild.channels.cache.find(
    c => c.name === `onboarding-${application.username}`
  );
  const onboardingVoice = interaction.guild.channels.cache.find(
    c => c.name === `onboarding-voice-${application.username}`
  );

  if (onboardingText) {
    await onboardingText.send('✅ Onboarding complete! This channel will be deleted in 10 seconds.');
    setTimeout(() => onboardingText.delete().catch(console.error), 10_000);
  }
  if (onboardingVoice) {
    setTimeout(() => onboardingVoice.delete().catch(console.error), 10_000);
  }

  // Post in #announcements
  try {
    const announcementsChannel = await interaction.client.channels.fetch(process.env.ANNOUNCEMENTS_CHANNEL_ID);
    const embed = new EmbedBuilder()
      .setTitle('🎉 New Creator!')
      .setDescription(`Welcome <@${targetUser.id}> to the HyperChat creator family!`)
      .setColor(0x57f287)
      .setTimestamp();
    await announcementsChannel.send({ embeds: [embed] });
  } catch {
    console.warn('Could not post to #announcements.');
  }

  // DM the user
  try {
    await targetUser.send(
      '🎉 Congratulations! Your HyperChat creator account has been fully activated!\n\n' +
      'You now have access to:\n' +
      '🎙️ **Creator Lounge** — voice channel for creators\n' +
      '📢 **#announcements** — stay updated with HyperChat news\n' +
      '💬 **#creator-chat** — chat with other creators\n' +
      '🎫 **Support tickets** — get help anytime\n\n' +
      'Welcome to the team!'
    );
  } catch {
    console.warn(`Could not DM user ${targetUser.username} — DMs may be disabled.`);
  }

  await log(
    interaction.client,
    'Creator Activated',
    `**${targetUser.username}** (${targetUser.id}) activated as Creator by **${interaction.user.username}**.`,
    0x57f287
  );

  return interaction.editReply({ content: `✅ Successfully activated ${targetUser.username} as a Creator!` });
};
