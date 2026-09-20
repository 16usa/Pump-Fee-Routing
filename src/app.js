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
  const tokens=(top||[]).filter(Boolean).slice(0,8);
  const profiles=(h.profiles||[]).filter(Boolean).slice(0,3);
  const payments=(h.payments||[]).filter(Boolean).slice(0,5);
  const money=h.money||{};
  const total=Number(money.totalPaid||0);

  const paymentMini=(p)=>{
    if(!p) return '';
    const amount=p.amount_usd??p.amount??0;
    const to=p.display_name||p.recipient_handle||p.to||'recipient';
    return `<div class="home-v2-payment-mini">
      <strong>${fmtMoney(amount)}</strong>
      <span>sent to <b>${esc(to)}</b></span>
      <time>${esc(ago(p.sent_at||p.created_at))}</time>
    </div>`;
  };

  const leadProfile=profiles[0]||null;
  const leadName=leadProfile?.display_name||leadProfile?.handle||'Recipient';
  const leadHandle=leadProfile?.handle||'recipient';

  return `<section class="home-preview-shell home-ref-previews home-reference-v2-previews">
    <div class="wrap home-preview-stack">




      <a class="home-preview-card home-ref-card home-ref-explore-card home-explore-reference-v7" href="#/explore">
        <div class="home-explore-v7-head">
          <strong>Explore</strong>
          <span>Open →</span>
        </div>
        ${(() => {
          const withVisual = tokens.filter(t => String(t?.mint || t?.contract || t?.image_url || '').trim());
          const primary = withVisual[0] || tokens[0] || null;
          const secondary = withVisual.find(t => t !== primary) || withVisual[0] || primary;

          const findProfile = (token) => {
            const handle = String(token?.profile || token?.recipient_handle || token?.recipient_handles || '').replace(/^@/, '').trim().toLowerCase();
            if (!handle) return null;
            return profiles.find(p => String(p?.handle || '').replace(/^@/, '').trim().toLowerCase() === handle) || null;
          };

          const renderTokenArt = (token, className) => {
            const initial = esc(initials(token?.symbol || token?.name || 'P'));
            if (!token) return `<span class="home-explore-v7-fallback ${className}">${initial}</span>`;
            const mint = String(token.mint || token.contract || '').trim();
            const direct = String(token.image_url || '').trim();
            const fallbackAction = direct
              ? `this.onerror=function(){this.style.display='none';this.nextElementSibling.style.display='grid'};this.src='${esc(direct)}'`
              : `this.style.display='none';this.nextElementSibling.style.display='grid'`;
            if (mint) {
              return `<img class="home-explore-v7-art ${className}" src="/api/token-image/${encodeURIComponent(mint)}" alt="" loading="eager" decoding="async" onerror="${fallbackAction}"><span class="home-explore-v7-fallback ${className}" style="display:none">${initial}</span>`;
            }
            if (direct) {
              return `<img class="home-explore-v7-art ${className}" src="${esc(direct)}" alt="" loading="eager" decoding="async" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="home-explore-v7-fallback ${className}" style="display:none">${initial}</span>`;
            }
            return `<span class="home-explore-v7-fallback ${className}">${initial}</span>`;
          };

          const renderRecipient = (token) => {
            const profile = findProfile(token);
            const handle = String(token?.profile || token?.recipient_handle || token?.recipient_handles || '').replace(/^@/, '').trim();
            const label = profile?.display_name || handle || 'Recipient';
            const avatarUrl = String(profile?.avatar_url || '').trim();
            return `<div class="home-explore-v7-recipient"><i>$</i>${avatar(label, false, avatarUrl)}<b>${esc(label)}</b></div>`;
          };

          const renderPrimary = (token) => {
            if (!token) {
              return `<div class="home-explore-v7-primary-card is-empty"><div class="home-explore-v7-media">${renderTokenArt(null, 'primary')}</div></div>`;
            }
            return `<div class="home-explore-v7-primary-card">
              <div class="home-explore-v7-media">
                ${renderTokenArt(token, 'primary')}
                <div class="home-explore-v7-venue">${platformBadge(token.platform || 'Pump')}</div>
                ${renderRecipient(token)}
                <div class="home-explore-v7-copy">
                  <div class="home-explore-v7-title"><strong>${esc(token.name || 'Token')}</strong><span>${esc(token.symbol || '')}</span></div>
                  <div class="home-explore-v7-stats"><span>${fmtMc(token.mc ?? token.market_cap_usd)} MC</span><b>${fmtMoney(token.sent || 0)}</b></div>
                </div>
              </div>
            </div>`;
          };

          const renderSecondary = (token) => {
            return `<div class="home-explore-v7-secondary-card${token ? '' : ' is-empty'}">
              <div class="home-explore-v7-media">${renderTokenArt(token, 'secondary')}</div>
              <div class="home-explore-v7-secondary-shade" aria-hidden="true"></div>
            </div>`;
          };

          return `<div class="home-explore-v7-stage">
            <div class="home-explore-v7-primary-slot">${renderPrimary(primary)}</div>
            <div class="home-explore-v7-secondary-slot">${renderSecondary(secondary)}</div>
          </div>`;
        })()}
      </a>
      <a class="home-preview-card home-ref-card home-v2-payments-card" href="#/money">
        <div class="home-preview-label"><b>Payments</b><span>Open →</span></div>
        ${payments.length
          ? `<div class="home-v2-payments-list">${payments.map(paymentMini).join('')}</div>`
          : `<div class="home-v2-empty-row"><i></i><b>$</b><i></i><span>No payouts recorded yet.</span></div>`}
      </a>

      <a class="home-preview-card home-ref-card home-v2-analytics-card" href="#/money">
        <div class="home-preview-label"><b>Analytics</b><span>Open →</span></div>
        <div class="home-v2-analytics-tabs"><b>Fees</b><span>1D</span><span>30D</span><span>All time</span></div>
        <div class="home-v2-analytics-period">1D</div>
        <strong class="home-v2-analytics-total">${fmtMoney(total)}</strong>
        <div class="home-v2-chart">${Array.from({length:32},(_,i)=>`<i style="height:${18+((i*37)%76)}%"></i>`).join('')}</div>
      </a>

      <a class="home-preview-card home-ref-card home-v2-launch-card" href="#/launch">
        <div class="home-preview-label"><b>Launch</b><span>Open →</span></div>
        <div class="home-v2-launch-label">Fees route to</div>
        <div class="home-v2-profile-strip">
          ${profiles.length?profiles.map((p,i)=>{
            const n=p.display_name||p.handle;
            return `<span class="${i===0?'active':''}">${avatar(n,false,p.avatar_url||'')}<b>${esc(n)}</b><small>@${esc(p.handle||'')}</small></span>`;
          }).join(''):`<span class="active">${avatar(leadName,false,'')}<b>${esc(leadName)}</b><small>@${esc(leadHandle)}</small></span>`}
        </div>
        <div class="home-v2-paying">
          <div>${avatar(leadName,true,leadProfile?.avatar_url||'')}</div>
          <span><small>Paying out</small><b>${esc(leadName)}</b><em>@${esc(leadHandle)}</em></span>
          <strong>${payments[0]?fmtMoney(payments[0].amount_usd??payments[0].amount??0):'$0.00'}</strong>
        </div>
        <div class="home-v2-sent-via">Sent via X Money</div>
      </a>

      <a class="home-preview-card home-ref-card home-v2-docs-card" href="#/docs">
        <div class="home-preview-label"><b>Docs</b><span>Open →</span></div>
        <small class="home-v2-docs-eyebrow">Sharing config</small>
        <strong class="home-v2-docs-title">Attribution is per-mint</strong>
        <p>One config account per token mint. The treasury appears in its shareholders array, so a single wallet gets clean per-token attribution.</p>
        <div class="home-v2-docs-fields">
          <span><small>Off</small><small>Len</small><small>Field</small></span>
          <b><i>0</i><i>8</i><em>discriminator</em></b>
          <b><i>11</i><i>32</i><em>token mint</em></b>
          <b><i>43</i><i>32</i><em>admin</em></b>
          <b><i>75</i><i>1</i><em>revoke flag</em></b>
        </div>
        <div class="home-v2-docs-bottom">
          <span><small>Detection</small><b>On-chain</b></span>
          <span><small>Claiming</small><b>Creator fees</b></span>
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
  return `<main class="home-page home-reference-v1">
    <section class="hero wrap home-hero">
      <div class="hero-copy">
        <h1>Route token fees<br>through X Money</h1>
        <p>Point a token's creator fees at any X handle and we pay them out in dollars through X Money. Launch on Pump and Pons.</p>
        <div class="hero-buttons">
          <button class="btn-light" data-action="open-launch">Launch a token</button>
          <a class="text-link" href="#/docs">Read the docs <span>→</span></a>
        </div>
      </div>
    </section>

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
        <button class="${!state.explore.venue?'active':''}" data-venue="">All</button>
        <button class="${state.explore.venue==='pump'?'active':''}" data-venue="pump">● Pump</button>
        <button disabled>■ Pons <small>Soon</small></button>
        <button disabled>Four <small>Soon</small></button>
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
        <button type="button" data-scroll-to="docs-1"><b>1</b>Overview</button>
        <button type="button" data-scroll-to="docs-2"><b>2</b>Supported venues</button>
        <button type="button" data-scroll-to="docs-3"><b>3</b>Directing fees</button>
        <button type="button" data-scroll-to="docs-4"><b>4</b>Naming the recipient</button>
        <button type="button" data-scroll-to="docs-5"><b>5</b>The ${recipientPct}/${protocolPct} split</button>
        <button type="button" data-scroll-to="docs-6"><b>6</b>How claims work</button>
        <button type="button" data-scroll-to="docs-7"><b>7</b>Getting your fees</button>
        <button type="button" data-scroll-to="docs-8"><b>8</b>Payout setup</button>
        <button type="button" data-scroll-to="docs-9"><b>9</b>Unclaimed payments</button>
        <button type="button" data-scroll-to="docs-10"><b>10</b>Public confirmation</button>
        <button type="button" data-scroll-to="docs-11"><b>11</b>Treasury and cross-chain</button>
        <button type="button" data-scroll-to="docs-12"><b>12</b>$PAID and buyback</button>
        <button type="button" data-scroll-to="docs-13"><b>13</b>Stopping payments</button>
        <button type="button" data-scroll-to="docs-14"><b>14</b>If a token is not registering</button>
        <button type="button" data-scroll-to="docs-15"><b>15</b>Glossary</button>
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
function legalPage(){
  const name=esc(state.brand.name);
  return `<main class="legal-page-v1">
    <section class="wrap legal-hero">
      <p class="eyebrow">Legal</p>
      <h1>Terms, privacy and disclosures</h1>
      <p>This page describes how ${name} is intended to operate. It is a product draft and should be reviewed for the actual operator, jurisdictions and production providers before public launch.</p>
    </section>

    <section class="wrap legal-tabs">
      <button type="button" class="active" data-scroll-to="legal-terms">Terms</button>
      <button type="button" data-scroll-to="legal-privacy">Privacy</button>
      <button type="button" data-scroll-to="legal-disclosures">Disclosures</button>
    </section>

    <article class="wrap legal-doc-v1">
      <section id="legal-terms" class="legal-block">
        <div class="legal-block-head"><span>01</span><h2>Terms of use</h2></div>

        <h3>Independent service</h3>
        <p>${name} is an independent creator-fee routing and payout product. References to pump.fun, X, X Money, Solana, exchanges, wallets or payout providers do not imply affiliation, sponsorship or endorsement by those companies or services.</p>

        <h3>No endorsement by recipients</h3>
        <p>A token may name an X account as the intended recipient of creator-fee distributions. That does not mean the named account created, approved, promoted or endorsed the token.</p>

        <h3>Third-party launch venues</h3>
        <p>Token creation, trading, wallets and creator-fee mechanics are provided by third parties. Those services have their own terms, restrictions, availability and technical risks. ${name} does not control their uptime, markets or execution.</p>

        <h3>Fee-routing requirement</h3>
        <p>A token is only eligible for project accounting when the configured treasury is verified as the permanent recipient of the required creator-fee share. Tokens that do not satisfy the current registration rules may be excluded.</p>

        <h3>Payouts</h3>
        <p>Amounts displayed as owed, pending or sent depend on confirmed ledger records and the configured payout rail. A displayed balance is not a bank deposit, custodial account or guaranteed payment time.</p>

        <h3>Opt out</h3>
        <p>An X account owner can use the opt-out flow to stop future recipient payouts and hide associated listings in this product. Opting out does not prevent third parties from creating or trading tokens elsewhere.</p>

        <h3>Suspension and corrections</h3>
        <p>Registration, indexing or payout records may be paused or corrected when chain data, recipient identity, provider status or reconciliation evidence is incomplete or contradictory.</p>
      </section>

      <section id="legal-privacy" class="legal-block">
        <div class="legal-block-head"><span>02</span><h2>Privacy</h2></div>

        <h3>Public blockchain data</h3>
        <p>The product reads public blockchain information such as token mints, creator-fee configurations, transaction references and treasury activity. Public chain data is not private account data.</p>

        <h3>X account data</h3>
        <p>When X sign-in is used for an opt-out action, the application uses the authenticated identity returned by the configured OAuth flow to verify that the request belongs to that X account.</p>

        <h3>Operational records</h3>
        <p>The backend may retain recipient handles, token relationships, claim records, payout statuses, provider references and reconciliation metadata needed to operate and audit the service.</p>

        <h3>Secrets and signing material</h3>
        <p>Private keys, provider secrets and administrative credentials are server-side configuration and are not intended to be exposed through the public interface.</p>

        <h3>Third-party providers</h3>
        <p>When external identity, exchange, wallet or payout providers are enabled, those providers process data under their own policies and technical systems.</p>
      </section>

      <section id="legal-disclosures" class="legal-block">
        <div class="legal-block-head"><span>03</span><h2>Disclosures</h2></div>

        <h3>Cryptoasset risk</h3>
        <p>Memecoins and other cryptoassets can be extremely volatile, illiquid or lose all market value. Nothing in this product is a representation that a token has fundamental value or that any market price will persist.</p>

        <h3>No investment advice</h3>
        <p>Listings, rankings, payment totals, market information and protocol explanations are informational product features. They are not investment, legal, tax or financial advice.</p>

        <h3>No custody representation</h3>
        <p>The public interface should not be interpreted as a bank account, securities account or insured deposit product. On-chain assets and external payout rails have different settlement and custody models.</p>

        <h3>$PAID</h3>
        <p>$PAID is currently described as a planned protocol token and buyback / burn mechanism. Until the token and live execution policy are actually enabled, protocol-cut values shown in the product represent accounting state rather than completed market purchases or burns.</p>

        <h3>Future integrations</h3>
        <p>Pons, additional chains, walletless launch modes and other future rails should be treated as unavailable until the corresponding production integration is explicitly enabled.</p>

        <div class="legal-review-note">
          <strong>Production review required</strong>
          <span>Before a public launch, replace operator placeholders and have the final terms, privacy language and disclosures reviewed for the actual business, jurisdictions and providers.</span>
        </div>
      </section>
    </article>

    ${moneyFooter()}
  </main>`;
}

let launchXLookupTimer=null;
let launchXLookupSeq=0;
let launchSelectedXProfile=null;

function clearLaunchXLookup(){
  const box=document.querySelector('#launchXLookup');
  if(box)box.replaceChildren();
}

function renderLaunchXLookup(profile){
  const box=document.querySelector('#launchXLookup');
  if(!box)return;
  box.replaceChildren();
  if(!profile)return;

  const card=document.createElement('div');
  card.className='launch-x-result';

  const avatar=document.createElement('div');
  avatar.className='launch-x-avatar';
  if(profile.profileImageUrl){
    const img=document.createElement('img');
    img.src=profile.profileImageUrl;
    img.alt='';
    img.referrerPolicy='no-referrer';
    avatar.appendChild(img);
  }else{
    avatar.textContent=(profile.name||profile.username||'X').trim().charAt(0).toUpperCase()||'X';
  }

  const copy=document.createElement('div');
  copy.className='launch-x-copy';
  const top=document.createElement('div');
  top.className='launch-x-name-row';
  const name=document.createElement('strong');
  name.textContent=profile.name||profile.username;
  top.appendChild(name);
  if(profile.verified){
    const badge=document.createElement('span');
    badge.className='launch-x-verified';
    badge.textContent='✓';
    badge.title=profile.verifiedType?`Verified: ${profile.verifiedType}`:'Verified';
    top.appendChild(badge);
  }
  const handle=document.createElement('span');
  handle.textContent=`@${profile.username}`;
  copy.append(top,handle);
  card.append(avatar,copy);
  box.appendChild(card);
}

function renderLaunchXLookupMessage(message){
  const box=document.querySelector('#launchXLookup');
  if(!box)return;
  box.replaceChildren();
  const row=document.createElement('div');
  row.className='launch-x-message';
  row.textContent=message;
  box.appendChild(row);
}

async function lookupLaunchXAccount(raw){
  const username=String(raw||'').replace(/^@/,'').trim();
  const seq=++launchXLookupSeq;
  if(!username){
    launchSelectedXProfile=null;
    clearLaunchXLookup();
    updateLaunchPreview();
    return;
  }
  if(!/^[A-Za-z0-9_]{1,15}$/.test(username)){
    launchSelectedXProfile=null;
    renderLaunchXLookupMessage('Enter a valid X username');
    updateLaunchPreview();
    return;
  }
  renderLaunchXLookupMessage('Searching X…');
  try{
    const profile=await api(`/api/x/profile?username=${encodeURIComponent(username)}`);
    if(seq!==launchXLookupSeq)return;
    const current=String(document.querySelector('#launchHandle')?.value||'').replace(/^@/,'').trim();
    if(current.toLowerCase()!==username.toLowerCase())return;
    launchSelectedXProfile={
      name:profile.name||profile.username||username,
      username:profile.username||username,
      profileImageUrl:profile.profileImageUrl||'',
      verified:Boolean(profile.verified),
      verifiedType:profile.verifiedType||''
    };
    renderLaunchXLookup(profile);
    updateLaunchPreview();
  }catch(err){
    if(seq!==launchXLookupSeq)return;
    launchSelectedXProfile=null;
    updateLaunchPreview();
    renderLaunchXLookupMessage(err.message==='X lookup is not configured'
      ? 'X lookup is not configured on the server'
      : err.message);
  }
}

let launchPreviewImageUrl='';

function updateLaunchImagePreview(input){
  const file=input?.files?.[0]||null;
  const shell=input?.closest('.launch-file-shell');
  const label=shell?.querySelector('span');
  const preview=document.querySelector('#launchPreviewImage');

  if(launchPreviewImageUrl){
    URL.revokeObjectURL(launchPreviewImageUrl);
    launchPreviewImageUrl='';
  }

  if(!file){
    if(label)label.textContent='Choose image';
    if(preview){
      preview.replaceChildren(document.createTextNode('P'));
      preview.classList.remove('has-image');
    }
    return;
  }

  if(file.size>5_000_000){
    input.value='';
    if(label)label.textContent='Choose image';
    if(preview){
      preview.replaceChildren(document.createTextNode('P'));
      preview.classList.remove('has-image');
    }
    setLaunchStatus('Token image must be 5 MB or smaller');
    return;
  }

  if(!/^image\/(png|jpeg|gif|webp)$/i.test(file.type||'')){
    input.value='';
    if(label)label.textContent='Choose image';
    if(preview){
      preview.replaceChildren(document.createTextNode('P'));
      preview.classList.remove('has-image');
    }
    setLaunchStatus('Use PNG, JPG, GIF, or WEBP');
    return;
  }

  launchPreviewImageUrl=URL.createObjectURL(file);
  if(label)label.textContent=file.name||'Image selected';
  if(preview){
    const img=document.createElement('img');
    img.src=launchPreviewImageUrl;
    img.alt='Token image preview';
    preview.replaceChildren(img);
    preview.classList.add('has-image');
  }
}


function updateLaunchMiniImage(input){
  const shell=input?.closest('.launch-file-shell');
  if(!shell)return;

  let mini=shell.querySelector('.launch-file-mini');
  if(!mini){
    mini=document.createElement('div');
    mini.className='launch-file-mini';

    const img=document.createElement('img');
    img.alt='Selected token image';

    const text=document.createElement('span');
    text.textContent='Change image';

    mini.append(img,text);
    shell.appendChild(mini);
  }

  const file=input?.files?.[0]||null;
  if(!file){
    shell.classList.remove('has-selected-image');
    mini.hidden=true;
    return;
  }

  const img=mini.querySelector('img');
  if(img && launchPreviewImageUrl)img.src=launchPreviewImageUrl;
  mini.hidden=false;
  shell.classList.add('has-selected-image');
}
function launchPreviewProfileNode(profile,mode='row'){
  const wrap=document.createElement('span');
  wrap.className=`launch-preview-profile launch-preview-profile-${mode}`;

  if(!profile){
    wrap.textContent='—';
    wrap.classList.add('is-empty');
    return wrap;
  }

  if(mode==='badge'){
    const pay=document.createElement('span');
    pay.className='launch-preview-pay-mark';
    pay.textContent='P';
    wrap.appendChild(pay);
  }

  const avatar=document.createElement('span');
  avatar.className='launch-preview-profile-avatar';
  if(profile.profileImageUrl){
    const img=document.createElement('img');
    img.src=profile.profileImageUrl;
    img.alt='';
    img.referrerPolicy='no-referrer';
    avatar.appendChild(img);
  }else{
    avatar.textContent=(profile.name||profile.username||'X').trim().charAt(0).toUpperCase()||'X';
  }

  const name=document.createElement('strong');
  name.textContent=profile.name||profile.username||'X';

  wrap.append(avatar,name);

  if(profile.verified){
    const verified=document.createElement('span');
    verified.className='launch-preview-profile-verified';
    verified.textContent='✓';
    verified.title=profile.verifiedType?`Verified: ${profile.verifiedType}`:'Verified';
    wrap.appendChild(verified);
  }

  return wrap;
}

function updateLaunchPreview(){
  const name=document.querySelector('#launchName')?.value.trim()||'Token name';
  const ticker=document.querySelector('#launchTicker')?.value.trim().toUpperCase()||'TICKER';
  const typedHandle=document.querySelector('#launchHandle')?.value.trim().replace(/^@/,'')||'';
  const profile=launchSelectedXProfile &&
    String(launchSelectedXProfile.username||'').toLowerCase()===typedHandle.toLowerCase()
      ? launchSelectedXProfile
      : null;

  document.querySelector('#launchPreviewName')?.replaceChildren(document.createTextNode(name));
  document.querySelector('#launchPreviewTicker')?.replaceChildren(document.createTextNode(ticker));

  const badge=document.querySelector('#launchPreviewBadge');
  if(badge)badge.replaceChildren(...(profile?[launchPreviewProfileNode(profile,'badge')]:[]));

  const recipient=document.querySelector('#launchPreviewRecipient');
  if(recipient)recipient.replaceChildren(launchPreviewProfileNode(profile,'row'));
}


let launchMode='launch';

function launchModeTabs(active='launch'){
  return `<div class="launch-mode-tabs">
    <button type="button" data-launch-mode="launch" class="${active==='launch'?'active':''}">Launch</button>
    <button type="button" data-launch-mode="register" class="${active==='register'?'active':''}">Register</button>
    <button type="button" data-launch-mode="walletless" class="${active==='walletless'?'active':''}">Walletless</button>
  </div>`;
}

function launchStaticPreview(recipientPct,protocolPct){
  return `<div class="launch-preview-stack">
    <aside class="launch-preview-card launch-preview-usepaid">
      <div class="launch-preview-media">
        <div class="launch-preview-image">−</div>
      </div>
      <div class="launch-preview-title">
        <div><strong>Token name</strong><span>TICKER</span></div>
      </div>
      <div class="launch-preview-metrics">
        <span><b>$0</b> MC</span>
        <span><b>$0</b> Sent</span>
      </div>
      <div class="launch-preview-recipient-line">
        <span>X Money sent to</span><span class="launch-preview-recipient">—</span>
      </div>
      <div class="launch-preview-split">
        <div><span>Recipient share</span><b>${recipientPct}%</b></div>
        <div><span>$PAID buybacks and burn</span><b>${protocolPct}%</b></div>
      </div>
    </aside>
  </div>`;
}

function launchFeeAddressBox(treasury){
  return `<div class="launch-fee-address-box">
    <div><span>Pump fee-sharing address</span><strong>${esc(treasury||'Configured treasury')}</strong></div>
    <button type="button" data-action="copy-fee-address" data-copy-value="${esc(treasury)}" aria-label="Copy fee-sharing address">⌑</button>
  </div>`;
}

function switchLaunchMode(mode){
  if(!['launch','register','walletless'].includes(mode))return;
  launchMode=mode;
  document.querySelectorAll('[data-launch-panel]').forEach(panel=>{
    panel.hidden=panel.dataset.launchPanel!==mode;
  });

  const panel=document.querySelector(`[data-launch-panel="${mode}"]`);
  if(!panel)return;

  if(typeof ensureLaunchDemoBlock==='function')ensureLaunchDemoBlock();
  requestAnimationFrame(()=>{
    const stack=panel.querySelector('.launch-preview-stack');
    const demo=document.querySelector('#launchDemoBlock');
    if(demo&&stack)stack.before(demo);
  });
}

function launchPage(){
  const treasury=state.brand.treasuryAddress||'';
  const recipientPct=fmtNum((state.brand.recipientShareBps||8000)/100);
  const protocolPct=fmtNum((state.brand.protocolShareBps||2000)/100);
  const brandName=esc(state.brand.name||'PROJECT');

  return `<main class="launch-page-v1">
    <section class="wrap launch-v1-hero">
      <h1>Launch and direct fees through X Money</h1>
      <p>Prepare a token for pump.fun, name the X recipient, then register the mint and permanently route 100% of creator fees to the configured treasury.</p>
    </section>

    <section class="wrap launch-v1-grid">
      <div class="launch-mode-panel" data-launch-panel="launch" ${launchMode==='launch'?'':'hidden'}>
        <div class="launch-v1-form-card">
          <h2 class="launch-mode-heading">Launch token</h2>
          ${launchModeTabs('launch')}

          <div class="launch-venue-row">
            <button type="button" class="active">● Pump</button>
            <button type="button" disabled>■ Pons <small>Soon</small></button>
          </div>

          <form class="launch-form launch-form-v1" id="launchForm">
            <div class="launch-field">
              <label for="launchHandle">X Money sent to</label>
              <input id="launchHandle" placeholder="Search X for an account" required autocomplete="off" autocapitalize="none" spellcheck="false">
              <div id="launchXLookup" class="launch-x-lookup" aria-live="polite"></div>
            </div>

            <div class="launch-divider"></div>

            <div class="launch-two">
              <div class="launch-field"><label for="launchName">Name</label><input id="launchName" placeholder="Ledger Cat" maxlength="32"></div>
              <div class="launch-field"><label for="launchTicker">Ticker</label><input id="launchTicker" placeholder="LCAT" maxlength="10" autocapitalize="characters"></div>
            </div>

            <div class="launch-field">
              <label for="launchImage">Token image</label>
              <div class="launch-file-shell"><input id="launchImage" type="file" accept="image/png,image/jpeg,image/gif,image/webp"><span>Choose image</span></div>
            </div>

            <div class="launch-field"><label for="launchDescription">Description</label><textarea id="launchDescription" rows="4" placeholder="Describe the token"></textarea></div>

            <details class="launch-social-details" open>
              <summary>Social links <small>(optional)</small><span class="launch-social-chevron" aria-hidden="true">⌃</span></summary>
              <div class="launch-social-body">
                <p class="launch-help">You can use the registered token page as the website link.</p>
                <input id="launchWebsite" type="url" inputmode="url" autocomplete="url" autocapitalize="none" spellcheck="false" placeholder="https://yoursite.com">
                <div class="launch-two"><input id="launchTelegram" placeholder="Telegram"><input id="launchX" placeholder="X"></div>
              </div>
            </details>

            <div class="launch-divider"></div>

            <div class="launch-field launch-payment-note-field">
              <label for="launchPaymentNote">Payment note</label>
              <textarea id="launchPaymentNote" maxlength="250" rows="3">Creator fees via ${brandName}</textarea>
              <p class="launch-help"><span id="launchPaymentNoteCount">${`Creator fees via ${state.brand.name}`.length}</span>/250 · the message the recipient sees with every payout</p>
            </div>

            <div class="launch-field">
              <label for="launchDevBuy">Dev Buy <small>(optional)</small></label>
              <div class="launch-money-input"><span>SOL</span><input id="launchDevBuy" inputmode="decimal" placeholder="0.00"></div>
              <p class="launch-help">0 SOL creates the token without an initial buy. Any amount above 0 is included in the Pump launch transaction and still requires your wallet approval.</p>
            </div>

            <label class="launch-terms"><input type="checkbox" required><span>I agree to the <a href="#/legal">Terms</a> and have read the disclosures.</span></label>
            <button class="btn-light full launch-submit" id="launchSubmitButton" type="submit">${currentWallet?'Launch token':'Connect wallet'}</button>
            <div id="launchStatus" class="status-box hidden" aria-live="polite"></div>
          </form>

          <div class="launch-preview-stack">
            <aside class="launch-preview-card launch-preview-usepaid">
              <div class="launch-preview-media">
                <div class="launch-preview-image" id="launchPreviewImage">P</div>
                <div class="launch-preview-badge" id="launchPreviewBadge" aria-hidden="true"></div>
              </div>

              <div class="launch-preview-title">
                <div>
                  <strong id="launchPreviewName">Token name</strong>
                  <span id="launchPreviewTicker">TICKER</span>
                </div>
              </div>

              <div class="launch-preview-metrics">
                <span><b>$0</b> MC</span>
                <span><b>$0</b> Sent</span>
              </div>

              <div class="launch-preview-recipient-line">
                <span>X Money sent to</span>
                <span id="launchPreviewRecipient" class="launch-preview-recipient">—</span>
              </div>

              <div class="launch-preview-split">
                <div><span>Recipient share</span><b>${recipientPct}%</b></div>
                <div><span>$PAID buybacks and burn</span><b>${protocolPct}%</b></div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <div class="launch-mode-panel" data-launch-panel="register" ${launchMode==='register'?'':'hidden'}>
        <p class="launch-mode-context">These fee-sharing instructions are for Pump. To create a Pons token, use the Launch tab. Existing Pons tokens pointed at PAID are indexed automatically.</p>

        <div class="launch-v1-form-card">
          <h2 class="launch-mode-heading">Register a token</h2>
          ${launchModeTabs('register')}

          <div class="launch-venue-row">
            <button type="button" class="active">● Pump</button>
          </div>

          <form class="launch-form launch-form-v1 launch-register-form" id="launchRegisterForm">
            <div class="launch-field">
              <label for="launchRegisterHandle">X Money sent to</label>
              <input id="launchRegisterHandle" placeholder="Search X for an account" autocomplete="off" autocapitalize="none" spellcheck="false">
            </div>

            <div class="launch-field launch-payment-note-field">
              <label for="launchRegisterPaymentNote">Payment note</label>
              <textarea id="launchRegisterPaymentNote" maxlength="250" rows="3">Creator fees via ${brandName}</textarea>
              <p class="launch-help">${`Creator fees via ${state.brand.name}`.length}/250 · the message the recipient sees with every payout</p>
            </div>

            <div class="launch-divider"></div>

            <div class="launch-field">
              <label for="launchRegisterMint">Contract address</label>
              <input id="launchRegisterMint" placeholder="Mint address" autocomplete="off" autocapitalize="none" spellcheck="false">
              <p class="launch-help">The address of the token you already launched on pump.fun.</p>
            </div>

            <div class="launch-register-setup">
              <h3>Set up fee sharing</h3>
              <p>On pump.fun, open the token's fee sharing, send 100% of the creator fees to the ${brandName} fee-sharing address, and revoke the config. That handover is what proves the token is yours, so there is no wallet to connect.</p>
              ${launchFeeAddressBox(treasury)}
              <div class="launch-register-check"><button type="button" class="launch-text-button">Check</button><span>Not checked yet.</span></div>
            </div>

            <div class="launch-divider"></div>
            <p class="launch-register-note">No sign-in and no wallet. Handing us the fee authority is the proof the token is yours.</p>
            <button type="button" class="btn-light full launch-submit" disabled>Choose who gets paid</button>
            <p class="launch-register-terms">By registering, you agree to the <a href="#/legal">Terms of Use</a>.</p>
          </form>

          ${launchStaticPreview(recipientPct,protocolPct)}
        </div>
      </div>

      <div class="launch-mode-panel" data-launch-panel="walletless" ${launchMode==='walletless'?'':'hidden'}>
        <p class="launch-mode-context">These fee-sharing instructions are for Pump. To create a Pons token, use the Launch tab. Existing Pons tokens pointed at PAID are indexed automatically.</p>

        <div class="launch-v1-form-card launch-walletless-card">
          <h2 class="launch-mode-heading">Walletless launch</h2>
          ${launchModeTabs('walletless')}

          <div class="launch-venue-row">
            <button type="button" class="active">● Pump</button>
          </div>

          <div class="launch-walletless-steps">
            <section class="launch-walletless-step">
              <span class="launch-walletless-number">1</span>
              <div>
                <h3>Put the recipient's @handle in the description</h3>
                <p>When you create the coin on pump.fun, write the X handle of who gets paid anywhere in its description — @elonmusk, for example. We read it from there when the token registers.</p>
              </div>
            </section>

            <section class="launch-walletless-step">
              <span class="launch-walletless-number">2</span>
              <div>
                <h3>Set up fee sharing</h3>
                <p>Once the coin exists, open its fee sharing on pump.fun and send 100% of the creator fees to this address.</p>
                ${launchFeeAddressBox(treasury)}
              </div>
            </section>

            <section class="launch-walletless-step">
              <span class="launch-walletless-number">3</span>
              <div>
                <h3>Payouts start on their own</h3>
                <p>Nothing to submit. The token appears on Explore and the first payout lands shortly, confirmed publicly by ${brandName}.</p>
                <p class="launch-walletless-tip">Launched already, and the description names nobody? Register the token instead — you choose the recipient there.</p>
              </div>
            </section>
          </div>

          <div class="launch-preview-stack launch-walletless-preview">
            <aside class="launch-walletless-pump-card">
              <h3>Launch on Pump</h3>
              <p>pump.fun · Share creator rewards</p>
              <img
                class="launch-walletless-pump-reference"
                src="/assets/walletless-share-creator-rewards.webp"
                alt="Pump Share creator rewards setup showing one recipient with 100 percent allocation"
                loading="lazy"
                decoding="async"
              >
              <p>Add our treasury as the only recipient, at 100%, before you create the coin.</p>
            </aside>
          </div>
        </div>
      </div>
    </section>
    ${moneyFooter()}
  </main>`;
}

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
function optOutPage(){
  const raw=(location.hash||'').split('?')[1]||'';
  const qs=new URLSearchParams(raw);
  const done=qs.get('done')||'';

  return `<main class="optout-page-v1">
    <section class="wrap optout-hero">
      <h1>Opt out of ${esc(state.brand.name)}</h1>
      <p>Sign in with X to stop payments to your account and keep tokens that name you off this site.</p>
    </section>

    <section class="wrap optout-card">
      <p class="eyebrow">Opt out</p>
      <h2>Turn off everything tied to your handle</h2>
      <p class="optout-lead">${esc(state.brand.name)} pays creator-fee distributions to the X account a token names. If that is you and you do not want it, opting out disables the recipient flow for your handle.</p>

      <div class="optout-effects">
        <div><b>1</b><section><h3>Payments stop</h3><p>We will not send future X Money-style payouts to your account.</p></section></div>
        <div><b>2</b><section><h3>Tokens naming you are hidden</h3><p>They are removed from Explore, Payments, search and your public profile views.</p></section></div>
        <div><b>3</b><section><h3>Unpaid fees move to protocol accounting</h3><p>Future unpaid recipient accounting can be diverted to the protocol allocation and pending $PAID buyback ledger.</p></section></div>
        <div><b>4</b><section><h3>Launches here cannot pick you</h3><p>The launch flow rejects a recipient handle that has opted out.</p></section></div>
      </div>

      <div class="optout-limit">
        <h3>What we cannot stop</h3>
        <p>Anyone can still create a token on third-party launch venues using your handle or name. We do not control those venues. We can stop listing it here and stop paying your handle from it.</p>
      </div>

      <p class="optout-auth-note">Signing in verifies that the request comes from the X account owner. The existing OAuth flow reads the authenticated X identity for this opt-out action.</p>
    </section>

    <section class="wrap optout-status-card">
      ${done ? `
        <div class="optout-success">
          <div class="optout-success-icon">✓</div>
          <div>
            <span>Opted out</span>
            <h2>@${esc(done)}</h2>
            <p>Payments and launch selection for this handle are now disabled by the backend.</p>
          </div>
        </div>
        <div class="optout-check-grid">
          <div><span>Your X account</span><b>@${esc(done)}</b></div>
          <div><span>X Money payments</span><b>Stopped</b></div>
          <div><span>Tokens shown here</span><b>Hidden</b></div>
          <div><span>Selectable at launch</span><b>No</b></div>
        </div>
      ` : `
        <div class="optout-checking">
          <span>Checking</span>
          <h2>Your X account</h2>
          <div class="optout-check-grid">
            <div><span>X Money payments</span><b>—</b></div>
            <div><span>Tokens shown here</span><b>—</b></div>
            <div><span>Selectable at launch</span><b>—</b></div>
            <div><span>Unpaid fees</span><b>—</b></div>
          </div>
        </div>

        <a class="btn-light full center-button optout-x-button" href="/api/auth/x/start">Sign in with X</a>
        <div class="status-box optout-env-note">X OAuth must be configured on the server before sign-in can complete.</div>
      `}

      <div class="optout-progress">
        <div class="${done?'done':'active'}"><b>1</b><span>Sign in with X</span></div>
        <div class="${done?'done':''}"><b>2</b><span>Confirm</span></div>
        <div class="${done?'done':''}"><b>3</b><span>Opted out</span></div>
      </div>
    </section>

    ${moneyFooter()}
  </main>`;
}

function tokenDetailClaimCard(c,i){
  return `<button class="token-detail-event expandable" data-expand="token-claim-${i}">
    <div class="token-event-main">
      <div>
        <span>Claimed</span>
        <strong>${fmtNum(c.gross_native||0)} ${esc(c.native_symbol||'SOL')}</strong>
      </div>
      <div class="token-event-value">
        <b>${fmtMoney(c.gross_usd||0)}</b>
        <time>${esc(ago(c.confirmed_at||c.created_at))}</time>
      </div>
    </div>
    <div class="token-event-meta">
      <span>Recipient ${fmtMoney(c.recipient_usd||0)}</span>
      <span>Protocol ${fmtMoney(c.protocol_usd||0)}</span>
      <span class="token-status-pill">${esc(c.status||'confirmed')}</span>
    </div>
    <div class="details hidden">
      <div><span>Transaction</span><b class="token-detail-truncate">${esc(c.tx_signature||c.id||'—')}</b></div>
      <div><span>SOL price</span><b>${fmtMoney(c.native_usd_price||0)}</b></div>
    </div>
  </button>`;
}

function tokenDetailPaymentCard(p,i,handle){
  const amount=Number(p.item_amount_usd??p.amount_usd??0);
  return `<button class="token-detail-event expandable" data-expand="token-payment-${i}">
    <div class="token-event-main">
      <div>
        <span>Payment to @${esc(handle||p.recipient_handle||'recipient')}</span>
        <strong>${fmtMoney(amount)}</strong>
      </div>
      <div class="token-event-value">
        <span class="token-status-pill">${esc(p.status||'queued')}</span>
        <time>${esc(ago(p.sent_at||p.created_at))}</time>
      </div>
    </div>
    <div class="token-event-meta">
      <span>${esc(p.provider||'payout rail')}</span>
      <span>${p.public_confirmation_url?'Public confirmation':'Ledger record'}</span>
    </div>
    <div class="details hidden">
      <div><span>Provider reference</span><b class="token-detail-truncate">${esc(p.provider_ref||p.id||'—')}</b></div>
      <div><span>Created</span><b>${esc(p.created_at||'—')}</b></div>
    </div>
  </button>`;
}

function tokenDetailEmpty(title,copy){
  return `<div class="token-detail-empty"><strong>${esc(title)}</strong><span>${esc(copy)}</span></div>`;
}

async function tokenPage(mint){
  const t=await api(`/api/tokens/${encodeURIComponent(mint)}`);
  const recipient=moneyProfile(t.recipient_handle)||{};
  const chain=t.chain||null;
  const recipientPct=fmtNum((state.brand.recipientShareBps||8000)/100);
  const protocolPct=fmtNum((state.brand.protocolShareBps||2000)/100);
  const routeGood=!!t.permanent && Number(t.fee_share_bps||0)>=10000;
  const pumpUrl=t.venue==='pump'?`https://pump.fun/coin/${encodeURIComponent(t.mint)}`:'';
  const totalClaims=(t.claims||[]).reduce((n,c)=>n+Number(c.gross_usd||0),0);

  return `<main class="token-detail-page">
    <section class="wrap token-detail-breadcrumb">
      <a href="#/explore">← Explore</a>
      <span>${esc(t.platform||t.venue||'Token')}</span>
    </section>

    <section class="wrap token-detail-hero">
      <div class="token-detail-cover">
        ${avatar(t.symbol||t.name,true,t.image_url)}
      </div>

      <div class="token-detail-identity">
        <div class="token-detail-name-row">
          <div>
            <p>${esc(t.platform||t.venue||'Token')} · ${esc(t.age||'')}</p>
            <h1>${esc(t.name||t.symbol||'Token')}</h1>
            <span>${esc(t.symbol||'')}</span>
          </div>
          ${pumpUrl?`<a class="token-detail-external" href="${pumpUrl}" target="_blank" rel="noopener">Open on Pump ↗</a>`:''}
        </div>

        <a class="token-detail-recipient" href="#/profile/${encodeURIComponent(t.recipient_handle||'')}">
          ${avatar(recipient.display_name||t.recipient_handle||'X',true,recipient.avatar_url||'')}
          <div><span>X Money sent to</span><b>@${esc(t.recipient_handle||'—')}</b></div>
          <i>→</i>
        </a>
      </div>

      <div class="token-detail-money">
        <div class="token-detail-primary">
          <span>Total sent</span>
          <strong>${fmtMoney(t.sent||0)}</strong>
        </div>
        <div><span>Currently owed</span><b>${fmtMoney(t.owed||0)}</b></div>
        <div><span>Total earned</span><b>${fmtMoney(t.earned||0)}</b></div>
        <div><span>Market cap</span><b>${fmtMc(t.market_cap_usd||0)}</b></div>
      </div>
    </section>

    <section class="wrap token-detail-grid">
      <div class="token-detail-panel token-route-panel">
        <div class="token-detail-panel-head">
          <div><span>Fee route</span><h2>${routeGood?'Verified':'Pending verification'}</h2></div>
          <span class="token-route-badge ${routeGood?'good':''}">${routeGood?'Permanent':'Pending'}</span>
        </div>

        <div class="token-route-meter">
          <div style="width:${Math.min(100,Math.max(0,Number(t.fee_share_bps||0)/100))}%"></div>
        </div>

        <div class="token-route-facts">
          <div><span>Creator fees routed</span><b>${fmtNum(Number(t.fee_share_bps||0)/100)}%</b></div>
          <div><span>Recipient share</span><b>${recipientPct}%</b></div>
          <div><span>Protocol share</span><b>${protocolPct}%</b></div>
          <div><span>Venue</span><b>${esc(t.platform||t.venue||'—')}</b></div>
        </div>

        <div class="token-route-addresses">
          <div><span>Token mint</span><code>${esc(t.mint)}</code></div>
          <div><span>Treasury</span><code>${esc(state.brand.treasuryAddress||'Not configured')}</code></div>
        </div>
      </div>

      <div class="token-detail-panel token-chain-panel">
        <div class="token-detail-panel-head">
          <div><span>On-chain state</span><h2>${chain?'Indexed':'Waiting for index'}</h2></div>
          <span class="token-route-badge ${chain?'good':''}">${chain?'Live':'—'}</span>
        </div>

        ${chain?`
          <div class="token-chain-facts">
            <div><span>Claimable now</span><b>${fmtMoney(chain.gross_unclaimed_usd||t.claimable_usd||0)}</b></div>
            <div><span>Recipient unclaimed</span><b>${fmtMoney(chain.recipient_unclaimed_usd||0)}</b></div>
            <div><span>Protocol unclaimed</span><b>${fmtMoney(chain.protocol_unclaimed_usd||0)}</b></div>
            <div><span>Can distribute</span><b>${chain.can_distribute?'Yes':'Not yet'}</b></div>
            <div><span>Graduated</span><b>${chain.is_graduated?'Yes':'No'}</b></div>
            <div><span>Verified slot</span><b>${esc(chain.verified_slot??'—')}</b></div>
          </div>
          <p class="token-indexed-at">Indexed ${esc(ago(chain.indexed_at||t.chain_indexed_at))}</p>
        `:tokenDetailEmpty('No active chain state yet','The next successful discovery pass will populate verified fee-routing state.')}
      </div>
    </section>

    ${t.description?`
      <section class="wrap token-detail-section">
        <div class="token-detail-section-head"><h2>About</h2></div>
        <p class="token-detail-description">${esc(t.description)}</p>
      </section>
    `:''}

    <section class="wrap token-detail-section">
      <div class="token-detail-section-head">
        <h2>Claims</h2>
        <span>${(t.claims||[]).length} records · ${fmtMoney(totalClaims)}</span>
      </div>
      <div class="token-detail-events">
        ${(t.claims||[]).length?(t.claims||[]).map(tokenDetailClaimCard).join(''):tokenDetailEmpty('No claims yet','Confirmed creator-fee claims will appear here.')}
      </div>
    </section>

    <section class="wrap token-detail-section">
      <div class="token-detail-section-head">
        <h2>Payments</h2>
        <span>${(t.payouts||[]).length} records</span>
      </div>
      <div class="token-detail-events">
        ${(t.payouts||[]).length?(t.payouts||[]).map((p,i)=>tokenDetailPaymentCard(p,i,t.recipient_handle)).join(''):tokenDetailEmpty('No payments yet','Confirmed recipient payouts funded by this token will appear here.')}
      </div>
    </section>

    ${moneyFooter()}
  </main>`;
}

function profileTokenCard(t){
  return `<a class="profile-token-card" href="#/token/${encodeURIComponent(t.mint||t.contract)}">
    <div class="profile-token-image">${avatar(t.symbol||t.name,true,t.image_url)}</div>
    <div class="profile-token-copy">
      <span>${esc(t.platform||t.venue||'Token')} · ${esc(t.age||ago(t.created_at))}</span>
      <strong>${esc(t.name||t.symbol||'Token')}</strong>
      <small>${esc(t.symbol||'')}</small>
    </div>
    <div class="profile-token-sent">
      <span>Sent</span>
      <b>${fmtMoney(t.sent||0)}</b>
    </div>
    <div class="profile-token-stats">
      <span>${fmtMc(t.market_cap_usd||t.mc||0)} <small>MC</small></span>
      <span>${fmtMoney(t.owed||0)} <small>Owed</small></span>
      <span>${t.permanent?'Permanent':'Pending'} <small>Route</small></span>
    </div>
  </a>`;
}

function profilePaymentCard(p,i){
  const confirmed=['sent','claimed'].includes(p.status);
  return `<button class="profile-payment-card expandable" data-expand="profile-payment-${i}">
    <div class="profile-payment-main">
      <div>
        <span>${confirmed?'Paid':'Scheduled'}</span>
        <strong>${fmtMoney(p.amount_usd||0)}</strong>
      </div>
      <div class="profile-payment-side">
        <b class="token-status-pill">${esc(p.status||'queued')}</b>
        <time>${esc(ago(p.sent_at||p.created_at))}</time>
      </div>
    </div>
    <div class="profile-payment-meta">
      <span>${esc(p.provider||'payout rail')}</span>
      <span>${p.public_confirmation_url?'Public confirmation':'Ledger record'}</span>
    </div>
    <div class="details hidden">
      <div><span>Provider reference</span><b class="token-detail-truncate">${esc(p.provider_ref||p.id||'—')}</b></div>
      <div><span>Created</span><b>${esc(p.created_at||'—')}</b></div>
      ${p.public_confirmation_url?`<div><span>Confirmation</span><b class="token-detail-truncate">${esc(p.public_confirmation_url)}</b></div>`:''}
    </div>
  </button>`;
}

async function profilePage(handle){
  const p=await api(`/api/profiles/${encodeURIComponent(handle)}`);
  const r=p.recipient||{};
  const tokens=p.tokens||[];
  const payments=p.payments||[];
  const owed=tokens.reduce((n,t)=>n+Number(t.owed||0),0);
  const earned=tokens.reduce((n,t)=>n+Number(t.earned||0),0);
  const sent=tokens.reduce((n,t)=>n+Number(t.sent||0),0);
  const top=tokens.slice().sort((a,b)=>Number(b.sent||0)-Number(a.sent||0))[0]||null;
  const display=r.display_name||r.handle||handle;
  const cleanHandle=String(r.handle||handle||'').replace(/^@/,'');
  const xUrl=cleanHandle?`https://x.com/${encodeURIComponent(cleanHandle)}`:'';

  if(r.opted_out){
    return `<main class="profile-page-v1">
      <section class="wrap profile-hidden-card">
        <p class="eyebrow">X Profile</p>
        <h1>This profile has opted out.</h1>
        <p>Payments and public token listings for @${esc(cleanHandle)} are disabled in ${esc(state.brand.name)}.</p>
        <a href="#/explore" class="btn-light">Back to Explore</a>
      </section>
      ${moneyFooter()}
    </main>`;
  }

  return `<main class="profile-page-v1">
    <section class="wrap profile-v1-hero">
      <div class="profile-v1-person">
        ${avatar(display,true,r.avatar_url||'')}
        <div class="profile-v1-name">
          <p>X Profile</p>
          <h1>${esc(display)}</h1>
          <span>@${esc(cleanHandle)}</span>
        </div>
        ${xUrl?`<a class="profile-x-link" href="${xUrl}" target="_blank" rel="noopener">View on X ↗</a>`:''}
      </div>

      ${r.bio?`<p class="profile-v1-bio">${esc(r.bio)}</p>`:''}

      <div class="profile-v1-total">
        <span>Total received</span>
        <strong>${fmtMoney(p.received||0)}</strong>
        <small>Confirmed payouts through the project ledger.</small>
      </div>

      <div class="profile-v1-stats">
        <div><span>Tokens</span><b>${tokens.length}</b></div>
        <div><span>Currently owed</span><b>${fmtMoney(owed)}</b></div>
        <div><span>Total earned</span><b>${fmtMoney(earned)}</b></div>
        <div><span>Token payments</span><b>${fmtMoney(sent)}</b></div>
      </div>
    </section>

    ${top?`
      <section class="wrap profile-featured">
        <div class="profile-section-head">
          <h2>Top token</h2>
          <a href="#/token/${encodeURIComponent(top.mint||top.contract)}">Open →</a>
        </div>
        <a class="profile-featured-card" href="#/token/${encodeURIComponent(top.mint||top.contract)}">
          <div class="profile-featured-image">${avatar(top.symbol||top.name,true,top.image_url)}</div>
          <div>
            <span>${esc(top.platform||top.venue||'Token')}</span>
            <h3>${esc(top.name||top.symbol||'Token')}</h3>
            <p>${esc(top.symbol||'')}</p>
          </div>
          <div class="profile-featured-money">
            <span>Sent</span>
            <strong>${fmtMoney(top.sent||0)}</strong>
          </div>
        </a>
      </section>
    `:''}

    <section class="wrap profile-v1-section">
      <div class="profile-section-head">
        <h2>Tokens</h2>
        <span>${tokens.length}</span>
      </div>
      <div class="profile-token-list">
        ${tokens.length?tokens.map(profileTokenCard).join(''):tokenDetailEmpty('No visible tokens','Tokens naming this X account will appear here after registration.')}
      </div>
    </section>

    <section class="wrap profile-v1-section">
      <div class="profile-section-head">
        <h2>X Payments</h2>
        <span>${payments.length}</span>
      </div>
      <div class="profile-payment-list">
        ${payments.length?payments.map(profilePaymentCard).join(''):tokenDetailEmpty('No payments yet','Confirmed payouts to this X account will appear here.')}
      </div>
    </section>

    <section class="wrap profile-recipient-note">
      <strong>Recipient, not endorsement</strong>
      <p>Being named as the recipient of creator-fee distributions does not mean this X account created, approved, promoted or endorsed any token shown here.</p>
    </section>

    ${moneyFooter()}
  </main>`;
}

function adminPage(){return `<main><section class="wrap launch-page"><p class="eyebrow">Internal</p><h1>Operations</h1><p class="lead">Run workers manually without restarting the server. The admin token stays in your browser session only.</p><form class="launch-form" id="adminForm"><label>Admin token<input id="adminToken" type="password" autocomplete="off"></label><div class="launch-actions"><button type="button" class="btn-light" data-admin-run="discovery">Run discovery</button><button type="button" class="btn-light" data-admin-run="claims">Run claims</button><button type="button" class="btn-light" data-admin-run="payouts">Run payouts</button></div></form><pre class="status-box" id="adminOutput">Ready.</pre></section>${footer()}</main>`;}
function launchModal(){return `<div class="modal-bg hidden" id="launchModal"><div class="modal"><button class="modal-x" data-action="close-launch">×</button><p class="eyebrow">Launch</p><h2>Route creator fees</h2><p>Create the token on pump.fun, name a recipient in metadata, then permanently route 100% of creator fees to the configured treasury.</p><a class="modal-option" href="#/launch"><span class="option-icon">●</span><div><b>Launch / route token</b><small>Build and sign the fee-sharing transaction</small></div><span>→</span></a><a class="modal-option" href="#/docs"><span class="option-icon">⌘</span><div><b>Read integration docs</b><small>Indexer, claims, ledger and payouts</small></div><span>→</span></a></div></div>`;}
function loadingPage(){return `<main><section class="wrap launch-page"><p class="eyebrow">Loading</p><h1>Syncing ledger…</h1></section></main>`;}
function errorPage(err){return `<main><section class="wrap launch-page"><p class="eyebrow">Error</p><h1>Could not load</h1><p class="lead">${esc(err?.message||err)}</p><button class="btn-light" data-action="reload">Retry</button></section></main>`;}
async function loadBase(){const [cfg,home,money,tokens]=await Promise.all([api('/api/config'),api('/api/home'),api('/api/money'),api('/api/tokens?limit=100')]);state.brand={...state.brand,...cfg,heroLine1:'Route token fees',heroLine2:'through X Money',description:'Point a token’s creator fees at any X handle and route the recipient share in dollars through your configured payout rail.'};state.home=home;state.money=money;state.tokens=tokens.tokens||[];document.title=state.brand.name;}
async function refreshTokens(){const q=new URLSearchParams({search:state.explore.query,sort:state.explore.sort,venue:state.explore.venue,limit:'200'});const j=await api(`/api/tokens?${q}`);state.tokens=j.tokens||[];}
async function render(){const path=(location.hash||'#/').slice(2).split('?')[0];app.innerHTML=header()+loadingPage()+launchModal();try{if(!state.home)await loadBase();let page;if(path===''||path==='/')page=homePage();else if(path==='explore'){await refreshTokens();page=explorePage();}else if(path==='money'){state.money=await api('/api/money');page=moneyPage();}else if(path==='docs')page=docsPage();else if(path==='legal')page=legalPage();else if(path==='launch')page=launchPage();else if(path==='capital-flow'){state.money=await api('/api/money');page=capitalFlowPage();}else if(path==='paid'){state.money=await api('/api/money');page=paidPage();}else if(path==='opt-out')page=optOutPage();else if(path==='admin')page=adminPage();else if(path.startsWith('token/'))page=await tokenPage(decodeURIComponent(path.slice(6)));else if(path.startsWith('profile/'))page=await profilePage(decodeURIComponent(path.slice(8)));else page=homePage();app.innerHTML=header()+page+launchModal();window.scrollTo(0,0);}catch(e){app.innerHTML=header()+errorPage(e)+launchModal();}}
let currentLaunch=null,currentWallet=null;

function solanaWalletProvider(){
  const candidates=[
    window.phantom?.solana,
    window.solflare,
    window.backpack?.solana,
    window.solana
  ].filter(Boolean);

  return candidates.find(p=>p?.isPhantom)
    || candidates.find(p=>p?.isSolflare)
    || candidates.find(p=>p?.isBackpack)
    || candidates.find(p=>typeof p?.connect==='function')
    || null;
}

function mobileBrowserWithoutWallet(){
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent||'') && !solanaWalletProvider();
}

function encodeLaunchWalletDraft(){
  const ids=[
    'launchHandle','launchName','launchTicker','launchDescription',
    'launchWebsite','launchTelegram','launchX','launchPaymentNote','launchDevBuy'
  ];
  const draft={};
  for(const id of ids){
    const el=document.querySelector(`#${id}`);
    if(el && typeof el.value==='string')draft[id]=el.value;
  }
  try{
    const bytes=new TextEncoder().encode(JSON.stringify(draft));
    let binary='';
    for(const b of bytes)binary+=String.fromCharCode(b);
    return btoa(binary).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
  }catch{
    return '';
  }
}

function decodeLaunchWalletDraft(value){
  if(!value)return null;
  try{
    const normalized=value.replaceAll('-','+').replaceAll('_','/');
    const padded=normalized+'='.repeat((4-normalized.length%4)%4);
    const binary=atob(padded);
    const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  }catch{
    return null;
  }
}

function launchWalletReturnUrl(){
  const target=new URL(location.href);
  target.hash='#/launch';
  const draft=encodeLaunchWalletDraft();
  if(draft)target.searchParams.set('launchWalletDraft',draft);
  return target.toString();
}

function walletBrowseUrl(wallet){
  const url=encodeURIComponent(launchWalletReturnUrl());
  const ref=encodeURIComponent(location.origin);
  if(wallet==='phantom')return `https://phantom.app/ul/browse/${url}?ref=${ref}`;
  if(wallet==='solflare')return `https://solflare.com/ul/v1/browse/${url}?ref=${ref}`;
  return '';
}

function closeLaunchWalletPicker(){
  document.querySelector('#launchWalletPicker')?.remove();
}

function showLaunchWalletPicker(){
  closeLaunchWalletPicker();
  const modal=document.createElement('div');
  modal.id='launchWalletPicker';
  modal.className='launch-wallet-picker';
  modal.innerHTML=`
    <div class="launch-wallet-picker-backdrop" data-wallet-close></div>
    <section class="launch-wallet-picker-card" role="dialog" aria-modal="true" aria-labelledby="launchWalletPickerTitle">
      <div class="launch-wallet-picker-head">
        <h3 id="launchWalletPickerTitle">Connect Solana wallet</h3>
        <button type="button" data-wallet-close aria-label="Close">×</button>
      </div>
      <p class="launch-wallet-picker-copy">On iPhone, open this Launch page inside your wallet app. The text fields will carry over automatically.</p>
      <button type="button" class="launch-wallet-choice" data-wallet-open="phantom">
        <span class="launch-wallet-choice-mark">P</span>
        <span><strong>Phantom</strong><small>Open in Phantom</small></span>
        <b>›</b>
      </button>
      <button type="button" class="launch-wallet-choice" data-wallet-open="solflare">
        <span class="launch-wallet-choice-mark">S</span>
        <span><strong>Solflare</strong><small>Open in Solflare</small></span>
        <b>›</b>
      </button>
      <p class="launch-wallet-picker-note">For security, iOS does not transfer a selected local image file between Safari and a wallet browser. If you already chose an image, select it once more after the wallet app opens.</p>
    </section>
  `;

  modal.addEventListener('click',e=>{
    const close=e.target.closest('[data-wallet-close]');
    if(close){
      e.preventDefault();
      closeLaunchWalletPicker();
      return;
    }

    const walletOpen=e.target.closest('[data-wallet-open]');
    if(walletOpen){
      e.preventDefault();
      const target=walletBrowseUrl(walletOpen.dataset.walletOpen);
      if(!target)return;
      walletOpen.disabled=true;
      location.href=target;
    }
  });

  document.body.appendChild(modal);
}

function restoreLaunchWalletDraft(){
  const url=new URL(location.href);
  const raw=url.searchParams.get('launchWalletDraft');
  const draft=decodeLaunchWalletDraft(raw);
  if(!draft)return false;
  const form=document.querySelector('#launchForm');
  if(!form)return false;

  for(const [id,value] of Object.entries(draft)){
    const el=document.querySelector(`#${id}`);
    if(el && typeof value==='string')el.value=value;
  }

  url.searchParams.delete('launchWalletDraft');
  history.replaceState(null,'',`${url.pathname}${url.search}${url.hash}`);
  updateLaunchPreview();
  const note=document.querySelector('#launchPaymentNoteCount');
  const noteInput=document.querySelector('#launchPaymentNote');
  if(note&&noteInput)note.textContent=String(noteInput.value.length);
  const handle=document.querySelector('#launchHandle')?.value||'';
  if(handle)lookupLaunchXAccount(handle);
  setLaunchStatus('Launch details restored. Connect your wallet and re-select the token image if needed.',true);
  return true;
}

function syncLaunchWalletUi(){
  const provider=solanaWalletProvider();
  if(provider && provider.publicKey){
    currentWallet=provider;
    const button=document.querySelector('#launchSubmitButton');
    if(button && !button.disabled && button.textContent!=='Launch token')button.textContent='Launch token';
  }else if(mobileBrowserWithoutWallet()){
    const button=document.querySelector('#launchSubmitButton');
    if(button && !button.disabled && button.textContent!=='Connect wallet')button.textContent='Connect wallet';
  }
}

async function connectWallet(){
  const provider=solanaWalletProvider();

  if(!provider?.connect){
    showLaunchWalletPicker();
    return null;
  }

  const out=await provider.connect();
  const pub=out?.publicKey?.toString?.()||provider.publicKey?.toString?.()||'';
  if(!pub)throw new Error('Wallet connected but did not return a Solana public key');

  currentWallet=provider;

  if(typeof provider.on==='function' && !provider.__projectWalletEventsBound){
    provider.__projectWalletEventsBound=true;
    provider.on('disconnect',()=>{
      currentWallet=null;
      currentLaunch=null;
      const button=document.querySelector('#launchSubmitButton');
      if(button){button.disabled=false;button.textContent='Connect wallet';}
    });
  }

  for(const id of ['creatorPubkey','creatorPubkeySuccess']){
    const el=document.querySelector(`#${id}`);
    if(el)el.value=pub;
  }
  return pub;
}
function setLaunchStatus(text,good=false){const el=document.querySelector('#launchStatus');if(el){const message=String(text||'');el.textContent=message;el.classList.toggle('good',good);el.classList.toggle('hidden',!message);}}

async function launchImageBase64(file){
  if(!file)throw new Error('Choose a token image first');
  if(file.size>5_000_000)throw new Error('Token image must be 5 MB or smaller');
  if(!/^image\/(png|jpeg|gif|webp)$/i.test(file.type||''))throw new Error('Use PNG, JPG, GIF, or WEBP');
  const bytes=new Uint8Array(await file.arrayBuffer());
  let binary='';
  const chunk=0x8000;
  for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
  return btoa(binary);
}

function isLaunchConfirmationPendingError(err){
  return /transaction is not confirmed yet|mint account is not visible on-chain/i.test(String(err?.message||''));
}

async function confirmCreatedLaunch(attempts=2){
  if(!currentLaunch?.id||!currentLaunch?.mint||!currentLaunch?.createSignature)throw new Error('Pending token transaction is incomplete');
  let lastError=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    setLaunchStatus(`Token submitted: ${currentLaunch.mint.slice(0,6)}…${currentLaunch.mint.slice(-6)}. Waiting for confirmation${attempt>1?' (retry)':''}…`);
    try{
      const out=await api('/api/launch/created',{
        method:'POST',
        body:JSON.stringify({
          intent_id:currentLaunch.id,
          mint:currentLaunch.mint,
          creator_pubkey:currentLaunch.creatorPubkey,
          tx_signature:currentLaunch.createSignature
        })
      });
      currentLaunch={...currentLaunch,createConfirmed:true,createPending:false};
      return out;
    }catch(err){
      lastError=err;
      if(!isLaunchConfirmationPendingError(err))throw err;
      if(attempt<attempts)await new Promise(r=>setTimeout(r,1800));
    }
  }
  currentLaunch={...currentLaunch,createPending:true};
  return {ok:false,pending:true,reason:lastError?.message||'Transaction confirmation is still pending'};
}

async function confirmRoutingLaunch(attempts=2){
  if(!currentLaunch?.id||!currentLaunch?.mint||!currentLaunch?.routingSignature)throw new Error('Pending fee-routing transaction is incomplete');
  let lastError=null;
  for(let attempt=1;attempt<=attempts;attempt++){
    setLaunchStatus(`Fee routing submitted. Waiting for confirmation${attempt>1?' (retry)':''}…`);
    try{
      const out=await api('/api/launch/confirm',{
        method:'POST',
        body:JSON.stringify({
          intent_id:currentLaunch.id,
          mint:currentLaunch.mint,
          recipient_handle:currentLaunch.handle,
          tx_signature:currentLaunch.routingSignature
        })
      });
      if(out.ok)currentLaunch={...currentLaunch,routingConfirmed:true,routingPending:false};
      return out;
    }catch(err){
      lastError=err;
      if(!isLaunchConfirmationPendingError(err))throw err;
      if(attempt<attempts)await new Promise(r=>setTimeout(r,1800));
    }
  }
  currentLaunch={...currentLaunch,routingPending:true};
  return {ok:false,pending:true,reason:lastError?.message||'Fee-routing confirmation is still pending'};
}

async function finishCurrentLaunch(){
  if(!currentLaunch?.mint||!currentLaunch?.createSignature)throw new Error('No submitted token transaction to finish');
  const button=document.querySelector('#launchSubmitButton');

  if(!currentLaunch.createConfirmed){
    const created=await confirmCreatedLaunch();
    if(created?.pending){
      if(button){button.disabled=false;button.textContent='Retry confirmation';}
      setLaunchStatus('Token transaction was submitted, but confirmation is still pending. Tap Retry confirmation — do not launch a second token.');
      return created;
    }
  }

  setLaunchStatus('Token confirmed. One more wallet approval will permanently route 100% of creator fees to the treasury.');
  const routed=await routeFees();

  if(routed?.pending){
    if(button){button.disabled=false;button.textContent='Retry confirmation';}
    setLaunchStatus('Fee-routing transaction was submitted, but confirmation is still pending. Tap Retry confirmation — it will check the same transaction.');
    return routed;
  }

  if(routed?.ok){
    if(button){button.disabled=true;button.textContent='Launched';}
    const symbol=String(currentLaunch.symbol||document.querySelector('#launchTicker')?.value||'TOKEN').trim().toUpperCase();
    setLaunchStatus(`Launch complete. ${symbol} is registered and live in Explore.`,true);
    setTimeout(()=>{location.hash=`#/token/${encodeURIComponent(currentLaunch.mint)}`;},900);
  }
  return routed;
}

async function launchTokenOnPump(){
  if(!currentLaunch)throw new Error('Create the launch intent first');

  if(currentLaunch?.mint&&currentLaunch?.createSignature)return finishCurrentLaunch();

  if(!window.solanaWeb3?.VersionedTransaction||!window.solanaWeb3?.Keypair)throw new Error('Solana web3 browser bundle did not load');

  let creator=currentLaunch?.creatorPubkey||currentWallet?.publicKey?.toString?.()||'';
  if(!creator)creator=await connectWallet();

  const name=document.querySelector('#launchName')?.value.trim()||'';
  const symbol=document.querySelector('#launchTicker')?.value.trim().toUpperCase()||'';
  const description=document.querySelector('#launchDescription')?.value.trim()||'';
  const website=document.querySelector('#launchWebsite')?.value.trim()||'';
  const twitter=document.querySelector('#launchX')?.value.trim()||'';
  const telegram=document.querySelector('#launchTelegram')?.value.trim()||'';
  const file=document.querySelector('#launchImage')?.files?.[0];

  if(!name)throw new Error('Enter the token name');
  if(!symbol)throw new Error('Enter the ticker');
  if(name.length>32)throw new Error('Token name must be 32 characters or fewer');
  if(symbol.length>13)throw new Error('Ticker must be 13 characters or fewer');

  const devBuySol=Number(document.querySelector('#launchDevBuy')?.value||0);
  if(!Number.isFinite(devBuySol)||devBuySol<0)throw new Error('Dev Buy must be a valid SOL amount');
  const solLamports=Math.round(devBuySol*1_000_000_000);
  if(!Number.isSafeInteger(solLamports))throw new Error('Dev Buy amount is too large');

  setLaunchStatus('Uploading token metadata to IPFS…');
  const imageBase64=await launchImageBase64(file);
  const metadata=await api('/api/launch/metadata',{
    method:'POST',
    body:JSON.stringify({
      intent_id:currentLaunch.id,
      name,
      symbol,
      description,
      website,
      twitter,
      telegram,
      image_base64:imageBase64,
      image_type:file.type,
      image_name:file.name
    })
  });

  let mintKeypair=null;
  let mintPubkey='';
  if(solLamports===0){
    mintKeypair=window.solanaWeb3.Keypair.generate();
    mintPubkey=mintKeypair.publicKey.toBase58();
  }

  setLaunchStatus(solLamports>0
    ? `Building Pump launch + ${devBuySol} SOL initial buy…`
    : 'Building Pump launch transaction…');

  const built=await api('/api/launch/prepare-create',{
    method:'POST',
    body:JSON.stringify({
      intent_id:currentLaunch.id,
      user_pubkey:creator,
      mint_pubkey:mintPubkey,
      name,
      symbol,
      metadata_uri:metadata.metadataUri,
      sol_lamports:String(solLamports)
    })
  });

  const bytes=Uint8Array.from(atob(built.transactionBase64),c=>c.charCodeAt(0));
  const tx=window.solanaWeb3.VersionedTransaction.deserialize(bytes);
  if(built.requiresMintSignature){
    if(!mintKeypair)throw new Error('Mint signer was not generated');
    tx.sign([mintKeypair]);
  }

  setLaunchStatus(solLamports>0
    ? `Approve token creation and ${devBuySol} SOL initial buy in your wallet…`
    : 'Approve token creation in your wallet…');

  let sig;
  if(currentWallet.signAndSendTransaction){
    const out=await currentWallet.signAndSendTransaction(tx);
    sig=out.signature||out;
  }else{
    const signed=await currentWallet.signTransaction(tx);
    sig=await currentWallet.sendTransaction(signed);
  }

  const mint=built.mint;
  currentLaunch={
    ...currentLaunch,
    mint,
    symbol,
    creatorPubkey:creator,
    createSignature:String(sig),
    metadataUri:metadata.metadataUri,
    createConfirmed:false,
    createPending:true
  };

  return finishCurrentLaunch();
}

async function routeFees(){
  if(!currentLaunch)throw new Error('Create the launch intent first');
  const mint=String(currentLaunch.mint||'').trim();
  let creator=String(currentLaunch.creatorPubkey||currentWallet?.publicKey?.toString?.()||'').trim();

  if(!creator)creator=await connectWallet();
  if(!mint)throw new Error('Token mint is not available yet');
  if(!currentWallet)await connectWallet();

  if(currentLaunch.routingSignature)return confirmRoutingLaunch();

  setLaunchStatus('Building fee-sharing transaction…');
  const p=await api('/api/launch/prepare-routing',{
    method:'POST',
    body:JSON.stringify({intent_id:currentLaunch.id,mint,creator_pubkey:creator})
  });

  if(!window.solanaWeb3?.VersionedTransaction)throw new Error('Solana web3 browser bundle did not load');
  const bytes=Uint8Array.from(atob(p.transactionBase64),c=>c.charCodeAt(0));
  const tx=window.solanaWeb3.VersionedTransaction.deserialize(bytes);

  setLaunchStatus('Approve the transaction in your wallet…');
  let sig;
  if(currentWallet.signAndSendTransaction){
    const out=await currentWallet.signAndSendTransaction(tx);
    sig=out.signature||out;
  }else{
    const signed=await currentWallet.signTransaction(tx);
    sig=await currentWallet.sendTransaction(signed);
  }

  currentLaunch={...currentLaunch,routingSignature:String(sig),routingPending:true};
  return confirmRoutingLaunch();
}

app.addEventListener('click',async e=>{
  try{
    const walletClose=e.target.closest('[data-wallet-close]');
    if(walletClose){e.preventDefault();closeLaunchWalletPicker();return;}

    const walletOpen=e.target.closest('[data-wallet-open]');
    if(walletOpen){
      e.preventDefault();
      const target=walletBrowseUrl(walletOpen.dataset.walletOpen);
      if(target){
        walletOpen.disabled=true;
        location.href=target;
      }
      return;
    }

    const scrollControl=e.target.closest('[data-scroll-to]');
    if(scrollControl){
      e.preventDefault();
      const target=document.getElementById(scrollControl.dataset.scrollTo);
      if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
      if(scrollControl.closest('.legal-tabs')){
        scrollControl.closest('.legal-tabs').querySelectorAll('[data-scroll-to]').forEach(x=>x.classList.toggle('active',x===scrollControl));
      }
      return;
    }
    const launchModeButton=e.target.closest('[data-launch-mode]');if(launchModeButton){e.preventDefault();switchLaunchMode(launchModeButton.dataset.launchMode);return;}
    const a=e.target.closest('[data-action]');if(a){const action=a.dataset.action;if(action==='open-launch')document.querySelector('#launchModal')?.classList.remove('hidden');if(action==='close-launch')document.querySelector('#launchModal')?.classList.add('hidden');if(action==='menu')document.querySelector('#mobileMenu')?.classList.toggle('hidden');if(action==='go-launch')location.hash='#/launch';if(action==='reload'){state.home=null;render();}if(action==='connect-wallet'){const pub=await connectWallet();if(pub)setLaunchStatus(`Wallet connected: ${pub}`,true);}if(action==='launch-token')await launchTokenOnPump();if(action==='route-fees')await routeFees();if(action==='verify-mint'){const mint=(document.querySelector('#launchMintSuccess')?.value||document.querySelector('#launchMint')?.value||'').trim();if(!mint)throw new Error('Paste the mint first');const out=await api('/api/tokens/register',{method:'POST',body:JSON.stringify({mint,recipient_handle:currentLaunch?.handle||''})});setLaunchStatus(out.ok?`Registered for @${out.recipient}`:`Not ready: ${out.reason}`,out.ok);}if(action==='copy-fee-address'){const value=String(a.dataset.copyValue||'').trim();if(value&&navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);a.textContent='✓';setTimeout(()=>{a.textContent='⌑';},900);}}}
    const exp=e.target.closest('.expandable');if(exp){exp.classList.toggle('open');exp.querySelector('.details,.tx-details')?.classList.toggle('hidden');}
    const sort=e.target.closest('[data-sort]');if(sort){state.explore.sort=sort.dataset.sort;await refreshTokens();document.querySelector('#launchGrid').innerHTML=state.tokens.map(exploreTokenCard).join('')||'<div class="explore-empty"><span>No launches.</span></div>';document.querySelectorAll('[data-sort]').forEach(b=>b.classList.toggle('active',b.dataset.sort===state.explore.sort));}
    const venue=e.target.closest('[data-venue]');if(venue){state.explore.venue=state.explore.venue===venue.dataset.venue?'':venue.dataset.venue;await refreshTokens();document.querySelector('#launchGrid').innerHTML=state.tokens.map(exploreTokenCard).join('')||'<div class="explore-empty"><span>No launches.</span></div>';document.querySelectorAll('[data-venue]').forEach(b=>b.classList.toggle('active',b.dataset.venue===state.explore.venue));}
    const run=e.target.closest('[data-admin-run]');if(run){const token=document.querySelector('#adminToken')?.value||'';const out=document.querySelector('#adminOutput');out.textContent='Running…';const result=await api(`/api/admin/run/${run.dataset.adminRun}`,{method:'POST',headers:{authorization:`Bearer ${token}`},body:'{}'});out.textContent=JSON.stringify(result,null,2);}
    if(e.target.id==='launchModal')e.target.classList.add('hidden');
  }catch(err){setLaunchStatus(err.message);const out=document.querySelector('#adminOutput');if(out)out.textContent=err.message;}
});
let searchTimer;
app.addEventListener('input',e=>{if(e.target.id==='tokenSearch'){clearTimeout(searchTimer);state.explore.query=e.target.value;searchTimer=setTimeout(async()=>{try{await refreshTokens();const grid=document.querySelector('#launchGrid');if(grid)grid.innerHTML=state.tokens.map(exploreTokenCard).join('')||'<div class="explore-empty"><span>No launches match this search.</span></div>';}catch{}},180);}if(e.target.id==='launchHandle'){clearTimeout(launchXLookupTimer);const typed=String(e.target.value||'').replace(/^@/,'').trim().toLowerCase();if(launchSelectedXProfile&&String(launchSelectedXProfile.username||'').toLowerCase()!==typed)launchSelectedXProfile=null;launchXLookupTimer=setTimeout(()=>lookupLaunchXAccount(e.target.value),350);}if(e.target.id==='launchPaymentNote'){const count=document.querySelector('#launchPaymentNoteCount');if(count)count.textContent=String(e.target.value.length);}if(['launchName','launchTicker','launchHandle'].includes(e.target.id))updateLaunchPreview();});
app.addEventListener('change',e=>{
  if(e.target.id==='launchImage')updateLaunchImagePreview(e.target);
});
app.addEventListener('change',e=>{
  if(e.target.id==='launchImage')setTimeout(()=>updateLaunchMiniImage(e.target),0);
});
app.addEventListener('submit',async e=>{if(e.target.id==='launchForm'){e.preventDefault();const button=document.querySelector('#launchSubmitButton');try{
  if(!currentWallet){
    if(button){button.disabled=true;button.textContent='Connecting wallet…';}
    const creator=await connectWallet();
    currentLaunch=null;
    if(!creator){
      if(button){button.disabled=false;button.textContent='Connect wallet';}
      setLaunchStatus('');
      return;
    }
    if(button){button.disabled=false;button.textContent='Launch token';}
    setLaunchStatus(`Wallet connected: ${creator}`,true);
    return;
  }

  if(currentLaunch?.mint&&currentLaunch?.createSignature){
    if(button){button.disabled=true;button.textContent='Checking confirmation…';}
    const resumed=await finishCurrentLaunch();
    if(resumed?.pending&&button){button.disabled=false;button.textContent='Retry confirmation';}
    return;
  }

  const handle=document.querySelector('#launchHandle').value.trim();
  const creator=currentWallet.publicKey?.toString?.()||await connectWallet();
  if(button){button.disabled=true;button.textContent='Preparing launch…';}

  const out=await api('/api/launch/intents',{
    method:'POST',
    body:JSON.stringify({recipient_handle:handle,creator_pubkey:creator,mint:null})
  });
  currentLaunch={...out,handle:handle.replace(/^@/,''),creatorPubkey:creator};

  if(!out.treasuryAddress)throw new Error('Set TREASURY_ADDRESS on the server before launching');

  setLaunchStatus('Launch intent created. Preparing token transaction…');
  if(button)button.textContent='Launching…';
  const routed=await launchTokenOnPump();
  if(!routed?.ok&&!routed?.pending&&button){button.disabled=false;button.textContent='Launch token';}
}catch(err){
  if(button){
    button.disabled=false;
    button.textContent=(currentLaunch?.mint&&currentLaunch?.createSignature)?'Retry confirmation':(currentWallet?'Launch token':'Connect wallet');
  }
  setLaunchStatus(err.message);
}}});

window.addEventListener('hashchange',render);render();

/* launch-demo-rotator-v1
   Adds the UsePaid-style animated two-mode payment demo card on Launch.
   Built as a DOM enhancer so it does not require rebuilding existing Launch markup. */
const launchDemoScenes=[5,10,20,50,100].flatMap(amount=>[
  {kind:'paid',amount},
  {kind:'sent',amount}
]);

let launchDemoSceneIndex=0;
let launchDemoTimer=null;

function launchDemoEscapeHtml(value){
  return String(value??'')
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'","&#039;");
}

function getLaunchDemoRecipient(){
  if(typeof launchSelectedXProfile!=='undefined' && launchSelectedXProfile && (launchSelectedXProfile.name || launchSelectedXProfile.username)){
    return {
      name: launchSelectedXProfile.name || launchSelectedXProfile.username,
      username: launchSelectedXProfile.username || '',
      verified: !!launchSelectedXProfile.verified,
      initial: String(launchSelectedXProfile.name || launchSelectedXProfile.username || '').trim().charAt(0).toUpperCase(),
      avatarUrl: launchSelectedXProfile.profileImageUrl || ''
    };
  }
  return null;
}

function launchDemoAvatar(profile, extraClass=''){
  if(!profile){
    return `<span class="launch-demo-avatar ${extraClass}" aria-hidden="true"></span>`;
  }
  if(profile.avatarUrl){
    return `<span class="launch-demo-avatar ${extraClass}"><img src="${launchDemoEscapeHtml(profile.avatarUrl)}" alt="" referrerpolicy="no-referrer"></span>`;
  }
  return `<span class="launch-demo-avatar ${extraClass}">${launchDemoEscapeHtml(profile.initial||'')}</span>`;
}

function launchDemoVerified(show){
  return show ? '<span class="launch-demo-verified" aria-hidden="true">✓</span>' : '';
}

function launchDemoContent(scene){
  const recipient=getLaunchDemoRecipient();
  const amount=`$${Number(scene.amount).toFixed(2)}`;
  if(scene.kind==='paid'){
    return `
      <div class="launch-demo-card-icons">
        <span class="launch-demo-brand">$</span>
        <span class="launch-demo-avatar" aria-hidden="true">P</span>
      </div>
      <div class="launch-demo-card-copy">
        <div class="launch-demo-card-line launch-demo-card-line-main"><strong>Paid</strong> sent you <strong>${amount}</strong></div>
        <div class="launch-demo-card-line launch-demo-card-line-sub">for <strong>"Creator fees via @UsePaid"</strong> · now</div>
      </div>
      <div class="launch-demo-card-end">
        <span class="launch-demo-bell" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path d="M12 22a2.25 2.25 0 0 0 2.12-1.5H9.88A2.25 2.25 0 0 0 12 22Zm7-5.25-1.45-1.7V10a5.55 5.55 0 0 0-4.3-5.42V3.75a1.25 1.25 0 0 0-2.5 0v.83A5.55 5.55 0 0 0 6.45 10v5.05L5 16.75a1 1 0 0 0 .76 1.65h12.48a1 1 0 0 0 .76-1.65Z"/></svg></span>
      </div>
    `;
  }

  const recipientName=recipient ? recipient.name : 'Recipient';
  return `
    <div class="launch-demo-card-icons">
      <span class="launch-demo-brand">P</span>
      ${launchDemoAvatar(recipient)}
    </div>
    <div class="launch-demo-card-copy">
      <div class="launch-demo-card-line launch-demo-card-line-main"><strong>$${Number(scene.amount).toFixed(0)}</strong> sent to <strong>${launchDemoEscapeHtml(recipientName)}</strong> ${launchDemoVerified(!!recipient?.verified)}</div>
      <div class="launch-demo-card-line launch-demo-card-line-sub">Creator fees via <strong>@UsePaid</strong> · now</div>
    </div>
    <div class="launch-demo-card-end"></div>
  `;
}

function renderLaunchDemoScene(force=false){
  const rotator=document.querySelector('#launchDemoRotator');
  if(!rotator)return;
  const scene=launchDemoScenes[launchDemoSceneIndex % launchDemoScenes.length];
  if(force || !rotator.dataset.ready){
    rotator.innerHTML=launchDemoContent(scene);
    rotator.dataset.ready='1';
    return;
  }
  rotator.classList.remove('is-active');
  setTimeout(()=>{
    if(!document.body.contains(rotator))return;
    rotator.innerHTML=launchDemoContent(scene);
    rotator.classList.add('is-active');
  },160);
}

function startLaunchDemoRotation(){
  const card=document.querySelector('#launchDemoRotator');
  if(!card)return;
  if(launchDemoTimer)return;
  renderLaunchDemoScene(true);
  card.classList.add('is-active');
  launchDemoTimer=setInterval(()=>{
    if(!document.querySelector('#launchDemoRotator')){
      clearInterval(launchDemoTimer);
      launchDemoTimer=null;
      return;
    }
    launchDemoSceneIndex=(launchDemoSceneIndex+1)%launchDemoScenes.length;
    renderLaunchDemoScene(false);
  },2600);
}

function stopLaunchDemoRotation(){
  if(launchDemoTimer){
    clearInterval(launchDemoTimer);
    launchDemoTimer=null;
  }
}

function ensureLaunchDemoBlock(){
  const previewStack=document.querySelector('.launch-preview-stack');
  if(!previewStack){
    stopLaunchDemoRotation();
    return;
  }
  if(document.querySelector('#launchDemoBlock')){
    if(!launchDemoTimer)startLaunchDemoRotation();
    return;
  }
  const wrap=document.createElement('div');
  wrap.id='launchDemoBlock';
  wrap.className='launch-demo-block';
  wrap.innerHTML=`
    <p class="launch-demo-terms">By launching, you agree to the <a href="#/legal">Terms of Use</a>.</p>
    <div class="launch-demo-rotator is-active" id="launchDemoRotator" aria-live="polite"></div>
  `;
  previewStack.parentNode.insertBefore(wrap, previewStack);
  startLaunchDemoRotation();
}

const launchDemoObserver=new MutationObserver(()=>{
  const onLaunch=!!document.querySelector('.launch-preview-stack');
  if(onLaunch)ensureLaunchDemoBlock();
  else stopLaunchDemoRotation();
});

if(document.body){
  launchDemoObserver.observe(document.body,{childList:true,subtree:true});
  setTimeout(ensureLaunchDemoBlock,0);
}
window.addEventListener('hashchange',()=>setTimeout(ensureLaunchDemoBlock,40));
window.addEventListener('load',()=>setTimeout(ensureLaunchDemoBlock,40));

/* launch-demo-rotator-fix-v1 */

/* launch-demo-rotator-loop-fix-v2 */

/* launch-demo-recipient-logic-v1 */

/* launch-demo-bell-v1 */

/* launch-modes-register-walletless-v1 */

/* launch-walletless-reference-image-v1 */


/* launch-mobile-wallet-connect-v1 */
let launchWalletRestoreTimer=null;
const launchWalletRestoreObserver=new MutationObserver(()=>{
  if(!document.querySelector('#launchForm'))return;
  syncLaunchWalletUi();
  if(new URL(location.href).searchParams.has('launchWalletDraft')){
    clearTimeout(launchWalletRestoreTimer);
    launchWalletRestoreTimer=setTimeout(restoreLaunchWalletDraft,20);
  }
});
if(app)launchWalletRestoreObserver.observe(app,{childList:true});
window.addEventListener('load',()=>setTimeout(()=>{syncLaunchWalletUi();restoreLaunchWalletDraft();},60));


/* launch-mobile-wallet-loading-hotfix-v1 */

/* launch-wallet-picker-click-fix-v1 */

/* launch-confirmation-retry-v3 */
