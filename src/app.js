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
function footer(){return `<footer><div class="footer-inner"><div class="footer-brand">${logo()}<p>Independent creator-fee routing protocol.</p><span>© 2026 ${esc(state.brand.name)}</span></div><div><b>Product</b><a href="#/explore">Explore</a><a href="#/money">Money</a><a href="#/launch">Launch</a></div><div><b>Protocol</b><a href="#/capital-flow">Capital flow</a><a href="#/paid">Protocol cut</a><a href="#/docs">How it works</a></div><div><b>Legal</b><a href="#/legal">Terms</a><a href="#/opt-out">Opt out</a></div></div></footer>`;}
function tokenCard(t,compact=false){return `<a class="token-card ${compact?'compact':''}" href="#/token/${encodeURIComponent(t.mint||t.contract)}"><div class="token-img">${avatar(t.symbol||t.name,true,t.image_url)}</div><div class="token-meta"><div class="meta-line">${platformBadge(t.platform||'Pump')}<span class="muted">@${esc(t.profile||t.recipient_handle||'')}</span><span class="muted">${esc(t.age||ago(t.created_at))}</span></div><div class="token-name"><strong>${esc(t.name)}</strong><span>${esc(t.symbol)}</span></div><div class="token-numbers"><span>${fmtMc(t.mc??t.market_cap_usd)} <small>MC</small></span><span>${fmtNum(t.sent)} <small>Sent</small></span>${compact?'':`<span>${fmtNum(t.owed)} <small>Owed</small></span>`}</div>${compact?'':`<div class="contract">${esc((t.mint||'').slice(0,6))}…${esc((t.mint||'').slice(-6))}</div>`}</div></a>`;}
function paymentCard(p,i){const amount=p.amount_usd??p.amount??0;const to=p.display_name||p.recipient_handle||p.to||'recipient';const mints=String(p.mints||'').split(',').filter(Boolean);return `<button class="payment-card expandable" data-expand="payment-${i}"><div class="row"><div><strong>${fmtMoney(amount)}</strong><span>${['sent','claimed'].includes(p.status)?'sent':'scheduled'} to <b>${esc(to)}</b> ${['sent','claimed'].includes(p.status)?'<em>✓</em>':''}</span></div><span class="chev">⌄</span></div><div class="mini-tokens">${mints.slice(0,5).map((x,j)=>`${j?'<span class="arrow">→</span>':''}<span class="mini-icon">${esc(x[0]||'T')}</span>`).join('')}<time>${esc(ago(p.sent_at||p.created_at))}</time></div><div class="details hidden"><div><span>Status</span><b>${esc(p.status||'queued')}</b></div><div><span>Provider</span><b>${esc(p.provider||'')}</b></div><div><span>Reference</span><b>${esc(p.provider_ref||p.id||'')}</b></div>${p.public_confirmation_url?`<div><span>Confirmation</span><b>${esc(p.public_confirmation_url)}</b></div>`:''}</div></button>`;}
function txCard(x,i){return `<button class="transfer-card expandable" data-expand="tx-${i}"><div class="tx-icon">≋</div><div class="tx-main"><strong>${x.received_usd?fmtMoney(x.received_usd):`${fmtNum(x.volume_native)} SOL`}</strong><span>${esc(x.pair||'SOLUSD')} · ${esc(x.side||'sell')}</span></div><div class="tx-side"><span class="tx-status">${esc(x.status||'queued')}</span><small>${esc(ago(x.filled_at||x.created_at))}</small></div><span class="chev">⌄</span><div class="tx-details hidden"><div><span>Provider</span><b>${esc(x.provider||'')}</b></div><div><span>Reference</span><b>${esc(x.provider_ref||x.id||'')}</b></div></div></button>`;}
function moneySections(money){const exchanges=money?.exchange||[];const top=money?.topPaid||[];return `<section class="wrap section">${sectionTitle('Off-ramp')}<div class="tabs small-tabs"><button class="active">All</button><button disabled>Deposits</button><button disabled>Swaps</button><button disabled>ACH</button></div><div class="tx-list">${exchanges.length?exchanges.map(txCard).join(''):'<div class="empty">No exchange orders recorded yet.</div>'}</div></section><section class="wrap section"><div class="section-title bridge-heading"><h2>Bridge <span class="bridge-dot">■</span><small>Configured treasury rail</small></h2></div><div class="empty">Bridge events appear here when a bridge adapter is configured.</div><p class="note">Payouts do not need to wait on this rail; the payout worker can use a pre-funded provider balance.</p></section><section class="wrap section">${sectionTitle('Top paid profiles')}<div class="rank-list">${top.length?top.map(x=>`<a class="rank-card" href="#/profile/${encodeURIComponent(x.handle)}">${avatar(x.display_name||x.handle)}<div><b>${esc(x.display_name||x.handle)}</b><span>@${esc(x.handle)}</span></div><strong>${fmtMoney(x.received)}</strong></a>`).join(''):'<div class="empty">No completed payouts yet.</div>'}</div></section>`;}
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

function homeOnRamp(){
  return `<section class="wrap section">${sectionTitle('On-ramp')}
    <div class="tx-list"><div class="empty">No on-ramp activity yet.</div></div>
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
    ${homeOnRamp()}
    ${footer()}
  </main>`;
}
function explorePage(){const tokens=state.tokens||[];return `<main class="explore-page"><section class="wrap explore-head"><div><h1>Explore tokens</h1><p>pump.fun launches the tokens. The backend verifies permanent 100% creator-fee routing to the configured treasury, records claims, and tracks what has been sent and what is still owed.</p></div><button class="btn-light" data-action="go-launch">Launch a token</button></section><section class="wrap section">${sectionTitle('Trending','#/explore')}<div class="trending-strip">${tokens.slice(0,10).map(t=>`<a class="trend" href="#/token/${encodeURIComponent(t.mint)}">${avatar(t.symbol)}<div><b>${esc(t.name)}</b><span>${esc(t.symbol)}</span><small>Sent ${fmtNum(t.sent)}</small></div></a>`).join('')}</div></section><section class="wrap section launches">${sectionTitle('All launches')}<div class="filter-row"><div class="tabs venue"><button class="${!state.explore.venue?'active':''}" data-venue="">All</button><button data-venue="pump">● Pump</button><button disabled>■ Pons Soon</button><button disabled>Four Soon</button></div><input id="tokenSearch" placeholder="Search by contract address" value="${esc(state.explore.query)}"></div><div class="sorts"><button class="${state.explore.sort==='sent'?'active':''}" data-sort="sent">Total X Payments</button><button class="${state.explore.sort==='mc'?'active':''}" data-sort="mc">Market Cap</button><button class="${state.explore.sort==='recent'?'active':''}" data-sort="recent">Recent</button></div><div class="launch-grid" id="launchGrid">${tokens.map(t=>tokenCard(t,false)).join('')||'<div class="empty">No launches match this search.</div>'}</div></section>${footer()}</main>`;}
function moneyPage(){const m=state.money||{recent:[],topPaid:[],exchange:[]};return `<main><section class="wrap money-hero"><p class="back">↖ Money</p><strong class="money-total">${fmtMoney(m.totalPaid||0)}</strong><span>Total paid out</span><div class="money-tabs"><button class="active">Payout rail</button><button>Solana treasury</button></div><div class="money-stats"><div><span>Currently owed</span><b>${fmtMoney(m.totalOwed||0)}</b></div><div><span>Pending protocol cut</span><b>${fmtMoney(m.protocolPending||0)}</b></div></div></section><section class="wrap update-note">Live values are calculated from the local ledger database and confirmed payout records.</section><section class="wrap section first">${sectionTitle('Recent payments')}<div class="payment-list">${(m.recent||[]).map(paymentCard).join('')||'<div class="empty">No payouts recorded yet.</div>'}</div></section>${moneySections(m)}${footer()}</main>`;}
function docsPage(){return `<main><article class="wrap doc"><p class="eyebrow">Docs</p><h1>How ${esc(state.brand.name)} works</h1><p class="lead">This full-stack build uses a persistent ledger, a pump.fun fee-sharing verifier, claim worker, payout scheduler, exchange adapter, launch transaction builder, profile views and opt-out flow.</p>${docSection('1','Registration',`<p>On pump.fun the service verifies a fee-sharing config for the token mint. It only registers a token as payable when the configured treasury is the sole shareholder at 10,000 bps and the sharing authority is permanent.</p><pre>mint → sharing_config → treasury 100% → permanent</pre>`)}${docSection('2','Recipient',`<p>The indexer reads the recipient from the fixed metadata line:</p><pre>Fees to @yourhandle via ${esc(state.brand.name)}</pre><p>If the fixed line is absent, the parser can fall back to the first handle or an explicitly supplied linked handle.</p>`)}${docSection('3','Claims','<p>The claim worker checks each registered mint for distributable creator fees. In live mode it builds the permissionless Pump distribution transaction, pays transaction fees from a dedicated crank key, confirms on-chain settlement and records the treasury balance increase as a claim.</p>')}${docSection('4','80 / 20 ledger',`<p>Each confirmed claim is split at ${state.brand.recipientShareBps||8000} / ${state.brand.protocolShareBps||2000} basis points. Recipient credits and protocol-cut buyback entries are persisted in SQLite.</p>`)}${docSection('5','Payout milestones','<p>The payout worker evaluates cumulative milestones at $5, $10, $20, $50, $100, $250, $500, $1,000 and then each additional $1,000. When a milestone is crossed, the full outstanding recipient balance is queued for the configured payout adapter.</p>')}${docSection('6','Exchange and payout providers','<p>Kraken market-sell support is included behind an explicit live-trading flag. Payouts support manual reconciliation or a generic HTTP provider adapter. X Money itself does not expose a public payout API in this project; if you have an authorized gateway, point the HTTP adapter at it.</p>')}${docSection('7','Opt out','<p>An X OAuth flow is included so the owner of a handle can authenticate and opt out. Opted-out tokens are hidden, future recipient credits are diverted to the protocol cut, and unpaid balance is queued for buyback accounting.</p>')}${docSection('8','Safety','<p>No private key is requested from site visitors. Creator-side fee-routing transactions are built server-side but must be signed by the creator wallet in the browser. Server secrets stay in environment variables.</p>')}</article>${footer()}</main>`;}
function docSection(n,title,body){return `<section class="doc-section"><h2><span>${n}</span>${esc(title)}</h2>${body}</section>`;}
function legalPage(){return `<main><article class="wrap doc legal-doc"><p class="eyebrow">Legal</p><h1>Terms and disclosures</h1><p class="lead">Replace these placeholders with terms reviewed for your actual operator, jurisdictions, launch workflow, token mechanics and payout providers before production launch.</p>${docSection('1','Independent service','<p>This project is not affiliated with X, X Money, pump.fun, Kraken or any other third-party provider merely because it integrates with or references them.</p>')}${docSection('2','No endorsement','<p>A token naming an X handle must not be presented as an endorsement, partnership or approval by that account.</p>')}${docSection('3','Third-party rails','<p>Launchpads, wallets, exchanges, social networks and payout providers have their own terms and availability rules.</p>')}</article>${footer()}</main>`;}
function launchPage(){const treasury=state.brand.treasuryAddress||'';return `<main><section class="wrap launch-page"><p class="eyebrow">Launch</p><h1>Route a token</h1><p class="lead">Create the recipient line, launch the token on pump.fun, then make the creator-fee share permanent at 100% to this treasury.</p><form class="launch-form" id="launchForm"><label>X handle<input id="launchHandle" placeholder="@recipient" required></label><label>Creator wallet<input id="creatorPubkey" placeholder="Connect wallet or paste public key"></label><label>Token mint<input id="launchMint" placeholder="Paste mint after the token exists"></label><div class="config-box"><span>Treasury</span><b class="mono-small">${esc(treasury||'Configure TREASURY_ADDRESS')}</b><span>Fee share</span><b>100%</b><span>Recipient / protocol accounting</span><b>80% / 20%</b></div><button class="btn-light full" type="submit">Create launch intent</button></form><div class="success-card hidden" id="launchSuccess"><div class="success-icon">✓</div><h2>Launch intent ready</h2><p>Put this exact line in the token description:</p><code id="descriptionLine"></code><p class="muted">After the mint exists, connect the creator wallet and route the fee-sharing config.</p><div class="launch-actions"><button class="btn-light" data-action="connect-wallet">Connect Solana wallet</button><button class="btn-light" data-action="route-fees">Route fees 100%</button><button class="text-button" data-action="verify-mint">Verify registration</button></div><div id="launchStatus" class="status-box"></div></div></section>${footer()}</main>`;}
function capitalFlowPage(){const m=state.money||{};return `<main><article class="wrap doc"><p class="eyebrow">Protocol</p><h1>Capital flow</h1><p class="lead">Every confirmed on-chain claim creates two ledger paths: recipient credit and protocol cut.</p>${docSection('1','Creator fees arrive','<p>Eligible pump.fun sharing configs distribute creator fees to the treasury. The claim worker confirms the transaction before accounting for it.</p>')}${docSection('2','Recipient share',`<p>${fmtMoney(m.totalOwed||0)} is currently owed across recipient ledgers. Completed payouts total ${fmtMoney(m.totalPaid||0)}.</p>`)}${docSection('3','Protocol cut',`<p>${fmtMoney(m.protocolPending||0)} is currently recorded as pending protocol-cut / buyback accounting.</p>`)}${docSection('4','Exchange orders',`<div class="tx-list">${(m.exchange||[]).map(txCard).join('')||'<div class="empty">No exchange orders recorded yet.</div>'}</div>`)}</article>${footer()}</main>`;}
function paidPage(){const m=state.money||{};return `<main><article class="wrap doc"><p class="eyebrow">Protocol</p><h1>Protocol cut</h1><p class="lead">The default accounting split is 80% recipient / 20% protocol. Pending protocol-cut balance: ${fmtMoney(m.protocolPending||0)}.</p>${docSection('1','Source','<p>Every confirmed claim records the protocol share separately from recipient balances, preserving a direct link back to the fee event.</p>')}${docSection('2','Buyback adapter','<p>The ledger and worker hooks are present. A production buy-and-burn transaction should only be enabled after the project token mint and execution policy are finalized.</p>')}</article>${footer()}</main>`;}
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
    const sort=e.target.closest('[data-sort]');if(sort){state.explore.sort=sort.dataset.sort;await refreshTokens();document.querySelector('#launchGrid').innerHTML=state.tokens.map(t=>tokenCard(t,false)).join('')||'<div class="empty">No launches.</div>';document.querySelectorAll('[data-sort]').forEach(b=>b.classList.toggle('active',b.dataset.sort===state.explore.sort));}
    const venue=e.target.closest('[data-venue]');if(venue){state.explore.venue=venue.dataset.venue;await refreshTokens();document.querySelector('#launchGrid').innerHTML=state.tokens.map(t=>tokenCard(t,false)).join('')||'<div class="empty">No launches.</div>';document.querySelectorAll('[data-venue]').forEach(b=>b.classList.toggle('active',b.dataset.venue===state.explore.venue));}
    const run=e.target.closest('[data-admin-run]');if(run){const token=document.querySelector('#adminToken')?.value||'';const out=document.querySelector('#adminOutput');out.textContent='Running…';const result=await api(`/api/admin/run/${run.dataset.adminRun}`,{method:'POST',headers:{authorization:`Bearer ${token}`},body:'{}'});out.textContent=JSON.stringify(result,null,2);}
    if(e.target.id==='launchModal')e.target.classList.add('hidden');
  }catch(err){setLaunchStatus(err.message);const out=document.querySelector('#adminOutput');if(out)out.textContent=err.message;}
});
let searchTimer;
app.addEventListener('input',e=>{if(e.target.id==='tokenSearch'){clearTimeout(searchTimer);state.explore.query=e.target.value;searchTimer=setTimeout(async()=>{try{await refreshTokens();const grid=document.querySelector('#launchGrid');if(grid)grid.innerHTML=state.tokens.map(t=>tokenCard(t,false)).join('')||'<div class="empty">No launches match this search.</div>';}catch{}},180);}});
app.addEventListener('submit',async e=>{if(e.target.id==='launchForm'){e.preventDefault();try{const handle=document.querySelector('#launchHandle').value.trim();const creator=document.querySelector('#creatorPubkey').value.trim();const mint=document.querySelector('#launchMint').value.trim();const out=await api('/api/launch/intents',{method:'POST',body:JSON.stringify({recipient_handle:handle,creator_pubkey:creator,mint})});currentLaunch={...out,handle:handle.replace(/^@/,'')};e.target.classList.add('hidden');document.querySelector('#launchSuccess').classList.remove('hidden');document.querySelector('#descriptionLine').textContent=out.descriptionLine;setLaunchStatus(out.treasuryAddress?'Intent created. Launch token, then route fee sharing.':'Set TREASURY_ADDRESS on the server before routing.');}catch(err){alert(err.message);}}});
window.addEventListener('hashchange',render);render();
