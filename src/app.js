import { BRAND as FALLBACK_BRAND } from './config.js';

const app=document.querySelector('#app');
const state={brand:{...FALLBACK_BRAND},home:null,money:null,tokens:[],loading:false,error:'',explore:{query:'',sort:'sent',venue:''}};
const esc=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const fmtMoney=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:Number(n)>=1000?0:2}).format(Number(n||0));
const fmtNum=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(n||0));
const fmtMc=n=>Number(n)>=1e6?`$${(Number(n)/1e6).toFixed(1)}M`:Number(n)>=1e3?`$${(Number(n)/1e3).toFixed(Number(n)>=100000?0:1)}K`:`$${fmtNum(n)}`;
const ago=v=>{if(!v)return'';const ms=Math.max(0,Date.now()-new Date(v).getTime()),m=Math.floor(ms/60000);if(m<60)return`${m}m`;const h=Math.floor(m/60);if(h<24)return`${h}h`;return`${Math.floor(h/24)}d`;};
const initials=s=>String(s||'?').replace(/^@/,'').split(/\s+/).map(x=>x[0]).join('').slice(0,2).toUpperCase();
async function api(path,opts={}){const r=await fetch(path,{...opts,headers:{'content-type':'application/json',...(opts.headers||{})}});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||`HTTP ${r.status}`);return j;}
const avatar=(text,large=false,img='')=>img?`<div class="avatar ${large?'avatar-lg':''}"><img src="${esc(img)}" alt=""></div>`:`<div class="avatar ${large?'avatar-lg':''}" aria-hidden="true">${esc(initials(text))}</div>`;
const logo=()=>`<a class="logo" href="#/" aria-label="Home"><span>${esc(state.brand.mark||'P')}</span></a>`;
const platformBadge=(name='Pump')=>`<span class="platform-badge">${String(name).toLowerCase()==='pons'?'◼':'◉'} ${esc(name)}</span>`;
const sectionTitle=(title,link='')=>`<div class="section-title"><h2>${esc(title)}</h2>${link?`<a href="${link}">View all</a>`:''}</div>`;
const pager=(i=1,total=1)=>`<div class="pager"><button disabled>‹</button><span>${i} / ${total}</span><button disabled>›</button></div>`;
function header(){return `<header class="topbar"><div class="topbar-inner">${logo()}<nav class="desktop-nav"><a href="#/explore">Explore</a><a href="#/money">Money</a><a href="#/capital-flow">Capital flow</a><a href="#/docs">Docs</a></nav><div class="top-actions"><button class="launch-pill" data-action="open-launch">Launch</button><button class="menu-btn" data-action="menu" aria-label="Menu"><i></i><i></i></button></div></div><div class="mobile-menu hidden" id="mobileMenu"><a href="#/explore">Explore</a><a href="#/money">Money</a><a href="#/capital-flow">Capital flow</a><a href="#/paid">Protocol</a><a href="#/docs">Docs</a><a href="#/opt-out">Opt out</a><a href="#/legal">Legal</a></div></header>`;}
function footer(){return `<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-brand">
      ${logo()}
      <p>Independent creator-fee routing protocol.</p>
      <span>© 2026 ${esc(state.brand.name)}</span>
    </div>

    <div class="footer-links">
      <b>Product</b>
      <a href="#/explore">Explore</a>
      <a href="#/money">Money</a>
      <a href="#/launch">Launch</a>
    </div>

    <div class="footer-links">
      <b>Protocol</b>
      <a href="#/capital-flow">Capital flow</a>
      <a href="#/paid">Protocol cut</a>
      <a href="#/docs">How it works</a>
    </div>

    <div class="footer-links">
      <b>Legal</b>
      <a href="#/legal">Terms</a>
      <a href="#/opt-out">Opt out</a>
    </div>
  </div>
</footer>`;}
function tokenCard(t,compact=false){return `<a class="token-card ${compact?'compact':''}" href="#/token/${encodeURIComponent(t.mint||t.contract)}"><div class="token-img">${avatar(t.symbol||t.name,true,t.image_url)}</div><div class="token-meta"><div class="meta-line">${platformBadge(t.platform||'Pump')}<span class="muted">@${esc(t.profile||t.recipient_handle||'')}</span><span class="muted">${esc(t.age||ago(t.created_at))}</span></div><div class="token-name"><strong>${esc(t.name)}</strong><span>${esc(t.symbol)}</span></div><div class="token-numbers"><span>${fmtMc(t.mc??t.market_cap_usd)} <small>MC</small></span><span>${fmtNum(t.sent)} <small>Sent</small></span>${compact?'':`<span>${fmtNum(t.owed)} <small>Owed</small></span>`}</div>${compact?'':`<div class="contract">${esc((t.mint||'').slice(0,6))}…${esc((t.mint||'').slice(-6))}</div>`}</div></a>`;}
function paymentCard(p,i){const amount=p.amount_usd??p.amount??0;const to=p.display_name||p.recipient_handle||p.to||'recipient';const mints=String(p.mints||'').split(',').filter(Boolean);return `<button class="payment-card expandable" data-expand="payment-${i}"><div class="row"><div><strong>${fmtMoney(amount)}</strong><span>${['sent','claimed'].includes(p.status)?'sent':'scheduled'} to <b>${esc(to)}</b> ${['sent','claimed'].includes(p.status)?'<em>✓</em>':''}</span></div><span class="chev">⌄</span></div><div class="mini-tokens">${mints.slice(0,5).map((x,j)=>`${j?'<span class="arrow">→</span>':''}<span class="mini-icon">${esc(x[0]||'T')}</span>`).join('')}<time>${esc(ago(p.sent_at||p.created_at))}</time></div><div class="details hidden"><div><span>Status</span><b>${esc(p.status||'queued')}</b></div><div><span>Provider</span><b>${esc(p.provider||'')}</b></div><div><span>Reference</span><b>${esc(p.provider_ref||p.id||'')}</b></div>${p.public_confirmation_url?`<div><span>Confirmation</span><b>${esc(p.public_confirmation_url)}</b></div>`:''}</div></button>`;}
function txCard(x,i){return `<button class="transfer-card expandable" data-expand="tx-${i}"><div class="tx-icon">≋</div><div class="tx-main"><strong>${x.received_usd?fmtMoney(x.received_usd):`${fmtNum(x.volume_native)} SOL`}</strong><span>${esc(x.pair||'SOLUSD')} · ${esc(x.side||'sell')}</span></div><div class="tx-side"><span class="tx-status">${esc(x.status||'queued')}</span><small>${esc(ago(x.filled_at||x.created_at))}</small></div><span class="chev">⌄</span><div class="tx-details hidden"><div><span>Provider</span><b>${esc(x.provider||'')}</b></div><div><span>Reference</span><b>${esc(x.provider_ref||x.id||'')}</b></div></div></button>`;}
function moneyProfile(handle){
  const key=String(handle||'').replace(/^@/,'').toLowerCase();
  return (state.home?.profiles||[]).find(p=>String(p.handle||'').replace(/^@/,'').toLowerCase()===key)||null;
}

function moneyTokenByMint(mint){
  return (state.tokens||[]).find(t=>(t.mint||t.contract)===mint)||null;
}

function moneyRoundIcon(label,kind='dark'){
  return `<span class="money-round-icon ${kind}">${esc(label)}</span>`;
}

function moneyRecentCard(p,i){
  const amount=p.amount_usd??p.amount??0;
  const handle=p.recipient_handle||p.to||'recipient';
  const profile=moneyProfile(handle);
  const mints=String(p.mints||'').split(',').filter(Boolean);
  const token=moneyTokenByMint(mints[0]||'');
  const confirmed=['sent','claimed'].includes(p.status);
  return `<button class="money-payment-card expandable" data-expand="money-payment-${i}">
    <div class="money-payment-copy">
      <strong>${fmtMoney(amount)}</strong>
      <span>${confirmed?'sent':'scheduled'} to <b>${esc(p.display_name||handle)}</b>${confirmed?' <em>✓</em>':''}</span>
    </div>
    <span class="chev">⌄</span>
    <div class="money-payment-route">
      <div class="money-payment-avatar">
        ${token?avatar(token.symbol||token.name,true,token.image_url):avatar(mints[0]||'T',true)}
        <i>●</i>
      </div>
      <b class="money-dollar">$</b>
      <div class="money-payment-avatar">
        ${avatar(profile?.display_name||p.display_name||handle,true,profile?.avatar_url||p.avatar_url||'')}
        <i class="x">X</i>
      </div>
      <time>${esc(ago(p.sent_at||p.created_at))}</time>
    </div>
    <div class="details hidden">
      <div><span>Status</span><b>${esc(p.status||'queued')}</b></div>
      <div><span>Provider</span><b>${esc(p.provider||'')}</b></div>
      <div><span>Reference</span><b>${esc(p.provider_ref||p.id||'')}</b></div>
    </div>
  </button>`;
}

function moneyOffRampCard(x,i){
  const side=String(x.side||'sell').toLowerCase();
  const status=String(x.status||'queued');
  const provider=String(x.provider||'rail');
  const native=Number(x.volume_native||0);
  const usd=Number(x.received_usd||0);
  const swapped=/swap/i.test(status)||side==='swap';
  const sentUsd=usd>0 && !swapped;
  const amount=usd>0?fmtMoney(usd):`${fmtNum(native)} SOL`;
  const subtitle=swapped
    ? `swapped ${fmtNum(native)} SOL`
    : sentUsd?`USD sent to ${provider}`:`sent to ${provider}`;
  const left=swapped||!sentUsd?moneyRoundIcon('≋','sol'):moneyRoundIcon('🇺🇸','usd');
  const right=swapped?moneyRoundIcon('🇺🇸','usd'):moneyRoundIcon(provider.slice(0,1).toUpperCase(),'provider');
  const arrow=swapped?'⇄':'→';
  return `<button class="money-transfer-card expandable" data-expand="money-off-${i}">
    <div class="money-transfer-copy"><strong>${esc(amount)}</strong><span>${esc(subtitle)}</span></div>
    <div class="money-transfer-route">${left}<b>${arrow}</b>${right}</div>
    <div class="money-transfer-side"><span class="money-status">${esc(status)}</span><time>${esc(ago(x.filled_at||x.created_at))}</time></div>
    <span class="chev">⌄</span>
    <div class="tx-details hidden">
      <div><span>Provider</span><b>${esc(provider)}</b></div>
      <div><span>Pair</span><b>${esc(x.pair||'SOLUSD')}</b></div>
      <div><span>Reference</span><b>${esc(x.provider_ref||x.id||'')}</b></div>
    </div>
  </button>`;
}

function moneyTopTokenCard(t){
  const handle=t.recipient_handle||t.profile||'';
  const profile=moneyProfile(handle);
  return `<a class="money-top-token-card" href="#/token/${encodeURIComponent(t.mint||t.contract||'')}">
    <div class="money-top-route">
      <div class="money-payment-avatar">${avatar(t.symbol||t.name,true,t.image_url)}<i>●</i></div>
      <b class="money-dollar">$</b>
      <div class="money-payment-avatar">${avatar(profile?.display_name||handle||'X',true,profile?.avatar_url||'')}<i class="x">X</i></div>
    </div>
    <div class="money-top-values">
      <strong>${fmtMoney(t.sent||0)}</strong>
      <span>${fmtMoney(t.owed||0)} owed</span>
    </div>
  </a>`;
}

function moneyOnRampCard(x,i){
  const provider=String(x.provider||'Kraken');
  const usd=Number(x.received_usd||x.gross_usd||0);
  const native=Number(x.volume_native||0);
  const amount=usd>0?fmtMoney(usd):(native>0?`${fmtNum(native)} SOL`:'$0.00');
  return `<button class="money-on-card expandable" data-expand="money-on-${i}">
    <div class="money-on-copy"><strong>${esc(amount)}</strong><span>from <b>${esc(provider)}</b></span></div>
    ${moneyRoundIcon('$','payout')}
    <div class="money-on-side"><span class="money-status">Received</span><time>${esc(ago(x.filled_at||x.created_at))}</time></div>
    <span class="chev">⌄</span>
    <div class="tx-details hidden">
      <div><span>Provider</span><b>${esc(provider)}</b></div>
      <div><span>Pair</span><b>${esc(x.pair||'')}</b></div>
      <div><span>Reference</span><b>${esc(x.provider_ref||x.id||'')}</b></div>
    </div>
  </button>`;
}

function moneyBridgeSection(){
  return `<section class="wrap money-section">
    <div class="money-section-head money-bridge-head">
      <h2>Bridge <small><i>↗</i> Configured treasury rail</small></h2>
      <div class="money-pager"><button disabled>‹</button><span>1 / 1</span><button disabled>›</button></div>
    </div>
    <div class="money-empty-card">
      <div class="money-empty-route">${moneyRoundIcon('◇','bridge')}<b>→</b>${moneyRoundIcon('≋','sol')}</div>
      <strong>No bridge activity yet.</strong>
      <span>Bridge events will appear here when a bridge adapter is configured.</span>
    </div>
  </section>`;
}

function moneySections(money){
  const exchanges=money?.exchange||[];
  const offRamp=exchanges.filter(x=>!isOnRampOrder(x));
  const onRamp=exchanges.filter(isOnRampOrder);
  const topTokens=(state.tokens||[]).slice().sort((a,b)=>Number(b.sent||0)-Number(a.sent||0)).slice(0,6);
  const inTransit=onRamp.reduce((sum,x)=>sum+Number(x.received_usd||x.gross_usd||0),0);

  return `<section class="wrap money-section">
    <div class="money-section-head"><h2>Off-ramp</h2><div class="money-pager"><button disabled>‹</button><span>1</span><button disabled>›</button></div></div>
    <div class="money-filter-tabs"><button class="active">All</button><button disabled>Deposits</button><button disabled>Swaps</button><button disabled>ACH</button></div>
    <div class="money-list">${offRamp.length?offRamp.slice(0,6).map(moneyOffRampCard).join(''):'<div class="money-empty-card"><strong>No off-ramp activity yet.</strong><span>Exchange and payout-rail events will appear here.</span></div>'}</div>
  </section>

  ${moneyBridgeSection()}

  <section class="wrap money-section">
    <p class="money-delay">Updates are delayed. Showing top paid tokens from the confirmed ledger.</p>
    <div class="money-section-head">
      <h2>Top paid tokens</h2>
      <div class="money-pager"><button disabled>‹</button><span>1 / 1</span><button disabled>›</button></div>
    </div>
    <p class="money-explainer">Ranked by all-time amount sent. Owed amounts do not affect rank. Recipient shown is the token's current beneficiary.</p>
    <div class="money-list">${topTokens.length?topTokens.map(moneyTopTokenCard).join(''):'<div class="money-empty-card"><strong>No paid tokens yet.</strong><span>Tokens will be ranked here after confirmed payouts.</span></div>'}</div>
  </section>

  <section class="wrap money-section">
    <div class="money-section-head">
      <h2>On-ramp <small class="money-transit">${fmtMoney(inTransit)} <span>in transit</span></small></h2>
      <div class="money-pager"><button disabled>‹</button><span>1</span><button disabled>›</button></div>
    </div>
    <div class="money-list">${onRamp.length?onRamp.slice(0,6).map(moneyOnRampCard).join(''):'<div class="money-empty-card"><strong>No on-ramp activity yet.</strong><span>Confirmed funding events will appear here.</span></div>'}</div>
  </section>`;
}

function moneyFooter(){
  return `<footer class="money-footer">
    <div class="money-footer-inner">
      <div class="money-footer-brand">
        <b>${esc(state.brand.name)}</b>
        <span>© 2026 ${esc(state.brand.name)}</span>
        <em>𝕏</em>
        <small>Not affiliated with X Corp.</small>
      </div>
      <div class="money-footer-links"><b>Product</b><a href="#/explore">Explore</a><a href="#/money">Payments</a><a href="#/money">Analytics</a><a href="#/launch">Launch</a></div>
      <div class="money-footer-links"><b>Protocol</b><a href="#/capital-flow">Capital Flow</a><a href="#/paid">$PAID</a><a href="#/docs">Docs</a></div>
      <div class="money-footer-links"><b>Legal</b><a href="#/legal">Terms</a><a href="#/legal">Privacy</a><a href="#/legal">Disclosures</a><a href="#/opt-out">Opt out</a></div>
    </div>
  </footer>`;
}

function homeHeroCard(h,top){
  const t=top[0]||null;
  const p=(h.profiles||[])[0]||null;
  const handle=t?.profile||t?.recipient_handle||p?.handle||'';
  const display=p?.display_name||handle||'';
  const sent=Number(t?.sent||0);
  const owed=Number(t?.owed||0);
  return `<a class="home-hero-card" href="${t?`#/token/${encodeURIComponent(t.mint||t.contract)}`:'#/explore'}">
    <div class="home-hero-media">
      ${t?.image_url?`<img src="${esc(t.image_url)}" alt="">`:`<div class="home-hero-media-empty"><span>${esc(initials(t?.symbol||t?.name||'P'))}</span><small>${t?'Image unavailable':'No routed token yet'}</small></div>`}
      <div class="home-hero-media-badge">${platformBadge(t?.platform||'Pump')}</div>
      <div class="home-hero-media-route">${handle?`@${esc(handle)}`:'Treasury'}</div>
    </div>
    <div class="home-hero-card-body">
      <div class="home-hero-token-row">
        <div>
          <small>${handle?`@${esc(handle)}`:'Waiting for first route'}</small>
          <strong>${t?esc(t.name):'No routed token yet'}</strong>
          <span>${t?`${esc(t.symbol||'')} · ${fmtMc(t.mc??t.market_cap_usd)} MC`:'Permanent 100% creator-fee route required'}</span>
        </div>
        <b>${t?fmtMoney(sent):'$0.00'}</b>
      </div>
      <div class="home-hero-stats">
        <div><span>Sent</span><b>${fmtMoney(sent)}</b></div>
        <div><span>Owed</span><b>${fmtMoney(owed)}</b></div>
        <div><span>Recipient</span><b>${handle?`@${esc(handle)}`:'—'}</b></div>
      </div>
      <div class="home-hero-card-foot"><span>${display?esc(display):'Verified on-chain routing'}</span><em>${t?'View token →':'Explore →'}</em></div>
    </div>
  </a>`;
}

function homePreviewDeck(h,top){
  const t=top[0]||null;
  const pay=(h.payments||[])[0]||null;
  const money=h.money||{};
  const profile=(h.profiles||[])[0]||null;
  const total=Number(money.totalPaid||0);
  return `<section class="home-preview-shell">
    <div class="wrap home-preview-stack">
      <a class="home-preview-card home-preview-token-card" href="#/explore">
        <div class="home-preview-label"><b>Explore</b><span>View all →</span></div>
        <div class="home-preview-token-row">
          ${t?avatar(t.symbol||t.name,true,t.image_url):'<div class="home-preview-placeholder">P</div>'}
          <div>
            <small>${t?`@${esc(t.profile||t.recipient_handle||'')}`:'Token routing'}</small>
            <strong>${t?esc(t.name):'No routed token yet'}</strong>
            <span>${t?`${fmtMc(t.mc??t.market_cap_usd)} MC · ${fmtMoney(t.sent)} Sent`:'Tokens appear here after on-chain verification'}</span>
          </div>
          <em>→</em>
        </div>
      </a>

      <a class="home-preview-card home-preview-payment-card" href="#/money">
        <div class="home-preview-label"><b>Payments</b><span>View all →</span></div>
        <div class="home-preview-payment">
          <small>${pay?'Latest confirmed payment':'Confirmed payouts'}</small>
          <strong>${pay?fmtMoney(pay.amount_usd??pay.amount??0):'$0.00'}</strong>
          <span>${pay?`sent to ${esc(pay.display_name||pay.recipient_handle||'recipient')}`:'No confirmed payments yet'}</span>
          <time>${pay?esc(ago(pay.sent_at||pay.created_at)):'—'}</time>
        </div>
      </a>

      <a class="home-preview-card home-preview-analytics-card" href="#/money">
        <div class="home-preview-label"><b>Analytics</b><span>View all →</span></div>
        <div class="home-preview-analytics">
          <small>Total paid</small>
          <strong>${fmtMoney(total)}</strong>
          <div class="home-mini-chart">${Array.from({length:22},(_,i)=>`<i style="height:${12+((i*23)%68)}%"></i>`).join('')}</div>
          <span>Confirmed ledger activity</span>
        </div>
      </a>

      <a class="home-preview-card home-preview-launch-card" href="#/launch">
        <div class="home-preview-label"><b>Launch</b><span>Open →</span></div>
        <div class="home-preview-launch">
          <small>Recipient X handle</small>
          <div class="home-preview-input">@${profile?esc(profile.handle):'recipient'}</div>
          <div class="home-preview-launch-meta">
            <span>Creator fees</span><b>100%</b>
            <span>Treasury route</span><b>Permanent</b>
          </div>
        </div>
      </a>

      <a class="home-preview-card home-preview-doc-card" href="#/docs">
        <div class="home-preview-label"><b>How it works</b><span>Read →</span></div>
        <div class="home-preview-doc-lines">
          <span><i>1</i><b>Launch token</b><small>pump.fun / supported venue</small></span>
          <span><i>2</i><b>Route creator fees</b><small>100% to treasury</small></span>
          <span><i>3</i><b>Pay recipient</b><small>public ledger confirmation</small></span>
        </div>
      </a>
    </div>
  </section>`;
}

function homeTopTokenCard(t){
  const handle=t.profile||t.recipient_handle||'';
  const mint=t.mint||t.contract||'';
  const ageText=t.age||ago(t.created_at);
  return `<a class="home-top-token-card" href="#/token/${encodeURIComponent(mint)}">
    <div class="home-top-token-media">
      ${t.image_url?`<img src="${esc(t.image_url)}" alt="">`:`<div class="home-top-token-fallback">${esc(initials(t.symbol||t.name||'T'))}</div>`}
      <div class="home-top-token-platform">${platformBadge(t.platform||'Pump')}</div>
      <div class="home-top-token-age">${esc(ageText||'')}</div>
      <div class="home-top-token-recipient">
        ${avatar(handle||t.symbol)}
        <span>${handle?`@${esc(handle)}`:'Recipient'}</span>
      </div>
    </div>
    <div class="home-top-token-body">
      <div class="home-top-token-title"><strong>${esc(t.name)}</strong><span>${esc(t.symbol||'')}</span></div>
      <div class="home-top-token-sub"><span>${fmtMc(t.mc??t.market_cap_usd)} MC</span><span>${fmtMoney(t.owed||0)} Owed</span></div>
      <div class="home-top-token-paid"><small>Sent</small><b>${fmtMoney(t.sent||0)}</b></div>
    </div>
  </a>`;
}

function homeTopTokens(top){
  const rows=top.slice(0,20);
  return `<section class="wrap section home-top-tokens">
    <div class="home-top-tokens-head">
      <h2>Top Tokens</h2>
      <div class="home-top-tokens-controls">
        <div class="home-top-token-tabs">
          <button class="active">● Pump</button>
          <button disabled>■ Pons</button>
          <button>All</button>
        </div>
        <div class="home-top-token-pager"><button disabled>‹</button><span>1</span><button disabled>›</button></div>
      </div>
    </div>
    ${rows.length
      ? `<div class="home-top-token-grid">${rows.map(homeTopTokenCard).join('')}</div>`
      : `<div class="home-top-token-empty">
          <div class="home-top-token-skeleton"><i></i><span>No registered tokens yet.</span></div>
          <div class="home-top-token-skeleton"><i></i><span>Verified tokens will appear here.</span></div>
        </div>`}
    <a class="home-top-tokens-view" href="#/explore">View all tokens →</a>
  </section>`;
}

function homeProfileCard(p,index=0){
  const name=p.display_name||p.handle;
  const tokens=Number(p.token_count||0);
  const received=Number(p.received||0);
  return `<a class="home-profile-feature" href="#/profile/${encodeURIComponent(p.handle)}">
    <div class="home-profile-cover home-profile-cover-${index%4}">
      <div class="home-profile-cover-mark">${esc(initials(name))}</div>
      <div class="home-profile-avatar">${avatar(name,true,p.avatar_url)}</div>
      <div class="home-profile-open">↗</div>
    </div>
    <div class="home-profile-feature-body">
      <div class="home-profile-feature-name">
        <div><strong>${esc(name)}</strong><span>@${esc(p.handle)}</span></div>
        <em>𝕏</em>
      </div>
      <div class="home-profile-feature-stats">
        <div><small>Tokens</small><b>${fmtNum(tokens)}</b></div>
        <div><small>Received</small><b>${fmtMoney(received)}</b></div>
      </div>
    </div>
  </a>`;
}

function homeTopProfiles(profiles){
  const rows=(profiles||[]).slice(0,4);
  return `<section class="wrap section profiles-section home-top-profiles">
    <div class="home-top-profiles-head">
      <h2>Top X Profiles</h2>
      <div class="home-top-profiles-pager"><button disabled>‹</button><span>1</span><button disabled>›</button></div>
    </div>
    ${rows.length
      ? `<div class="home-profile-feature-grid">${rows.map(homeProfileCard).join('')}</div>`
      : `<div class="home-profile-feature-grid home-profile-empty-grid">
          <div class="home-profile-feature home-profile-empty">
            <div class="home-profile-cover"><div class="home-profile-cover-mark">X</div></div>
            <div class="home-profile-feature-body"><strong>Profiles appear after tokens register.</strong><span>Recipients are ranked from real payout data.</span></div>
          </div>
          <div class="home-profile-feature home-profile-empty">
            <div class="home-profile-cover"><div class="home-profile-cover-mark">X</div></div>
            <div class="home-profile-feature-body"><strong>Waiting for recipient data.</strong><span>No demo profiles are inserted.</span></div>
          </div>
        </div>`}
  </section>`;
}

function homeRecentPaymentCard(p,i,tokens){
  const amount=p.amount_usd??p.amount??0;
  const to=p.display_name||p.recipient_handle||p.to||'recipient';
  const mints=String(p.mints||'').split(',').filter(Boolean);
  const firstMint=mints[0]||'';
  const token=(tokens||[]).find(t=>(t.mint||t.contract)===firstMint)||null;
  const confirmed=['sent','claimed'].includes(p.status);
  return `<button class="home-payment-card expandable" data-expand="home-payment-${i}">
    <div class="home-payment-top">
      <div>
        <strong>${fmtMoney(amount)}</strong>
        <span>${confirmed?'sent':'scheduled'} to <b>${esc(to)}</b>${confirmed?' <em>✓</em>':''}</span>
      </div>
      <span class="chev">⌄</span>
    </div>
    <div class="home-payment-route">
      <div class="home-payment-party home-payment-token">
        ${token?avatar(token.symbol||token.name,true,token.image_url):`<span class="home-payment-placeholder">${esc(initials(token?.symbol||firstMint||'T'))}</span>`}
        <i class="home-payment-badge">●</i>
      </div>
      <span class="home-payment-dollar">$</span>
      <div class="home-payment-party home-payment-recipient">
        ${avatar(to,true,p.avatar_url||'')}
        <i class="home-payment-x">X</i>
      </div>
      <time>${esc(ago(p.sent_at||p.created_at))}</time>
    </div>
    <div class="details hidden">
      <div><span>Status</span><b>${esc(p.status||'queued')}</b></div>
      <div><span>Provider</span><b>${esc(p.provider||'')}</b></div>
      <div><span>Reference</span><b>${esc(p.provider_ref||p.id||'')}</b></div>
      ${p.public_confirmation_url?`<div><span>Confirmation</span><b>${esc(p.public_confirmation_url)}</b></div>`:''}
    </div>
  </button>`;
}

function homeRecentPayments(h){
  const payments=(h.payments||[]).slice(0,6);
  const tokens=h.tokens||[];
  return `<section class="wrap section home-recent-payments">
    <p class="home-payment-update">Updates are delayed. Showing recent payments from the confirmed ledger.</p>
    <div class="home-recent-payments-head">
      <h2>Recent payments</h2>
      <div class="home-recent-payments-pager"><button disabled>‹</button><span>1</span><button disabled>›</button></div>
    </div>
    <div class="home-payment-list">
      ${payments.length
        ? payments.map((p,i)=>homeRecentPaymentCard(p,i,tokens)).join('')
        : `<div class="home-payment-empty">
            <div class="home-payment-empty-route"><i></i><b>$</b><i></i></div>
            <strong>No payouts recorded yet.</strong>
            <span>Confirmed payments will appear here automatically.</span>
          </div>`}
    </div>
  </section>`;
}

function homeMostPaymentRow(x,index,tokens){
  const handle=x.handle||'';
  const name=x.display_name||handle||'Recipient';
  const received=Number(x.received||0);
  const related=(tokens||[]).filter(t=>String(t.recipient_handle||t.profile||'').toLowerCase()===String(handle).toLowerCase());
  const lead=related.sort((a,b)=>Number(b.sent||0)-Number(a.sent||0))[0]||null;
  const owed=related.reduce((sum,t)=>sum+Number(t.owed||0),0);
  return `<a class="home-most-payment-row" href="#/profile/${encodeURIComponent(handle)}">
    <div class="home-most-payment-route">
      <div class="home-most-token">
        ${lead?avatar(lead.symbol||lead.name,true,lead.image_url):avatar(name,true)}
        <i class="home-most-token-mark">●</i>
      </div>
      <span class="home-most-dollar">$</span>
      <div class="home-most-recipient">
        ${avatar(name,true,x.avatar_url||'')}
        <i class="home-most-x">X</i>
      </div>
    </div>
    <div class="home-most-payment-copy">
      <strong>${fmtMoney(received)}</strong>
      <span>${owed>0?`${fmtMoney(owed)} owed`:`${related.length||0} token${related.length===1?'':'s'}`}</span>
    </div>
  </a>`;
}

function homeMostPayments(h){
  const rows=(h.money?.topPaid||[]).slice(0,6);
  const tokens=h.tokens||[];
  return `<section class="wrap section home-most-payments">
    <p class="home-most-update">Ranked by all-time confirmed payments.</p>
    <div class="home-most-payments-head">
      <h2>Most Payments</h2>
      <div class="home-most-payments-pager"><button disabled>‹</button><span>1 / 1</span><button disabled>›</button></div>
    </div>
    <div class="home-most-payments-list">
      ${rows.length
        ? rows.map((x,i)=>homeMostPaymentRow(x,i,tokens)).join('')
        : `<div class="home-most-payments-empty">
            <div class="home-most-empty-route"><i></i><b>$</b><i></i></div>
            <strong>No completed payments yet.</strong>
            <span>Recipients will be ranked here after confirmed payouts.</span>
          </div>`}
    </div>
  </section>`;
}

function homeOffRampIcon(kind){
  if(kind==='usd') return '<span class="home-off-icon home-off-usd">🇺🇸</span>';
  if(kind==='x') return '<span class="home-off-icon home-off-x">$</span>';
  if(kind==='provider') return '<span class="home-off-icon home-off-provider">●</span>';
  return '<span class="home-off-icon home-off-sol">≋</span>';
}

function homeOffRampCard(x,i){
  const received=Number(x.received_usd||0);
  const native=Number(x.volume_native||0);
  const pair=String(x.pair||'SOLUSD').toUpperCase();
  const side=String(x.side||'sell').toLowerCase();
  const status=String(x.status||'queued');
  const provider=String(x.provider||'provider');
  const amount=received>0?fmtMoney(received):`${fmtNum(native)} SOL`;
  const isSwap=side==='sell'||side==='swap'||/swap/i.test(status);
  const leftKind=received>0?'usd':'sol';
  const rightKind=isSwap?(received>0?'x':'usd'):'provider';
  const subtitle=isSwap
    ? (received>0?`USD sent to payout rail`:`swapped ${fmtNum(native)} SOL`)
    : `${received>0?'USD':'SOL'} sent to ${provider}`;
  return `<button class="home-off-card expandable" data-expand="home-off-${i}">
    <div class="home-off-main">
      <div class="home-off-copy">
        <strong>${esc(amount)}</strong>
        <span>${esc(subtitle)}</span>
      </div>
      <div class="home-off-route">
        ${homeOffRampIcon(leftKind)}
        <span class="home-off-arrow">${isSwap?'⇄':'→'}</span>
        ${homeOffRampIcon(rightKind)}
      </div>
      <div class="home-off-meta">
        <span class="home-off-status ${esc(status.toLowerCase().replace(/[^a-z0-9]+/g,'-'))}">${esc(status)}</span>
        <time>${esc(ago(x.filled_at||x.created_at))}</time>
      </div>
      <span class="chev">⌄</span>
    </div>
    <div class="tx-details hidden">
      <div><span>Provider</span><b>${esc(provider)}</b></div>
      <div><span>Pair</span><b>${esc(pair)}</b></div>
      <div><span>Side</span><b>${esc(side)}</b></div>
      <div><span>Reference</span><b>${esc(x.provider_ref||x.id||'')}</b></div>
    </div>
  </button>`;
}

function homeOffRamp(h){
  const exchanges=(h.money?.exchange||[]).slice(0,6);
  return `<section class="wrap section home-off-ramp">
    <div class="home-off-head">
      <h2>Off-ramp</h2>
      <div class="home-off-pager"><button disabled>‹</button><span>1</span><button disabled>›</button></div>
    </div>
    <div class="home-off-tabs">
      <button class="active">All</button>
      <button disabled>Deposits</button>
      <button disabled>Swaps</button>
      <button disabled>ACH</button>
    </div>
    <div class="home-off-list">
      ${exchanges.length
        ? exchanges.map(homeOffRampCard).join('')
        : `<div class="home-off-empty">
            <div class="home-off-empty-route">${homeOffRampIcon('sol')}<span>→</span>${homeOffRampIcon('provider')}</div>
            <strong>No off-ramp activity yet.</strong>
            <span>Confirmed exchange and payout-rail events will appear here.</span>
          </div>`}
    </div>
  </section>`;
}

function isOnRampOrder(x){
  const side=String(x?.side||'').toLowerCase();
  return ['buy','deposit','onramp','on-ramp','transfer_in','transfer-in','withdrawal','withdraw'].some(v=>side.includes(v));
}

function homeOnRampCard(x,i){
  const provider=String(x.provider||'Kraken');
  const usd=Number(x.received_usd||x.gross_usd||0);
  const native=Number(x.volume_native||0);
  const pair=String(x.pair||'SOLUSD').toUpperCase();
  const status=String(x.status||'received');
  const amount=usd>0?fmtMoney(usd):(native>0?`${fmtNum(native)} SOL`:'$0.00');
  return `<button class="home-on-card expandable" data-expand="home-on-${i}">
    <div class="home-on-main">
      <div class="home-on-copy">
        <strong>${esc(amount)}</strong>
        <span>from <b>${esc(provider)}</b></span>
      </div>
      <span class="home-on-money">$</span>
      <div class="home-on-meta">
        <span class="home-on-status">${esc(status)}</span>
        <time>${esc(ago(x.filled_at||x.created_at))}</time>
      </div>
      <span class="chev">⌄</span>
    </div>
    <div class="tx-details hidden">
      <div><span>Provider</span><b>${esc(provider)}</b></div>
      <div><span>Pair</span><b>${esc(pair)}</b></div>
      <div><span>Side</span><b>${esc(x.side||'')}</b></div>
      <div><span>Reference</span><b>${esc(x.provider_ref||x.id||'')}</b></div>
    </div>
  </button>`;
}

function homeOnRamp(h){
  const orders=(h.money?.exchange||[]).filter(isOnRampOrder).slice(0,6);
  const inTransit=orders.reduce((sum,x)=>sum+Number(x.received_usd||x.gross_usd||0),0);
  return `<section class="wrap section home-on-ramp">
    <div class="home-on-head">
      <h2>On-ramp</h2>
      <div class="home-on-transit"><b>${fmtMoney(inTransit)}</b><span>in transit</span></div>
      <div class="home-on-pager"><button disabled>‹</button><span>1</span><button disabled>›</button></div>
    </div>
    <div class="home-on-list">
      ${orders.length
        ? orders.map(homeOnRampCard).join('')
        : `<div class="home-on-empty">
            <div class="home-on-empty-route"><i>$</i></div>
            <strong>No on-ramp activity yet.</strong>
            <span>Confirmed funding events will appear here.</span>
          </div>`}
    </div>
  </section>`;
}

function homePage(){
  const h=state.home||{tokens:[],profiles:[],payments:[],money:{}};
  const top=h.tokens||[];
  return `<main class="home-page">
    <section class="hero wrap home-hero">
      <div class="hero-copy">
        <h1>Route token fees<br>through X Money</h1>
        <p>Point a token's creator fees at any X handle and we pay them out in dollars through X Money. Launch on Pump and Pons.</p>
        <div class="hero-buttons">
          <button class="btn-light" data-action="open-launch">Launch a token</button>
          <a class="text-link" href="#/docs">Read the docs <span>→</span></a>
        </div>
      </div>
      ${homeHeroCard(h,top)}
    </section>

    ${top.length?`<section class="marquee home-marquee"><div class="marquee-track">${top.slice(0,16).concat(top.slice(0,16)).map(t=>`<a class="marquee-item" href="#/token/${encodeURIComponent(t.mint||t.contract)}">${avatar(t.symbol)}<div><small>@${esc(t.profile)} · ${esc(t.age)}</small><b>${esc(t.name)} <i>${esc(t.symbol)}</i></b><span>${fmtMc(t.mc)} MC · ${fmtMoney(t.sent)} Sent</span></div></a>`).join('')}</div></section>`:''}

    ${homePreviewDeck(h,top)}

    ${homeTopTokens(top)}

    ${homeTopProfiles(h.profiles||[])}

    ${homeRecentPayments(h)}

    ${homeMostPayments(h)}
    ${homeOffRamp(h)}
    ${homeOnRamp(h)}
    ${footer()}
  </main>`;
}
function exploreTrendingCard(t){
  return `<a class="explore-trend-card" href="#/token/${encodeURIComponent(t.mint||t.contract||'')}">
    ${avatar(t.symbol||t.name,true,t.image_url)}
    <div>
      <strong>${esc(t.name)}</strong>
      <span>${esc(t.symbol||'')}</span>
      <small>Sent ${fmtNum(t.sent||0)}</small>
    </div>
  </a>`;
}

function exploreTokenCard(t){
  const mint=t.mint||t.contract||'';
  const handle=t.profile||t.recipient_handle||'';
  return `<a class="explore-token-card" href="#/token/${encodeURIComponent(mint)}">
    <div class="explore-token-image">
      ${t.image_url?`<img src="${esc(t.image_url)}" alt="">`:`<div class="explore-token-fallback">${esc(initials(t.symbol||t.name||'T'))}</div>`}
    </div>
    <div class="explore-token-info">
      <div class="explore-token-meta">
        ${platformBadge(t.platform||'Pump')}
        <span class="explore-token-profile">${handle?`@${esc(handle)}`:'Recipient'}</span>
        <span class="explore-token-age">${esc(t.age||ago(t.created_at))}</span>
      </div>
      <div class="explore-token-name">
        <strong>${esc(t.name)}</strong>
        <span>${esc(t.symbol||'')}</span>
      </div>
      <div class="explore-token-stats">
        <div><b>${fmtMc(t.mc??t.market_cap_usd)}</b><small>MC</small></div>
        <div><b>${fmtNum(t.sent||0)}</b><small>Sent</small></div>
        <div><b>${fmtNum(t.owed||0)}</b><small>Owed</small></div>
      </div>
      <div class="explore-token-contract">${mint?`${esc(mint.slice(0,6))}...${esc(mint.slice(-6))}`:'-'}</div>
    </div>
  </a>`;
}

function exploreTrending(tokens){
  const trending=(tokens||[]).slice(0,10);
  return `<section class="wrap section explore-trending">
    <div class="explore-section-head"><h2>Trending</h2><a href="#/explore">View all</a></div>
    ${trending.length
      ? `<div class="explore-trending-strip">${trending.map(exploreTrendingCard).join('')}</div>`
      : `<div class="explore-trending-strip explore-trending-empty">
          ${Array.from({length:3},()=>`<div class="explore-trend-skeleton"><i></i><span></span></div>`).join('')}
        </div>`}
  </section>`;
}

function explorePage(){
  const tokens=state.tokens||[];
  return `<main class="explore-page">
    <section class="wrap explore-head explore-hero">
      <div>
        <h1>Explore tokens</h1>
        <p>pump.fun launches the tokens. ${esc(state.brand.name)} claims the creator fees on chain and pays them to an X account in dollars through X Money, with a public confirmation for every payout.</p>
        <button class="btn-light" data-action="go-launch">Launch a token</button>
      </div>
    </section>

    ${exploreTrending(tokens)}

    <section class="wrap section launches explore-launches">
      <div class="explore-section-head explore-launches-head"><h2>All launches</h2></div>

      <div class="explore-venue-tabs">
        <button class="${state.explore.venue==='pump'?'active':''}" data-venue="pump">● Pump</button>
        <button class="${state.explore.venue==='pons'?'active':''}" data-venue="pons">■ Pons</button>
      </div>

      <input class="explore-search" id="tokenSearch" placeholder="Search by contract address" value="${esc(state.explore.query)}">

      <div class="sorts explore-sorts">
        <button class="${state.explore.sort==='sent'?'active':''}" data-sort="sent">Total X Payments</button>
        <button class="${state.explore.sort==='mc'?'active':''}" data-sort="mc">Market Cap</button>
        <button class="${state.explore.sort==='recent'?'active':''}" data-sort="recent">Recent</button>
      </div>

      <div class="explore-launch-grid" id="launchGrid">
        ${tokens.length?tokens.map(exploreTokenCard).join(''):`<div class="explore-empty"><span>No launches match this search.</span></div>`}
      </div>
    </section>

    ${footer()}
  </main>`;
}

function moneyPage(){
  const m=state.money||{recent:[],topPaid:[],exchange:[]};
  const updated=m.indexer?.completedAt||m.indexer?.startedAt||m.recent?.[0]?.created_at||null;
  return `<main class="money-page-v2">
    <section class="wrap money-summary-card">
      <p class="money-label">𝕏 Money</p>
      <strong class="money-summary-total">${fmtMoney(m.totalPaid||0)}</strong>
      <span class="money-summary-caption">Total paid out</span>

      <div class="money-summary-tabs">
        <button class="active">𝕏 Money</button>
        <button>Solana treasury</button>
      </div>

      <div class="money-summary-stat"><span>Currently owed</span><b>${fmtMoney(m.totalOwed||0)}</b></div>
      <div class="money-summary-stat"><span>Ledger updated</span><b>${updated?esc(ago(updated)):'—'}</b></div>
    </section>

    <section class="wrap money-section money-recent-section">
      <p class="money-delay">Updates are delayed. Showing recent payments from the confirmed ledger.</p>
      <div class="money-section-head">
        <h2>Recent payments</h2>
        <div class="money-pager"><button disabled>‹</button><span>1</span><button disabled>›</button></div>
      </div>
      <div class="money-list">${(m.recent||[]).slice(0,6).map(moneyRecentCard).join('')||'<div class="money-empty-card"><strong>No payouts recorded yet.</strong><span>Confirmed payments will appear here.</span></div>'}</div>
    </section>

    ${moneySections(m)}
    ${moneyFooter()}
  </main>`;
}
function docsVenueCard(name,status,chain,copy,kind=''){
  return `<div class="docs-venue ${kind}">
    <div><b>${esc(name)}</b><span>${esc(status)}</span></div>
    <small>${esc(chain)}</small>
    <p>${esc(copy)}</p>
  </div>`;
}

function docsFact(label,value){
  return `<div class="docs-fact"><span>${esc(label)}</span><b>${value}</b></div>`;
}

function docsPage(){
  const name=esc(state.brand.name);
  const recipientPct=fmtNum((state.brand.recipientShareBps||8000)/100);
  const protocolPct=fmtNum((state.brand.protocolShareBps||2000)/100);

  return `<main class="docs-page-v1">
    <article class="wrap docs-v1">
      <header class="docs-v1-hero">
        <p class="eyebrow">Docs</p>
        <h1>How ${name} works</h1>
        <p class="lead">${name} is a creator-fee routing service. A token points its creator fees at the configured treasury, the system verifies and claims eligible fees on chain, and the recipient allocation is tracked for payout.</p>
      </header>

      <nav class="docs-toc">
        <a href="#docs-1"><b>1</b>Overview</a>
        <a href="#docs-2"><b>2</b>Supported venues</a>
        <a href="#docs-3"><b>3</b>Directing fees</a>
        <a href="#docs-4"><b>4</b>Naming the recipient</a>
        <a href="#docs-5"><b>5</b>The ${recipientPct}/${protocolPct} split</a>
        <a href="#docs-6"><b>6</b>How claims work</a>
        <a href="#docs-7"><b>7</b>Getting your fees</a>
        <a href="#docs-8"><b>8</b>Payout setup</a>
        <a href="#docs-9"><b>9</b>Unclaimed payments</a>
        <a href="#docs-10"><b>10</b>Public confirmation</a>
        <a href="#docs-11"><b>11</b>Treasury and cross-chain</a>
        <a href="#docs-12"><b>12</b>$PAID and buyback</a>
        <a href="#docs-13"><b>13</b>Stopping payments</a>
        <a href="#docs-14"><b>14</b>If a token is not registering</a>
        <a href="#docs-15"><b>15</b>Glossary</a>
      </nav>

      <section class="docs-v1-section" id="docs-1">
        <h2><span>1</span>Overview</h2>
        <p>A deployer launches a token on a supported venue and permanently routes the creator-fee share to the project treasury. The token metadata identifies the X handle that should receive the recipient allocation.</p>
        <p>From there the system is mechanical: registration is discovered from public chain state, fees accrue, claims are recorded against transaction references, the recipient and protocol allocations are separated in the ledger, and completed payouts are published in the product.</p>
        <div class="docs-steps">
          <div><b>1</b><span>Token directs creator fees</span></div>
          <div><b>2</b><span>Description names a recipient</span></div>
          <div><b>3</b><span>Indexer verifies registration</span></div>
          <div><b>4</b><span>Fees are claimed and ledgered</span></div>
          <div><b>5</b><span>Recipient payout is confirmed</span></div>
        </div>
      </section>

      <section class="docs-v1-section" id="docs-2">
        <h2><span>2</span>Supported venues</h2>
        <p>The venue changes how the creator-fee destination is configured, but it does not change the accounting model after a token is registered.</p>
        <div class="docs-venue-grid">
          ${docsVenueCard('pump.fun','Live','Solana','Fee sharing is configured after token creation. The route must point entirely to the configured treasury and be made permanent.','live')}
          ${docsVenueCard('pons.family','Not live yet','Robinhood Chain','Reserved for a future launch rail. No Pons token is treated as payable until that integration is explicitly enabled.','soon')}
          ${docsVenueCard('four.meme','Exploratory','BNB Chain','Shown only as a possible future venue. It is not currently supported by this project.','future')}
        </div>
      </section>

      <section class="docs-v1-section" id="docs-3">
        <h2><span>3</span>Directing fees</h2>
        <p>For a token to become payable, the configured treasury must be the sole creator-fee shareholder at 10,000 basis points and the sharing authority must be permanent. A partial or still-editable route remains ineligible.</p>
        <div class="docs-facts">
          ${docsFact('When','After the token exists')}
          ${docsFact('What is verified','Fee-sharing config per mint')}
          ${docsFact('Required share','100%')}
          ${docsFact('Permanent','Authority revoked / locked')}
        </div>
      </section>

      <section class="docs-v1-section" id="docs-4">
        <h2><span>4</span>Naming the recipient</h2>
        <p>The most reliable way to name the beneficiary is a fixed line in the token description. It keeps the payout handle unambiguous even when the rest of the description mentions other accounts.</p>
        <pre class="docs-code">Fees to @yourhandle via ${name}</pre>
        <p>The parser may fall back to a linked or first detected handle when required, but the explicit recipient line is the preferred format.</p>
      </section>

      <section class="docs-v1-section" id="docs-5">
        <h2><span>5</span>The ${recipientPct}/${protocolPct} split</h2>
        <p>Each confirmed claim is divided at claim time. The recipient allocation and the protocol allocation become separate ledger entries tied to the same fee event.</p>
        <div class="docs-facts">
          ${docsFact('To the recipient',`${recipientPct}%`)}
          ${docsFact('Protocol cut',`${protocolPct}%`)}
          ${docsFact('Applied','Per confirmed claim')}
          ${docsFact('Extra project fee','None')}
        </div>
      </section>

      <section class="docs-v1-section" id="docs-6">
        <h2><span>6</span>How claims work</h2>
        <p>Creator fees accrue on chain and are claimed on a schedule rather than on every trade. A successful claim is keyed to its transaction reference so the same event cannot be accounted for twice.</p>
        <p>A failed chain transaction creates no recipient obligation. The fees remain on chain until a later successful claim can be verified.</p>
        <h3>Payout milestones</h3>
        <p>The current backend can evaluate cumulative payout milestones and queue the outstanding recipient balance when a threshold is crossed. Provider execution remains subject to the configured payout adapter and live-mode safeguards.</p>
      </section>

      <section class="docs-v1-section" id="docs-7">
        <h2><span>7</span>Getting your fees</h2>
        <div class="docs-steps compact">
          <div><b>1</b><span>A token names your handle</span></div>
          <div><b>2</b><span>Trading generates creator fees</span></div>
          <div><b>3</b><span>Eligible fees are claimed and credited</span></div>
          <div><b>4</b><span>A confirmed payout is recorded</span></div>
        </div>
        <p>The recipient does not need to connect a Solana wallet to be represented in the payout ledger. Receiving a payout also does not imply endorsement of the token that named the handle.</p>
      </section>

      <section class="docs-v1-section" id="docs-8">
        <h2><span>8</span>Payout setup</h2>
        <p>The product is designed around an X Money-style payout experience, while the backend uses an explicit payout adapter. Production sending requires an authorized provider configuration; the site does not manufacture or expose payment credentials.</p>
        <div class="docs-note">Current safe configuration can keep payouts in manual or read-only mode until the production rail is connected.</div>
      </section>

      <section class="docs-v1-section" id="docs-9">
        <h2><span>9</span>Unclaimed payments</h2>
        <p>Provider-returned or expired recipient payments should be recorded separately from the fixed protocol cut. That keeps reversals traceable and prevents returned recipient money from being silently blended into ordinary protocol revenue.</p>
      </section>

      <section class="docs-v1-section" id="docs-10">
        <h2><span>10</span>Public confirmation</h2>
        <p>Confirmed payouts can be displayed publicly with the amount, recipient, contributing token or tokens, status and provider reference. The public view never needs server secrets or signing material.</p>
      </section>

      <section class="docs-v1-section" id="docs-11">
        <h2><span>11</span>The treasury and cross-chain</h2>
        <p>Fees are earned on the chain where a token launched. If future venues live on other chains, any bridge belongs at the treasury layer. Recipient payouts and protocol accounting remain separate from that crossing.</p>
      </section>

      <section class="docs-v1-section" id="docs-12">
        <h2><span>12</span>$PAID and the buyback</h2>
        <p>The protocol allocation is intended to fund open-market $PAID purchases and burns after the token and production execution policy are live. Until then, the ledger records that allocation as pending buyback accounting.</p>
        <a class="docs-inline-link" href="#/paid">Read the $PAID mechanism →</a>
      </section>

      <section class="docs-v1-section" id="docs-13">
        <h2><span>13</span>Stopping payments</h2>
        <p>The project includes an X OAuth opt-out flow. Once a handle is verified and opted out, future payout eligibility can be blocked and the related token visibility/accounting rules can be applied consistently by the backend.</p>
        <a class="docs-inline-link" href="#/opt-out">Open opt-out →</a>
      </section>

      <section class="docs-v1-section" id="docs-14">
        <h2><span>14</span>If a token is not registering</h2>
        <div class="docs-checks">
          <div><b>Not the whole fee</b><span>The treasury must receive the complete creator-fee share.</span></div>
          <div><b>Not permanent yet</b><span>An editable sharing authority is not considered payable.</span></div>
          <div><b>Wrong treasury</b><span>The on-chain destination must match the configured treasury address.</span></div>
          <div><b>No recipient handle</b><span>Add the explicit recipient line or a supported linked handle.</span></div>
          <div><b>Too recent</b><span>The discovery worker may not have reached a brand-new token yet.</span></div>
        </div>
      </section>

      <section class="docs-v1-section" id="docs-15">
        <h2><span>15</span>Glossary</h2>
        <dl class="docs-glossary">
          <dt>Creator fees</dt><dd>Trading fees assigned by the launch venue to the token creator.</dd>
          <dt>Fee sharing</dt><dd>The pump.fun configuration used to direct creator fees to one or more wallets.</dd>
          <dt>Claim</dt><dd>A confirmed on-chain collection of accrued creator fees for a registered token.</dd>
          <dt>Recipient share</dt><dd>The portion of a confirmed claim credited to the named recipient.</dd>
          <dt>Protocol cut</dt><dd>The portion tracked for project execution and $PAID buyback accounting.</dd>
          <dt>Held balance</dt><dd>A recipient amount that remains in the ledger until the relevant payout condition is resolved.</dd>
          <dt>Treasury</dt><dd>The configured address to which eligible creator fees are permanently routed.</dd>
        </dl>
      </section>
    </article>

    ${moneyFooter()}
  </main>`;
}
function docSection(n,title,body){return `<section class="doc-section"><h2><span>${n}</span>${esc(title)}</h2>${body}</section>`;}
function legalPage(){return `<main><article class="wrap doc legal-doc"><p class="eyebrow">Legal</p><h1>Terms and disclosures</h1><p class="lead">Replace these placeholders with terms reviewed for your actual operator, jurisdictions, launch workflow, token mechanics and payout providers before production launch.</p>${docSection('1','Independent service','<p>This project is not affiliated with X, X Money, pump.fun, Kraken or any other third-party provider merely because it integrates with or references them.</p>')}${docSection('2','No endorsement','<p>A token naming an X handle must not be presented as an endorsement, partnership or approval by that account.</p>')}${docSection('3','Third-party rails','<p>Launchpads, wallets, exchanges, social networks and payout providers have their own terms and availability rules.</p>')}</article>${footer()}</main>`;}
function launchPage(){const treasury=state.brand.treasuryAddress||'';return `<main><section class="wrap launch-page"><p class="eyebrow">Launch</p><h1>Route a token</h1><p class="lead">Create the recipient line, launch the token on pump.fun, then make the creator-fee share permanent at 100% to this treasury.</p><form class="launch-form" id="launchForm"><label>X handle<input id="launchHandle" placeholder="@recipient" required></label><label>Creator wallet<input id="creatorPubkey" placeholder="Connect wallet or paste public key"></label><label>Token mint<input id="launchMint" placeholder="Paste mint after the token exists"></label><div class="config-box"><span>Treasury</span><b class="mono-small">${esc(treasury||'Configure TREASURY_ADDRESS')}</b><span>Fee share</span><b>100%</b><span>Recipient / protocol accounting</span><b>80% / 20%</b></div><button class="btn-light full" type="submit">Create launch intent</button></form><div class="success-card hidden" id="launchSuccess"><div class="success-icon">✓</div><h2>Launch intent ready</h2><p>Put this exact line in the token description:</p><code id="descriptionLine"></code><p class="muted">After the mint exists, connect the creator wallet and route the fee-sharing config.</p><div class="launch-actions"><button class="btn-light" data-action="connect-wallet">Connect Solana wallet</button><button class="btn-light" data-action="route-fees">Route fees 100%</button><button class="text-button" data-action="verify-mint">Verify registration</button></div><div id="launchStatus" class="status-box"></div></div></section>${footer()}</main>`;}
function capitalFlowStep(n,title,body,kind=''){
  return `<section class="capital-flow-step ${kind}">
    <div class="capital-flow-step-index">${esc(n)}</div>
    <div>
      <h2>${esc(title)}</h2>
      <div class="capital-flow-step-copy">${body}</div>
    </div>
  </section>`;
}

function capitalFlowPage(){
  const m=state.money||{};
  const exchanges=m.exchange||[];
  const offRamp=exchanges.filter(x=>!isOnRampOrder(x)).slice(0,8);

  return `<main class="capital-flow-page">
    <section class="wrap capital-flow-hero">
      <p class="eyebrow">Protocol</p>
      <h1>Capital flow</h1>
      <p class="capital-flow-lead">Creator fees from pump.fun are claimed on a schedule, converted through the configured exchange rail, and recorded for recipient payout. The protocol share covers execution costs and the project’s buyback / burn accounting.</p>
    </section>

    <section class="wrap capital-flow-pons">
      <h2>Pons fee flow</h2>
      <div class="capital-flow-pons-grid">
        <div><b>1</b><span>Native fees accrue and are claimed into the configured treasury.</span></div>
        <div><b>2</b><span>When Pons support is enabled, bridged assets can be converted onto the Solana payout rail.</span></div>
        <div><b>3</b><span>The recipient allocation is converted to dollars through the configured exchange and payout provider.</span></div>
        <div><b>4</b><span>Recipient and protocol allocations remain separate in the ledger from claim through payout.</span></div>
      </div>
      <p>Accrued fees, claimed funds, conversion and completed payouts are separate stages. Token-denominated fees remain held until the configured rail can process them.</p>
    </section>

    <section class="wrap capital-flow-feed">
      <p class="capital-flow-delay">Showing recent verified transfers while the feed refreshes.</p>
      <div class="capital-flow-feed-head">
        <h2>Off-ramp</h2>
        <div class="money-pager"><button disabled>‹</button><span>1</span><button disabled>›</button></div>
      </div>
      <div class="money-filter-tabs capital-flow-tabs">
        <button class="active">All</button>
        <button disabled>Deposits</button>
        <button disabled>Swaps</button>
        <button disabled>ACH</button>
      </div>
      <div class="capital-flow-transfer-list">
        ${offRamp.length
          ? offRamp.map(moneyOffRampCard).join('')
          : `<div class="capital-flow-empty">
              <div class="capital-flow-empty-route">${moneyRoundIcon('≋','sol')}<b>→</b>${moneyRoundIcon('$','payout')}</div>
              <strong>No verified transfers yet.</strong>
              <span>Claim, exchange and payout events will appear here when they are recorded.</span>
            </div>`}
      </div>
    </section>

    <section class="wrap capital-flow-story">
      ${capitalFlowStep('01','A token on pump.fun points its fees at us',
        `<p>At launch, the token routes its creator-fee share to the configured treasury and locks that destination. The indexer verifies the permanent route before the token becomes payable.</p>`,
        'pump')}

      ${capitalFlowStep('02','The exchange rail converts it to dollars',
        `<p>Confirmed recipient funds can be converted through the configured exchange adapter. Conversions and payouts are recorded separately so the ledger can distinguish what is claimed, converted, sent and still owed.</p>`,
        'exchange')}

      ${capitalFlowStep('03','The protocol share funds execution and buyback accounting',
        `<p>The protocol allocation is tracked separately from recipient balances. Execution costs and buyback / burn activity can be reconciled back to the originating fee events instead of being mixed into recipient payouts.</p>`,
        'protocol')}

      ${capitalFlowStep('04','USD reaches the configured payout balance',
        `<p>Converted recipient funds move onto the configured payout rail and remain identifiable as recipient liabilities until a confirmed payout is recorded.</p>`,
        'balance')}

      ${capitalFlowStep('05','The recipient receives the distribution',
        `<p>Each completed payout is linked to the recipient and the tokens that funded it. The public product can show the confirmed amount, recipient, status and reference without exposing server secrets.</p>`,
        'recipient')}

      ${capitalFlowStep('06','Payout operations',
        `<p>The current build keeps accounting and payout execution behind explicit provider configuration and read-only safeguards. Live sending is only available when the corresponding production adapters and secrets are enabled.</p>
         <div class="capital-flow-ops">
           <div><span>Recipient share</span><b>${fmtNum((state.brand.recipientShareBps||8000)/100)}%</b></div>
           <div><span>Protocol share</span><b>${fmtNum((state.brand.protocolShareBps||2000)/100)}%</b></div>
           <div><span>Currently owed</span><b>${fmtMoney(m.totalOwed||0)}</b></div>
           <div><span>Total paid</span><b>${fmtMoney(m.totalPaid||0)}</b></div>
         </div>`,
        'operations')}
    </section>

    ${moneyFooter()}
  </main>`;
}
function paidInfoCard(label,value){
  return `<div class="paid-info-card"><span>${esc(label)}</span><b>${value}</b></div>`;
}

function paidStep(n,title,body){
  return `<div class="paid-step">
    <div class="paid-step-number">${esc(n)}</div>
    <div><h3>${esc(title)}</h3><p>${body}</p></div>
  </div>`;
}

function paidPage(){
  const m=state.money||{};
  const recipientPct=fmtNum((state.brand.recipientShareBps||8000)/100);
  const protocolPct=fmtNum((state.brand.protocolShareBps||2000)/100);

  return `<main class="paid-page">
    <section class="wrap paid-hero">
      <p class="eyebrow">Protocol</p>
      <h1>$PAID</h1>
      <p class="paid-lead">Each confirmed fee claim is split between the named recipient and the protocol. The recipient share is paid through the configured payout rail; the protocol share is reserved for open-market $PAID buybacks and burns.</p>

      <div class="paid-not-live">
        <span>Not launched yet</span>
        <h2>$PAID has not been issued.</h2>
        <p>Until a project token is launched and its execution policy is enabled, protocol-cut balances remain in the ledger as pending buybacks. No buy or burn is executed automatically by this page.</p>
      </div>
    </section>

    <section class="wrap paid-section">
      <h2>What it is for</h2>
      <p class="paid-copy">$PAID is designed as the protocol's value-accrual token rather than a governance or access token. Its role is simple: the protocol allocation can be used to buy the token on the open market and remove the purchased supply.</p>

      <div class="paid-info-grid">
        ${paidInfoCard('Ticker','$PAID')}
        ${paidInfoCard('Home chain','Solana')}
        ${paidInfoCard('Recipient share',`${recipientPct}%`)}
        ${paidInfoCard('Protocol share',`${protocolPct}%`)}
        ${paidInfoCard('Pending buybacks',fmtMoney(m.protocolPending||0))}
        ${paidInfoCard('Mechanism','Market buy → burn')}
      </div>
    </section>

    <section class="wrap paid-section">
      <h2>How the buy and burn works</h2>
      <div class="paid-steps">
        ${paidStep('1','A claim settles','Creator fees are claimed on chain and recorded as a fee event with a unique transaction reference.')}
        ${paidStep('2','The protocol cut is set aside',`${protocolPct}% of the confirmed claim is tracked separately as protocol accounting instead of recipient money.`)}
        ${paidStep('3','$PAID is bought on the open market','When live buyback execution is explicitly enabled, the protocol can acquire the token through the configured market adapter at prevailing market prices.')}
        ${paidStep('4','Purchased supply is burned','The resulting token amount can be sent to the configured burn destination, with transaction references retained for reconciliation.')}
      </div>
    </section>

    <section class="wrap paid-section paid-chain-section">
      <h2>Fees from other chains</h2>
      <p class="paid-copy">If additional launch rails are enabled later, their creator fees can still feed the same protocol accounting. Cross-chain movement belongs at the treasury layer; recipient payouts remain separate from that bridge path.</p>

      <div class="paid-flow-card">
        <div><span>Origin fees</span><b>Pump / future rails</b></div>
        <i>→</i>
        <div><span>Treasury</span><b>Reconciled balance</b></div>
        <i>→</i>
        <div><span>Buyback</span><b>$PAID on Solana</b></div>
      </div>
    </section>

    <section class="wrap paid-section">
      <h2>Unclaimed or returned payments</h2>
      <p class="paid-copy">If a payout provider returns an unclaimed recipient payment, that event should be recorded separately from the normal protocol cut. This keeps recipient reversals distinguishable from the fixed protocol allocation in the ledger.</p>

      <div class="paid-ledger-card">
        <div><span>Protocol cut pending</span><b>${fmtMoney(m.protocolPending||0)}</b></div>
        <div><span>Recipient currently owed</span><b>${fmtMoney(m.totalOwed||0)}</b></div>
        <div><span>Total paid</span><b>${fmtMoney(m.totalPaid||0)}</b></div>
      </div>
    </section>

    ${moneyFooter()}
  </main>`;
}
function optOutPage(){return `<main><section class="wrap launch-page"><p class="eyebrow">Opt out</p><h1>Stop payments</h1><p class="lead">Authenticate the X account that owns the handle. Opting out stops payouts, hides tokens naming the handle, blocks it from launch selection and diverts future unpaid accounting to the protocol cut.</p><a class="btn-light full center-button" href="/api/auth/x/start">Sign in with X</a><div class="status-box">X OAuth requires X_CLIENT_ID and X_REDIRECT_URI in the server environment.</div></section>${footer()}</main>`;}
async function tokenPage(mint){const t=await api(`/api/tokens/${encodeURIComponent(mint)}`);return `<main><section class="wrap money-hero token-hero"><p class="back"><a href="#/explore">↖ Explore</a></p><div class="profile-row">${avatar(t.symbol,true,t.image_url)}<div><b>${esc(t.name)} ${esc(t.symbol)}</b><span>@${esc(t.recipient_handle)}</span></div></div><div class="money-stats"><div><span>Market cap</span><b>${fmtMc(t.market_cap_usd)}</b></div><div><span>Sent</span><b>${fmtMoney(t.sent)}</b></div><div><span>Owed</span><b>${fmtMoney(t.owed)}</b></div><div><span>Fee route</span><b>${t.permanent?'Permanent':'Pending'} · ${fmtNum(t.fee_share_bps/100)}%</b></div></div><code class="token-mint">${esc(t.mint)}</code></section><section class="wrap section">${sectionTitle('Claims')}<div class="tx-list">${(t.claims||[]).map((c,i)=>`<div class="rank-card"><div><b>${fmtNum(c.gross_native)} SOL</b><span>${esc(c.tx_signature||c.id)}</span></div><strong>${fmtMoney(c.gross_usd)}</strong></div>`).join('')||'<div class="empty">No claims yet.</div>'}</div></section><section class="wrap section">${sectionTitle('Payments')}<div class="payment-list">${(t.payouts||[]).map((p,i)=>paymentCard({...p,amount_usd:p.item_amount_usd,mints:t.mint},i)).join('')||'<div class="empty">No payments yet.</div>'}</div></section>${footer()}</main>`;}
async function profilePage(handle){const p=await api(`/api/profiles/${encodeURIComponent(handle)}`);return `<main><section class="wrap money-hero token-hero"><p class="back"><a href="#/">↖ Home</a></p><div class="profile-row">${avatar(p.recipient.display_name||p.recipient.handle,true,p.recipient.avatar_url)}<div><b>${esc(p.recipient.display_name||p.recipient.handle)}</b><span>@${esc(p.recipient.handle)}</span></div></div><strong class="money-total">${fmtMoney(p.received)}</strong><span>Received</span></section><section class="wrap section">${sectionTitle('Tokens')}<div class="token-grid">${p.tokens.map(t=>tokenCard(t,true)).join('')||'<div class="empty">No visible tokens.</div>'}</div></section><section class="wrap section">${sectionTitle('X Payments')}<div class="payment-list">${p.payments.map(paymentCard).join('')||'<div class="empty">No payouts.</div>'}</div></section>${footer()}</main>`;}
function adminPage(){return `<main><section class="wrap launch-page"><p class="eyebrow">Internal</p><h1>Operations</h1><p class="lead">Run workers manually without restarting the server. The admin token stays in your browser session only.</p><form class="launch-form" id="adminForm"><label>Admin token<input id="adminToken" type="password" autocomplete="off"></label><div class="launch-actions"><button type="button" class="btn-light" data-admin-run="discovery">Run discovery</button><button type="button" class="btn-light" data-admin-run="claims">Run claims</button><button type="button" class="btn-light" data-admin-run="payouts">Run payouts</button></div></form><pre class="status-box" id="adminOutput">Ready.</pre></section>${footer()}</main>`;}
function launchModal(){return `<div class="modal-bg hidden" id="launchModal"><div class="modal"><button class="modal-x" data-action="close-launch">×</button><p class="eyebrow">Launch</p><h2>Route creator fees</h2><p>Create the token on pump.fun, name a recipient in metadata, then permanently route 100% of creator fees to the configured treasury.</p><a class="modal-option" href="#/launch"><span class="option-icon">●</span><div><b>Launch / route token</b><small>Build and sign the fee-sharing transaction</small></div><span>→</span></a><a class="modal-option" href="#/docs"><span class="option-icon">⌘</span><div><b>Read integration docs</b><small>Indexer, claims, ledger and payouts</small></div><span>→</span></a></div></div>`;}
function loadingPage(){return `<main><section class="wrap launch-page"><p class="eyebrow">Loading</p><h1>Syncing ledger…</h1></section></main>`;}
function errorPage(err){return `<main><section class="wrap launch-page"><p class="eyebrow">Error</p><h1>Could not load</h1><p class="lead">${esc(err?.message||err)}</p><button class="btn-light" data-action="reload">Retry</button></section></main>`;}
async function loadBase(){const [cfg,home,money,tokens]=await Promise.all([api('/api/config'),api('/api/home'),api('/api/money'),api('/api/tokens?limit=100')]);state.brand={...state.brand,...cfg,heroLine1:'Route token fees',heroLine2:'through X Money',description:'Point a token’s creator fees at any X handle and route the recipient share in dollars through your configured payout rail.'};state.home=home;state.money=money;state.tokens=tokens.tokens||[];document.title=state.brand.name;}
async function refreshTokens(){const q=new URLSearchParams({search:state.explore.query,sort:state.explore.sort,venue:state.explore.venue,limit:'200'});const j=await api(`/api/tokens?${q}`);state.tokens=j.tokens||[];}
async function render(){const path=(location.hash||'#/').slice(2).split('?')[0];app.innerHTML=header()+loadingPage()+launchModal();try{if(!state.home)await loadBase();let page;if(path===''||path==='/')page=homePage();else if(path==='explore'){await refreshTokens();page=explorePage();}else if(path==='money'){state.money=await api('/api/money');page=moneyPage();}else if(path==='docs')page=docsPage();else if(path==='legal')page=legalPage();else if(path==='launch')page=launchPage();else if(path==='capital-flow'){state.money=await api('/api/money');page=capitalFlowPage();}else if(path==='paid'){state.money=await api('/api/money');page=paidPage();}else if(path==='opt-out')page=optOutPage();else if(path==='admin')page=adminPage();else if(path.startsWith('token/'))page=await tokenPage(decodeURIComponent(path.slice(6)));else if(path.startsWith('profile/'))page=await profilePage(decodeURIComponent(path.slice(8)));else page=homePage();app.innerHTML=header()+page+launchModal();window.scrollTo(0,0);}catch(e){app.innerHTML=header()+errorPage(e)+launchModal();}}
let currentLaunch=null,currentWallet=null;
async function connectWallet(){const provider=window.phantom?.solana||window.solana;if(!provider?.connect)throw new Error('No Solana wallet found in this browser');const out=await provider.connect();currentWallet=provider;const pub=out.publicKey?.toString?.()||provider.publicKey?.toString?.();if(document.querySelector('#creatorPubkey'))document.querySelector('#creatorPubkey').value=pub||'';return pub;}
function setLaunchStatus(text,good=false){const el=document.querySelector('#launchStatus');if(el){el.textContent=text;el.classList.toggle('good',good);}}
async function routeFees(){if(!currentLaunch)throw new Error('Create the launch intent first');const mint=document.querySelector('#launchMint')?.value.trim();let creator=document.querySelector('#creatorPubkey')?.value.trim();if(!creator)creator=await connectWallet();if(!mint)throw new Error('Paste the token mint first');if(!currentWallet)await connectWallet();setLaunchStatus('Building fee-sharing transaction…');const p=await api('/api/launch/prepare-routing',{method:'POST',body:JSON.stringify({mint,creator_pubkey:creator})});if(!window.solanaWeb3?.VersionedTransaction)throw new Error('Solana web3 browser bundle did not load');const bytes=Uint8Array.from(atob(p.transactionBase64),c=>c.charCodeAt(0));const tx=window.solanaWeb3.VersionedTransaction.deserialize(bytes);setLaunchStatus('Approve the transaction in your wallet…');let sig;if(currentWallet.signAndSendTransaction){const out=await currentWallet.signAndSendTransaction(tx);sig=out.signature||out;}else{const signed=await currentWallet.signTransaction(tx);sig=await currentWallet.sendTransaction(signed);}setLaunchStatus(`Submitted ${sig}. Verifying on-chain…`);await new Promise(r=>setTimeout(r,2500));const out=await api('/api/launch/confirm',{method:'POST',body:JSON.stringify({intent_id:currentLaunch.id,mint,recipient_handle:currentLaunch.handle,tx_signature:String(sig)})});setLaunchStatus(out.ok?`Registered. Fees are permanently routed to treasury for @${out.recipient}.`:`Not registered yet: ${out.reason}`,out.ok);if(out.ok){state.home=null;await loadBase();}}

app.addEventListener('click',async e=>{
  try{
    const a=e.target.closest('[data-action]');if(a){const action=a.dataset.action;if(action==='open-launch')document.querySelector('#launchModal')?.classList.remove('hidden');if(action==='close-launch')document.querySelector('#launchModal')?.classList.add('hidden');if(action==='menu')document.querySelector('#mobileMenu')?.classList.toggle('hidden');if(action==='go-launch')location.hash='#/launch';if(action==='reload'){state.home=null;render();}if(action==='connect-wallet'){const pub=await connectWallet();setLaunchStatus(`Wallet connected: ${pub}`,true);}if(action==='route-fees')await routeFees();if(action==='verify-mint'){const mint=document.querySelector('#launchMint')?.value.trim();if(!mint)throw new Error('Paste the mint first');const out=await api('/api/tokens/register',{method:'POST',body:JSON.stringify({mint,recipient_handle:currentLaunch?.handle||''})});setLaunchStatus(out.ok?`Registered for @${out.recipient}`:`Not ready: ${out.reason}`,out.ok);}}
    const exp=e.target.closest('.expandable');if(exp){exp.classList.toggle('open');exp.querySelector('.details,.tx-details')?.classList.toggle('hidden');}
    const sort=e.target.closest('[data-sort]');if(sort){state.explore.sort=sort.dataset.sort;await refreshTokens();document.querySelector('#launchGrid').innerHTML=state.tokens.map(exploreTokenCard).join('')||'<div class="explore-empty"><span>No launches.</span></div>';document.querySelectorAll('[data-sort]').forEach(b=>b.classList.toggle('active',b.dataset.sort===state.explore.sort));}
    const venue=e.target.closest('[data-venue]');if(venue){state.explore.venue=state.explore.venue===venue.dataset.venue?'':venue.dataset.venue;await refreshTokens();document.querySelector('#launchGrid').innerHTML=state.tokens.map(exploreTokenCard).join('')||'<div class="explore-empty"><span>No launches.</span></div>';document.querySelectorAll('[data-venue]').forEach(b=>b.classList.toggle('active',b.dataset.venue===state.explore.venue));}
    const run=e.target.closest('[data-admin-run]');if(run){const token=document.querySelector('#adminToken')?.value||'';const out=document.querySelector('#adminOutput');out.textContent='Running…';const result=await api(`/api/admin/run/${run.dataset.adminRun}`,{method:'POST',headers:{authorization:`Bearer ${token}`},body:'{}'});out.textContent=JSON.stringify(result,null,2);}
    if(e.target.id==='launchModal')e.target.classList.add('hidden');
  }catch(err){setLaunchStatus(err.message);const out=document.querySelector('#adminOutput');if(out)out.textContent=err.message;}
});
let searchTimer;
app.addEventListener('input',e=>{if(e.target.id==='tokenSearch'){clearTimeout(searchTimer);state.explore.query=e.target.value;searchTimer=setTimeout(async()=>{try{await refreshTokens();const grid=document.querySelector('#launchGrid');if(grid)grid.innerHTML=state.tokens.map(exploreTokenCard).join('')||'<div class="explore-empty"><span>No launches match this search.</span></div>';}catch{}},180);}});
app.addEventListener('submit',async e=>{if(e.target.id==='launchForm'){e.preventDefault();try{const handle=document.querySelector('#launchHandle').value.trim();const creator=document.querySelector('#creatorPubkey').value.trim();const mint=document.querySelector('#launchMint').value.trim();const out=await api('/api/launch/intents',{method:'POST',body:JSON.stringify({recipient_handle:handle,creator_pubkey:creator,mint})});currentLaunch={...out,handle:handle.replace(/^@/,'')};e.target.classList.add('hidden');document.querySelector('#launchSuccess').classList.remove('hidden');document.querySelector('#descriptionLine').textContent=out.descriptionLine;setLaunchStatus(out.treasuryAddress?'Intent created. Launch token, then route fee sharing.':'Set TREASURY_ADDRESS on the server before routing.');}catch(err){alert(err.message);}}});
window.addEventListener('hashchange',render);render();
