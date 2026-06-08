const { REST, Routes } = require('discord.js');
require('dotenv').config();

const commands = [
  {
    name: 'apply',
    description: 'Apply to become a HyperChat creator',
    options: [
      {
        name: 'details',
        description: 'Tell us about yourself and why you want to join',
        type: 3,
        required: true,
      },
    ],
  },
  {
    name: 'activate',
    description: 'Activate a creator (Admin only)',
    options: [
      {
        name: 'user',
        description: 'The user to activate',
        type: 6,
        required: true,
      },
    ],
  },
  {
    name: 'setup-channels',
    description: 'Create private hc- channels for all activated creators (Admin only)',
  },
  {
  name: 'setup-channel',
  description: 'Create a private hc- channel for a specific creator (Admin only)',
  options: [
    {
      name: 'user',
      description: 'The user to create a channel for',
      type: 6,
      required: true,
    },
  ],
},
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Registering slash commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered successfully!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
})();
