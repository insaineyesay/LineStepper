import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config';

describe('loadConfig', () => {
  it('drops trailing slashes from CORS origins, which browsers never send', () => {
    const config = loadConfig({ CORS_ORIGINS: 'https://a.vercel.app/, https://b.com' });
    expect(config.corsOrigins).toEqual(['https://a.vercel.app', 'https://b.com']);
  });
});
