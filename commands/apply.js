const supabase = require('../supabase');
const { log } = require('../utils/logger');

module.exports = async (interaction) => {
  const discordId = interaction.user.id;
  const username = interaction.user.username;
  const details = interaction.options.getString('details');

  await interaction.deferReply({ flags: 64 });

  // Rate limit — check if applied in last 24 hours
  const { data: recent } = await supabase
    .from('creator_applications')
    .select('id, created_at, status')
    .eq('discord_id', discordId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (recent) {
    // Block if active application exists
    if (['pending', 'approved_pending'].includes(recent.status)) {
      return interaction.editReply({
        content: '❌ You already have an active application. Please wait for it to be reviewed.',
      });
    }

    // Block if rejected but applied within last 24 hours
    if (recent.status === 'rejected') {
      const hoursSince = (Date.now() - new Date(recent.created_at)) / (1000 * 60 * 60);
      if (hoursSince < 24) {
        const hoursLeft = Math.ceil(24 - hoursSince);
        return interaction.editReply({
          content: `❌ You can apply again in **${hoursLeft} hour(s)**. Please wait before reapplying.`,
        });
      }
    }
  }

  // Insert new application
  const { error } = await supabase
    .from('creator_applications')
    .insert({ discord_id: discordId, username, details, status: 'pending' });

  if (error) {
    console.error('Supabase insert error:', error);
    await log(interaction.client, 'Application Error', `**${username}** (${discordId}) failed to submit application.\nError: ${error.message}`, 0xff0000);
    return interaction.editReply({
      content: '❌ Something went wrong submitting your application. Please try again.',
    });
  }

  // Assign Guest role if not already assigned
  const guestRole = interaction.guild.roles.cache.get(process.env.GUEST_ROLE_ID);
  if (guestRole && !interaction.member.roles.cache.has(guestRole.id)) {
    await interaction.member.roles.add(guestRole).catch(console.error);
  }

  // Post to #applications channel
  const applicationChannel = await interaction.client.channels.fetch(
    process.env.APPLICATION_CHANNEL_ID
  );

  const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

  const embed = new EmbedBuilder()
    .setTitle('New Creator Application')
    .setColor(0x5865f2)
    .addFields(
      { name: 'Username', value: username, inline: true },
      { name: 'Discord ID', value: discordId, inline: true },
      { name: 'Details', value: details }
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

  await applicationChannel.send({ embeds: [embed], components: [row] });

  // Log the action
  await log(interaction.client, 'New Application', `**${username}** (${discordId}) submitted a creator application.`, 0x5865f2);

  await interaction.editReply({
    content: '✅ Your application has been submitted! We will review it shortly.',
  });
};
