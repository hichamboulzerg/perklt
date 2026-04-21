// /postback — OGAds conversion postback receiver.
//
// Configure in OGAds dashboard → Postback URL:
//   https://perklt.com/postback
//     ?sub={aff_sub}
//     &source={aff_sub2}
//     &campaign={aff_sub3}
//     &payout={payout}
//     &offer={offer_name}
//     &offer_id={offer_id}
//     &affiliate_id={affiliate_id}
//     &session_ip={session_ip}
//     &session_ts={session_timestamp}
//     &secret=<POSTBACK_SECRET>

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  if (url.searchParams.get('secret') !== env.POSTBACK_SECRET) {
    return new Response('forbidden', { status: 403 });
  }

  const p = url.searchParams;
  const subid = p.get('sub') || p.get('aff_sub') || p.get('subid1') || p.get('s1');
  if (!subid) return new Response('missing sub', { status: 400 });

  const payout = parseFloat(p.get('payout') || '0') || 0;
  const offer = p.get('offer') || p.get('offer_name') || '';
  const offerId = p.get('offer_id') || '';
  const affiliateId = p.get('affiliate_id') || '';
  const source = p.get('source') || p.get('aff_sub2') || '';
  const campaign = p.get('campaign') || p.get('aff_sub3') || '';
  const sessionIp = p.get('session_ip') || '';
  const sessionTs = p.get('session_ts') || p.get('session_timestamp') || p.get('datetime') || '';

  const raw = Object.fromEntries(p);
  delete raw.secret;

  try {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO conversions
       (subid, ts, payout, offer, offer_id, affiliate_id, source, campaign, session_ip, session_ts, raw)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        subid,
        Date.now(),
        payout,
        offer,
        offerId,
        affiliateId,
        source,
        campaign,
        sessionIp,
        sessionTs,
        JSON.stringify(raw)
      )
      .run();
  } catch (_) {
    return new Response('db error', { status: 500 });
  }

  return new Response('ok');
}
