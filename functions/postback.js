// /postback — OGAds conversion postback receiver.
//
// Configure in OGAds dashboard → Postback URL:
//   https://perklt.com/postback?sub={subid1}&source={subid2}&campaign={subid3}
//     &payout={payout}&offer={offer_name}&secret=<POSTBACK_SECRET>
//
// (exact token names depend on OGAds — adjust to whatever their docs expose)

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.searchParams.get('secret') !== env.POSTBACK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const subid =
    url.searchParams.get('sub') ||
    url.searchParams.get('subid1') ||
    url.searchParams.get('s1');
  if (!subid) return new Response('missing sub', { status: 400 });

  const payout = parseFloat(url.searchParams.get('payout') || '0') || 0;
  const offer = url.searchParams.get('offer') || '';
  const source = url.searchParams.get('source') || '';
  const campaign = url.searchParams.get('campaign') || '';

  const raw = Object.fromEntries(url.searchParams);
  delete raw.secret;

  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO conversions
       (subid, ts, payout, offer, source, campaign, raw)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        subid,
        Date.now(),
        payout,
        offer,
        source,
        campaign,
        JSON.stringify(raw)
      )
      .run();
  } catch (_) {
    return new Response('db error', { status: 500 });
  }

  return new Response('ok');
}
