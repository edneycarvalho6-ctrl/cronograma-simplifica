// ==UserScript==
// @name         Simplifica → Cronograma (sync automático)
// @namespace    https://edneycarvalho6-ctrl.github.io/cronograma-simplifica/
// @version      2.2
// @description  Enquanto o Edney navega nos cursos da Simplifica na Hotmart, marca sozinho as aulas concluídas no Cronograma Simplifica (nuvem Supabase). Aditivo: nunca desmarca.
// @match        *://*.hotmart.com/*
// @match        *://hotmart.com/*
// @downloadURL  https://raw.githubusercontent.com/edneycarvalho6-ctrl/cronograma-simplifica/main/simplifica-sync.user.js
// @updateURL    https://raw.githubusercontent.com/edneycarvalho6-ctrl/cronograma-simplifica/main/simplifica-sync.user.js
// @connect      splkpfmpnpclxxuktggl.supabase.co
// @run-at       document-idle
// @grant        GM_xmlhttpRequest
// ==/UserScript==

// >>> MODO ESPIÃO (temporário): manda pra nuvem (id=99 topo / id=98 iframe) o que o script enxerga.
const DEBUG = true;

(function () {
  'use strict';

  const SUPA_URL = 'https://splkpfmpnpclxxuktggl.supabase.co';
  const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNwbGtwZm1wbnBjbHh4dWt0Z2dsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzODM5MjAsImV4cCI6MjA5NTk1OTkyMH0.PWwjUzdYQMSY3SYP-h3hqVzqXRK6eUCTgNpu7MwH6Iw';
  const H = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, 'Content-Type': 'application/json' };

  const norm = s => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();

  // Requisição via GM_xmlhttpRequest — roda fora da CSP da Hotmart (fetch() é bloqueado por ela).
  function req(method, url, body) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method, url,
        headers: { ...H, ...(method !== 'GET' ? { Prefer: 'resolution=merge-duplicates' } : {}) },
        data: body ? JSON.stringify(body) : undefined,
        onload: r => (r.status >= 200 && r.status < 300) ? resolve(r.responseText) : reject(new Error('http ' + r.status)),
        onerror: () => reject(new Error('neterr')),
        ontimeout: () => reject(new Error('timeout'))
      });
    });
  }

  function toast(msg, cor) {
    let t = document.getElementById('cron-sync-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cron-sync-toast';
      t.style.cssText = 'position:fixed;bottom:18px;left:18px;z-index:2147483647;color:#fff;' +
        'padding:9px 16px;border-radius:20px;font:600 13px Segoe UI,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.4);' +
        'opacity:0;transition:opacity .3s;pointer-events:none;';
      document.body.appendChild(t);
    }
    t.style.background = cor || '#2e9e5b';
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._h);
    t._h = setTimeout(() => { t.style.opacity = '0'; }, 3500);
  }

  async function lerNuvem() {
    const txt = await req('GET', SUPA_URL + '/rest/v1/cronograma_estudo?id=eq.1&select=dados');
    const rows = JSON.parse(txt);
    return rows.length ? rows[0].dados : null;
  }

  async function salvarNuvem(dados) {
    await req('POST', SUPA_URL + '/rest/v1/cronograma_estudo', { id: 1, dados, updated_at: new Date().toISOString() });
  }

  // Módulos marcados como "Completo" na barra lateral da Hotmart
  function modulosCompletosNaPagina(nomesModulos) {
    const achados = new Set();
    const marcas = [...document.querySelectorAll('*')].filter(e =>
      e.children.length === 0 && norm(e.textContent) === 'completo');
    for (const m of marcas) {
      let p = m.parentElement;
      for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
        const txt = norm(p.textContent);
        const hit = nomesModulos.find(n => txt.includes(norm(n)));
        if (hit) { achados.add(hit); break; }
      }
    }
    return achados;
  }

  // Aula aberta agora: casa título da aula (heading OU item ativo) contra a grade
  function aulaAtualNaPagina(dados) {
    const cand = [];
    document.querySelectorAll('h1,h2,h3,[class*="title"],[class*="titulo"]').forEach(h => {
      const t = norm(h.textContent);
      if (t && t.length < 140) cand.push(t);
    });
    for (const c of dados.cursos)
      for (const m of c.modulos)
        for (let i = 0; i < m.aulas.length; i++) {
          const nome = norm(m.aulas[i].nome);
          if (cand.some(t => t === nome || t.startsWith(nome) || (nome.startsWith(t) && t.length > 8)))
            return { curso: c, modulo: m, idx: i };
        }
    return null;
  }

  // ---- MODO ESPIÃO: reporta pra nuvem o que o script vê nesta página/frame ----
  async function salvarDebug(report) {
    try {
      const id = report.frame === 'top' ? 99 : 98;
      await req('POST', SUPA_URL + '/rest/v1/cronograma_estudo', { id, dados: report, updated_at: new Date().toISOString() });
    } catch (e) {}
  }
  function coletarDebug(dados, completos, atual) {
    const nomes = [];
    dados.cursos.forEach(c => c.modulos.forEach(m => m.aulas.forEach(a => nomes.push(a.nome))));
    const matches = [];
    const leafs = [...document.querySelectorAll('body *')].filter(e => e.children.length === 0);
    for (const el of leafs) {
      const t = norm(el.textContent);
      if (t.length < 5 || t.length > 160) continue;
      const hit = nomes.find(n => { const nn = norm(n); return t === nn || t.includes(nn) || nn.includes(t); });
      if (!hit) continue;
      let row = el, classes = [], hasSvg = false, checkGlyph = false, completoTxt = false;
      for (let i = 0; i < 5 && row; i++, row = row.parentElement) {
        if (row.className && typeof row.className === 'string') classes.push(row.className.slice(0, 60));
        if (row.querySelector && row.querySelector('svg,img,i[class]')) hasSvg = true;
        if (/✓|✔|check|conclu|complet|assisti|watched|done/i.test((row.className || '') + ' ' + (row.getAttribute && (row.getAttribute('aria-label') || '')))) completoTxt = true;
        if (/[✓✔]/.test(row.textContent)) checkGlyph = true;
      }
      matches.push({ aula: hit, txt: el.textContent.trim().slice(0, 80), tag: el.tagName, classes, hasSvg, checkGlyph, completoTxt });
      if (matches.length >= 25) break;
    }
    const heads = [...document.querySelectorAll('h1,h2,h3')].map(h => h.textContent.trim().slice(0, 90)).filter(Boolean).slice(0, 20);
    return {
      debug: true, ts: new Date().toISOString(), ver: '2.2', url: location.href,
      frame: window.top === window.self ? 'top' : 'iframe',
      docTitle: document.title.slice(0, 120),
      nLeafs: leafs.length, nHeads: heads.length, heads,
      completos: [...completos], atual: atual ? { modulo: atual.modulo.nome, idx: atual.idx, nome: atual.modulo.aulas[atual.idx].nome } : null,
      nMatches: matches.length, matches
    };
  }

  let ultimaAssinatura = '';

  async function sincronizar() {
    let dados;
    try { dados = await lerNuvem(); }
    catch (e) { if (DEBUG) toast('⚠️ sync: rede bloqueada (' + e.message + ')', '#c0392b'); return; }
    if (!dados || !dados.cursos) return;

    const nomesModulos = dados.cursos.flatMap(c => c.modulos.map(m => m.nome));
    const completos = modulosCompletosNaPagina(nomesModulos);
    const atual = aulaAtualNaPagina(dados);

    if (DEBUG) salvarDebug(coletarDebug(dados, completos, atual));

    const assinatura = [...completos].sort().join('|') + '||' + (atual ? atual.modulo.nome + '#' + atual.idx : '');
    if (assinatura === ultimaAssinatura) return;
    ultimaAssinatura = assinatura;

    const agora = new Date().toISOString();
    let mudou = 0;

    for (const c of dados.cursos)
      for (const m of c.modulos) {
        if (completos.has(m.nome)) {
          if (m.aulas.length === 0) { if (!m.feito) { m.feito = true; m.data = agora; mudou++; } }
          else { for (const a of m.aulas) if (!a.feito) { a.feito = true; a.data = agora; mudou++; } }
        }
      }
    if (atual) {
      for (let i = 0; i < atual.idx; i++) {
        const a = atual.modulo.aulas[i];
        if (!a.feito) { a.feito = true; a.data = agora; mudou++; }
      }
    }

    if (mudou > 0) {
      await salvarNuvem(dados);
      toast('📚 Cronograma sincronizado: +' + mudou + (mudou === 1 ? ' aula' : ' aulas'));
    }
  }

  // sinal visível de que o script CARREGOU (independente de rede)
  if (window.top === window.self) setTimeout(() => toast('🔌 Sync Cronograma ativo', '#2d6cdf'), 1500);

  let deb;
  const agendar = ms => { clearTimeout(deb); deb = setTimeout(sincronizar, ms); };
  agendar(4000);
  setInterval(sincronizar, 25000);
  const pushState = history.pushState;
  history.pushState = function () { pushState.apply(this, arguments); agendar(3000); };
  window.addEventListener('popstate', () => agendar(3000));
  const mo = new MutationObserver(() => agendar(3500));
  mo.observe(document.documentElement, { childList: true, subtree: true });
})();
