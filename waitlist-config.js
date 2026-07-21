/**
 * Shared waitlist + Supabase config for index.html and es.html.
 * Load after config.js (optional). Exposes window.initKallpaWaitlist({ locale }).
 *
 * KALLPA_CONFIG.ALPHA_SIGNUPS_OPEN — when false, hides Android alpha CTA
 * (notify / launch waitlist still works). Flip after ~15 Play testers.
 */
(function () {
  function readConfig() {
    const cfg = window.KALLPA_CONFIG || {};
    const url = String(cfg.SUPABASE_URL || '').replace(/\/$/, '');
    const key = String(cfg.SUPABASE_ANON_KEY || '');
    const placeholder =
      !url ||
      url.includes('YOUR_SUPABASE') ||
      url.includes('YOUR_PROJECT') ||
      !key ||
      key.includes('YOUR_SUPABASE');
    const alphaOpen = cfg.ALPHA_SIGNUPS_OPEN !== false;
    return { url, key, ready: !placeholder, alphaOpen };
  }

  function setMessage(el, text, isError) {
    el.textContent = text;
    el.className =
      'min-h-[24px] text-sm font-medium ' + (isError ? 'text-red-400' : 'text-[#34d399]');
  }

  window.initKallpaWaitlist = function initKallpaWaitlist(options) {
    const locale = options.locale || 'en';
    const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY, ready, alphaOpen } =
      readConfig();

    const form = document.getElementById('waitlist-form');
    const emailInput = document.getElementById('email-input');
    const continueBtn = document.getElementById('continue-btn');
    const step1 = document.getElementById('step-1');
    const step2 = document.getElementById('step-2');
    const backBtn = document.getElementById('back-btn');
    const submitSpinner = document.getElementById('submit-spinner');
    const formMessage = document.getElementById('form-message');
    const optionBtns = document.querySelectorAll('.signup-option-btn');
    const platformBtns = document.querySelectorAll('.platform-btn');
    const setupNotice = document.getElementById('waitlist-setup-notice');
    const alphaClosedNotice = document.getElementById('alpha-closed-notice');
    const betaBtn = document.getElementById('btn-beta');
    const playEmailHint = document.getElementById('play-email-hint');

    let selectedPlatform = null;

    if (!form || !emailInput || !continueBtn) return;

    if (!ready) {
      if (setupNotice) setupNotice.classList.remove('hidden');
      continueBtn.disabled = true;
      emailInput.disabled = true;
      emailInput.placeholder =
        locale === 'es' ? 'Lista de espera no configurada' : 'Waitlist not configured yet';
      return;
    }

    if (setupNotice) setupNotice.classList.add('hidden');

    if (!alphaOpen) {
      if (betaBtn) betaBtn.classList.add('hidden');
      if (alphaClosedNotice) alphaClosedNotice.classList.remove('hidden');
    } else if (alphaClosedNotice) {
      alphaClosedNotice.classList.add('hidden');
    }

    function isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }

    function updatePlayHint() {
      if (!playEmailHint) return;
      const show =
        alphaOpen &&
        (selectedPlatform === 'android' || selectedPlatform === 'both');
      playEmailHint.classList.toggle('hidden', !show);
    }

    // Platform button toggle
    platformBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedPlatform = btn.dataset.platform;
        platformBtns.forEach((b) => {
          b.classList.remove('border-[#7c3aed]', 'bg-[rgba(124,58,237,0.15)]', 'text-white');
          b.classList.add(
            'border-[rgba(124,58,237,0.25)]',
            'bg-[rgba(124,58,237,0.05)]',
            'text-[#9999b8]'
          );
        });
        btn.classList.remove(
          'border-[rgba(124,58,237,0.25)]',
          'bg-[rgba(124,58,237,0.05)]',
          'text-[#9999b8]'
        );
        btn.classList.add('border-[#7c3aed]', 'bg-[rgba(124,58,237,0.15)]', 'text-white');
        updatePlayHint();
      });
    });

    continueBtn.addEventListener('click', () => {
      const email = emailInput.value.trim();
      if (!email) {
        setMessage(
          formMessage,
          locale === 'es' ? 'Introduce tu correo.' : 'Please enter your email address.',
          true
        );
        emailInput.focus();
        return;
      }
      if (!isValidEmail(email)) {
        setMessage(
          formMessage,
          locale === 'es' ? 'Correo no válido.' : 'Please enter a valid email address.',
          true
        );
        emailInput.focus();
        return;
      }
      setMessage(formMessage, '', false);
      step1.classList.add('hidden');
      step2.classList.remove('hidden');
      if (typeof fbq === 'function') {
        fbq('track', 'ViewContent', { content_name: 'waitlist_step2' });
      }
      const notifyBtn = document.getElementById('btn-notify');
      if (notifyBtn) notifyBtn.focus();
    });

    backBtn.addEventListener('click', () => {
      step2.classList.add('hidden');
      step1.classList.remove('hidden');
      emailInput.focus();
      setMessage(formMessage, '', false);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const clickedBtn = e.submitter || document.activeElement;
      const signupType = clickedBtn?.dataset?.type;
      if (!signupType) return;

      if (signupType === 'beta' && !alphaOpen) {
        setMessage(
          formMessage,
          locale === 'es'
            ? 'El alpha de Android está cerrado por ahora. Únete a “Notificarme”.'
            : 'Android alpha is closed for now. Choose “Notify me” instead.',
          true
        );
        return;
      }

      const email = emailInput.value.trim();
      if (!isValidEmail(email)) {
        setMessage(
          formMessage,
          locale === 'es' ? 'Correo no válido.' : 'Invalid email. Please go back and re-enter.',
          true
        );
        return;
      }

      if (!selectedPlatform) {
        setMessage(
          formMessage,
          locale === 'es'
            ? 'Elige una plataforma (Android, Apple o ambas).'
            : 'Please choose a platform (Android, Apple, or both).',
          true
        );
        return;
      }

      if (
        signupType === 'beta' &&
        selectedPlatform === 'ios'
      ) {
        setMessage(
          formMessage,
          locale === 'es'
            ? 'El alpha abierto es solo Android por ahora. Elige Android o “Notificarme” para iOS.'
            : 'Open alpha is Android-only for now. Choose Android, or “Notify me” for iOS.',
          true
        );
        return;
      }

      optionBtns.forEach((b) => {
        b.disabled = true;
        b.classList.add('opacity-50', 'cursor-not-allowed');
      });
      submitSpinner.classList.remove('hidden');
      setMessage(formMessage, '', false);

      try {
        const response = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            email,
            locale,
            signup_type: signupType,
            platform: selectedPlatform,
          }),
        });

        if (response.ok || response.status === 201 || response.status === 409) {
          if (typeof fbq === 'function') {
            fbq('track', 'Lead', {
              content_name: signupType,
              content_category: selectedPlatform,
              email: email.toLowerCase().trim(),
            });
          }
          const msg =
            response.status === 409
              ? locale === 'es'
                ? '¡Ya estás en la lista!'
                : "You're already on the list!"
              : signupType === 'beta'
                ? locale === 'es'
                  ? '¡Solicitud de alpha enviada! Te enviaremos el enlace de Google Play pronto.'
                  : "You're in for Android alpha! We'll email your Google Play invite soon."
                : locale === 'es'
                  ? '¡Estás en la lista! Te avisaremos en el lanzamiento.'
                  : "You're on the list! We'll notify you at launch.";
          setMessage(formMessage, msg, false);
          step2.classList.add('hidden');
          step1.classList.add('hidden');
          form.reset();
          setTimeout(() => {
            const page = locale === 'es' ? 'gracias.html' : 'thank-you.html';
            window.location.href =
              page +
              '?type=' +
              encodeURIComponent(signupType) +
              '&platform=' +
              encodeURIComponent(selectedPlatform);
          }, 300);
        } else {
          const errorData = await response.json().catch(() => ({}));
          console.error('Waitlist error:', response.status, errorData);
          setMessage(
            formMessage,
            locale === 'es' ? 'Algo salió mal. Inténtalo de nuevo.' : 'Something went wrong. Try again.',
            true
          );
          optionBtns.forEach((b) => {
            b.disabled = false;
            b.classList.remove('opacity-50', 'cursor-not-allowed');
          });
        }
      } catch (err) {
        console.error('Network error:', err);
        setMessage(
          formMessage,
          locale === 'es'
            ? 'Error de red. Comprueba tu conexión.'
            : 'Something went wrong. Check your connection and try again.',
          true
        );
        optionBtns.forEach((b) => {
          b.disabled = false;
          b.classList.remove('opacity-50', 'cursor-not-allowed');
        });
      } finally {
        submitSpinner.classList.add('hidden');
      }
    });

    emailInput.addEventListener('input', () => {
      if (formMessage.textContent) setMessage(formMessage, '', false);
    });
  };
})();
