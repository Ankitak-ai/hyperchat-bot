const {
  REST,
  Routes,
  ApplicationCommandOptionType,
  PermissionFlagsBits,
} = require('discord.js');

require('dotenv').config();

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

const announceCommand = {
  name: 'announce',
  description: 'Post an announcement to the announcements channel (Admin only)',
  options: [
    {
      name: 'message',
      description: 'The announcement text',
      type: ApplicationCommandOptionType.String,
      required: true,
    },
  ],
  default_member_permissions: PermissionFlagsBits.Administrator.toString(),
};

(async () => {
  try {
    console.log('Registering /announce command...');

    const clientId = process.env.CLIENT_ID;
    const guildId = process.env.GUILD_ID;

    if (!clientId || !guildId) {
      console.error('❌ Missing CLIENT_ID or GUILD_ID in .env');
      process.exit(1);
    }

    const existingCommands = await rest.get(
      Routes.applicationGuildCommands(clientId, guildId)
    );

    const existingAnnounce = existingCommands.find(
      (cmd) => cmd.name === 'announce'
    );

    if (existingAnnounce) {
      await rest.patch(
        Routes.applicationGuildCommand(clientId, guildId, existingAnnounce.id),
        { body: announceCommand }
      );

      console.log('✅ Updated existing /announce command.');
    } else {
      await rest.post(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: announceCommand }
      );

      console.log('✅ Created /announce command.');
    }
  } catch (error) {
    console.error('❌ Error registering /announce command:');
    console.error(error);
  }
})();
