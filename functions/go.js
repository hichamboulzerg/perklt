// /go — click tracker + OGAds smartlink forwarder.
//
// Blocks:
//  1. Non-tier-1 geo (we only ship offers in US/UK/CA/AU/NZ)
//  2. Empty User-Agent
//  3. Common bot/scraper User-Agents
//  4. Cloudflare bot-management score < 30 (when available)
//
// Blocked clicks are logged to D1 with a `blocked` reason and NOT forwarded
// to OGAds (protects your account quality score). Blocked humans land on /
// instead of the smartlink; blocked bots get a 204.

const TIER1 = new Set(['US', 'GB', 'CA', 'AU', 'NZ']); // GB == UK

const BOT_UA = /(bot|crawl|spider|slurp|mediapartners|headless|phantomjs|puppeteer|playwright|selenium|curl\/|wget\/|python-requests|python-urllib|go-http-client|java\/|okhttp|axios|node-fetch|httpclient|httpunit|facebookexternalhit|twitterbot|whatsapp|telegrambot|linkedinbot|discordbot|slackbot|ahrefsbot|semrushbot|mj12bot|dotbot|petalbot|yandexbot|bingbot|googlebot|applebot|duckduckbot|baiduspider|sogou|exabot|seznam)/i;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const source = url.searchParams.get('s') || url.searchParams.get('utm_source') || 'direct';
  const campaign = url.searchParams.get('c') || url.searchParams.get('utm_campaign') || '';

  const clickId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  const cf = request.cf || {};
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  const referrer = request.headers.get('referer') || '';
  const country = (cf.country || '').toUpperCase();
  const city = cf.city || '';
  const region = cf.region || '';
  const botScore = Number((cf.botManagement && cf.botManagement.score) ?? cf.clientTrustScore ?? -1);

  // Decide block reason, if any
  let blocked = null;
  let looksLikeBot = false;
  if (!ua) {
    blocked = 'empty_ua';
    looksLikeBot = true;
  } else if (BOT_UA.test(ua)) {
    blocked = 'bot_ua';
    looksLikeBot = true;
  } else if (botScore >= 0 && botScore < 30) {
    blocked = 'bot_score';
    looksLikeBot = true;
  } else if (country && !TIER1.has(country)) {
    blocked = 'geo_' + country;
  } else if (!country) {
    // unknown country is suspicious but not definitive — let through with a tag
    blocked = null;
  }

  // Build outbound URL (only used when not blocked)
  const base = env.OGADS_URL || 'https://checkmyapp.store/sl/o1ogr';
  const smartlink = blocked
    ? null
    : `${base}?aff_sub=${clickId}` +
      `&aff_sub2=${encodeURIComponent(source)}` +
      `&aff_sub3=${encodeURIComponent(campaign)}`;

  // Log (fire-and-await; don't fail the request on DB error)
  try {
    await env.DB.prepare(
      `INSERT INTO clicks
       (id, ts, ip, country, city, region, ua, referrer, source, campaign, smartlink_to, blocked, bot_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        clickId,
        Date.now(),
        ip,
        country,
        city,
        region,
        ua,
        referrer,
        source,
        campaign,
        smartlink,
        blocked,
        botScore >= 0 ? botScore : null
      )
      .run();
  } catch (_) { /* never block the user on a log failure */ }

  if (blocked) {
    // Bots: 204 No Content. Humans (wrong geo): land on homepage.
    if (looksLikeBot) return new Response(null, { status: 204 });
    return Response.redirect(url.origin + '/', 302);
  }

  return Response.redirect(smartlink, 302);
}
