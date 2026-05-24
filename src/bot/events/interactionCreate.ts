import { Interaction, Collection, MessageFlags, type ButtonInteraction } from 'discord.js';
import { logger } from '../../shared/logger';

async function handleRoleButton(interaction: ButtonInteraction): Promise<void> {
  const roleId = interaction.customId.slice(3); // strip "rr:"
  if (!interaction.guild) return;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: '❌ تعذّر إيجاد عضويتك.', flags: MessageFlags.Ephemeral });
    return;
  }
  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      await interaction.reply({ content: `➖ أزلت رتبة <@&${roleId}>`, flags: MessageFlags.Ephemeral });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ content: `➕ أضفت رتبة <@&${roleId}>`, flags: MessageFlags.Ephemeral });
    }
  } catch {
    await interaction.reply({
      content: '❌ تعذّر تعديل الرتبة — تأكد أن رتبة البوت أعلى من الرتبة المطلوبة.',
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction: Interaction, commands: Collection<string, any>) {
    // Button interactions (role panels use customId "rr:<roleId>").
    if (interaction.isButton()) {
      if (interaction.customId.startsWith('rr:')) await handleRoleButton(interaction).catch(() => undefined);
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (!command) {
      logger.warning(`Unknown command: ${interaction.commandName}`);
      return;
    }

    try {
      await command.execute(interaction);
      logger.info(`Command executed: /${interaction.commandName} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error in command ${interaction.commandName}: ${error}`);
      const payload = { content: '❌ صار خطأ أثناء تنفيذ الأمر!', flags: MessageFlags.Ephemeral } as const;
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => undefined);
      else await interaction.reply(payload).catch(() => undefined);
    }
  },
};
