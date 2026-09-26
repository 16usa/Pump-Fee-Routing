import crypto from 'node:crypto';
import { config } from './config.js';
import { db } from './db.js';

const b64url = b => Buffer.from(b).toString('base64url');
export function startXOAuth(){
  if(!config.xClientId||!config.xRedirectUri) throw new Error('X OAuth is not configured');
  const state=b64url(crypto.randomBytes(24)); const verifier=b64url(crypto.randomBytes(48)); const challenge=b64url(crypto.createHash('sha256').update(verifier).digest());
  db.prepare(`INSERT INTO oauth_states(state,code_verifier) VALUES(?,?)`).run(state,verifier);
  const u=new URL('https://x.com/i/oauth2/authorize');
  u.searchParams.set('response_type','code'); u.searchParams.set('client_id',config.xClientId); u.searchParams.set('redirect_uri',config.xRedirectUri); u.searchParams.set('scope','users.read offline.access'); u.searchParams.set('state',state); u.searchParams.set('code_challenge',challenge); u.searchParams.set('code_challenge_method','S256');
  return u.toString();
}
export async function finishXOAuth({code,state}){
  const row=db.prepare('SELECT * FROM oauth_states WHERE state=?').get(state); if(!row) throw new Error('Invalid or expired OAuth state'); db.prepare('DELETE FROM oauth_states WHERE state=?').run(state);
  const form=new URLSearchParams({code,grant_type:'authorization_code',client_id:config.xClientId,redirect_uri:config.xRedirectUri,code_verifier:row.code_verifier});
  const headers={'content-type':'application/x-www-form-urlencoded'}; if(config.xClientSecret) headers.authorization='Basic '+Buffer.from(`${config.xClientId}:${config.xClientSecret}`).toString('base64');
  const tr=await fetch('https://api.x.com/2/oauth2/token',{method:'POST',headers,body:form}); const tj=await tr.json(); if(!tr.ok) throw new Error(tj.error_description||tj.error||`X token ${tr.status}`);
  const me=await fetch('https://api.x.com/2/users/me?user.fields=name,username,profile_image_url,description',{headers:{authorization:`Bearer ${tj.access_token}`}}); const mj=await me.json(); if(!me.ok)throw new Error(mj.detail||`X users/me ${me.status}`);
  return mj.data;
}
