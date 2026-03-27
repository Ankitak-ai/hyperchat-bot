// Time slot selection
if (interaction.customId.startsWith('slot_')) {
  const parts = interaction.customId.split('_');
  const userId = parts[1];
  const slot = parts[2];

  const slotLabels = {
    morning: 'Morning (9AM - 12PM)',
    afternoon: 'Afternoon (12PM - 3PM)',
    evening: 'Evening (3PM - 6PM)',
    night: 'Night (6PM - 9PM)',
  };

  const schedulingChannel = await interaction.client.channels.fetch(
    process.env.SCHEDULING_CHANNEL_ID
  );

  const { EmbedBuilder } = require('discord.js');

  const embed = new EmbedBuilder()
    .setTitle('📅 New Scheduling Request')
    .setColor(0x57f287)
    .addFields(
      { name: 'User', value: `<@${userId}>`, inline: true },
      { name: 'Preferred Time Slot', value: slotLabels[slot], inline: true },
      { name: 'Available Days', value: 'Any day (Mon - Sun)', inline: true },
    )
    .setTimestamp();

  await schedulingChannel.send({ embeds: [embed] });

  await interaction.update({
    content: `✅ Thanks! Your preferred slot **${slotLabels[slot]}** has been noted. Our team will reach out soon!`,
    components: [],
  });
}
