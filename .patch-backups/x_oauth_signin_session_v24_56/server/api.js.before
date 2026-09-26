import { randomUUID, timingSafeEqual } from 'node:crypto';
import { config } from './config.js';
import { db, recordClaim, getIndexerStatus } from './db.js';
import { homeData, listTokens, getToken, moneySummary, profile, listPayments } from './queries.js';
import { verifyAndRegisterMint, buildFeeRoutingTransaction, buildPumpCreateTransaction, confirmUserSignedTransaction, parseRecipient, fetchSolUsd } from './solana.js';
import { runDiscovery, runClaims, runPayouts } from './workers.js';
import { confirmPayout, optOutHandle } from './payouts.js';
import { sellSolUsd } from './kraken.js';
import { startXOAuth, finishXOAuth } from './xoauth.js';

function json(res,status,body){ const data=JSON.stringify(body); res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(data); }
async function body(req,maxBytes=1_000_000){ const chunks=[]; let size=0; for await(const c of req){ size+=c.length; if(size>maxBytes)throw Object.assign(new Error('Body too large'),{statusCode:413}); chunks.push(c); } if(!chunks.length)return {}; const text=Buffer.concat(chunks).toString('utf8'); try{return JSON.parse(text);}catch{throw Object.assign(new Error('Invalid JSON'),{statusCode:400});} }
function secureEq(a,b){ const aa=Buffer.from(a||''),bb=Buffer.from(b||''); return aa.length===bb.length && aa.length>0 && timingSafeEqual(aa,bb); }
function requireAdmin(req){ const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'') || req.headers['x-admin-token']; if(!config.adminToken||!secureEq(token,config.adminToken))throw Object.assign(new Error('Unauthorized'),{statusCode:401}); }
function requireWebhook(req){ const token=req.headers['x-webhook-secret'] || (req.headers.authorization||'').replace(/^Bearer\s+/i,''); if(!config.webhookSecret||!secureEq(token,config.webhookSecret))throw Object.assign(new Error('Unauthorized'),{statusCode:401}); }
function requireWritable(){ if(config.readOnlyMode)throw Object.assign(new Error('Read-only mode: money-moving and accounting mutation routes are disabled'),{statusCode:423}); }
function requireUserSignedLaunch(){ if(!config.userSignedLaunchEnabled)throw Object.assign(new Error('User-signed launch is disabled'),{statusCode:423}); }




/* all-token-images-v10 */
function tokenImageCandidates(raw){
  const value=String(raw||'').trim();
  if(!value) return [];
  const out=[];
  const add=(url)=>{
    const u=String(url||'').trim();
    if(u && /^https?:\/\//i.test(u) && !out.includes(u)) out.push(u);
  };

  if(/^ar:\/\//i.test(value)){
    add(`https://arweave.net/${value.replace(/^ar:\/\//i,'')}`);
    return out;
  }

  let ipfsPath='';
  if(/^ipfs:\/\//i.test(value)){
    ipfsPath=value.replace(/^ipfs:\/\//i,'').replace(/^ipfs\//i,'');
  }else{
    const m=value.match(/\/ipfs\/([^?#]+)/i);
    if(m) ipfsPath=m[1];
  }

  if(ipfsPath){
    ipfsPath=ipfsPath.replace(/^\/+/,'');
    add(value);
    add(`https://ipfs.io/ipfs/${ipfsPath}`);
    add(`https://gateway.pinata.cloud/ipfs/${ipfsPath}`);
    add(`https://dweb.link/ipfs/${ipfsPath}`);
    return out;
  }

  add(value);
  return out;
}

function imageValuesFromMetadata(meta){
  if(!meta || typeof meta!=='object') return [];
  const values=[
    meta.image_uri,meta.image,meta.imageUrl,meta.image_url,
    meta.metadata?.image_uri,meta.metadata?.image,meta.metadata?.imageUrl,meta.metadata?.image_url,
    meta.coin_metadata?.image_uri,meta.coin_metadata?.image,meta.coin_metadata?.imageUrl,meta.coin_metadata?.image_url
  ];
  return [...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))];
}

function metadataUris(meta){
  if(!meta || typeof meta!=='object') return [];
  const values=[meta.uri,meta.metadata_uri,meta.metadataUri,meta.metadata?.uri,meta.coin_metadata?.uri];
  return [...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))];
}

async function fetchMetadataJson(target){
  const direct=String(target||'').trim();
  const candidates=tokenImageCandidates(direct);
  if(/^https?:\/\//i.test(direct) && !candidates.includes(direct)) candidates.unshift(direct);
  for(const url of candidates.length?candidates:[direct]){
    if(!/^https?:\/\//i.test(url)) continue;
    try{
      const r=await fetch(url,{
        headers:{accept:'application/json,text/plain;q=0.9,*/*;q=0.5'},
        redirect:'follow',
        signal:AbortSignal.timeout(12000)
      });
      if(!r.ok) continue;
      const text=await r.text();
      if(text.length>2_000_000) continue;
      const data=JSON.parse(text);
      if(data && typeof data==='object') return data;
    }catch{}
  }
  return null;
}

async function resolvePumpTokenImages(mint){
  const candidates=[];
  const addRaw=(raw)=>{
    for(const url of tokenImageCandidates(raw)){
      if(!candidates.includes(url)) candidates.push(url);
    }
  };

  const stored=getToken(mint);
  addRaw(stored?.image_url||'');

  const urls=[...new Set([
    config.pumpMetadataUrlTemplate.replace('{mint}',encodeURIComponent(mint)),
    `https://frontend-api-v3.pump.fun/coins-v2/${encodeURIComponent(mint)}`,
    `https://frontend-api-v3.pump.fun/coins/${encodeURIComponent(mint)}`
  ])];

  for(const target of urls){
    try{
      const r=await fetch(target,{headers:{accept:'application/json'},redirect:'follow',signal:AbortSignal.timeout(12000)});
      if(!r.ok) continue;
      const meta=await r.json();

      for(const raw of imageValuesFromMetadata(meta)) addRaw(raw);
      for(const uri of metadataUris(meta)){
        const metadata=await fetchMetadataJson(uri);
        if(!metadata) continue;
        for(const raw of imageValuesFromMetadata(metadata)) addRaw(raw);
      }
    }catch{}
  }

  if(stored?.metadata_json){
    try{
      const meta=JSON.parse(stored.metadata_json);
      for(const raw of imageValuesFromMetadata(meta)) addRaw(raw);
      for(const uri of metadataUris(meta)){
        const metadata=await fetchMetadataJson(uri);
        if(!metadata) continue;
        for(const raw of imageValuesFromMetadata(metadata)) addRaw(raw);
      }
    }catch{}
  }

  return candidates;
}

async function proxyTokenImage(res,mint){
  const candidates=await resolvePumpTokenImages(mint);
  for(const target of candidates){
    try{
      const r=await fetch(target,{
        headers:{
          accept:'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          'user-agent':'Mozilla/5.0'
        },
        redirect:'follow',
        signal:AbortSignal.timeout(15000)
      });
      if(!r.ok) continue;
      const type=String(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(!type.startsWith('image/')) continue;
      const bytes=Buffer.from(await r.arrayBuffer());
      if(!bytes.length || bytes.length>8_000_000) continue;

      res.writeHead(200,{
        'content-type':type,
        'content-length':String(bytes.length),
        'cache-control':'public, max-age=900, stale-while-revalidate=3600',
        'x-content-type-options':'nosniff'
      });
      res.end(bytes);
      return true;
    }catch{}
  }
  return false;
}



/* sitewide-x-avatars-v13 */
function largerXAvatar(url){
  return String(url||'').replace(/_normal(\.[a-z0-9]+)(\?.*)?$/i,'_400x400$1$2');
}

async function resolveXAvatar(handle){
  const username=String(handle||'').replace(/^@/,'').trim();
  if(!/^[A-Za-z0-9_]{1,15}$/.test(username)) return null;

  const existing=db.prepare(
    'SELECT handle,display_name,avatar_url,x_user_id FROM recipients WHERE handle=? COLLATE NOCASE'
  ).get(username);

  if(existing?.avatar_url) return String(existing.avatar_url);
  if(!config.xBearerToken) return null;

  try{
    const fields='id,name,username,profile_image_url';
    const r=await fetch(
      `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=${encodeURIComponent(fields)}`,
      {
        headers:{authorization:`Bearer ${config.xBearerToken}`,accept:'application/json'},
        signal:AbortSignal.timeout(12000)
      }
    );
    if(!r.ok) return null;

    const payload=await r.json().catch(()=>({}));
    const u=payload?.data;
    const avatarUrl=largerXAvatar(u?.profile_image_url||'');
    if(!avatarUrl) return null;

    if(existing){
      db.prepare(`UPDATE recipients
        SET x_user_id=COALESCE(NULLIF(?,''),x_user_id),
            display_name=COALESCE(NULLIF(?,''),display_name),
            avatar_url=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE handle=? COLLATE NOCASE`)
        .run(
          String(u?.id||''),
          String(u?.name||u?.username||''),
          avatarUrl,
          username
        );
    }

    return avatarUrl;
  }catch{
    return null;
  }
}

async function proxyXAvatar(res,handle){
  const target=await resolveXAvatar(handle);
  if(!target) return false;

  try{
    const r=await fetch(target,{
      headers:{
        accept:'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'user-agent':'Mozilla/5.0'
      },
      redirect:'follow',
      signal:AbortSignal.timeout(12000)
    });
    if(!r.ok) return false;

    const type=String(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!type.startsWith('image/')) return false;

    const bytes=Buffer.from(await r.arrayBuffer());
    if(!bytes.length || bytes.length>3_000_000) return false;

    res.writeHead(200,{
      'content-type':type,
      'content-length':String(bytes.length),
      'cache-control':'public, max-age=3600, stale-while-revalidate=86400',
      'x-content-type-options':'nosniff'
    });
    res.end(bytes);
    return true;
  }catch{
    return false;
  }
}


/* sitewide-x-banners-v22-1 */
async function resolveXBanner(handle){
  const username=String(handle||'').replace(/^@/,'').trim();
  if(!/^[A-Za-z0-9_]{1,15}$/.test(username)) return null;

  const existing=db.prepare(
    'SELECT handle,banner_url,avatar_url FROM recipients WHERE handle=? COLLATE NOCASE'
  ).get(username);

  if(existing?.banner_url) return String(existing.banner_url);
  if(!config.xBearerToken) return null;

  try{
    const fields='id,name,username,profile_image_url,profile_banner_url,verified,verified_type';
    const r=await fetch(
      `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=${encodeURIComponent(fields)}`,
      {
        headers:{authorization:`Bearer ${config.xBearerToken}`,accept:'application/json'},
        signal:AbortSignal.timeout(12000)
      }
    );
    if(!r.ok) return null;

    const payload=await r.json().catch(()=>({}));
    const u=payload?.data;
    if(!u) return null;

    const avatarUrl=largerXAvatar(u.profile_image_url||'');
    const bannerUrl=String(u.profile_banner_url||'').trim();

    if(existing){
      db.prepare(`UPDATE recipients
        SET x_user_id=COALESCE(NULLIF(?,''),x_user_id),
            display_name=COALESCE(NULLIF(?,''),display_name),
            avatar_url=COALESCE(NULLIF(?,''),avatar_url),
            banner_url=COALESCE(NULLIF(?,''),banner_url),
            verified=?,
            verified_type=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE handle=? COLLATE NOCASE`)
        .run(
          String(u.id||''),
          String(u.name||u.username||''),
          avatarUrl,
          bannerUrl,
          u.verified?1:0,
          String(u.verified_type||''),
          username
        );
    }

    return bannerUrl||null;
  }catch{
    return null;
  }
}

async function proxyXBanner(res,handle){
  const target=await resolveXBanner(handle);
  if(!target) return false;

  try{
    const r=await fetch(target,{
      headers:{
        accept:'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        'user-agent':'Mozilla/5.0'
      },
      redirect:'follow',
      signal:AbortSignal.timeout(12000)
    });
    if(!r.ok) return false;

    const type=String(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!type.startsWith('image/')) return false;

    const bytes=Buffer.from(await r.arrayBuffer());
    if(!bytes.length || bytes.length>8_000_000) return false;

    res.writeHead(200,{
      'content-type':type,
      'content-length':String(bytes.length),
      'cache-control':'public, max-age=3600, stale-while-revalidate=86400',
      'x-content-type-options':'nosniff'
    });
    res.end(bytes);
    return true;
  }catch{
    return false;
  }
}



/* x-identities-batch-v23-1 */
function cacheXIdentityUser(u){
  const username=String(u?.username||'').replace(/^@/,'').trim();
  if(!username) return null;

  const avatarUrl=largerXAvatar(u?.profile_image_url||u?.profileImageUrl||'');
  const bannerUrl=String(u?.profile_banner_url||u?.profileBannerUrl||'').trim();
  const displayName=String(u?.name||username).trim()||username;
  const verifiedType=String(u?.verified_type||u?.verifiedType||'');
  const verified=Boolean(u?.verified);

  db.prepare(`INSERT INTO recipients(
    handle,x_user_id,display_name,avatar_url,banner_url,verified,verified_type
  ) VALUES(?,?,?,?,?,?,?)
  ON CONFLICT(handle) DO UPDATE SET
    x_user_id=COALESCE(NULLIF(excluded.x_user_id,''),recipients.x_user_id),
    display_name=COALESCE(NULLIF(excluded.display_name,''),recipients.display_name),
    avatar_url=COALESCE(NULLIF(excluded.avatar_url,''),recipients.avatar_url),
    banner_url=COALESCE(NULLIF(excluded.banner_url,''),recipients.banner_url),
    verified=excluded.verified,
    verified_type=excluded.verified_type,
    updated_at=CURRENT_TIMESTAMP`)
    .run(
      username,
      String(u?.id||''),
      displayName,
      avatarUrl,
      bannerUrl,
      verified?1:0,
      verifiedType
    );

  return {
    username,
    name:displayName,
    profileImageUrl:avatarUrl,
    profileBannerUrl:bannerUrl,
    verified,
    verifiedType
  };
}

async function fetchSingleXIdentity(username){
  if(!config.xBearerToken) return null;

  try{
    const fields='id,name,username,profile_image_url,profile_banner_url,verified,verified_type';
    const r=await fetch(
      `https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=${encodeURIComponent(fields)}`,
      {
        headers:{authorization:`Bearer ${config.xBearerToken}`,accept:'application/json'},
        signal:AbortSignal.timeout(12000)
      }
    );

    if(!r.ok) return null;
    const payload=await r.json().catch(()=>({}));
    if(!payload?.data) return null;
    return cacheXIdentityUser(payload.data);
  }catch{
    return null;
  }
}

async function resolveXIdentities(handles){
  const usernames=[...new Set((handles||[])
    .map(x=>String(x||'').replace(/^@/,'').trim())
    .filter(x=>/^[A-Za-z0-9_]{1,15}$/.test(x))
  )].slice(0,100);

  if(!usernames.length) return [];

  const live=new Map();

  if(config.xBearerToken){
    // Fast path: X batch lookup.
    try{
      const fields='id,name,username,profile_image_url,profile_banner_url,verified,verified_type';
      const r=await fetch(
        `https://api.x.com/2/users/by?usernames=${encodeURIComponent(usernames.join(','))}&user.fields=${encodeURIComponent(fields)}`,
        {
          headers:{authorization:`Bearer ${config.xBearerToken}`,accept:'application/json'},
          signal:AbortSignal.timeout(15000)
        }
      );

      if(r.ok){
        const payload=await r.json().catch(()=>({}));
        for(const u of (payload?.data||[])){
          const identity=cacheXIdentityUser(u);
          if(identity) live.set(identity.username.toLowerCase(),identity);
        }
      }
    }catch{}

    // Reliable fallback: if the DB name is still literally the @handle,
    // refresh that account through the single X profile lookup.
    const getStored=db.prepare(`SELECT handle,display_name FROM recipients
      WHERE handle=? COLLATE NOCASE`);

    const stale=usernames.filter(username=>{
      if(live.has(username.toLowerCase())) return false;
      const row=getStored.get(username);
      const stored=String(row?.display_name||'').replace(/^@/,'').trim();
      return !stored || stored.toLowerCase()===username.toLowerCase();
    });

    for(let i=0;i<stale.length;i+=4){
      const group=stale.slice(i,i+4);
      const resolved=await Promise.all(group.map(fetchSingleXIdentity));
      resolved.filter(Boolean).forEach(identity=>{
        live.set(identity.username.toLowerCase(),identity);
      });
    }
  }

  const get=db.prepare(`SELECT handle,display_name,avatar_url,banner_url,verified,verified_type
    FROM recipients WHERE handle=? COLLATE NOCASE`);

  return usernames.map(username=>{
    const current=live.get(username.toLowerCase());
    if(current) return current;

    const row=get.get(username)||{};
    return {
      username:String(row.handle||username),
      name:String(row.display_name||username),
      profileImageUrl:String(row.avatar_url||''),
      profileBannerUrl:String(row.banner_url||''),
      verified:Boolean(row.verified),
      verifiedType:String(row.verified_type||'')
    };
  });
}


export async function handleApi(req,res,url){
  try{

    if(req.method==='GET'&&url.pathname.startsWith('/api/token-image/')){
      const mint=decodeURIComponent(url.pathname.slice('/api/token-image/'.length)).trim();
      if(!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint)) return json(res,400,{error:'Invalid mint'});
      const sent=await proxyTokenImage(res,mint);
      if(sent) return;
      return json(res,404,{error:'Token image not found'});
    }
    if(req.method==='GET'&&url.pathname.startsWith('/api/x-avatar/')){
      const handle=decodeURIComponent(url.pathname.slice('/api/x-avatar/'.length)).replace(/^@/,'').trim();
      if(!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return json(res,400,{error:'Invalid X username'});
      const sent=await proxyXAvatar(res,handle);
      if(sent) return;
      return json(res,404,{error:'X avatar not found'});
    }
    if(req.method==='GET'&&url.pathname.startsWith('/api/x-banner/')){
      const handle=decodeURIComponent(url.pathname.slice('/api/x-banner/'.length)).replace(/^@/,'').trim();
      if(!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return json(res,400,{error:'Invalid X username'});
      const sent=await proxyXBanner(res,handle);
      if(sent) return;
      return json(res,404,{error:'X banner not found'});
    }
    if(req.method==='GET'&&url.pathname==='/api/health') return json(res,200,{ok:true,name:config.appName,treasuryConfigured:!!config.treasuryAddress,readOnly:config.readOnlyMode,liveChain:config.liveChainTransactions,userSignedLaunch:config.userSignedLaunchEnabled,onchainDiscovery:config.onchainDiscoveryEnabled,claimWorker:!config.readOnlyMode&&config.claimWorkerEnabled&&config.liveChainTransactions,payoutWorker:!config.readOnlyMode&&config.payoutWorkerEnabled,payoutProvider:config.payoutProvider,exchangeProvider:config.exchangeProvider,indexer:getIndexerStatus()});
    if(req.method==='GET'&&url.pathname==='/api/indexer/status') return json(res,200,getIndexerStatus());
    if(req.method==='GET'&&url.pathname==='/api/config') return json(res,200,{name:config.appName,mark:config.appMark,treasuryAddress:config.treasuryAddress,recipientShareBps:config.recipientShareBps,protocolShareBps:config.protocolShareBps,readOnly:config.readOnlyMode,liveChain:config.liveChainTransactions,userSignedLaunch:config.userSignedLaunchEnabled,payoutProvider:config.payoutProvider});
    if(req.method==='GET'&&url.pathname==='/api/home') return json(res,200,homeData());
    if(req.method==='GET'&&url.pathname==='/api/tokens') return json(res,200,{tokens:listTokens({search:url.searchParams.get('search')||'',sort:url.searchParams.get('sort')||'sent',venue:url.searchParams.get('venue')||'',limit:url.searchParams.get('limit')||100})});
    if(req.method==='GET'&&url.pathname.startsWith('/api/tokens/')){ const row=getToken(decodeURIComponent(url.pathname.slice('/api/tokens/'.length))); return row?json(res,200,row):json(res,404,{error:'Not found'}); }
    if(req.method==='GET'&&url.pathname.startsWith('/api/profiles/')){ const row=profile(decodeURIComponent(url.pathname.slice('/api/profiles/'.length))); return row?json(res,200,row):json(res,404,{error:'Not found'}); }
    if(req.method==='GET'&&url.pathname==='/api/money') return json(res,200,moneySummary());
    if(req.method==='GET'&&url.pathname==='/api/payments') return json(res,200,{payments:listPayments(Number(url.searchParams.get('limit')||50))});
    if(req.method==='GET'&&url.pathname==='/api/x/identities'){
      const usernames=String(url.searchParams.get('usernames')||'')
        .split(',')
        .map(x=>x.trim())
        .filter(Boolean)
        .slice(0,100);
      return json(res,200,{identities:await resolveXIdentities(usernames)});
    }
    if(req.method==='GET'&&url.pathname==='/api/x/profile'){
      const username=String(url.searchParams.get('username')||'').replace(/^@/,'').trim();
      if(!/^[A-Za-z0-9_]{1,15}$/.test(username))throw Object.assign(new Error('Invalid X username'),{statusCode:400});
      if(!config.xBearerToken)throw Object.assign(new Error('X lookup is not configured'),{statusCode:503});
      const fields='id,name,username,profile_image_url,profile_banner_url,verified,verified_type';
      const r=await fetch(`https://api.x.com/2/users/by/username/${encodeURIComponent(username)}?user.fields=${encodeURIComponent(fields)}`,{
        headers:{authorization:`Bearer ${config.xBearerToken}`,accept:'application/json'},
        signal:AbortSignal.timeout(12000)
      });
      const payload=await r.json().catch(()=>({}));
      if(r.status===404 || (!payload.data && Array.isArray(payload.errors) && payload.errors.some(x=>x?.status===404))){
        return json(res,404,{error:'X account not found'});
      }
      if(!r.ok || !payload.data){
        const message=payload?.detail||payload?.title||payload?.errors?.[0]?.detail||payload?.errors?.[0]?.message||`X API HTTP ${r.status}`;
        throw Object.assign(new Error(message),{statusCode:r.status===429?429:502});
      }
      const u=payload.data;
      /* cache-x-profile-avatar-v13 + x-profile-banner-v22-1 */
      const cachedAvatar=largerXAvatar(u.profile_image_url||'');
      const cachedBanner=String(u.profile_banner_url||'').trim();
      db.prepare(`UPDATE recipients
        SET x_user_id=COALESCE(NULLIF(?,''),x_user_id),
            display_name=COALESCE(NULLIF(?,''),display_name),
            avatar_url=COALESCE(NULLIF(?,''),avatar_url),
            banner_url=COALESCE(NULLIF(?,''),banner_url),
            verified=?,
            verified_type=?,
            updated_at=CURRENT_TIMESTAMP
        WHERE handle=? COLLATE NOCASE`)
        .run(
          String(u.id||''),
          String(u.name||u.username||''),
          cachedAvatar,
          cachedBanner,
          u.verified?1:0,
          String(u.verified_type||''),
          username
        );
      return json(res,200,{
        id:String(u.id||''),
        name:String(u.name||u.username||''),
        username:String(u.username||username),
        profileImageUrl:String(u.profile_image_url||''),
        profileBannerUrl:cachedBanner,
        verified:Boolean(u.verified),
        verifiedType:String(u.verified_type||'')
      });
    }
    if(req.method==='POST'&&url.pathname==='/api/tokens/register'){ const b=await body(req); const out=await verifyAndRegisterMint(b.mint,{fallbackHandle:b.recipient_handle||''}); return json(res,out.ok?200:422,out); }
    if(req.method==='POST'&&url.pathname==='/api/launch/intents'){ const b=await body(req); const handle=String(b.recipient_handle||'').replace(/^@/,'').trim(); if(!/^[A-Za-z0-9_]{1,15}$/.test(handle))throw Object.assign(new Error('Invalid X handle'),{statusCode:400}); const opted=db.prepare('SELECT opted_out FROM recipients WHERE handle=? COLLATE NOCASE').get(handle); if(opted?.opted_out)throw Object.assign(new Error('Recipient has opted out'),{statusCode:409}); const id=randomUUID(); const line=`Fees to @${handle} via ${config.appName}`; db.prepare(`INSERT INTO launch_intents(id,mint,recipient_handle,creator_pubkey,description_line,status) VALUES(?,?,?,?,?,'draft')`).run(id,b.mint||null,handle,b.creator_pubkey||null,line); return json(res,201,{id,descriptionLine:line,treasuryAddress:config.treasuryAddress,status:'draft'}); }
    if(req.method==='POST'&&url.pathname==='/api/launch/metadata'){
      requireUserSignedLaunch();
      const b=await body(req,7_000_000);
      const intent=db.prepare('SELECT * FROM launch_intents WHERE id=?').get(b.intent_id||'');
      if(!intent)throw Object.assign(new Error('Launch intent not found'),{statusCode:404});
      const name=String(b.name||'').trim(),symbol=String(b.symbol||'').trim().toUpperCase();
      if(!name||name.length>32)throw Object.assign(new Error('Token name must be 1-32 characters'),{statusCode:400});
      if(!symbol||symbol.length>13)throw Object.assign(new Error('Ticker must be 1-13 characters'),{statusCode:400});
      const type=String(b.image_type||'').toLowerCase();
      if(!/^image\/(png|jpeg|gif|webp)$/.test(type))throw Object.assign(new Error('Unsupported token image type'),{statusCode:400});
      let image;
      try{image=Buffer.from(String(b.image_base64||''),'base64');}catch{throw Object.assign(new Error('Invalid token image'),{statusCode:400});}
      if(!image.length||image.length>5_000_000)throw Object.assign(new Error('Token image must be 1 byte to 5 MB'),{statusCode:400});
      let description=String(b.description||'').trim();
      if(!description.includes(intent.description_line))description=`${description}${description?'\n\n':''}${intent.description_line}`;
      const form=new FormData();
      const safeName=String(b.image_name||'token-image').replace(/[^A-Za-z0-9._-]/g,'_').slice(-80)||'token-image';
      form.append('file',new Blob([image],{type}),safeName);
      form.append('name',name);
      form.append('symbol',symbol);
      form.append('description',description);
      form.append('twitter',String(b.twitter||''));
      form.append('telegram',String(b.telegram||''));
      form.append('website',String(b.website||''));
      form.append('showName','true');
      const r=await fetch(config.pumpMetadataUploadUrl,{method:'POST',body:form,signal:AbortSignal.timeout(60000)});
      const raw=await r.text();
      let payload={};try{payload=JSON.parse(raw);}catch{}
      if(!r.ok)throw Object.assign(new Error(`Pump metadata upload failed (HTTP ${r.status})`),{statusCode:502});
      const metadataUri=payload.metadataUri||payload.metadata_uri||payload.uri;
      if(!metadataUri)throw Object.assign(new Error('Pump metadata upload did not return metadataUri'),{statusCode:502});
      db.prepare(`UPDATE launch_intents SET status='metadata-ready',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(intent.id);
      return json(res,200,{ok:true,metadataUri,descriptionLine:intent.description_line});
    }
    if(req.method==='POST'&&url.pathname==='/api/launch/prepare-create'){
      requireUserSignedLaunch();
      const b=await body(req);
      const intent=db.prepare('SELECT * FROM launch_intents WHERE id=?').get(b.intent_id||'');
      if(!intent)throw Object.assign(new Error('Launch intent not found'),{statusCode:404});
      const user=String(b.user_pubkey||'').trim(),name=String(b.name||'').trim(),symbol=String(b.symbol||'').trim().toUpperCase(),uri=String(b.metadata_uri||'').trim();
      if(!user||!name||!symbol||!uri)throw Object.assign(new Error('user_pubkey, name, symbol and metadata_uri required'),{statusCode:400});
      const solLamports=Number(b.sol_lamports||0);
      if(!Number.isSafeInteger(solLamports)||solLamports<0)throw Object.assign(new Error('Invalid initial buy amount'),{statusCode:400});
      if(solLamports>0){
        const r=await fetch(config.pumpCreateApiUrl,{
          method:'POST',
          headers:{'content-type':'application/json','accept':'application/json'},
          body:JSON.stringify({
            user,name,symbol,uri,solLamports:String(solLamports),
            mayhemMode:false,cashback:false,tokenizedAgent:false,
            frontRunningProtection:false,tipAmount:0,encoding:'base64',
            feePayer:user,creator:user
          }),
          signal:AbortSignal.timeout(30000)
        });
        const raw=await r.text();let out={};try{out=JSON.parse(raw);}catch{}
        if(!r.ok)throw Object.assign(new Error(out.error||out.message||`Pump create builder failed (HTTP ${r.status})`),{statusCode:502});
        const transactionBase64=out.transaction||out.transactionBase64;
        const mint=out.mintPublicKey||out.mint;
        if(!transactionBase64||!mint)throw Object.assign(new Error('Pump create builder returned an incomplete transaction'),{statusCode:502});
        return json(res,200,{transactionBase64,mint,requiresMintSignature:false,mode:'create-and-buy',solLamports});
      }
      if(!b.mint_pubkey)throw Object.assign(new Error('mint_pubkey required for a zero-buy launch'),{statusCode:400});
      const out=await buildPumpCreateTransaction({mint:b.mint_pubkey,user,name,symbol,uri});
      return json(res,200,out);
    }
    if(req.method==='POST'&&url.pathname==='/api/launch/created'){
      requireUserSignedLaunch();
      const b=await body(req);
      const intent=db.prepare('SELECT * FROM launch_intents WHERE id=?').get(b.intent_id||'');
      if(!intent)throw Object.assign(new Error('Launch intent not found'),{statusCode:404});
      const out=await confirmUserSignedTransaction({signature:b.tx_signature,mint:b.mint});
      db.prepare(`UPDATE launch_intents SET mint=?,creator_pubkey=COALESCE(?,creator_pubkey),status='created',tx_signature=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.mint,b.creator_pubkey||null,b.tx_signature||null,intent.id);
      return json(res,200,out);
    }
    if(req.method==='POST'&&url.pathname==='/api/launch/prepare-routing'){
      requireUserSignedLaunch();
      const b=await body(req);
      if(!b.mint||!b.creator_pubkey)throw Object.assign(new Error('mint and creator_pubkey required'),{statusCode:400});
      const tx=await buildFeeRoutingTransaction({mint:b.mint,creator:b.creator_pubkey});
      return json(res,200,tx);
    }
    if(req.method==='POST'&&url.pathname==='/api/launch/confirm'){
      const b=await body(req);
      if(!b.mint)throw Object.assign(new Error('mint required'),{statusCode:400});
      if(b.tx_signature)await confirmUserSignedTransaction({signature:b.tx_signature,mint:b.mint});
      const intent=b.intent_id?db.prepare('SELECT * FROM launch_intents WHERE id=?').get(b.intent_id):null;
      const fallback=intent?.recipient_handle||b.recipient_handle||'';
      const out=await verifyAndRegisterMint(b.mint,{fallbackHandle:fallback});
      if(out.ok && b.intent_id) db.prepare(`UPDATE launch_intents SET mint=?,status='registered',tx_signature=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(b.mint,b.tx_signature||null,b.intent_id);
      return json(res,out.ok?200:422,out);
    }
    if(req.method==='POST'&&url.pathname==='/api/webhooks/pump'){ requireWebhook(req); const b=await body(req); const key=b.id||b.signature||randomUUID(); try{db.prepare(`INSERT INTO webhook_events(id,source,event_key,payload_json) VALUES(?,?,?,?)`).run(randomUUID(),'pump',key,JSON.stringify(b));}catch{return json(res,200,{ok:true,duplicate:true});} const mints=[...(Array.isArray(b.mints)?b.mints:[]),...(b.mint?[b.mint]:[])]; const out=[]; for(const mint of [...new Set(mints)]){try{out.push(await verifyAndRegisterMint(mint,{fallbackHandle:b.recipient_handle||''}));}catch(e){out.push({ok:false,mint,error:e.message});}} return json(res,200,{ok:true,results:out}); }
    if(req.method==='POST'&&url.pathname==='/api/webhooks/payout'){ requireWebhook(req); requireWritable(); const b=await body(req); return json(res,200,confirmPayout({id:b.id,status:b.status||'sent',provider_ref:b.provider_ref||b.reference,confirmation_url:b.public_confirmation_url})); }
    if(req.method==='GET'&&url.pathname==='/api/auth/x/start'){ const dest=startXOAuth(); res.writeHead(302,{location:dest}); return res.end(); }
    if(req.method==='GET'&&url.pathname==='/api/auth/x/callback'){ const user=await finishXOAuth({code:url.searchParams.get('code'),state:url.searchParams.get('state')}); if(!user?.username)throw new Error('X did not return a username'); const result=optOutHandle(user.username); res.writeHead(302,{location:`/#/opt-out?done=${encodeURIComponent(result.handle)}`}); return res.end(); }
    if(req.method==='POST'&&url.pathname==='/api/admin/opt-out'){ requireAdmin(req); const b=await body(req); return json(res,200,optOutHandle(b.handle)); }
    if(req.method==='POST'&&url.pathname==='/api/admin/claim-record'){ requireAdmin(req); requireWritable(); const b=await body(req); const price=Number(b.native_usd_price||await fetchSolUsd()); return json(res,201,recordClaim({mint:b.mint,txSignature:b.tx_signature||null,grossNative:Number(b.gross_native),nativeUsdPrice:price,raw:{manual:true}})); }
    if(req.method==='POST'&&url.pathname==='/api/admin/payout-confirm'){ requireAdmin(req); requireWritable(); const b=await body(req); return json(res,200,confirmPayout({id:b.id,status:b.status||'sent',provider_ref:b.provider_ref,confirmation_url:b.public_confirmation_url})); }
    if(req.method==='POST'&&url.pathname==='/api/admin/exchange/sell'){ requireAdmin(req); requireWritable(); const b=await body(req); return json(res,200,await sellSolUsd({claimId:b.claim_id||null,volumeSol:Number(b.volume_sol)})); }
    if(req.method==='POST'&&url.pathname==='/api/admin/run/discovery'){ requireAdmin(req); return json(res,200,await runDiscovery()); }
    if(req.method==='POST'&&url.pathname==='/api/admin/run/claims'){ requireAdmin(req); requireWritable(); return json(res,200,await runClaims()); }
    if(req.method==='POST'&&url.pathname==='/api/admin/run/payouts'){ requireAdmin(req); requireWritable(); return json(res,200,await runPayouts()); }
    if(req.method==='GET'&&url.pathname==='/api/admin/status'){ requireAdmin(req); return json(res,200,{tokens:db.prepare('SELECT COUNT(*) n FROM tokens').get().n,claims:db.prepare('SELECT COUNT(*) n FROM claims').get().n,payouts:db.prepare('SELECT COUNT(*) n FROM payouts').get().n,buybacksPending:db.prepare(`SELECT COALESCE(SUM(amount_usd),0) v FROM buybacks WHERE status='pending'`).get().v,launchIntents:db.prepare('SELECT COUNT(*) n FROM launch_intents').get().n}); }
    return json(res,404,{error:'API route not found'});
  }catch(e){ const status=e.statusCode||500; if(status>=500)console.error('[api]',e); else console.warn(`[api] ${req.method} ${url.pathname} ${status}: ${e.message}`); return json(res,status,{error:e.message||'Internal error'}); }
}
