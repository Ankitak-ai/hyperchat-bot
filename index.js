const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const { createClient } = require('@supabase/supabase-js');

// ===== ENV =====
const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ===== CLIENT =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers
  ]
});

// ===== COMMAND =====
const commands = [
  new SlashCommandBuilder()
    .setName('apply')
    .setDescription('Apply for Creator access')
    .addStringOption(o =>
      o.setName('details')
        .setDescription('Channel link + intro')
        .setRequired(true)
    )
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  await rest.put(
    Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
    { body: commands }
  );
}

// ===== READY =====
client.once('clientReady', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// ===== APPLY =====
client.on('interactionCreate', async interaction => {

  // ---------- APPLY ----------
  if (interaction.isChatInputCommand() &&
      interaction.commandName === 'apply') {

    const details = interaction.options.getString('details');

    const { data } = await supabase
      .from('creator_applications')
      .insert({
        discord_id: interaction.user.id,
        username: interaction.user.tag,
        content: details,
        status: 'pending'
      })
      .select()
      .single();

    const staffChannel =
      interaction.guild.channels.cache.find(
        c => c.name === 'creator-applications'
      );

    if (!staffChannel)
      return interaction.reply({
        content: 'Staff channel not configured.',
        ephemeral: true
      });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`claim_${data.id}`)
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId(`approve_${data.id}`)
        .setLabel('Approve')
        .setStyle(ButtonStyle.Success),

      new ButtonBuilder()
        .setCustomId(`reject_${data.id}`)
        .setLabel('Reject')
        .setStyle(ButtonStyle.Danger)
    );

    const msg = await staffChannel.send({
      content:
`📩 **New Creator Application**

User: ${interaction.user.tag}
ID: ${interaction.user.id}

Details:
${details}

Status: Pending`,
      components: [row]
    });

    await supabase
      .from('creator_applications')
      .update({ message_id: msg.id })
      .eq('id', data.id);

    await interaction.reply({
      content: 'Application submitted.',
      ephemeral: true
    });
  }

  // ---------- BUTTON HANDLING ----------
  if (interaction.isButton()) {

    const [action, id] = interaction.customId.split('_');

    const { data: app } = await supabase
      .from('creator_applications')
      .select('*')
      .eq('id', id)
      .single();

    if (!app)
      return interaction.reply({
        content: 'Application not found.',
        ephemeral: true
      });

    // ----- CLAIM -----
    if (action === 'claim') {

      if (app.assigned_to)
        return interaction.reply({
          content: 'Already claimed.',
          ephemeral: true
        });

      await supabase
        .from('creator_applications')
        .update({
          assigned_to: interaction.user.id,
          status: 'in_review'
        })
        .eq('id', id);

      return interaction.update({
        content:
`📩 Application — CLAIMED by ${interaction.user.tag}

User: ${app.username}
Details:
${app.content}`,
        components: interaction.message.components
      });
    }

    // ----- APPROVE -----
    if (action === 'approve') {

      if (app.status === 'approved')
        return interaction.reply({
          content: 'Already approved.',
          ephemeral: true
        });

      const member =
        await interaction.guild.members.fetch(app.discord_id);

      const role =
        interaction.guild.roles.cache.find(r => r.name === 'Creator');

      if (role) await member.roles.add(role);

      await supabase
        .from('creator_applications')
        .update({ status: 'approved' })
        .eq('id', id);

      try {
        await member.send(
          'Your HyperChat Creator application has been approved.'
        );
      } catch {}

      return interaction.update({
        content:
`✅ APPROVED by ${interaction.user.tag}

User: ${app.username}`,
        components: []
      });
    }

    // ----- REJECT -----
    if (action === 'reject') {

      await supabase
        .from('creator_applications')
        .update({ status: 'rejected' })
        .eq('id', id);

      try {
        const member =
          await interaction.guild.members.fetch(app.discord_id);

        await member.send(
          'Your HyperChat Creator application was not approved.'
        );
      } catch {}

      return interaction.update({
        content:
`❌ REJECTED by ${interaction.user.tag}

User: ${app.username}`,
        components: []
      });
    }
  }
});

// ===== START =====
(async () => {
  await registerCommands();
  client.login(TOKEN);
})();
