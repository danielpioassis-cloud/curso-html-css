/* =================================================================
   PENINHA PRODUÇÕES & MARKETING — JavaScript
   Módulos: ícones, menu mobile, header ao rolar, smooth scroll,
   fade-in, contador animado, accordion FAQ, validação do form.
   JS vanilla, sem dependências (exceto Lucide para os ícones).
   ================================================================= */

/* ===== CONFIG ===== */
// Número de WhatsApp usado no envio do formulário.
// SUBSTITUA pelo número real (formato: 55 + DDD + número, só dígitos).
const WHATSAPP_NUMERO = '55XXXXXXXXXXX';

/* Executa tudo depois que o HTML carregar */
document.addEventListener('DOMContentLoaded', () => {

  /* -------------------------------------------------------------
     0. ÍCONES (Lucide)
     Renderiza todos os <i data-lucide="..."> da página.
     ------------------------------------------------------------- */
  if (window.lucide) lucide.createIcons();

  /* -------------------------------------------------------------
     1. ANO ATUAL NO FOOTER
     ------------------------------------------------------------- */
  const anoEl = document.getElementById('year');
  if (anoEl) anoEl.textContent = new Date().getFullYear();

  /* -------------------------------------------------------------
     2. MENU MOBILE (hambúrguer)
     ------------------------------------------------------------- */
  const hamburger = document.getElementById('hamburger');
  const nav = document.getElementById('nav');

  function fecharMenu() {
    nav.classList.remove('is-open');
    hamburger.classList.remove('is-open');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Abrir menu');
  }

  if (hamburger && nav) {
    hamburger.addEventListener('click', () => {
      const aberto = nav.classList.toggle('is-open');
      hamburger.classList.toggle('is-open', aberto);
      hamburger.setAttribute('aria-expanded', String(aberto));
      hamburger.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
    });

    // Fecha o menu ao clicar em qualquer link interno
    nav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', fecharMenu);
    });
  }

  /* -------------------------------------------------------------
     3. HEADER — borda ao rolar
     Adiciona classe quando a página sai do topo.
     ------------------------------------------------------------- */
  const header = document.getElementById('header');
  function aoRolarHeader() {
    if (window.scrollY > 20) header.classList.add('header--scrolled');
    else header.classList.remove('header--scrolled');
  }
  aoRolarHeader();
  window.addEventListener('scroll', aoRolarHeader, { passive: true });

  /* -------------------------------------------------------------
     4. SMOOTH SCROLL com compensação do header fixo
     (o CSS já faz scroll suave; aqui ajustamos o offset do topo)
     ------------------------------------------------------------- */
  const ALTURA_HEADER = 72;
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (id === '#' || id.length < 2) return;
      const alvo = document.querySelector(id);
      if (!alvo) return;
      e.preventDefault();
      const y = alvo.getBoundingClientRect().top + window.scrollY - ALTURA_HEADER;
      window.scrollTo({ top: y, behavior: 'smooth' });
    });
  });

  /* -------------------------------------------------------------
     5. FADE-IN ao rolar (Intersection Observer)
     Adiciona .is-visible quando o elemento entra na tela.
     ------------------------------------------------------------- */
  const elementosFade = document.querySelectorAll('.fade-in');
  const observerFade = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        obs.unobserve(entry.target); // anima só uma vez
      }
    });
  }, { threshold: 0.15 });
  elementosFade.forEach(el => observerFade.observe(el));

  /* -------------------------------------------------------------
     6. CONTADOR ANIMADO (números sobem ao entrar na tela)
     Lê data-target e data-prefix de cada .stat__num.
     ------------------------------------------------------------- */
  const contadores = document.querySelectorAll('.stat__num');

  function animarContador(el) {
    const alvo = parseInt(el.dataset.target, 10) || 0;
    const prefixo = el.dataset.prefix || '';
    const duracao = 1600; // ms
    const inicio = performance.now();

    function passo(agora) {
      const progresso = Math.min((agora - inicio) / duracao, 1);
      // easeOutQuad para desacelerar no fim
      const eased = 1 - (1 - progresso) * (1 - progresso);
      const valor = Math.floor(eased * alvo);
      el.textContent = prefixo + valor.toLocaleString('pt-BR');
      if (progresso < 1) requestAnimationFrame(passo);
      else el.textContent = prefixo + alvo.toLocaleString('pt-BR');
    }
    requestAnimationFrame(passo);
  }

  const observerContador = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        animarContador(entry.target);
        obs.unobserve(entry.target); // conta só uma vez
      }
    });
  }, { threshold: 0.5 });
  contadores.forEach(el => observerContador.observe(el));

  /* -------------------------------------------------------------
     7. FAQ ACCORDION (abre/fecha)
     Anima via max-height. Fecha os outros ao abrir um (opcional).
     ------------------------------------------------------------- */
  const itensFaq = document.querySelectorAll('.faq__item');
  itensFaq.forEach(item => {
    const botao = item.querySelector('.faq__question');
    const resposta = item.querySelector('.faq__answer');

    botao.addEventListener('click', () => {
      const estaAberto = item.classList.contains('is-open');

      // Fecha todos
      itensFaq.forEach(outro => {
        outro.classList.remove('is-open');
        outro.querySelector('.faq__question').setAttribute('aria-expanded', 'false');
        outro.querySelector('.faq__answer').style.maxHeight = null;
      });

      // Abre o clicado (se estava fechado)
      if (!estaAberto) {
        item.classList.add('is-open');
        botao.setAttribute('aria-expanded', 'true');
        resposta.style.maxHeight = resposta.scrollHeight + 'px';
      }
    });
  });

  /* -------------------------------------------------------------
     8. VALIDAÇÃO DO FORMULÁRIO + ENVIO PARA WHATSAPP
     Valida campos e, se ok, abre o WhatsApp com mensagem pronta.
     ------------------------------------------------------------- */
  const form = document.getElementById('contactForm');

  // Mostra/limpa mensagem de erro de um campo
  function setErro(campo, mensagem) {
    const erroEl = form.querySelector(`[data-error-for="${campo.name}"]`);
    if (erroEl) erroEl.textContent = mensagem;
    campo.classList.toggle('is-invalid', Boolean(mensagem));
  }

  // Valida um número de WhatsApp brasileiro (10 ou 11 dígitos)
  function whatsappValido(valor) {
    const digitos = valor.replace(/\D/g, '');
    return digitos.length === 10 || digitos.length === 11;
  }

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const nome = form.nome;
      const whatsapp = form.whatsapp;
      const segmento = form.segmento;
      let valido = true;

      // Nome: mínimo 2 caracteres
      if (nome.value.trim().length < 2) {
        setErro(nome, 'Digite seu nome completo.');
        valido = false;
      } else setErro(nome, '');

      // WhatsApp: formato válido
      if (!whatsappValido(whatsapp.value)) {
        setErro(whatsapp, 'Digite um WhatsApp válido com DDD.');
        valido = false;
      } else setErro(whatsapp, '');

      // Segmento: precisa selecionar
      if (!segmento.value) {
        setErro(segmento, 'Selecione um segmento.');
        valido = false;
      } else setErro(segmento, '');

      if (!valido) return;

      // Monta a mensagem e abre o WhatsApp
      const texto =
        `Olá! Vim pelo site da Peninha.%0A` +
        `*Nome:* ${encodeURIComponent(nome.value.trim())}%0A` +
        `*WhatsApp:* ${encodeURIComponent(whatsapp.value.trim())}%0A` +
        `*Segmento:* ${encodeURIComponent(segmento.value)}`;

      const url = `https://wa.me/${WHATSAPP_NUMERO}?text=${texto}`;
      window.open(url, '_blank');

      form.reset();
    });

    // Limpa o erro assim que o usuário corrige o campo
    form.querySelectorAll('.form__input').forEach(campo => {
      campo.addEventListener('input', () => setErro(campo, ''));
    });
  }

});
