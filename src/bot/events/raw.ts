import { getMusicManager } from '../music/manager';

/**
 * Forward raw gateway packets (VOICE_STATE_UPDATE / VOICE_SERVER_UPDATE) to Lavalink so it can
 * establish the voice connection. No-op when music is disabled.
 */
module.exports = {
  name: 'raw',
  once: false,
  async execute(packet: unknown) {
    const mgr = getMusicManager();
    if (mgr) await mgr.sendRawData(packet as never).catch(() => undefined);
  },
};
