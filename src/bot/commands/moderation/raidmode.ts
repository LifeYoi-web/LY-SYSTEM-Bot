import { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { setRaidMode } from '../../raid';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raidmode')
    .setDescription('تفعيل/إيقاف وضع الحماية من الريد (قفل السيرفر)')
    .addStringOption((o) =>
      o
        .setName('mode')
        .setDescription('تشغيل أو إيقاف')
        .setRequired(true)
        .addChoices({ name: 'تشغيل', value: 'on' }, { name: 'إيقاف', value: 'off' }),
    )
    .setDefaultMemberPermissions(Number(PermissionFlagsBits.ManageGuild)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const on = interaction.options.getString('mode', true) === 'on';
    await setRaidMode(interaction.guild, on);
    await interaction.reply({
      content: on ? '🔒 تم تفعيل وضع الحماية من الريد.' : '🔓 تم إيقاف وضع الحماية من الريد.',
      flags: MessageFlags.Ephemeral,
    });
  },
};
