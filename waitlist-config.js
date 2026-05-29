/**
 * Shared waitlist + Supabase config for index.html and es.html.
 * Load after config.js (optional). Exposes window.initKallpaWaitlist({ locale }).
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
    return { url, key, ready: !placeholder };
  }

  function setMessage(el, text, isError) {
    el.textContent = text;
    el.className =
      'min-h-[24px] text-sm font-medium ' + (isError ? 'text-red-400' : 'text-[#34d399]');
  }

  window.initKallpaWaitlist = function initKallpaWaitlist(options) {
    const locale = options.locale || 'en';
    const { url: SUPABASE_URL, key: SUPABASE_ANON_KEY, ready } = readConfig();

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

    function isValidEmail(email) {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    }

    // Platform button toggle
    platformBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedPlatform = btn.dataset.platform;
        platformBtns.forEach((b) => {
          b.classList.remove('border-[#7c3aed]', 'bg-[rgba(124,58,237,0.15)]', 'text-white');
          b.classList.add('border-[rgba(124,58,237,0.25)]', 'bg-[rgba(124,58,237,0.05)]', 'text-[#9999b8]');
        });
        btn.classList.remove('border-[rgba(124,58,237,0.25)]', 'bg-[rgba(124,58,237,0.05)]', 'text-[#9999b8]');
        btn.classList.add('border-[#7c3aed]', 'bg-[rgba(124,58,237,0.15)]', 'text-white');
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
      // Fire ViewContent when user shows signup intent
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

      const email = emailInput.value.trim();
      if (!isValidEmail(email)) {
        setMessage(
          formMessage,
          locale === 'es' ? 'Correo no válido.' : 'Invalid email. Please go back and re-enter.',
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
          body: JSON.stringify({ email, locale, signup_type: signupType, platform: selectedPlatform || 'android' }),
        });

        if (response.ok || response.status === 201) {
          // Fire Meta Pixel Lead event with Advanced Matching (hashed email)
          if (typeof fbq === 'function') {
            fbq('init', '1032633032791344', { em: email.toLowerCase().trim() });
            fbq('track', 'Lead', { content_name: signupType, content_category: selectedPlatform || 'android' });
          }
          const msg =
            signupType === 'beta'
              ? locale === 'es'
                ? '¡Solicitud de beta enviada! Te contactaremos pronto.'
                : "You've applied for beta access! We'll be in touch soon."
              : locale === 'es'
                ? '¡Estás en la lista! Te avisaremos en el lanzamiento.'
                : "You're on the list! We'll notify you at launch.";
          setMessage(formMessage, msg, false);
          step2.classList.add('hidden');
          step1.classList.add('hidden');
          form.reset();
        } else if (response.status === 409) {
          // Already signed up — still fire Lead for audience building
          if (typeof fbq === 'function') {
            fbq('init', '1032633032791344', { em: email.toLowerCase().trim() });
            fbq('track', 'Lead', { content_name: signupType, content_category: selectedPlatform || 'android' });
          }
          setMessage(
            formMessage,
            locale === 'es' ? '¡Ya estás en la lista!' : "You're already on the list!",
            false
          );
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
