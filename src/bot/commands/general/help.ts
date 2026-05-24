import { SlashCommandBuilder, ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

const CATEGORIES: { title: string; commands: [string, string][] }[] = [
  {
    title: '📌 عام',
    commands: [
      ['/help', 'عرض هذه القائمة'],
      ['/ping', 'قياس سرعة استجابة البوت'],
      ['/dashboard', 'رابط لوحة التحكم'],
    ],
  },
  {
    title: '🛡️ الإشراف',
    commands: [
      ['/ban', 'حظر عضو'],
      ['/kick', 'طرد عضو'],
      ['/timeout', 'كتم عضو لمدة'],
      ['/warn', 'تحذير عضو'],
      ['/unban', 'فك الحظر عبر المعرّف'],
      ['/clear', 'حذف رسائل'],
      ['/slowmode', 'الوضع البطيء'],
    ],
  },
  {
    title: '🧰 أدوات',
    commands: [
      ['/userinfo', 'معلومات عضو'],
      ['/serverinfo', 'معلومات السيرفر'],
      ['/avatar', 'صورة عضو'],
      ['/poll', 'إنشاء تصويت'],
      ['/say', 'إعلان باسم البوت'],
    ],
  },
];

module.exports = {
  data: new SlashCommandBuilder().setName('help').setDescription('يعرض قائمة جميع الأوامر المتاحة'),

  async execute(interaction: ChatInputCommandInteraction) {
    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle('📋 أوامر LY-SYSTEM')
      .setDescription('نظام إدارة وحماية متكامل لسيرفرك — مع لوحة تحكم على الويب.')
      .setThumbnail(interaction.client.user?.displayAvatarURL() ?? null)
      .setFooter({ text: 'LY-SYSTEM • /dashboard للوحة التحكم' })
      .setTimestamp();

    for (const cat of CATEGORIES) {
      embed.addFields({
        name: cat.title,
        value: cat.commands.map(([name, desc]) => `**${name}** — ${desc}`).join('\n'),
      });
    }

    await interaction.reply({ embeds: [embed] });
  },
};
