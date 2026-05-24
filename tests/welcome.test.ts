import { describe, it, expect } from 'vitest';
import { renderTemplate, welcomeText, goodbyeText } from '../src/bot/welcome';

const ctx = { user: '<@7>', username: 'Ahmed', server: 'LY', memberCount: 42 };

describe('welcome templating', () => {
  it('replaces every placeholder, including repeats', () => {
    const out = renderTemplate('{user} {username} {server} {memberCount} {count} {user}', ctx);
    expect(out).toBe('<@7> Ahmed LY 42 42 <@7>');
  });

  it('falls back to a default when the template is empty', () => {
    expect(welcomeText('', ctx)).toContain('<@7>');
    expect(welcomeText(null, ctx)).toContain('LY');
    expect(goodbyeText('   ', ctx)).toContain('Ahmed');
  });

  it('uses a custom template when provided', () => {
    expect(welcomeText('hi {username}', ctx)).toBe('hi Ahmed');
  });
});
