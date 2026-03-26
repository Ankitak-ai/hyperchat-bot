const supabase = require('../supabase');

module.exports = async (interaction) => {
  const discordId = interaction.user.id;
  const username = interaction.user.username;
  const details = interaction.options.getString('details');

  await interaction.deferReply({ ephemeral: true });

  // Check for existing active application
  const { data: existing } = await supabase
    .from('creator_applications')
    .select('id, status')
    .eq('discord_id', discordId)
    .in('status', ['pending', 'approved_pending'])
    .single();

  if (existing) {
    return interaction.editReply({
      content: '❌ You already have an active application. Please wait for it to be reviewed.',
    });
  }

  // Insert new application
  const { error } = await supabase
    .from('creator_applications')
    .insert({ discord_id: discordId, username, details, status: 'pending' });

  if (error) {
    console.error('Supabase insert error:', error);
    return interaction.editReply({
      content: '❌ Something went wrong submitting your application. Please try again.',
    });
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

  await interaction.editReply({
    content: '✅ Your application has been submitted! We will review it shortly.',
  });
};
