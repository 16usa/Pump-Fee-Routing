import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';

const b64url = b => Buffer.from(b).toString('base64url');
const parseB64Json = value => JSON.parse(Buffer.from(value,'base64url').toString('utf8'));

function sessionSecret(){
  return String(
    config.xSessionSecret ||
    config.xClientSecret ||
    config.webhookSecret ||
    config.adminToken ||
    ''
  ).trim();
}

export function xOAuthConfigured(){
  return Boolean(config.xClientId);
}

export function startXOAuth({redirectUri}={}){
  const callback=String(redirectUri||config.xRedirectUri||'').trim();
  if(!config.xClientId) throw Object.assign(new Error('X OAuth client ID is not configured'),{statusCode:503});
  if(!callback) throw Object.assign(new Error('X OAuth callback URL is not configured'),{statusCode:503});

  db.prepare(`DELETE FROM oauth_states WHERE created_at < datetime('now','-20 minutes')`).run();

  const state=b64url(crypto.randomBytes(24));
  const verifier=b64url(crypto.randomBytes(48));
  const challenge=b64url(crypto.createHash('sha256').update(verifier).digest());

  db.prepare(`INSERT INTO oauth_states(state,code_verifier,redirect_uri) VALUES(?,?,?)`)
    .run(state,verifier,callback);

  const u=new URL('https://x.com/i/oauth2/authorize');
  u.searchParams.set('response_type','code');
  u.searchParams.set('client_id',config.xClientId);
  u.searchParams.set('redirect_uri',callback);
  u.searchParams.set('scope','users.read');
  u.searchParams.set('state',state);
  u.searchParams.set('code_challenge',challenge);
  u.searchParams.set('code_challenge_method','S256');
  return u.toString();
}

export async function finishXOAuth({code,state}){
  if(!code) throw Object.assign(new Error('X did not return an authorization code'),{statusCode:400});
  if(!state) throw Object.assign(new Error('Missing OAuth state'),{statusCode:400});

  const row=db.prepare('SELECT * FROM oauth_states WHERE state=?').get(state);
  if(!row) throw Object.assign(new Error('Invalid or expired OAuth state'),{statusCode:400});
  db.prepare('DELETE FROM oauth_states WHERE state=?').run(state);

  const redirectUri=String(row.redirect_uri||config.xRedirectUri||'').trim();
  if(!redirectUri) throw Object.assign(new Error('OAuth callback URL is missing'),{statusCode:500});

  const form=new URLSearchParams({
    code,
    grant_type:'authorization_code',
    client_id:config.xClientId,
    redirect_uri:redirectUri,
    code_verifier:row.code_verifier
  });

  const headers={'content-type':'application/x-www-form-urlencoded'};
  if(config.xClientSecret){
    headers.authorization='Basic '+Buffer.from(`${config.xClientId}:${config.xClientSecret}`).toString('base64');
  }

  const tr=await fetch('https://api.x.com/2/oauth2/token',{method:'POST',headers,body:form});
  const tj=await tr.json().catch(()=>({}));
  if(!tr.ok){
    throw Object.assign(
      new Error(tj.error_description||tj.error||`X token exchange failed (${tr.status})`),
      {statusCode:502}
    );
  }

  const me=await fetch(
    'https://api.x.com/2/users/me?user.fields=name,username,profile_image_url',
    {headers:{authorization:`Bearer ${tj.access_token}`,accept:'application/json'}}
  );
  const mj=await me.json().catch(()=>({}));
  if(!me.ok){
    throw Object.assign(new Error(mj.detail||mj.title||`X users/me failed (${me.status})`),{statusCode:502});
  }
  return mj.data;
}

export function createXSession(user){
  const secret=sessionSecret();
  if(!secret){
    throw Object.assign(
      new Error('X session secret is not configured. Set X_SESSION_SECRET in Replit Secrets.'),
      {statusCode:503}
    );
  }
  const now=Math.floor(Date.now()/1000);
  const payload=b64url(JSON.stringify({
    id:String(user?.id||''),
    username:String(user?.username||''),
    name:String(user?.name||user?.username||''),
    profile_image_url:String(user?.profile_image_url||''),
    iat:now,
    exp:now+1800
  }));
  const sig=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function readXSession(token){
  const secret=sessionSecret();
  if(!secret || !token) return null;
  const [payload,sig]=String(token).split('.');
  if(!payload||!sig) return null;

  const expected=crypto.createHmac('sha256',secret).update(payload).digest('base64url');
  const aa=Buffer.from(sig),bb=Buffer.from(expected);
  if(aa.length!==bb.length || !crypto.timingSafeEqual(aa,bb)) return null;

  try{
    const data=parseB64Json(payload);
    if(!data?.username || Number(data.exp||0)<Math.floor(Date.now()/1000)) return null;
    return data;
  }catch{
    return null;
  }
}
