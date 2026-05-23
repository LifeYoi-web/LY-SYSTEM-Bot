import { Interaction, Collection } from 'discord.js';
import { logger } from '../../shared/logger';

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction: Interaction, commands: Collection<string, any>) {
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
      await interaction.reply({
        content: '❌ An error occurred while running this command!',
        ephemeral: true,
      });
    }
  },
};
