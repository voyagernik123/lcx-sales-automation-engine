import { describe, it, expect } from 'vitest';
import { parseRssItems } from '../news.js';

describe('parseRssItems', () => {
  it('parses RSS 2.0 items (title/link/pubDate + CDATA + entities)', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item>
        <title><![CDATA[SEC charges firm & halts $BTC scheme (BTC)]]></title>
        <link>https://example.com/a?x=1&amp;y=2</link>
        <pubDate>Tue, 15 Jul 2025 10:00:00 GMT</pubDate>
      </item>
      <item>
        <title>Plain title, price hit $64k today</title>
        <link>https://example.com/b</link>
        <pubDate>not-a-date</pubDate>
      </item>
    </channel></rss>`;
    const items = parseRssItems(xml, 'sec');
    expect(items).toHaveLength(2);
    expect(items[0].source).toBe('sec');
    expect(items[0].title).toBe('SEC charges firm & halts $BTC scheme (BTC)');
    expect(items[0].url).toBe('https://example.com/a?x=1&y=2');
    expect(items[0].publishedAt).toMatch(/^2025-07-15T/);
    expect(items[0].tickers.sort()).toEqual(['BTC']); // $BTC + (BTC) deduped, no "64"
    // bad date → null; "$64k" is not a ticker (no letters after tightening)
    expect(items[1].publishedAt).toBeNull();
    expect(items[1].tickers).toEqual([]);
  });

  it('parses Atom <entry> with href link', () => {
    const xml = `<feed><entry>
      <title>ESMA publishes MiCA guidance</title>
      <link href="https://esma.europa.eu/x" rel="alternate"/>
      <updated>2025-07-10T08:00:00Z</updated>
    </entry></feed>`;
    const items = parseRssItems(xml, 'esma');
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://esma.europa.eu/x');
    expect(items[0].publishedAt).toMatch(/^2025-07-10T/);
  });

  it('returns [] for junk / empty', () => {
    expect(parseRssItems('not xml', 'x')).toEqual([]);
    expect(parseRssItems('', 'x')).toEqual([]);
  });
});
