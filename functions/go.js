// /go — click tracker + OGAds smartlink forwarder.
// CTA buttons on the lander link here with ?s=<source>&c=<campaign>.
// We log the click to D1, then 302 to the OGAds smartlink with s1/s2/s3 subIDs
// so OGAds postbacks can tell us which source/campaign converted.

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const source =
    url.searchParams.get('s') ||
    url.searchParams.get('utm_source') ||
    'direct';
  const campaign =
    url.searchParams.get('c') ||
    url.searchParams.get('utm_campaign') ||
    '';

  const clickId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  const cf = request.cf || {};
  const ip = request.headers.get('cf-connecting-ip') || '';
  const ua = request.headers.get('user-agent') || '';
  const referrer = request.headers.get('referer') || '';
  const country = cf.country || '';
  const city = cf.city || '';
  const region = cf.region || '';

  const base = env.OGADS_URL || 'https://checkmyapp.store/sl/o1ogr';
  const smartlink =
    `${base}?s1=${clickId}` +
    `&s2=${encodeURIComponent(source)}` +
    `&s3=${encodeURIComponent(campaign)}`;

  try {
    await env.DB.prepare(
      `INSERT INTO clicks
       (id, ts, ip, country, city, region, ua, referrer, source, campaign, smartlink_to)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        smartlink
      )
      .run();
  } catch (_) {
    // never block the redirect on logging failure
  }

  return Response.redirect(smartlink, 302);
}
