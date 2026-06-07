import { useMe, useSelectGuild } from '../auth';

export function GuildPicker() {
  const { data: me } = useMe();
  const select = useSelectGuild();

  if (!me?.guilds || me.guilds.length <= 1) return null;

  return (
    <select
      value={me.guildId}
      disabled={select.isPending}
      onChange={(e) => select.mutate(e.target.value)}
      style={{
        width: '100%',
        background: 'rgba(255,255,255,0.04)',
        color: 'inherit',
        border: '1px solid rgba(245,124,0,0.4)',
        borderRadius: 10,
        padding: '8px 10px',
        marginBottom: 12,
        fontFamily: 'inherit',
        cursor: 'pointer',
      }}
      aria-label="اختيار السيرفر"
    >
      {me.guilds.map((g) => (
        <option key={g.id} value={g.id} style={{ color: '#000' }}>
          {g.name}
        </option>
      ))}
    </select>
  );
}
