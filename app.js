(() => {
  'use strict';

  const cfg = window.APP_CONFIG || {};
  const configured = Boolean(
    cfg.SUPABASE_URL &&
    cfg.SUPABASE_ANON_KEY &&
    !String(cfg.SUPABASE_URL).includes('REEMPLAZAR_CON_') &&
    !String(cfg.SUPABASE_ANON_KEY).includes('REEMPLAZAR_CON_')
  );

  const STATUS_LABELS = {
    pendiente: 'Pendiente',
    preparacion: 'En preparación',
    enviado: 'Enviado',
    entregado: 'Entregado',
    cancelado: 'Cancelado'
  };

  const PRIORITY_LABELS = { normal: 'Normal', urgente: 'Urgente' };
  const ROLE_LABELS = { admin: 'Administrador', supplier: 'Proveedor', operator: 'Supervisor' };
  const FULL_ADMIN_ROLE = 'admin';
  const NAON_DISCOUNT_PERCENT = 7;
  const INVOICE_AI_FUNCTION = 'analyze-invoice';

  const STATUS_OPTIONS = Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');

  const S = {
    sb: null,
    session: null,
    profile: null,
    mode: 'signed-out',
    services: [],
    materials: [],
    orders: [],
    orderItems: [],
    profiles: [],
    history: [],
    priceHistory: [],
    serviceMaterialExclusions: [],
    selectedServiceMaterialsId: null,
    serviceMaterialsDraftHidden: new Set(),
    publicServiceId: null,
    orderReporterName: '',
    draft: new Map(),
    extras: [],
    tab: 'dashboard',
    selectedOrderId: null,
    orderEditDraft: [],
    orderEditOriginalUpdatedAt: null,
    orderEditMode: false,
    orderEditPickupAtNaon: true,
    lastSuccessText: '',
    channel: null,
    refreshTimer: null,
    lastBudgetStatus: null,
    initialized: false,
    passwordRecovery: false,
    consumptionRows: [],
    consumptionServiceRows: [],
    consumptionLoadedKey: '',
    consumptionLoading: false,
    consumptionHistoryContext: null,
    priceImportWorkbook: null,
    priceImportRows: [],
    priceImportFileName: '',
    priceImportSheetName: '',
    priceImportComparison: null,
    priceImportSelected: new Set(),
    priceImportFilter: 'changes',
    priceImportSearch: '',
    billingImportWorkbook: null,
    billingImportRows: [],
    billingImportFileName: '',
    billingImportSheetName: '',
    billingImportComparison: null,
    billingImportSelected: new Set(),
    billingImportManualMatches: new Map(),
    billingImportFilter: 'changes',
    billingImportSearch: '',
    deferredInstallPrompt: null,
    invoices: [],
    selectedInvoiceId: null,
    invoiceUploadRows: [],
    invoiceReadingEditMode: false,
    invoiceReadingDraft: [],
    invoiceReadingTotalDraft: '',
    invoiceLoadError: null,
    invoiceOcrWorkerPromise: null,
    invoiceOcrLogger: null,
    invoiceOcrCurrentPage: 0,
    invoiceOcrTotalPages: 0,
    invoiceOcrAutoAttempts: new Set(),
    invoiceOcrRunning: false
  };

  const E = {};
  const M = {};
  const dtf = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });

  function isFullAdmin() { return S.profile?.role === FULL_ADMIN_ROLE; }
  function isSupplier() { return S.profile?.role === 'supplier'; }
  function canOperateOrders() { return ['admin', 'supplier'].includes(S.profile?.role); }
  function canManageMasterData() { return isFullAdmin(); }
  function canManageUsers() { return isFullAdmin(); }
  function allowedTabs() { return isFullAdmin() ? ['dashboard','orders','invoices','consumption','materials','services','users','history'] : ['dashboard','orders','history']; }

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    if (S.initialized) return;
    S.initialized = true;

    document.querySelectorAll('[id]').forEach((node) => { E[node.id] = node; });

    M.adminLogin = new bootstrap.Modal(E.adminLoginModal);
    M.extraMaterial = new bootstrap.Modal(E.extraMaterialModal);
    M.orderSuccess = new bootstrap.Modal(E.orderSuccessModal);
    M.orderDetail = new bootstrap.Modal(E.orderDetailModal);
    M.invoiceDetail = new bootstrap.Modal(E.invoiceDetailModal);
    M.service = new bootstrap.Modal(E.serviceModal);
    M.serviceMaterials = new bootstrap.Modal(E.serviceMaterialsModal);
    M.material = new bootstrap.Modal(E.materialModal);
    M.priceImport = new bootstrap.Modal(E.priceImportModal);
    M.billingImport = new bootstrap.Modal(E.billingImportModal);
    M.user = new bootstrap.Modal(E.userModal);
    M.consumptionHistory = new bootstrap.Modal(E.consumptionHistoryModal);
    M.toast = new bootstrap.Toast(E.appToast, { delay: 3200 });
    if (E.consumptionMonth) E.consumptionMonth.value = monthInputValue(new Date());

    bindEvents();
    setupPwa();
    setupSmartHorizontalScrollbars();
    if (window.pdfjsLib) {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
    }

    document.title = cfg.APP_NAME || 'Pedidos Clean It';
    E.appTitle.textContent = document.title;
    E.publicReporterName.value = '';
    E.orderDetailStatus.innerHTML = STATUS_OPTIONS;

    if (!configured) {
      E.loadingScreen.classList.add('d-none');
      E.accessSetupWarning.classList.remove('d-none');
      E.accessLoginButton.disabled = true;
      showLoginGate();
      return;
    }

    S.sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    S.sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        S.passwordRecovery = true;
        S.session = session;
        setTimeout(showPasswordResetView, 0);
        return;
      }
      if (event === 'SIGNED_OUT') {
        setTimeout(() => {
          if (S.mode !== 'signed-out') resetSessionAndShowLogin();
        }, 0);
      }
    });

    try {
      const { data, error } = await S.sb.auth.getSession();
      if (error) throw error;
      const recoveryInUrl = /(?:^|[&#?])type=recovery(?:&|$)/.test(`${window.location.hash}&${window.location.search}`);
      if ((S.passwordRecovery || recoveryInUrl) && data.session) {
        S.passwordRecovery = true;
        S.session = data.session;
        showPasswordResetView();
      } else if (data.session) await routeAuthenticatedSession(data.session);
      else showLoginGate();
    } catch (error) {
      console.error(error);
      showLoginGate();
      showAccessLoginError(error.message || 'No se pudo validar la sesión.');
    } finally {
      E.loadingScreen.classList.add('d-none');
    }
  }

  function bindEvents() {
    E.accessLoginForm.addEventListener('submit', accessLogin);
    E.accessTogglePassword.addEventListener('click', toggleAccessPassword);
    E.forgotPasswordButton.addEventListener('click', sendPasswordRecovery);
    E.passwordResetForm.addEventListener('submit', updateRecoveredPassword);
    E.publicEntryForm.addEventListener('submit', startPublicOrder);
    E.publicServiceSearch.addEventListener('input', handlePublicServiceSearch);
    E.publicServiceSearch.addEventListener('focus', () => renderPublicServiceSuggestions(E.publicServiceSearch.value, true));
    E.publicServiceSearch.addEventListener('keydown', handlePublicServiceSearchKeydown);
    E.publicServiceSelect.addEventListener('change', handlePublicServiceSelectChange);
    E.publicServiceSuggestions.addEventListener('click', handlePublicServiceSuggestionClick);
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.service-search-wrap')) hidePublicServiceSuggestions();
    });
    E.openAdminLoginButton.addEventListener('click', openAdminLogin);
    E.headerAdminLoginButton.addEventListener('click', openAdminLogin);
    E.switchServiceButton.addEventListener('click', requestServiceSwitch);
    E.emptySwitchServiceButton.addEventListener('click', requestServiceSwitch);
    E.loginForm.addEventListener('submit', login);
    E.togglePassword.addEventListener('click', togglePassword);
    E.logoutButton.addEventListener('click', logout);
    E.publicLogoutButton.addEventListener('click', logout);

    E.operatorSearch.addEventListener('input', renderOperatorGrid);
    E.operatorCategory.addEventListener('change', renderOperatorGrid);
    E.operatorPriority.addEventListener('change', renderOperatorMetrics);
    E.addExtraMaterialButton.addEventListener('click', openExtraMaterial);
    E.extraMaterialForm.addEventListener('submit', addExtraMaterial);
    E.operatorSaveButton.addEventListener('click', submitOrder);
    E.copySuccessButton.addEventListener('click', () => copyText(S.lastSuccessText));
    E.newOrderButton.addEventListener('click', startAnotherOrder);

    E.refreshAdminButton.addEventListener('click', () => refreshAdmin(true));
    E.ordersSearch.addEventListener('input', renderOrders);
    E.ordersServiceFilter.addEventListener('change', renderOrders);
    E.ordersStatusFilter.addEventListener('change', renderOrders);
    E.ordersPriorityFilter.addEventListener('change', renderOrders);
    E.applyCurrentBillingToOpenOrdersButton.addEventListener('click', applyCurrentBillingToAllOpenOrders);
    E.selectInvoiceFilesButton.addEventListener('click', () => E.invoicePdfInput.click());
    E.invoiceDropZone.addEventListener('click', () => E.invoicePdfInput.click());
    E.invoiceDropZone.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); E.invoicePdfInput.click(); }
    });
    ['dragenter','dragover'].forEach((name) => E.invoiceDropZone.addEventListener(name, (event) => {
      event.preventDefault();
      E.invoiceDropZone.classList.add('is-dragging');
    }));
    ['dragleave','drop'].forEach((name) => E.invoiceDropZone.addEventListener(name, (event) => {
      event.preventDefault();
      E.invoiceDropZone.classList.remove('is-dragging');
    }));
    E.invoiceDropZone.addEventListener('drop', (event) => processInvoiceFiles(event.dataTransfer?.files || []));
    E.invoicePdfInput.addEventListener('change', () => processInvoiceFiles(E.invoicePdfInput.files || []));
    E.invoiceSearch.addEventListener('input', renderInvoices);
    E.invoiceStatusFilter.addEventListener('change', renderInvoices);
    E.refreshInvoicesButton.addEventListener('click', refreshInvoicesData);
    E.saveInvoiceMatchButton.addEventListener('click', saveInvoiceManualMatch);
    E.openInvoicePdfButton.addEventListener('click', openSelectedInvoicePdf);
    E.reprocessInvoiceOcrButton.addEventListener('click', reprocessSelectedInvoiceWithOcr);
    E.deleteInvoiceButton.addEventListener('click', () => deleteInvoice(S.selectedInvoiceId));
    E.toggleInvoiceReviewedButton.addEventListener('click', toggleInvoiceReviewed);
    E.toggleInvoiceReadingEditButton.addEventListener('click', startInvoiceReadingEdit);
    E.cancelInvoiceReadingEditButton.addEventListener('click', cancelInvoiceReadingEdit);
    E.addInvoiceReadingItemButton.addEventListener('click', addInvoiceReadingItem);
    E.saveInvoiceReadingButton.addEventListener('click', saveInvoiceReading);
    E.invoiceReadingItems.addEventListener('input', handleInvoiceReadingInput);
    E.invoiceReadingTotal.addEventListener('input', () => { S.invoiceReadingTotalDraft = E.invoiceReadingTotal.value; });
    E.invoiceReadingItems.addEventListener('click', handleInvoiceReadingClick);
    E.invoiceDetailModal.addEventListener('hidden.bs.modal', resetInvoiceDetailState);
    E.consumptionMonth.addEventListener('change', () => loadConsumptionReport(true));
    E.consumptionServiceFilter.addEventListener('change', () => loadConsumptionReport(true));
    E.consumptionSearch.addEventListener('input', renderConsumption);
    E.refreshConsumptionButton.addEventListener('click', () => loadConsumptionReport(true));
    E.exportConsumptionButton.addEventListener('click', exportConsumptionCsv);
    E.materialsSearch.addEventListener('input', renderMaterials);
    E.materialsStatusFilter.addEventListener('change', renderMaterials);
    E.adminServiceSearch.addEventListener('input', renderServices);
    E.historyTypeFilter.addEventListener('change', renderHistory);
    E.historySearch.addEventListener('input', renderHistory);

    E.addMaterialButton.addEventListener('click', () => openMaterial());
    E.importPricesButton.addEventListener('click', openPriceImport);
    E.priceImportFile.addEventListener('change', handlePriceImportFile);
    E.priceImportSheet.addEventListener('change', handlePriceImportSheetChange);
    E.priceImportHeaderRow.addEventListener('input', handlePriceImportHeaderChange);
    E.priceImportSkuColumn.addEventListener('change', renderPriceImportPreview);
    E.priceImportPriceColumn.addEventListener('change', renderPriceImportPreview);
    E.priceImportDescriptionColumn.addEventListener('change', renderPriceImportPreview);
    E.priceImportAnalyzeButton.addEventListener('click', analyzePriceImport);
    E.priceImportResetButton.addEventListener('click', resetPriceImport);
    E.priceImportResultFilter.addEventListener('change', handlePriceImportFilterChange);
    E.priceImportSearch.addEventListener('input', handlePriceImportSearch);
    E.priceImportSelectAll.addEventListener('change', toggleVisiblePriceImportSelections);
    E.priceImportResultsBody.addEventListener('change', handlePriceImportResultChange);
    E.priceImportResultsBody.addEventListener('click', handlePriceImportResultClick);
    E.priceImportApplyButton.addEventListener('click', applySelectedPriceUpdates);
    E.priceImportModal.addEventListener('hidden.bs.modal', () => hidePriceImportError());
    E.importBillingButton.addEventListener('click', openBillingImport);
    E.billingImportFile.addEventListener('change', handleBillingImportFile);
    E.billingImportSheet.addEventListener('change', handleBillingImportSheetChange);
    E.billingImportHeaderRow.addEventListener('input', handleBillingImportHeaderChange);
    E.billingImportNameColumn.addEventListener('change', renderBillingImportPreview);
    E.billingImportCuitColumn.addEventListener('change', renderBillingImportPreview);
    E.billingImportSubtotalColumn.addEventListener('change', renderBillingImportPreview);
    E.billingImportAnalyzeButton.addEventListener('click', analyzeBillingImport);
    E.billingImportResetButton.addEventListener('click', () => resetBillingImport(true));
    E.billingImportResultFilter.addEventListener('change', () => { S.billingImportFilter = E.billingImportResultFilter.value; renderBillingImportResults(); });
    E.billingImportSearch.addEventListener('input', () => { S.billingImportSearch = E.billingImportSearch.value; renderBillingImportResults(); });
    E.billingImportSelectAll.addEventListener('change', toggleVisibleBillingImportSelections);
    E.billingImportResultsBody.addEventListener('change', handleBillingImportResultChange);
    E.billingImportResultsBody.addEventListener('click', handleBillingImportResultClick);
    E.billingImportApplyButton.addEventListener('click', applySelectedBillingUpdates);
    E.billingImportApplyAllButton.addEventListener('click', applyAllBillingUpdates);
    E.billingImportModal.addEventListener('hidden.bs.modal', hideBillingImportError);
    if (E.installAppButton) E.installAppButton.addEventListener('click', installPwa);
    E.materialForm.addEventListener('submit', saveMaterial);
    E.materialImageFile.addEventListener('change', previewMaterialImage);
    E.addServiceButton.addEventListener('click', () => openService());
    E.serviceForm.addEventListener('submit', saveService);
    E.serviceBilling.addEventListener('input', renderServiceBudgetPreview);
    E.serviceBudgetPercent.addEventListener('input', renderServiceBudgetPreview);
    E.serviceCuit.addEventListener('input', renderServiceCuitWarning);
    E.serviceMaterialsSearch.addEventListener('input', renderServiceMaterials);
    E.serviceMaterialsFilter.addEventListener('change', renderServiceMaterials);
    E.serviceMaterialsList.addEventListener('change', handleServiceMaterialToggle);
    E.showAllServiceMaterialsButton.addEventListener('click', () => setAllServiceMaterialsVisible(true));
    E.hideAllServiceMaterialsButton.addEventListener('click', () => setAllServiceMaterialsVisible(false));
    E.saveServiceMaterialsButton.addEventListener('click', saveServiceMaterials);
    E.userForm.addEventListener('submit', saveUser);

    E.copyOrderButton.addEventListener('click', () => {
      const order = getSelectedOrder();
      if (order) copyText(buildOrderText(order));
    });
    E.whatsappOrderButton.addEventListener('click', () => {
      const order = getSelectedOrder();
      if (!order) return;
      window.open(`https://wa.me/?text=${encodeURIComponent(buildOrderText(order))}`, '_blank', 'noopener');
    });
    E.saveOrderStatusButton.addEventListener('click', saveSelectedOrderStatus);
    E.editOrderButton.addEventListener('click', startOrderEdit);
    E.cancelOrderEditButton.addEventListener('click', cancelOrderEdit);
    E.saveOrderChangesButton.addEventListener('click', saveOrderChanges);
    E.addOrderMaterialButton.addEventListener('click', addMaterialToOrderDraft);
    E.orderNaonPickupCheckbox.addEventListener('change', handleOrderNaonPickupChange);
    E.orderDetailModal.addEventListener('hidden.bs.modal', resetOrderEditState);

    E.appShell.addEventListener('click', handleAppClick);
    E.appShell.addEventListener('input', handleAppInput);

    // El modal de detalle está fuera de #appShell en el HTML.
    // Por eso sus controles dinámicos (+, -, cantidad manual y quitar)
    // necesitan la misma delegación de eventos dentro del propio modal.
    E.orderDetailModal.addEventListener('click', handleAppClick);
    E.orderDetailModal.addEventListener('input', handleAppInput);

    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.adminTab));
    });
  }

  function showLoginGate() {
    E.loadingScreen.classList.add('d-none');
    E.passwordResetView.classList.add('d-none');
    E.authView.classList.add('d-none');
    E.appShell.classList.add('d-none');
    E.loginGateView.classList.remove('d-none');
    hideAccessLoginError();
    hideAccessLoginSuccess();
    setTimeout(() => E.accessLoginEmail?.focus(), 150);
  }

  function showPasswordResetView() {
    E.loadingScreen.classList.add('d-none');
    E.loginGateView.classList.add('d-none');
    E.passwordResetView.classList.add('d-none');
    E.authView.classList.add('d-none');
    E.appShell.classList.add('d-none');
    E.passwordResetView.classList.remove('d-none');
    E.passwordResetError.classList.add('d-none');
    E.passwordResetError.textContent = '';
    E.newPassword.value = '';
    E.confirmNewPassword.value = '';
    setTimeout(() => E.newPassword.focus(), 150);
  }

  function passwordRecoveryRedirectUrl() {
    return `${window.location.origin}${window.location.pathname}`;
  }

  async function sendPasswordRecovery() {
    hideAccessLoginError();
    hideAccessLoginSuccess();
    const email = E.accessLoginEmail.value.trim();
    if (!email) {
      showAccessLoginError('Ingresá el correo del usuario para enviar el enlace de recuperación.');
      E.accessLoginEmail.focus();
      return;
    }

    buttonBusy(E.forgotPasswordButton, true, 'Enviando enlace...');
    try {
      const { error } = await S.sb.auth.resetPasswordForEmail(email, {
        redirectTo: passwordRecoveryRedirectUrl()
      });
      if (error) throw error;
      showAccessLoginSuccess('Si el correo está registrado, recibirá un enlace para cambiar la contraseña. Revisá también la carpeta de spam.');
    } catch (error) {
      console.error(error);
      showAccessLoginError(error.message || 'No se pudo enviar el enlace de recuperación.');
    } finally {
      buttonBusy(E.forgotPasswordButton, false);
    }
  }

  async function updateRecoveredPassword(event) {
    event.preventDefault();
    E.passwordResetError.classList.add('d-none');
    E.passwordResetError.textContent = '';

    const password = E.newPassword.value;
    const confirmation = E.confirmNewPassword.value;
    if (password.length < 8) {
      E.passwordResetError.textContent = 'La contraseña debe tener como mínimo 8 caracteres.';
      E.passwordResetError.classList.remove('d-none');
      return;
    }
    if (password !== confirmation) {
      E.passwordResetError.textContent = 'Las contraseñas no coinciden.';
      E.passwordResetError.classList.remove('d-none');
      return;
    }

    buttonBusy(E.passwordResetButton, true, 'Guardando...');
    try {
      const { error } = await S.sb.auth.updateUser({ password });
      if (error) throw error;
      S.passwordRecovery = false;
      await S.sb.auth.signOut();
      resetSessionState();
      showLoginGate();
      setTimeout(() => showAccessLoginSuccess('Contraseña actualizada. Ya podés ingresar con la nueva contraseña.'), 50);
      window.history.replaceState({}, document.title, passwordRecoveryRedirectUrl());
    } catch (error) {
      console.error(error);
      E.passwordResetError.textContent = error.message || 'No se pudo actualizar la contraseña. Solicitá un nuevo enlace e intentá nuevamente.';
      E.passwordResetError.classList.remove('d-none');
    } finally {
      buttonBusy(E.passwordResetButton, false);
    }
  }

  async function accessLogin(event) {
    event.preventDefault();
    hideAccessLoginError();
    hideAccessLoginSuccess();
    buttonBusy(E.accessLoginButton, true, 'Ingresando...');
    try {
      const { data, error } = await S.sb.auth.signInWithPassword({
        email: E.accessLoginEmail.value.trim(),
        password: E.accessLoginPassword.value
      });
      if (error) throw error;
      await routeAuthenticatedSession(data.session);
      E.accessLoginPassword.value = '';
    } catch (error) {
      console.error(error);
      showAccessLoginError(error.message === 'Invalid login credentials'
        ? 'Correo o contraseña incorrectos.'
        : (error.message || 'No se pudo iniciar sesión.'));
    } finally {
      buttonBusy(E.accessLoginButton, false);
    }
  }

  async function routeAuthenticatedSession(session) {
    if (!session?.user?.id) throw new Error('La sesión no es válida.');
    showLoading();
    try {
      const { data: profile, error } = await S.sb.from('profiles').select('*').eq('id', session.user.id).single();
      if (error || !profile) throw new Error('El usuario no tiene un perfil habilitado. Revisalo en Administración → Usuarios.');
      if (!['admin', 'supplier', 'operator'].includes(profile.role)) throw new Error('El usuario no tiene un rol válido para ingresar.');

      S.session = session;
      S.profile = profile;
      E.loginGateView.classList.add('d-none');

      if (['admin', 'supplier'].includes(profile.role)) {
        S.mode = 'admin';
        await refreshAdmin(false);
        setupRealtime();
        showAdminApp();
        return;
      }

      S.mode = 'operator';
      S.orderReporterName = '';
      await loadPublicData();
      showPublicEntry();
    } catch (error) {
      console.error(error);
      await S.sb.auth.signOut();
      resetSessionState();
      showLoginGate();
      showAccessLoginError(error.message || 'No se pudo abrir la aplicación.');
      throw error;
    } finally {
      E.loadingScreen.classList.add('d-none');
    }
  }

  function authenticatedReporterName() {
    const profileName = String(S.profile?.full_name || '').trim();
    if (profileName) return profileName.slice(0, 100);
    const email = String(S.profile?.email || S.session?.user?.email || '').trim();
    return email ? email.split('@')[0].slice(0, 100) : 'Supervisor';
  }

  async function loadPublicData() {
    const { data, error } = await S.sb.rpc('supervisor_order_bootstrap');
    if (error) throw error;
    const payload = typeof data === 'string' ? JSON.parse(data) : (data || {});
    S.services = Array.isArray(payload.services) ? payload.services : [];
    S.materials = Array.isArray(payload.materials) ? payload.materials : [];
    S.serviceMaterialExclusions = Array.isArray(payload.hidden_materials) ? payload.hidden_materials : [];
    populatePublicServiceSelect();
    populateOperatorCategories();
  }

  function showPublicEntry() {
    if (!S.session || S.profile?.role !== 'operator') {
      showLoginGate();
      return;
    }
    E.loadingScreen.classList.add('d-none');
    E.loginGateView.classList.add('d-none');
    E.passwordResetView.classList.add('d-none');
    E.appShell.classList.add('d-none');
    E.authView.classList.remove('d-none');
    E.publicReporterName.readOnly = false;
    E.publicReporterName.value = S.orderReporterName || '';
    populatePublicServiceSelect();
    hidePublicServiceSuggestions();
  }

  function activePublicServices() {
    return S.services
      .filter((item) => item.active !== false)
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));
  }

  function publicServiceHaystack(service) {
    return normalize(`${service.name || ''} ${service.address || ''} ${service.zone || ''} ${service.description || ''}`);
  }

  function populatePublicServiceSelect() {
    const active = activePublicServices();
    const remembered = localStorage.getItem('pedidosCleanItService') || '';
    const current = E.publicServiceSelect.value || remembered;
    E.publicServiceSelect.innerHTML = '<option value="">Seleccionar servicio...</option>' + active
      .map((item) => `<option value="${ea(item.id)}">${eh(item.name)}</option>`)
      .join('');
    if (active.some((item) => item.id === current)) E.publicServiceSelect.value = current;
    E.publicStartButton.disabled = !configured || active.length === 0;
    if (configured && active.length === 0) showEntryError('No hay servicios activos cargados.');
  }

  function matchingPublicServices(rawQuery) {
    const query = normalize(rawQuery);
    const active = activePublicServices();
    if (!query) return active.slice(0, 8);
    return active.filter((service) => publicServiceHaystack(service).includes(query)).slice(0, 12);
  }

  function renderPublicServiceSuggestions(rawQuery, force = false) {
    const query = String(rawQuery || '').trim();
    const matches = matchingPublicServices(query);
    if (!force && !query) {
      hidePublicServiceSuggestions();
      return;
    }

    E.publicServiceSuggestions.innerHTML = matches.length
      ? matches.map((service) => `
          <button class="service-search-option" type="button" role="option" data-public-service-id="${ea(service.id)}">
            <span class="service-search-option-icon"><i class="bi bi-building"></i></span>
            <span class="service-search-option-copy">
              <strong>${eh(service.name || 'Servicio')}</strong>
              <small>${eh([service.address, service.zone].filter(Boolean).join(' · ') || 'Sin dirección informada')}</small>
            </span>
            <i class="bi bi-chevron-right service-search-option-arrow"></i>
          </button>`).join('')
      : '<div class="service-search-empty"><i class="bi bi-search"></i><span>No se encontraron servicios con ese criterio.</span></div>';
    E.publicServiceSuggestions.classList.remove('d-none');
  }

  function hidePublicServiceSuggestions() {
    E.publicServiceSuggestions.classList.add('d-none');
  }

  function selectPublicService(serviceId) {
    const service = activePublicServices().find((item) => item.id === serviceId);
    if (!service) return;
    E.publicServiceSelect.value = service.id;
    E.publicServiceSearch.value = service.name || '';
    hidePublicServiceSuggestions();
    hideEntryError();
  }

  function handlePublicServiceSearch() {
    const query = E.publicServiceSearch.value;
    const selected = activePublicServices().find((item) => item.id === E.publicServiceSelect.value);
    if (selected && normalize(selected.name) !== normalize(query)) E.publicServiceSelect.value = '';
    renderPublicServiceSuggestions(query, true);
  }

  function handlePublicServiceSearchKeydown(event) {
    if (event.key === 'Escape') {
      hidePublicServiceSuggestions();
      return;
    }
    if (event.key === 'ArrowDown') {
      const first = E.publicServiceSuggestions.querySelector('[data-public-service-id]');
      if (first) {
        event.preventDefault();
        first.focus();
      }
      return;
    }
    if (event.key === 'Enter') {
      const first = E.publicServiceSuggestions.querySelector('[data-public-service-id]');
      if (first && !E.publicServiceSuggestions.classList.contains('d-none')) {
        event.preventDefault();
        selectPublicService(first.dataset.publicServiceId);
      }
    }
  }

  function handlePublicServiceSuggestionClick(event) {
    const button = event.target.closest('[data-public-service-id]');
    if (!button) return;
    selectPublicService(button.dataset.publicServiceId);
  }

  function handlePublicServiceSelectChange() {
    const service = activePublicServices().find((item) => item.id === E.publicServiceSelect.value);
    E.publicServiceSearch.value = service?.name || '';
    hidePublicServiceSuggestions();
    hideEntryError();
  }

  function populateOperatorCategories() {
    const current = E.operatorCategory?.value || '';
    const source = S.publicServiceId ? visibleMaterialsForService(S.publicServiceId) : S.materials.filter((m) => m.active !== false);
    const categories = [...new Set(source.map((m) => m.category).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'es'));
    E.operatorCategory.innerHTML = '<option value="">Todas las categorías</option>' + categories
      .map((category) => `<option value="${ea(category)}">${eh(category)}</option>`)
      .join('');
    if (categories.includes(current)) E.operatorCategory.value = current;
  }

  async function startPublicOrder(event) {
    event.preventDefault();
    hideEntryError();

    const serviceId = E.publicServiceSelect.value;
    const reporter = E.publicReporterName.value.trim();

    if (!serviceId) {
      showEntryError('Seleccioná el servicio para el que vas a hacer el pedido.');
      return;
    }
    if (reporter.length < 2) {
      showEntryError('Ingresá el nombre y apellido del operario responsable.');
      E.publicReporterName.focus();
      return;
    }

    localStorage.setItem('pedidosCleanItService', serviceId);
    S.publicServiceId = serviceId;
    S.orderReporterName = reporter;
    S.draft.clear();
    S.extras = [];
    S.lastBudgetStatus = null;
    E.operatorPriority.value = 'normal';
    E.operatorNotes.value = '';
    E.operatorSearch.value = '';
    E.operatorCategory.value = '';
    populateOperatorCategories();

    showOperatorApp();
  }

  function showOperatorApp() {
    S.mode = 'operator';
    E.loginGateView.classList.add('d-none');
    E.passwordResetView.classList.add('d-none');
    E.authView.classList.add('d-none');
    E.appShell.classList.remove('d-none');
    E.adminView.classList.add('d-none');
    E.operatorView.classList.remove('d-none');
    E.adminMenuButton.classList.add('d-none');
    E.switchServiceButton.classList.remove('d-none');
    E.headerAdminLoginButton.classList.add('d-none');
    E.logoutButton.classList.remove('d-none');
    E.headerUserChip.classList.remove('d-none');
    E.headerUserName.textContent = authenticatedReporterName();
    E.headerUserRole.textContent = 'Supervisor';
    E.appSubtitle.textContent = 'Pedido de insumos';
    renderOperator();
  }

  function renderOperator() {
    const service = currentService();
    const hasService = Boolean(service);
    E.operatorNoService.classList.toggle('d-none', hasService);
    E.operatorContent.classList.toggle('d-none', !hasService);
    E.operatorSaveBar.classList.toggle('d-none', !hasService);
    if (!service) return;

    E.operatorServiceName.textContent = service.name || 'Servicio';
    E.operatorServiceAddress.textContent = service.address || 'Dirección no informada';
    E.operatorReporter.textContent = S.orderReporterName || 'Operario no informado';
    const description = String(service.description || '').trim();
    E.operatorServiceDescription.classList.toggle('d-none', !description);
    E.operatorServiceDescription.querySelector('span').textContent = description;
    renderOperatorMetrics();
    renderOperatorGrid();
  }

  function renderOperatorMetrics() {
    const metrics = cartMetrics();
    const previousStatus = S.lastBudgetStatus;
    S.lastBudgetStatus = metrics.status;

    E.operatorSelectedCount.textContent = String(metrics.totalItems);
    E.operatorUnitsCount.textContent = formatQty(metrics.totalUnits);
    E.operatorCustomCount.textContent = String(S.extras.length);
    E.operatorCartTotal.textContent = formatCurrency(metrics.totalAmount);
    E.operatorSaveTotal.textContent = formatCurrency(metrics.totalAmount);
    E.operatorPriorityLabel.textContent = PRIORITY_LABELS[E.operatorPriority.value] || 'Normal';
    E.operatorDraftCount.textContent = `${metrics.totalItems} ${metrics.totalItems === 1 ? 'insumo seleccionado' : 'insumos seleccionados'}`;
    E.operatorSaveButton.disabled = metrics.totalItems === 0;

    E.operatorBudgetFive.textContent = formatCurrency(metrics.fiveAmount);
    E.operatorBudgetLimit.textContent = formatCurrency(metrics.limitAmount);
    E.operatorBudgetSeven.textContent = formatCurrency(metrics.sevenAmount);
    E.operatorBudgetLimitLabel.textContent = `Límite ${formatPercent(metrics.limitPercent)}`;
    E.operatorBudgetDescription.textContent = metrics.billing > 0
      ? `Facturación mensual: ${formatCurrency(metrics.billing)}. El límite operativo está configurado en ${formatPercent(metrics.limitPercent)}.`
      : 'Administración todavía no configuró la facturación mensual de este servicio.';

    const usageText = metrics.limitAmount > 0
      ? `${formatPercent(metrics.usagePercent)} del límite utilizado · Disponible: ${formatCurrency(Math.max(0, metrics.limitAmount - metrics.totalAmount))}`
      : 'Sin facturación configurada';
    E.operatorBudgetUsage.textContent = usageText;
    E.operatorBudgetProgress.style.width = `${Math.min(100, Math.max(0, metrics.usagePercent))}%`;
    E.operatorBudgetProgress.className = `progress-bar ${metrics.status === 'sobre_7' ? 'bg-danger' : (metrics.status === 'sobre_limite' ? 'bg-warning' : 'bg-primary')}`;
    E.operatorBudgetPanel.classList.remove('budget-status-dentro','budget-status-warning','budget-status-danger','budget-status-unconfigured');
    E.operatorBudgetPanel.classList.add(metrics.status === 'sobre_7' ? 'budget-status-danger' : (metrics.status === 'sobre_limite' ? 'budget-status-warning' : (metrics.status === 'sin_configurar' ? 'budget-status-unconfigured' : 'budget-status-dentro')));

    let alertClass = '';
    let alertHtml = '';
    if (metrics.status === 'sobre_7') {
      alertClass = 'alert-danger';
      alertHtml = `<strong>Alerta crítica:</strong> el pedido supera el 7% de la facturación por ${eh(formatCurrency(metrics.totalAmount - metrics.sevenAmount))}. Podés enviarlo, pero quedará registrado como excepción.`;
    } else if (metrics.status === 'sobre_limite') {
      alertClass = 'alert-warning';
      alertHtml = `<strong>Tope superado:</strong> el pedido excede el límite de ${eh(formatPercent(metrics.limitPercent))} por ${eh(formatCurrency(metrics.totalAmount - metrics.limitAmount))}. Podés continuar de manera excepcional.`;
    } else if (metrics.unpricedCount > 0) {
      alertClass = 'alert-warning';
      alertHtml = `<strong>Total incompleto:</strong> hay ${metrics.unpricedCount} ${metrics.unpricedCount === 1 ? 'insumo seleccionado sin precio' : 'insumos seleccionados sin precio'}. El valor del carrito puede estar subestimado.`;
    } else if (metrics.status === 'sin_configurar') {
      alertClass = 'alert-info';
      alertHtml = '<strong>Sin tope calculado:</strong> cargá la facturación mensual desde Administración → Servicios.';
    }

    E.operatorBudgetAlert.className = `alert mt-3 mb-0 ${alertHtml ? alertClass : 'd-none'}`;
    E.operatorBudgetAlert.innerHTML = alertHtml;

    if (previousStatus && previousStatus !== metrics.status) {
      if (metrics.status === 'sobre_7') toast('Alerta: el pedido superó el 7% de la facturación.', 'error');
      else if (metrics.status === 'sobre_limite') toast(`El pedido superó el límite de ${formatPercent(metrics.limitPercent)}.`, 'info');
    }
  }

  function renderOperatorGrid() {
    const query = normalize(E.operatorSearch.value);
    const category = E.operatorCategory.value;
    const materials = visibleMaterialsForService(S.publicServiceId)
      .filter((item) => !category || item.category === category)
      .filter((item) => !query || normalize(`${item.name} ${item.sku || ''} ${item.category} ${item.detail || ''}`).includes(query))
      .sort(materialSort);

    const materialCards = materials.map(renderMaterialCard).join('');
    const extraCards = S.extras.map(renderExtraCard).join('');

    E.operatorInventoryGrid.innerHTML = materialCards + extraCards || '<div class="empty-inline">No hay insumos que coincidan con el filtro.</div>';
  }

  function renderMaterialCard(material) {
    const qty = number(S.draft.get(material.id));
    const selected = qty > 0;
    const unitPrice = number(material.unit_price);
    return `
      <article class="material-card ${selected ? 'is-selected' : ''}" data-material-card="${ea(material.id)}">
        <div class="material-image-wrap">
          <img class="material-image" src="${ea(material.image_url || 'assets/materials/default.svg')}" alt="${ea(material.name)}" loading="lazy" onerror="this.src='assets/materials/default.svg'">
          <span class="material-status ${selected ? 'selected' : 'idle'}">${selected ? `${formatQty(qty)} pedido` : 'Sin pedir'}</span>
        </div>
        <div class="material-body">
          <div class="material-category">${eh(material.category || 'General')}</div>
          <div class="material-name">${eh(material.name)}</div>
          <div class="material-detail">${eh(material.detail || material.unit || '')}</div>
          <div class="material-commercial"><span>${eh(material.sku || 'Sin SKU')}</span><strong>${unitPrice > 0 ? eh(formatCurrency(unitPrice)) : 'Precio pendiente'}</strong></div>
          <div class="stock-control">
            <button class="btn btn-outline-secondary" type="button" data-qty-action="minus" data-material-id="${ea(material.id)}" aria-label="Restar"><i class="bi bi-dash-lg"></i></button>
            <input class="form-control stock-input" type="number" min="0" max="999" step="0.01" inputmode="decimal" value="${ea(formatInputQty(qty))}" data-qty-input data-material-id="${ea(material.id)}" aria-label="Cantidad de ${ea(material.name)}">
            <button class="btn btn-outline-primary" type="button" data-qty-action="plus" data-material-id="${ea(material.id)}" aria-label="Sumar"><i class="bi bi-plus-lg"></i></button>
          </div>
          <div class="stock-unit">${eh(material.unit || 'unidad')}</div>
          <div class="material-line-total">${selected ? `Subtotal: ${eh(formatCurrency(qty * unitPrice))}` : 'Subtotal: $ 0'}</div>
          <div class="threshold-note">Sugerido habitual: ${eh(formatQty(material.suggested_quantity || 1))}</div>
        </div>
      </article>`;
  }

  function renderExtraCard(item, index) {
    return `
      <article class="material-card extra-material-card is-selected" data-extra-card="${index}">
        <div class="material-image-wrap">
          <img class="material-image" src="assets/materials/default.svg" alt="${ea(item.name)}">
          <span class="extra-material-badge">No listado</span>
          <span class="material-status selected">${formatQty(item.quantity)} pedido</span>
        </div>
        <div class="material-body">
          <div class="material-category">Excepción</div>
          <div class="material-name">${eh(item.name)}</div>
          <div class="material-detail">${eh(item.notes || item.unit)}</div>
          <div class="material-commercial"><span>${eh(item.sku || 'Sin SKU')}</span><strong>${number(item.unitPrice) > 0 ? eh(formatCurrency(item.unitPrice)) : 'Precio pendiente'}</strong></div>
          <div class="stock-control">
            <button class="btn btn-outline-secondary" type="button" data-extra-action="minus" data-extra-index="${index}" aria-label="Restar"><i class="bi bi-dash-lg"></i></button>
            <input class="form-control stock-input" type="number" min="0.01" max="999" step="0.01" value="${ea(formatInputQty(item.quantity))}" data-extra-input data-extra-index="${index}">
            <button class="btn btn-outline-primary" type="button" data-extra-action="plus" data-extra-index="${index}" aria-label="Sumar"><i class="bi bi-plus-lg"></i></button>
          </div>
          <div class="stock-unit">${eh(item.unit)}</div>
          <div class="material-line-total">Subtotal: ${eh(formatCurrency(number(item.quantity) * number(item.unitPrice)))}</div>
          <div class="custom-card-actions"><button class="btn btn-outline-danger btn-sm" type="button" data-custom-remove="${index}"><i class="bi bi-trash3 me-1"></i>Quitar</button></div>
        </div>
      </article>`;
  }

  function handleAppClick(event) {
    const billingReferenceButton = event.target.closest('[data-order-billing-reference]');
    if (billingReferenceButton) {
      setOrderBillingReference(
        billingReferenceButton.dataset.orderBillingId,
        billingReferenceButton.dataset.orderBillingReference,
        billingReferenceButton
      );
      return;
    }

    const orderEditQtyButton = event.target.closest('[data-order-edit-action]');
    if (orderEditQtyButton) {
      changeOrderEditQty(orderEditQtyButton.dataset.orderEditKey, orderEditQtyButton.dataset.orderEditAction === 'plus' ? 1 : -1);
      return;
    }

    const orderEditRemoveButton = event.target.closest('[data-order-edit-remove]');
    if (orderEditRemoveButton) {
      removeOrderEditItem(orderEditRemoveButton.dataset.orderEditRemove);
      return;
    }

    const qtyButton = event.target.closest('[data-qty-action]');
    if (qtyButton) {
      changeMaterialQty(qtyButton.dataset.materialId, qtyButton.dataset.qtyAction === 'plus' ? 1 : -1);
      return;
    }

    const extraButton = event.target.closest('[data-extra-action]');
    if (extraButton) {
      changeExtraQty(Number(extraButton.dataset.extraIndex), extraButton.dataset.extraAction === 'plus' ? 1 : -1);
      return;
    }

    const removeExtra = event.target.closest('[data-custom-remove]');
    if (removeExtra) {
      S.extras.splice(Number(removeExtra.dataset.customRemove), 1);
      renderOperatorMetrics();
      renderOperatorGrid();
      return;
    }

    const goTab = event.target.closest('[data-go-tab]');
    if (goTab) {
      switchTab(goTab.dataset.goTab);
      return;
    }

    const openOrderButton = event.target.closest('[data-order-open]');
    if (openOrderButton) {
      openOrder(openOrderButton.dataset.orderOpen);
      return;
    }

    const copyOrderButton = event.target.closest('[data-order-copy]');
    if (copyOrderButton) {
      const order = S.orders.find((item) => item.id === copyOrderButton.dataset.orderCopy);
      if (order) copyText(buildOrderText(order));
      return;
    }

    const deleteOrderButton = event.target.closest('[data-order-delete]');
    if (deleteOrderButton) {
      deleteOrder(deleteOrderButton.dataset.orderDelete);
      return;
    }

    const openInvoiceButton = event.target.closest('[data-invoice-open]');
    if (openInvoiceButton) {
      openInvoice(openInvoiceButton.dataset.invoiceOpen);
      return;
    }

    const deleteInvoiceButton = event.target.closest('[data-invoice-delete]');
    if (deleteInvoiceButton) {
      deleteInvoice(deleteInvoiceButton.dataset.invoiceDelete);
      return;
    }

    const editMaterialButton = event.target.closest('[data-edit-material]');
    if (editMaterialButton) {
      openMaterial(editMaterialButton.dataset.editMaterial);
      return;
    }

    const toggleMaterialButton = event.target.closest('[data-toggle-material]');
    if (toggleMaterialButton) {
      toggleMaterial(toggleMaterialButton.dataset.toggleMaterial);
      return;
    }

    const deleteMaterialButton = event.target.closest('[data-delete-material]');
    if (deleteMaterialButton) {
      deleteMaterial(deleteMaterialButton.dataset.deleteMaterial);
      return;
    }

    const configureServiceMaterialsButton = event.target.closest('[data-configure-service-materials]');
    if (configureServiceMaterialsButton) {
      openServiceMaterials(configureServiceMaterialsButton.dataset.configureServiceMaterials);
      return;
    }

    const editServiceButton = event.target.closest('[data-edit-service]');
    if (editServiceButton) {
      openService(editServiceButton.dataset.editService);
      return;
    }

    const toggleServiceButton = event.target.closest('[data-toggle-service]');
    if (toggleServiceButton) {
      toggleService(toggleServiceButton.dataset.toggleService);
      return;
    }

    const deleteServiceButton = event.target.closest('[data-delete-service]');
    if (deleteServiceButton) {
      deleteService(deleteServiceButton.dataset.deleteService);
      return;
    }

    const consumptionHistoryButton = event.target.closest('[data-consumption-history]');
    if (consumptionHistoryButton) {
      openConsumptionHistory(consumptionHistoryButton.dataset.consumptionService, consumptionHistoryButton.dataset.consumptionHistory);
      return;
    }

    const editUserButton = event.target.closest('[data-edit-user]');
    if (editUserButton) openUser(editUserButton.dataset.editUser);
  }

  function handleAppInput(event) {
    const orderEditInput = event.target.closest('[data-order-edit-input]');
    if (orderEditInput) {
      updateOrderEditInput(orderEditInput);
      return;
    }

    const materialInput = event.target.closest('[data-qty-input]');
    if (materialInput) {
      const materialId = materialInput.dataset.materialId;
      const qty = clampQty(materialInput.value, 0);
      if (qty > 0) S.draft.set(materialId, qty);
      else S.draft.delete(materialId);
      renderOperatorMetrics();
      updateMaterialCardState(materialInput.closest('.material-card'), qty, materialId);
      return;
    }

    const extraInput = event.target.closest('[data-extra-input]');
    if (extraInput) {
      const index = Number(extraInput.dataset.extraIndex);
      if (!S.extras[index]) return;
      const qty = clampQty(extraInput.value, 0.01);
      S.extras[index].quantity = qty;
      renderOperatorMetrics();
      const card = extraInput.closest('.material-card');
      const badge = card?.querySelector('.material-status');
      if (badge) badge.textContent = `${formatQty(qty)} pedido`;
      const line = card?.querySelector('.material-line-total');
      if (line) line.textContent = `Subtotal: ${formatCurrency(qty * number(S.extras[index].unitPrice))}`;
    }
  }

  function updateMaterialCardState(card, qty, materialId) {
    if (!card) return;
    const selected = qty > 0;
    card.classList.toggle('is-selected', selected);
    const badge = card.querySelector('.material-status');
    if (badge) {
      badge.classList.toggle('selected', selected);
      badge.classList.toggle('idle', !selected);
      badge.textContent = selected ? `${formatQty(qty)} pedido` : 'Sin pedir';
    }
    const material = S.materials.find((item) => item.id === materialId);
    const line = card.querySelector('.material-line-total');
    if (line) line.textContent = `Subtotal: ${formatCurrency(qty * number(material?.unit_price))}`;
  }

  function changeMaterialQty(materialId, delta) {
    const next = Math.max(0, number(S.draft.get(materialId)) + delta);
    setMaterialQty(materialId, next);
  }

  function setMaterialQty(materialId, value) {
    const qty = clampQty(value, 0);
    if (qty > 0) S.draft.set(materialId, qty);
    else S.draft.delete(materialId);
    renderOperatorMetrics();
    renderOperatorGrid();
  }

  function changeExtraQty(index, delta) {
    if (!S.extras[index]) return;
    S.extras[index].quantity = Math.max(0.01, number(S.extras[index].quantity) + delta);
    renderOperatorMetrics();
    renderOperatorGrid();
  }

  function openExtraMaterial() {
    E.extraMaterialForm.reset();
    E.extraQuantity.value = '1';
    E.extraUnit.value = 'unidad';
    E.extraUnitPrice.value = '0';
    M.extraMaterial.show();
    setTimeout(() => E.extraName.focus(), 250);
  }

  function addExtraMaterial(event) {
    event.preventDefault();
    const name = E.extraName.value.trim();
    const sku = E.extraSku.value.trim();
    const unitPrice = clampMoney(E.extraUnitPrice.value);
    const quantity = clampQty(E.extraQuantity.value, 0.01);
    const unit = E.extraUnit.value.trim() || 'unidad';
    const notes = E.extraNotes.value.trim();

    if (name.length < 2) {
      E.extraName.focus();
      return;
    }

    S.extras.push({ name, sku, unitPrice, quantity, unit, notes });
    M.extraMaterial.hide();
    renderOperatorMetrics();
    renderOperatorGrid();
    toast('Insumo agregado al pedido.', 'success');
  }

  async function submitOrder() {
    const service = currentService();
    const reporter = String(S.orderReporterName || '').trim();
    if (!service || reporter.length < 2) {
      toast('Falta identificar el servicio o el operario responsable.', 'error');
      return;
    }

    const metrics = cartMetrics();
    if (metrics.status === 'sobre_limite' || metrics.status === 'sobre_7' || metrics.unpricedCount > 0) {
      const warnings = [];
      if (metrics.status === 'sobre_7') warnings.push(`El pedido supera el 7% por ${formatCurrency(metrics.totalAmount - metrics.sevenAmount)}.`);
      else if (metrics.status === 'sobre_limite') warnings.push(`El pedido supera el límite de ${formatPercent(metrics.limitPercent)} por ${formatCurrency(metrics.totalAmount - metrics.limitAmount)}.`);
      if (metrics.unpricedCount > 0) warnings.push(`Hay ${metrics.unpricedCount} insumo${metrics.unpricedCount === 1 ? '' : 's'} sin precio.`);
      if (!confirm(`${warnings.join('\n')}\n\n¿Querés enviar el pedido igualmente como excepción?`)) return;
    }

    const items = [];
    S.draft.forEach((quantity, materialId) => {
      if (quantity > 0) items.push({ material_id: materialId, quantity });
    });
    S.extras.forEach((item) => {
      items.push({
        material_id: null,
        custom_name: item.name,
        sku: item.sku || null,
        unit_price: number(item.unitPrice),
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes || null
      });
    });

    if (!items.length) {
      toast('Seleccioná al menos un insumo.', 'error');
      return;
    }

    buttonBusy(E.operatorSaveButton, true, 'Enviando...');
    try {
      const { data, error } = await S.sb.rpc('supervisor_create_order', {
        p_service_id: service.id,
        p_reporter_name: reporter,
        p_priority: E.operatorPriority.value,
        p_notes: E.operatorNotes.value.trim() || null,
        p_items: items
      });
      if (error) throw error;

      const result = typeof data === 'string' ? JSON.parse(data) : data;
      const summary = `${result.item_count} ${result.item_count === 1 ? 'insumo' : 'insumos'} · ${formatQty(result.total_units)} unidades · ${formatCurrency(result.total_amount)}`;
      const budgetNote = result.budget_status === 'sobre_7'
        ? ' · Excepción: supera el 7%'
        : (result.budget_status === 'sobre_limite' ? ` · Excepción: supera el límite de ${formatPercent(result.budget_limit_percent)}` : '');
      E.successOrderCode.textContent = result.order_code;
      E.successOrderSummary.textContent = `${service.name} · ${summary}${budgetNote}`;
      S.lastSuccessText = `Pedido ${result.order_code}\nServicio: ${service.name}\nOperario responsable: ${reporter}\nCargado por: ${authenticatedReporterName()}\n${summary}${budgetNote}\nFecha: ${dtf.format(new Date(result.created_at))}`;

      S.draft.clear();
      S.extras = [];
      S.lastBudgetStatus = null;
      E.operatorNotes.value = '';
      E.operatorPriority.value = 'normal';
      renderOperatorMetrics();
      renderOperatorGrid();
      M.orderSuccess.show();
    } catch (error) {
      console.error(error);
      toast(publicCreateErrorMessage(error), 'error');
    } finally {
      buttonBusy(E.operatorSaveButton, false);
    }
  }

  function startAnotherOrder() {
    M.orderSuccess.hide();
    S.publicServiceId = null;
    S.orderReporterName = '';
    E.publicReporterName.value = '';
    E.publicServiceSearch.value = '';
    E.publicServiceSelect.value = '';
    showPublicEntry();
    setTimeout(() => E.publicServiceSearch.focus(), 150);
  }

  function requestServiceSwitch() {
    const hasDraft = S.draft.size > 0 || S.extras.length > 0;
    if (hasDraft && !confirm('Hay un pedido sin enviar. ¿Querés descartarlo y cambiar de servicio?')) return;
    S.draft.clear();
    S.extras = [];
    S.publicServiceId = null;
    showPublicEntry();
  }

  async function openAdminLogin() {
    hideLoginError();
    const { data } = await S.sb.auth.getSession();
    if (data.session) {
      await handleAdminSession(data.session);
      return;
    }
    M.adminLogin.show();
    setTimeout(() => E.loginEmail.focus(), 250);
  }

  async function login(event) {
    event.preventDefault();
    hideLoginError();
    buttonBusy(E.loginButton, true, 'Ingresando...');
    try {
      const { data, error } = await S.sb.auth.signInWithPassword({
        email: E.loginEmail.value.trim(),
        password: E.loginPassword.value
      });
      if (error) throw error;
      await handleAdminSession(data.session);
      M.adminLogin.hide();
      E.loginPassword.value = '';
    } catch (error) {
      console.error(error);
      showLoginError(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : (error.message || 'No se pudo iniciar sesión.'));
    } finally {
      buttonBusy(E.loginButton, false);
    }
  }

  async function handleAdminSession(session) {
    showLoading();
    try {
      const { data: profile, error } = await S.sb.from('profiles').select('*').eq('id', session.user.id).single();
      if (error || !profile) throw new Error('El usuario no tiene perfil. Ejecutá el esquema SQL y revisá el trigger.');
      if (!['admin', 'supplier'].includes(profile.role)) throw new Error('Este acceso es exclusivo para usuarios administrativos o proveedores habilitados.');

      S.session = session;
      S.profile = profile;
      S.mode = 'admin';
      await refreshAdmin(false);
      setupRealtime();
      showAdminApp();
    } catch (error) {
      console.error(error);
      await S.sb.auth.signOut();
      showLoginError(error.message || 'No se pudo abrir la administración.');
      M.adminLogin.show();
    } finally {
      E.loadingScreen.classList.add('d-none');
    }
  }

  async function logout(event) {
    const button = event?.currentTarget || E.logoutButton;
    buttonBusy(button, true, 'Saliendo...');
    try {
      await S.sb.auth.signOut();
    } finally {
      buttonBusy(button, false);
      resetSessionAndShowLogin();
    }
  }

  function resetSessionState() {
    teardownRealtime();
    S.session = null;
    S.profile = null;
    S.mode = 'signed-out';
    S.orders = [];
    S.orderItems = [];
    S.profiles = [];
    S.history = [];
    S.priceHistory = [];
    S.invoices = [];
    S.selectedInvoiceId = null;
    S.invoiceUploadRows = [];
    S.invoiceReadingEditMode = false;
    S.invoiceReadingDraft = [];
    S.invoiceReadingTotalDraft = '';
    S.invoiceLoadError = null;
    S.services = [];
    S.materials = [];
    S.serviceMaterialExclusions = [];
    S.consumptionRows = [];
    S.consumptionServiceRows = [];
    S.consumptionLoadedKey = '';
    S.consumptionLoading = false;
    S.consumptionHistoryContext = null;
    clearPriceImportState();
    S.publicServiceId = null;
    S.orderReporterName = '';
    S.draft.clear();
    S.extras = [];
  }

  function resetSessionAndShowLogin() {
    resetSessionState();
    showLoginGate();
  }

  function showAdminApp() {
    E.loginGateView.classList.add('d-none');
    E.passwordResetView.classList.add('d-none');
    E.authView.classList.add('d-none');
    E.appShell.classList.remove('d-none');
    E.operatorView.classList.add('d-none');
    E.adminView.classList.remove('d-none');
    E.adminMenuButton.classList.remove('d-none');
    E.switchServiceButton.classList.add('d-none');
    E.headerAdminLoginButton.classList.add('d-none');
    E.logoutButton.classList.remove('d-none');
    E.headerUserChip.classList.remove('d-none');
    E.headerUserName.textContent = S.profile?.full_name || S.profile?.email || 'Administrador';
    E.headerUserRole.textContent = ROLE_LABELS[S.profile?.role] || 'Usuario';
    E.appSubtitle.textContent = isSupplier() ? 'Panel proveedor · seguimiento de pedidos' : 'Administración de pedidos';
    applyRolePermissions();
    renderAdmin();
  }

  function applyRolePermissions() {
    const allowed = new Set(allowedTabs());
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      const tab = button.dataset.adminTab;
      const permitted = allowed.has(tab);
      button.classList.toggle('d-none', !permitted);
      if (!permitted) button.classList.remove('active');
      else button.classList.toggle('active', tab === S.tab);
    });

    if (E.historyTypeFilter) {
      const priceOption = E.historyTypeFilter.querySelector('option[value="price"]');
      if (priceOption) priceOption.disabled = !isFullAdmin();
      if (!isFullAdmin() && E.historyTypeFilter.value === 'price') E.historyTypeFilter.value = 'all';
    }

    const masterButtons = [
      E.addMaterialButton, E.importPricesButton, E.addServiceButton, E.saveMaterialButton, E.saveServiceButton,
      E.saveServiceMaterialsButton, E.showAllServiceMaterialsButton, E.hideAllServiceMaterialsButton
    ];
    masterButtons.forEach((button) => { if (button) button.disabled = !canManageMasterData(); });

    if (!allowed.has(S.tab)) S.tab = 'dashboard';
  }

  async function refreshAdmin(feedback = false) {
    if (S.mode !== 'admin' || !canOperateOrders()) return;
    if (feedback) buttonBusy(E.refreshAdminButton, true, 'Actualizando...');

    try {
      const priceHistoryRequest = isFullAdmin()
        ? S.sb.from('material_price_history').select('*').order('changed_at', { ascending: false }).limit(1000)
        : Promise.resolve({ data: [], error: null });
      const invoicesRequest = isFullAdmin()
        ? S.sb.from('supplier_invoices').select('*').order('created_at', { ascending: false }).limit(1000)
        : Promise.resolve({ data: [], error: null });

      const [servicesResult, materialsResult, exclusionsResult, ordersResult, itemsResult, profilesResult, historyResult, priceHistoryResult, invoicesResult] = await Promise.all([
        S.sb.from('services').select('*').order('name'),
        S.sb.from('materials').select('*').order('category').order('sort_order').order('name'),
        S.sb.from('service_material_exclusions').select('service_id,material_id'),
        S.sb.from('orders').select('*').order('created_at', { ascending: false }).limit(1000),
        S.sb.from('order_items').select('*').order('sort_order').order('created_at'),
        S.sb.from('profiles').select('*').order('full_name'),
        S.sb.from('order_status_history').select('*').order('changed_at', { ascending: false }).limit(500),
        priceHistoryRequest,
        invoicesRequest
      ]);

      [servicesResult, materialsResult, exclusionsResult, ordersResult, itemsResult, profilesResult, historyResult, priceHistoryResult]
        .forEach((result) => { if (result.error) throw result.error; });
      S.invoiceLoadError = invoicesResult.error || null;

      S.services = servicesResult.data || [];
      S.materials = materialsResult.data || [];
      S.serviceMaterialExclusions = exclusionsResult.data || [];
      S.orders = ordersResult.data || [];
      S.orderItems = itemsResult.data || [];
      S.profiles = profilesResult.data || [];
      S.history = historyResult.data || [];
      S.priceHistory = priceHistoryResult.data || [];
      S.invoices = invoicesResult.error ? [] : (invoicesResult.data || []);
      S.consumptionLoadedKey = '';

      populateAdminFilters();
      renderAdmin();
      if (feedback) toast('Datos actualizados.', 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudieron actualizar los datos.', 'error');
    } finally {
      if (feedback) buttonBusy(E.refreshAdminButton, false);
    }
  }

  function setupRealtime() {
    teardownRealtime();
    if (!S.sb || S.mode !== 'admin' || !canOperateOrders()) return;
    S.channel = S.sb.channel(`pedidos-admin-${S.profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, scheduleAdminRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, scheduleAdminRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_status_history' }, scheduleAdminRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'materials' }, scheduleAdminRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services' }, scheduleAdminRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'service_material_exclusions' }, scheduleAdminRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleAdminRefresh);
    if (isFullAdmin()) {
      S.channel
        .on('postgres_changes', { event: '*', schema: 'public', table: 'material_price_history' }, scheduleAdminRefresh)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'supplier_invoices' }, scheduleAdminRefresh);
    }
    S.channel.subscribe();
  }

  function teardownRealtime() {
    if (S.channel && S.sb) S.sb.removeChannel(S.channel);
    S.channel = null;
    clearTimeout(S.refreshTimer);
  }

  function scheduleAdminRefresh() {
    clearTimeout(S.refreshTimer);
    S.refreshTimer = setTimeout(() => refreshAdmin(false), 500);
  }

  function populateAdminFilters() {
    const activeValue = E.ordersServiceFilter.value || '';
    const options = '<option value="">Todos los servicios</option>' + S.services
      .map((service) => `<option value="${ea(service.id)}">${eh(service.name)}</option>`)
      .join('');
    E.ordersServiceFilter.innerHTML = options;
    if (S.services.some((service) => service.id === activeValue)) E.ordersServiceFilter.value = activeValue;

    const currentConsumptionService = E.consumptionServiceFilter?.value || '';
    if (E.consumptionServiceFilter) {
      E.consumptionServiceFilter.innerHTML = options;
      if (S.services.some((service) => service.id === currentConsumptionService)) E.consumptionServiceFilter.value = currentConsumptionService;
    }

    const currentUserService = E.userService.value || '';
    E.userService.innerHTML = '<option value="">Sin asignar</option>' + S.services
      .map((service) => `<option value="${ea(service.id)}">${eh(service.name)}</option>`)
      .join('');
    if (S.services.some((service) => service.id === currentUserService)) E.userService.value = currentUserService;
  }

  function switchTab(tab) {
    if (!allowedTabs().includes(tab)) tab = 'dashboard';
    S.tab = tab;
    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.adminTab === tab);
    });
    renderAdmin();
  }

  function renderAdmin() {
    if (S.mode !== 'admin') return;
    if (!allowedTabs().includes(S.tab)) S.tab = 'dashboard';
    applyRolePermissions();
    const panels = {
      dashboard: E.adminDashboard,
      orders: E.adminOrders,
      invoices: E.adminInvoices,
      consumption: E.adminConsumption,
      materials: E.adminMaterials,
      services: E.adminServices,
      users: E.adminUsers,
      history: E.adminHistory
    };
    Object.entries(panels).forEach(([key, panel]) => panel.classList.toggle('d-none', key !== S.tab));

    if (S.tab === 'dashboard') renderDashboard();
    if (S.tab === 'orders') renderOrders();
    if (S.tab === 'invoices') renderInvoices();
    if (S.tab === 'consumption') loadConsumptionReport(false);
    if (S.tab === 'materials') renderMaterials();
    if (S.tab === 'services') renderServices();
    if (S.tab === 'users') renderUsers();
    if (S.tab === 'history') renderHistory();
  }

  function renderDashboard() {
    const today = localDateKey(new Date());
    const open = S.orders.filter((order) => !['entregado', 'cancelado'].includes(order.status));
    E.kpiPending.textContent = String(S.orders.filter((order) => order.status === 'pendiente').length);
    E.kpiUrgent.textContent = String(open.filter((order) => order.priority === 'urgente').length);
    E.kpiToday.textContent = String(S.orders.filter((order) => localDateKey(new Date(order.created_at)) === today).length);
    E.kpiInProgress.textContent = String(S.orders.filter((order) => ['preparacion', 'enviado'].includes(order.status)).length);

    const recent = [...S.orders]
      .sort((a, b) => orderPriorityScore(b) - orderPriorityScore(a) || new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 8);

    E.dashboardRecentOrders.innerHTML = recent.map((order) => {
      const service = serviceById(order.service_id);
      return `<button class="dashboard-order-item text-start w-100" type="button" data-order-open="${ea(order.id)}">
        <div><div class="dashboard-order-title">${eh(order.order_code)} · ${eh(service?.name || 'Servicio')}</div><div class="dashboard-order-meta">${eh(order.reporter_name)} · ${dtf.format(new Date(order.created_at))} · ${order.total_items} insumos · ${formatCurrency(order.total_amount)}</div></div>
        <div class="dashboard-order-side"><span class="priority-badge ${ea(order.priority)}">${eh(PRIORITY_LABELS[order.priority] || order.priority)}</span><span class="status-badge ${ea(order.status)}">${eh(STATUS_LABELS[order.status] || order.status)}</span></div>
      </button>`;
    }).join('') || '<div class="empty-inline">Todavía no hay pedidos registrados.</div>';

    const counts = new Map();
    open.forEach((order) => counts.set(order.service_id, (counts.get(order.service_id) || 0) + 1));
    const activeServices = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    E.dashboardServices.innerHTML = activeServices.map(([serviceId, count]) => {
      const service = serviceById(serviceId);
      const urgent = open.filter((order) => order.service_id === serviceId && order.priority === 'urgente').length;
      return `<div class="priority-item ${urgent ? '' : 'low'}"><div class="priority-item-title">${eh(service?.name || 'Servicio')}</div><div class="priority-item-meta">${count} ${count === 1 ? 'pedido abierto' : 'pedidos abiertos'}${urgent ? ` · ${urgent} urgente${urgent === 1 ? '' : 's'}` : ''}</div></div>`;
    }).join('') || '<div class="empty-inline">No hay pedidos abiertos.</div>';
  }

  function renderOrders() {
    renderOrdersBillingChangeAlert();
    const query = normalize(E.ordersSearch.value);
    const serviceId = E.ordersServiceFilter.value;
    const status = E.ordersStatusFilter.value;
    const priority = E.ordersPriorityFilter.value;

    const filtered = S.orders.filter((order) => {
      const service = serviceById(order.service_id);
      const haystack = normalize(`${order.order_code} ${order.reporter_name} ${service?.name || ''}`);
      return (!query || haystack.includes(query)) &&
        (!serviceId || order.service_id === serviceId) &&
        (!status || order.status === status) &&
        (!priority || order.priority === priority);
    });

    E.ordersTableBody.innerHTML = filtered.map((order) => {
      const service = serviceById(order.service_id);
      return `<tr class="${order.priority === 'urgente' && !['entregado', 'cancelado'].includes(order.status) ? 'order-row-urgent' : ''}">
        <td><div class="order-code">${eh(order.order_code)}</div><div class="order-date">${dtf.format(new Date(order.created_at))}</div></td>
        <td><div class="order-service">${eh(service?.name || 'Servicio eliminado')}</div><div class="table-subtitle">${eh(service?.address || '')}</div></td>
        <td>${eh(order.reporter_name)}</td>
        <td><strong>${order.total_items}</strong> insumos<div class="order-content-summary">${formatQty(order.total_units)} unidades · ${formatCurrency(order.total_amount)}</div>${orderBillingReferenceBadge(order)}${budgetBadge(order)}${orderBudgetMiniProgress(order)}</td>
        <td><span class="priority-badge ${ea(order.priority)}">${eh(PRIORITY_LABELS[order.priority] || order.priority)}</span></td>
        <td><span class="status-badge ${ea(order.status)}">${eh(STATUS_LABELS[order.status] || order.status)}</span></td>
        <td><div class="action-group"><button class="btn btn-outline-primary" type="button" title="Ver pedido" data-order-open="${ea(order.id)}"><i class="bi bi-eye"></i></button><button class="btn btn-outline-secondary" type="button" title="Copiar" data-order-copy="${ea(order.id)}"><i class="bi bi-copy"></i></button>${isFullAdmin() ? `<button class="btn btn-outline-danger" type="button" title="Eliminar" data-order-delete="${ea(order.id)}"><i class="bi bi-trash3"></i></button>` : ''}</div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="7"><div class="empty-inline">No hay pedidos que coincidan con los filtros.</div></td></tr>';
  }

  function openOrder(orderId) {
    const order = S.orders.find((item) => item.id === orderId);
    if (!order) return;
    S.selectedOrderId = orderId;
    resetOrderEditState();
    renderOrderDetail(order);
    M.orderDetail.show();
  }

  function renderOrderDetail(order) {
    const service = serviceById(order.service_id);
    const items = itemsForOrder(order.id);

    E.orderDetailTitle.textContent = order.order_code;
    const creator = S.profiles.find((profile) => profile.id === order.created_by);
    const deliveryMode = order.pickup_at_naon === true
      ? `Retiro en Naón · ${formatPercent(order.discount_percent_snapshot || NAON_DISCOUNT_PERCENT)} aplicado`
      : (order.pickup_at_naon === false ? 'Entrega directa al servicio · sin descuento' : 'Pendiente de definir por Operaciones');
    const detailMeta = [
      ['Servicio', service?.name || 'Servicio eliminado'],
      ['Operario responsable', order.reporter_name],
      ['Cargado por', creator?.full_name || creator?.email || 'Usuario no disponible'],
      ['Fecha', dtf.format(new Date(order.created_at))],
      ['Prioridad', PRIORITY_LABELS[order.priority] || order.priority],
      ['Estado', STATUS_LABELS[order.status] || order.status],
      ['Contenido', `${order.total_items} insumos · ${formatQty(order.total_units)} unidades`],
      ['Modalidad', deliveryMode]
    ];
    if (order.pickup_at_naon === true) {
      detailMeta.push(['Subtotal sin descuento', formatCurrency(order.gross_total_amount || order.total_amount)]);
      detailMeta.push([`Descuento Naón (${formatPercent(order.discount_percent_snapshot || NAON_DISCOUNT_PERCENT)})`, `− ${formatCurrency(order.discount_amount)}`]);
    }
    detailMeta.push(['Total', formatCurrency(order.total_amount)]);
    renderOrderBillingReferenceAlert(order);
    E.orderDetailBudgetOverview.innerHTML = orderBudgetOverview(order);
    E.orderDetailMeta.innerHTML = detailMeta.map(([label, value]) => `<div class="order-meta-card"><div class="order-meta-label">${eh(label)}</div><div class="order-meta-value">${eh(value)}</div></div>`).join('');

    E.orderDetailItems.innerHTML = items.map((item) => {
      const basePrice = orderItemBaseUnitPrice(item);
      const pricingText = order.pickup_at_naon === true
        ? `Precio de lista: ${formatCurrency(basePrice)} · Precio Naón: ${formatCurrency(item.unit_price)}`
        : `Precio unitario: ${formatCurrency(item.unit_price)}`;
      return `
      <div class="order-detail-item">
        <img class="order-detail-thumb" src="${ea(item.image_url || 'assets/materials/default.svg')}" alt="${ea(item.item_name)}" onerror="this.src='assets/materials/default.svg'">
        <div><div class="order-detail-name">${eh(item.item_name)}</div><div class="order-detail-sub">${eh(item.item_sku ? `SKU ${item.item_sku} · ` : '')}${eh(item.category || (item.is_custom ? 'No listado' : 'General'))}${item.notes ? ` · ${eh(item.notes)}` : ''}</div><div class="order-detail-sub">${eh(pricingText)}</div></div>
        <div class="order-detail-qty">${formatQty(item.quantity)}<div class="order-detail-sub">${eh(item.unit || 'unidad')}</div><strong class="order-line-total">${eh(formatCurrency(item.line_total))}</strong></div>
      </div>`;
    }).join('');

    E.orderDetailNotesWrap.classList.toggle('d-none', !order.notes);
    E.orderDetailNotes.textContent = order.notes || '';
    E.orderDetailStatus.value = order.status;

    const closed = ['entregado', 'cancelado'].includes(order.status);
    E.editOrderButton.classList.toggle('d-none', !isFullAdmin() || closed);
    E.editOrderButton.title = closed ? 'Reabrí el pedido antes de modificar sus insumos.' : '';
    setOrderEditMode(false);
  }

  function resetOrderEditState() {
    S.orderEditDraft = [];
    S.orderEditOriginalUpdatedAt = null;
    S.orderEditMode = false;
    S.orderEditPickupAtNaon = true;
    if (E.orderNaonPickupCheckbox) E.orderNaonPickupCheckbox.checked = true;
    if (E.orderEditItems) E.orderEditItems.innerHTML = '';
    if (E.orderAddMaterialSelect) E.orderAddMaterialSelect.innerHTML = '<option value="">Seleccionar insumo...</option>';
    if (E.orderBillingReferenceAlert) {
      E.orderBillingReferenceAlert.innerHTML = '';
      E.orderBillingReferenceAlert.classList.add('d-none');
    }
  }

  function startOrderEdit() {
    if (!isFullAdmin()) {
      toast('Solo el administrador puede modificar el contenido de un pedido.', 'error');
      return;
    }
    const order = getSelectedOrder();
    if (!order) return;
    const billingReferenceState = orderBillingReferenceState(order);
    if (billingReferenceState.needsReview) {
      toast('Primero elegí si este pedido usará la facturación anterior o la nueva.', 'error');
      E.orderBillingReferenceAlert?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    if (['entregado', 'cancelado'].includes(order.status)) {
      toast('El pedido está cerrado. Reabrilo antes de modificar sus insumos.', 'error');
      return;
    }

    S.orderEditDraft = itemsForOrder(order.id).map((item, index) => ({
      key: item.id,
      source_item_id: item.id,
      material_id: item.material_id || null,
      item_name: item.item_name,
      item_sku: item.item_sku || '',
      category: item.category || (item.is_custom ? 'Excepción' : 'General'),
      unit: item.unit || 'unidad',
      quantity: number(item.quantity),
      unit_price: number(item.unit_price),
      list_unit_price: orderItemBaseUnitPrice(item),
      notes: item.notes || '',
      image_url: item.image_url || 'assets/materials/default.svg',
      is_custom: Boolean(item.is_custom),
      sort_order: number(item.sort_order) || ((index + 1) * 10),
      is_new: false
    }));
    S.orderEditOriginalUpdatedAt = order.updated_at;
    S.orderEditPickupAtNaon = order.pickup_at_naon == null ? true : Boolean(order.pickup_at_naon);
    E.orderNaonPickupCheckbox.checked = S.orderEditPickupAtNaon;
    setOrderEditMode(true);
    renderOrderNaonOption();
    renderOrderEditItems();
    renderOrderAddMaterialOptions();
    renderOrderEditSummary();
  }

  function cancelOrderEdit() {
    const order = getSelectedOrder();
    resetOrderEditState();
    if (order) renderOrderDetail(order);
  }

  function setOrderEditMode(enabled) {
    S.orderEditMode = Boolean(enabled);
    E.orderDetailReadOnly.classList.toggle('d-none', enabled);
    E.orderEditPanel.classList.toggle('d-none', !enabled);
    E.orderDetailShareActions.classList.toggle('d-none', enabled);
    E.orderStatusControls.classList.toggle('d-none', enabled);
    E.orderEditControls.classList.toggle('d-none', !enabled);
    E.editOrderButton.classList.toggle('d-none', enabled || !isFullAdmin() || ['entregado', 'cancelado'].includes(getSelectedOrder()?.status));
    E.orderDetailStatus.disabled = enabled;
  }

  function renderOrderEditItems() {
    E.orderEditItems.innerHTML = S.orderEditDraft.map((item) => {
      const basePrice = orderEditBaseUnitPrice(item);
      const effectivePrice = orderEditEffectiveUnitPrice(item);
      const pricingText = S.orderEditPickupAtNaon
        ? `Precio de lista: ${formatCurrency(basePrice)} · Naón −${formatPercent(NAON_DISCOUNT_PERCENT)}: ${formatCurrency(effectivePrice)}`
        : `Precio unitario: ${formatCurrency(basePrice)} · Sin descuento`;
      return `
      <div class="order-edit-item" data-order-edit-row="${ea(item.key)}">
        <img class="order-detail-thumb" src="${ea(item.image_url || 'assets/materials/default.svg')}" alt="${ea(item.item_name)}" onerror="this.src='assets/materials/default.svg'">
        <div class="order-edit-item-info">
          <div class="order-detail-name">${eh(item.item_name)}</div>
          <div class="order-detail-sub">${eh(item.item_sku ? `SKU ${item.item_sku} · ` : '')}${eh(item.category || 'General')} · ${eh(item.unit || 'unidad')}</div>
          <div class="order-detail-sub">${eh(pricingText)}${item.is_new ? ' · Precio actual del catálogo' : ' · Precio base registrado'}</div>
        </div>
        <div class="order-edit-item-actions">
          <div class="order-edit-qty-control">
            <button class="btn btn-outline-secondary" type="button" data-order-edit-action="minus" data-order-edit-key="${ea(item.key)}" aria-label="Restar una unidad"><i class="bi bi-dash-lg"></i></button>
            <input class="form-control order-edit-qty-input" type="number" min="0.01" max="999" step="0.01" value="${ea(formatInputQty(item.quantity))}" data-order-edit-input data-order-edit-key="${ea(item.key)}" aria-label="Cantidad de ${ea(item.item_name)}">
            <button class="btn btn-outline-primary" type="button" data-order-edit-action="plus" data-order-edit-key="${ea(item.key)}" aria-label="Sumar una unidad"><i class="bi bi-plus-lg"></i></button>
          </div>
          <strong class="order-edit-line-total" data-order-edit-line-total>${eh(formatCurrency(roundMoney(number(item.quantity) * effectivePrice)))}</strong>
          <button class="btn btn-outline-danger btn-sm order-edit-remove" type="button" data-order-edit-remove="${ea(item.key)}"><i class="bi bi-trash3 me-1"></i>Quitar</button>
        </div>
      </div>`;
    }).join('') || '<div class="empty-inline border rounded-4">El pedido quedó sin insumos. Agregá al menos uno para poder guardar.</div>';
  }

  function renderOrderAddMaterialOptions() {
    const order = getSelectedOrder();
    if (!order) return;
    const selectedMaterialIds = new Set(S.orderEditDraft.map((item) => item.material_id).filter(Boolean));
    const available = S.materials
      .filter((material) => material.active !== false)
      .filter((material) => !isMaterialHiddenForService(material.id, order.service_id))
      .filter((material) => !selectedMaterialIds.has(material.id))
      .sort(materialSort);

    E.orderAddMaterialSelect.innerHTML = '<option value="">Seleccionar insumo...</option>' + available
      .map((material) => {
        const effectivePrice = S.orderEditPickupAtNaon ? applyNaonDiscount(material.unit_price) : roundMoney(material.unit_price);
        const priceLabel = S.orderEditPickupAtNaon ? ` · Naón ${formatCurrency(effectivePrice)}` : ` · ${formatCurrency(effectivePrice)}`;
        return `<option value="${ea(material.id)}">${eh(material.name)}${material.sku ? ` · SKU ${eh(material.sku)}` : ''}${eh(priceLabel)}</option>`;
      })
      .join('');
    E.orderAddMaterialSelect.disabled = available.length === 0;
    E.addOrderMaterialButton.disabled = available.length === 0;
    E.orderAddMaterialHelp.textContent = available.length
      ? `${available.length} insumos habilitados disponibles para sumar.`
      : 'No quedan insumos habilitados para agregar.';
  }

  function addMaterialToOrderDraft() {
    if (!S.orderEditMode || !isFullAdmin()) return;
    const materialId = E.orderAddMaterialSelect.value;
    if (!materialId) {
      toast('Seleccioná un insumo para agregar.', 'error');
      return;
    }
    const material = S.materials.find((item) => item.id === materialId && item.active !== false);
    const order = getSelectedOrder();
    if (!material || !order || isMaterialHiddenForService(material.id, order.service_id)) {
      toast('Ese insumo no está habilitado para el servicio.', 'error');
      return;
    }

    const duplicate = S.orderEditDraft.find((item) => item.material_id === material.id);
    if (duplicate) {
      duplicate.quantity = clampQty(number(duplicate.quantity) + number(material.suggested_quantity || 1), 0.01);
    } else {
      S.orderEditDraft.push({
        key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        source_item_id: null,
        material_id: material.id,
        item_name: material.name,
        item_sku: material.sku || '',
        category: material.category || 'General',
        unit: material.unit || 'unidad',
        quantity: clampQty(material.suggested_quantity || 1, 0.01),
        unit_price: number(material.unit_price),
        list_unit_price: roundMoney(material.unit_price),
        notes: '',
        image_url: material.image_url || 'assets/materials/default.svg',
        is_custom: false,
        sort_order: (S.orderEditDraft.length + 1) * 10,
        is_new: true
      });
    }

    renderOrderEditItems();
    renderOrderAddMaterialOptions();
    renderOrderEditSummary();
  }

  function changeOrderEditQty(key, delta) {
    if (!S.orderEditMode) return;
    const item = S.orderEditDraft.find((row) => row.key === key);
    if (!item) return;
    const next = Math.round((number(item.quantity) + delta) * 100) / 100;
    if (next <= 0) {
      removeOrderEditItem(key);
      return;
    }
    item.quantity = clampQty(next, 0.01);
    renderOrderEditItems();
    renderOrderEditSummary();
  }

  function updateOrderEditInput(input) {
    if (!S.orderEditMode) return;
    const item = S.orderEditDraft.find((row) => row.key === input.dataset.orderEditKey);
    if (!item) return;
    item.quantity = input.value === '' ? 0 : clampQty(input.value, 0);
    const row = input.closest('[data-order-edit-row]');
    const lineTotal = row?.querySelector('[data-order-edit-line-total]');
    if (lineTotal) lineTotal.textContent = formatCurrency(roundMoney(number(item.quantity) * orderEditEffectiveUnitPrice(item)));
    input.classList.toggle('is-invalid', number(item.quantity) <= 0 || number(item.quantity) > 999);
    renderOrderEditSummary();
  }

  function removeOrderEditItem(key) {
    if (!S.orderEditMode) return;
    S.orderEditDraft = S.orderEditDraft.filter((item) => item.key !== key);
    renderOrderEditItems();
    renderOrderAddMaterialOptions();
    renderOrderEditSummary();
  }

  function handleOrderNaonPickupChange() {
    if (!S.orderEditMode || !isFullAdmin()) return;
    S.orderEditPickupAtNaon = Boolean(E.orderNaonPickupCheckbox.checked);
    renderOrderNaonOption();
    renderOrderEditItems();
    renderOrderAddMaterialOptions();
    renderOrderEditSummary();
  }

  function renderOrderNaonOption() {
    if (!E.orderNaonPickupBadge || !E.orderNaonPickupHelp) return;
    E.orderNaonPickupBadge.textContent = S.orderEditPickupAtNaon ? `${formatPercent(NAON_DISCOUNT_PERCENT)} aplicado` : 'Sin descuento';
    E.orderNaonPickupBadge.classList.toggle('is-active', S.orderEditPickupAtNaon);
    E.orderNaonPickupHelp.textContent = S.orderEditPickupAtNaon
      ? 'El proveedor deja el pedido en Naón. Se descuenta el 7% en cada precio unitario.'
      : 'El proveedor entrega directamente en el servicio. Se mantienen los precios de lista.';
  }

  function orderItemBaseUnitPrice(item) {
    return item?.list_unit_price == null ? roundMoney(item?.unit_price) : roundMoney(item.list_unit_price);
  }

  function orderEditBaseUnitPrice(item) {
    return item?.list_unit_price == null ? roundMoney(item?.unit_price) : roundMoney(item.list_unit_price);
  }

  function applyNaonDiscount(value) {
    return roundMoney(roundMoney(value) * (1 - NAON_DISCOUNT_PERCENT / 100));
  }

  function orderEditEffectiveUnitPrice(item) {
    const basePrice = orderEditBaseUnitPrice(item);
    return S.orderEditPickupAtNaon ? applyNaonDiscount(basePrice) : basePrice;
  }

  function orderEditMetrics(order) {
    const validItems = S.orderEditDraft.filter((item) => number(item.quantity) > 0);
    const totalUnits = validItems.reduce((sum, item) => sum + number(item.quantity), 0);
    const grossTotalAmount = roundMoney(validItems.reduce((sum, item) => sum + roundMoney(number(item.quantity) * orderEditBaseUnitPrice(item)), 0));
    const totalAmount = roundMoney(validItems.reduce((sum, item) => sum + roundMoney(number(item.quantity) * orderEditEffectiveUnitPrice(item)), 0));
    const discountAmount = roundMoney(Math.max(0, grossTotalAmount - totalAmount));
    const billing = number(order?.monthly_billing_snapshot);
    const limitAmount = number(order?.budget_limit_amount_snapshot);
    const sevenAmount = number(order?.budget_seven_percent_snapshot);
    const status = billing <= 0 ? 'sin_configurar' : (totalAmount > sevenAmount ? 'sobre_7' : (totalAmount > limitAmount ? 'sobre_limite' : 'dentro'));
    const differenceToSeven = roundMoney(sevenAmount - totalAmount);
    const usagePercent = sevenAmount > 0 ? totalAmount / sevenAmount * 100 : 0;
    return { totalItems: validItems.length, totalUnits, grossTotalAmount, totalAmount, discountAmount, billing, limitAmount, sevenAmount, status, differenceToSeven, usagePercent };
  }

  function renderOrderEditSummary() {
    const order = getSelectedOrder();
    if (!order) return;
    const metrics = orderEditMetrics(order);
    const statusClass = metrics.status === 'sobre_7' ? 'danger' : (metrics.status === 'sobre_limite' ? 'warning' : (metrics.status === 'dentro' ? 'success' : 'muted'));
    const differenceText = metrics.status === 'sin_configurar'
      ? 'El servicio no tiene facturación mensual configurada.'
      : (metrics.differenceToSeven >= 0
        ? `Margen hasta el 7%: ${formatCurrency(metrics.differenceToSeven)}`
        : `Exceso sobre el 7%: ${formatCurrency(Math.abs(metrics.differenceToSeven))}`);
    const progress = Math.max(0, Math.min(100, metrics.usagePercent));

    E.orderEditBudgetSummary.className = `order-edit-budget-summary is-${statusClass}`;
    E.orderEditBudgetSummary.innerHTML = `
      <div class="order-edit-budget-head">
        <div><div class="order-meta-label">Total ajustado</div><div class="order-edit-total">${eh(formatCurrency(metrics.totalAmount))}</div></div>
        <span class="order-edit-status-pill">${eh(budgetStatusText(metrics.status))}</span>
      </div>
      <div class="order-edit-price-breakdown">
        <span>Subtotal sin descuento: <strong>${eh(formatCurrency(metrics.grossTotalAmount))}</strong></span>
        <span class="${S.orderEditPickupAtNaon ? 'is-discount' : ''}">${S.orderEditPickupAtNaon ? `Descuento Naón (${formatPercent(NAON_DISCOUNT_PERCENT)}): <strong>− ${eh(formatCurrency(metrics.discountAmount))}</strong>` : 'Entrega al servicio: <strong>sin descuento</strong>'}</span>
      </div>
      <div class="order-edit-budget-grid">
        <div><span>Contenido</span><strong>${metrics.totalItems} insumos · ${eh(formatQty(metrics.totalUnits))} unidades</strong></div>
        <div><span>Límite configurado</span><strong>${metrics.billing > 0 ? `${eh(formatCurrency(metrics.limitAmount))} (${eh(formatPercent(order.budget_limit_percent_snapshot))})` : 'Sin configurar'}</strong></div>
        <div><span>Referencia máxima 7%</span><strong>${metrics.billing > 0 ? eh(formatCurrency(metrics.sevenAmount)) : 'Sin configurar'}</strong></div>
        <div class="order-edit-difference"><span>Resultado</span><strong>${eh(differenceText)}</strong></div>
      </div>
      ${metrics.billing > 0 ? `<div class="order-edit-progress" role="progressbar" aria-label="Uso de la referencia máxima del 7%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.max(0, Math.min(100, metrics.usagePercent)))}"><span style="width:${progress.toFixed(2)}%"></span>${budgetLimitMarker(order)}</div><div class="order-detail-sub mt-1">El pedido utiliza ${eh(formatPercent(metrics.usagePercent))} de la referencia del 7%. La marca vertical indica el límite operativo de ${eh(formatPercent(order.budget_limit_percent_snapshot))}.</div>` : ''}`;
  }

  async function saveOrderChanges() {
    if (!isFullAdmin() || !S.orderEditMode) {
      toast('No tenés permisos para modificar pedidos.', 'error');
      return;
    }
    const order = getSelectedOrder();
    if (!order) return;
    if (S.orderEditDraft.length < 1) {
      toast('El pedido debe conservar al menos un insumo.', 'error');
      return;
    }
    if (S.orderEditDraft.some((item) => number(item.quantity) <= 0 || number(item.quantity) > 999)) {
      toast('Revisá las cantidades. Deben ser mayores a 0 y no superar 999.', 'error');
      return;
    }

    const metrics = orderEditMetrics(order);
    if (metrics.status === 'sobre_7') {
      const accepted = confirm(`El pedido seguirá superando el 7% por ${formatCurrency(Math.abs(metrics.differenceToSeven))}. ¿Guardar igualmente?`);
      if (!accepted) return;
    } else if (metrics.status === 'sobre_limite') {
      const overLimit = Math.max(0, metrics.totalAmount - metrics.limitAmount);
      const accepted = confirm(`El pedido superará el límite configurado por ${formatCurrency(overLimit)}, aunque seguirá debajo del 7%. ¿Guardar igualmente?`);
      if (!accepted) return;
    }

    buttonBusy(E.saveOrderChangesButton, true, 'Guardando cambios...');
    try {
      const payload = S.orderEditDraft.map((item) => ({
        source_item_id: item.source_item_id || null,
        material_id: item.material_id || null,
        quantity: number(item.quantity)
      }));
      const { error } = await S.sb.rpc('admin_replace_order_items', {
        p_order_id: order.id,
        p_expected_updated_at: S.orderEditOriginalUpdatedAt,
        p_items: payload,
        p_pickup_at_naon: S.orderEditPickupAtNaon
      });
      if (error) throw error;

      const orderId = order.id;
      resetOrderEditState();
      await refreshAdmin(false);
      const updatedOrder = S.orders.find((item) => item.id === orderId);
      if (updatedOrder) {
        S.selectedOrderId = orderId;
        renderOrderDetail(updatedOrder);
      }
      toast('Pedido actualizado y totales recalculados.', 'success');
    } catch (error) {
      console.error(error);
      const message = String(error?.message || '');
      if (message.includes('modificado por otro usuario')) {
        toast('El pedido cambió mientras lo editabas. Actualizá y volvé a revisar.', 'error');
      } else if (message.includes('admin_replace_order_items') || message.includes('schema cache')) {
        toast('Falta ejecutar actualizar-descuento-naon.sql en Supabase.', 'error');
      } else {
        toast(message || 'No se pudieron guardar los cambios.', 'error');
      }
    } finally {
      buttonBusy(E.saveOrderChangesButton, false);
    }
  }

  async function saveSelectedOrderStatus() {
    if (!canOperateOrders()) { toast('No tenés permisos para cambiar estados.', 'error'); return; }
    const order = getSelectedOrder();
    if (!order) return;
    const nextStatus = E.orderDetailStatus.value;
    if (nextStatus === order.status) {
      M.orderDetail.hide();
      return;
    }

    buttonBusy(E.saveOrderStatusButton, true, 'Guardando...');
    try {
      const { error } = await S.sb.rpc('staff_update_order_status', {
        p_order_id: order.id,
        p_status: nextStatus,
        p_notes: null
      });
      if (error) throw error;
      M.orderDetail.hide();
      await refreshAdmin(false);
      toast('Estado actualizado.', 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudo actualizar el estado.', 'error');
    } finally {
      buttonBusy(E.saveOrderStatusButton, false);
    }
  }

  async function deleteOrder(orderId) {
    if (!isFullAdmin()) { toast('El proveedor no puede eliminar pedidos.', 'error'); return; }
    const order = S.orders.find((item) => item.id === orderId);
    if (!order || !confirm(`¿Eliminar definitivamente el pedido ${order.order_code}? Esta acción no se puede deshacer.`)) return;
    try {
      const { error } = await S.sb.from('orders').delete().eq('id', orderId);
      if (error) throw error;
      await refreshAdmin(false);
      toast('Pedido eliminado.', 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudo eliminar el pedido.', 'error');
    }
  }

  function buildOrderText(order) {
    const service = serviceById(order.service_id);
    const items = itemsForOrder(order.id);
    const lines = [
      `PEDIDO ${order.order_code}`,
      `Servicio: ${service?.name || 'Servicio'}`,
      service?.address ? `Dirección: ${service.address}` : null,
      `Operario responsable: ${order.reporter_name}`,
      `Fecha: ${dtf.format(new Date(order.created_at))}`,
      `Prioridad: ${PRIORITY_LABELS[order.priority] || order.priority}`,
      `Estado: ${STATUS_LABELS[order.status] || order.status}`,
      `Modalidad: ${order.pickup_at_naon === true ? `Retiro en Naón (${formatPercent(order.discount_percent_snapshot || NAON_DISCOUNT_PERCENT)} de descuento)` : (order.pickup_at_naon === false ? 'Entrega directa al servicio (sin descuento)' : 'Pendiente de definir')}`,
      '',
      'INSUMOS:'
    ].filter((line) => line !== null);

    items.forEach((item) => {
      const sku = item.item_sku ? ` [SKU ${item.item_sku}]` : '';
      const basePrice = orderItemBaseUnitPrice(item);
      const priceInfo = order.pickup_at_naon === true ? `${formatCurrency(basePrice)} lista → ${formatCurrency(item.unit_price)} Naón` : `${formatCurrency(item.unit_price)} c/u`;
      lines.push(`• ${formatQty(item.quantity)} ${item.unit || 'unidad'} — ${item.item_name}${sku} · ${priceInfo} · ${formatCurrency(item.line_total)}${item.notes ? ` (${item.notes})` : ''}`);
    });
    if (order.pickup_at_naon === true) {
      lines.push('', `SUBTOTAL SIN DESCUENTO: ${formatCurrency(order.gross_total_amount || order.total_amount)}`);
      lines.push(`DESCUENTO NAÓN (${formatPercent(order.discount_percent_snapshot || NAON_DISCOUNT_PERCENT)}): − ${formatCurrency(order.discount_amount)}`);
    }
    lines.push('', `TOTAL: ${formatCurrency(order.total_amount)}`);
    if (number(order.monthly_billing_snapshot) > 0) {
      lines.push(`Tope ${formatPercent(order.budget_limit_percent_snapshot)}: ${formatCurrency(order.budget_limit_amount_snapshot)}`);
      lines.push(`Control: ${budgetStatusText(order.budget_status)}`);
    } else {
      lines.push('Control: facturación no configurada');
    }
    if (order.notes) lines.push('', `Observación: ${order.notes}`);
    return lines.join('\n');
  }


  // ---------------------------------------------------------------------------
  // Control de facturas de proveedor
  // ---------------------------------------------------------------------------

  const INVOICE_BUCKET = 'supplier-invoices';
  const INVOICE_MAX_FILE_SIZE = 20 * 1024 * 1024;
  const INVOICE_MATCH_THRESHOLD = 50;
  const INVOICE_MONEY_TOLERANCE_PERCENT = 0.5;

  const INVOICE_STATUS_LABELS = {
    pendiente: 'Pendiente',
    coincide: 'Coincide',
    diferencias: 'Con diferencias',
    parcial: 'Comparación parcial',
    sin_match: 'Sin pedido vinculado',
    sin_lectura: 'Sin lectura de texto'
  };

  function invoiceById(id) {
    return S.invoices.find((item) => item.id === id) || null;
  }

  function invoiceStatusClass(status) {
    return ({
      coincide: 'success',
      diferencias: 'danger',
      parcial: 'warning',
      sin_match: 'secondary',
      sin_lectura: 'dark',
      pendiente: 'info'
    })[status] || 'secondary';
  }

  function invoiceMethodLabel(method) {
    return method === 'manual' ? 'Vinculación manual' : (method === 'automatico' ? 'Vinculación automática' : 'Sin vincular');
  }

  async function refreshInvoicesData() {
    buttonBusy(E.refreshInvoicesButton, true, 'Actualizando...');
    try {
      await refreshAdmin(false);
      renderInvoices();
      toast('Facturas actualizadas.', 'success');
    } finally {
      buttonBusy(E.refreshInvoicesButton, false);
    }
  }

  function effectiveInvoiceStatus(invoice) {
    const order = S.orders.find((item) => item.id === invoice.matched_order_id);
    return order ? compareInvoiceAgainstOrder(invoice, order).status : invoice.comparison_status;
  }

  function renderInvoices() {
    if (!isFullAdmin() || !E.invoiceTableBody) return;
    if (S.invoiceLoadError) showInvoiceModuleError(invoiceModuleErrorMessage(S.invoiceLoadError));
    else hideInvoiceModuleError();
    const query = normalize(E.invoiceSearch?.value || '');
    const status = E.invoiceStatusFilter?.value || '';
    const statusById = new Map(S.invoices.map((invoice) => [invoice.id, effectiveInvoiceStatus(invoice)]));
    const filtered = S.invoices.filter((invoice) => {
      const order = S.orders.find((item) => item.id === invoice.matched_order_id);
      const service = order ? serviceById(order.service_id) : null;
      const haystack = normalize(`${invoice.invoice_number || ''} ${invoice.file_name || ''} ${invoice.supplier_name || ''} ${invoice.supplier_tax_id || ''} ${order?.order_code || ''} ${service?.name || ''}`);
      return (!query || haystack.includes(query)) && (!status || statusById.get(invoice.id) === status);
    });

    const total = S.invoices.length;
    const ok = S.invoices.filter((item) => statusById.get(item.id) === 'coincide').length;
    const differences = S.invoices.filter((item) => ['diferencias', 'parcial'].includes(statusById.get(item.id))).length;
    const unmatched = S.invoices.filter((item) => ['sin_match', 'sin_lectura', 'pendiente'].includes(statusById.get(item.id))).length;
    E.invoiceKpiTotal.textContent = String(total);
    E.invoiceKpiOk.textContent = String(ok);
    E.invoiceKpiDifferences.textContent = String(differences);
    E.invoiceKpiUnmatched.textContent = String(unmatched);
    E.invoiceResultsCaption.textContent = `${filtered.length} ${filtered.length === 1 ? 'factura' : 'facturas'}`;

    E.invoiceTableBody.innerHTML = filtered.map((invoice) => {
      const order = S.orders.find((item) => item.id === invoice.matched_order_id);
      const service = order ? serviceById(order.service_id) : null;
      const score = Math.max(0, Math.min(100, number(invoice.match_score)));
      const effectiveStatus = statusById.get(invoice.id) || invoice.comparison_status;
      const invoiceTitle = invoice.invoice_number ? `Factura ${invoice.invoice_number}` : invoice.file_name;
      const supplier = invoice.supplier_name || 'Proveedor no identificado';
      const invoiceDate = invoice.invoice_date ? new Intl.DateTimeFormat('es-AR').format(new Date(`${invoice.invoice_date}T12:00:00`)) : 'Fecha no detectada';
      const amount = invoice.total_amount == null ? 'Importe no detectado' : formatCurrency(invoice.total_amount);
      return `<tr class="invoice-row ${invoice.reviewed ? 'is-reviewed' : ''}">
        <td><div class="order-code">${eh(invoiceTitle)}</div><div class="order-date">${eh(invoice.file_name)}</div></td>
        <td><div class="order-service">${eh(supplier)}</div><div class="table-subtitle">${eh(invoiceDate)}${invoice.supplier_tax_id ? ` · CUIT ${eh(invoice.supplier_tax_id)}` : ''}</div></td>
        <td><strong>${eh(amount)}</strong><div class="table-subtitle">${number(invoice.pdf_page_count)} ${number(invoice.pdf_page_count) === 1 ? 'página' : 'páginas'}</div></td>
        <td>${order ? `<div class="order-code">${eh(order.order_code)}</div><div class="table-subtitle">${eh(service?.name || 'Servicio eliminado')}</div>` : '<span class="text-secondary">Sin vincular</span>'}</td>
        <td><div class="invoice-confidence"><strong>${Math.round(score)}%</strong><div class="invoice-confidence-track"><span style="width:${score}%"></span></div><small>${eh(invoiceMethodLabel(invoice.match_method))}</small></div></td>
        <td><span class="badge text-bg-${invoiceStatusClass(effectiveStatus)}">${eh(INVOICE_STATUS_LABELS[effectiveStatus] || effectiveStatus)}</span></td>
        <td>${invoice.reviewed ? '<span class="invoice-reviewed"><i class="bi bi-check2-circle"></i> Revisada</span>' : '<span class="text-secondary">Pendiente</span>'}</td>
        <td><div class="action-group"><button class="btn btn-outline-primary" type="button" title="Ver control" data-invoice-open="${ea(invoice.id)}"><i class="bi bi-eye"></i></button><button class="btn btn-outline-danger" type="button" title="Eliminar factura" data-invoice-delete="${ea(invoice.id)}"><i class="bi bi-trash3"></i></button></div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="8"><div class="empty-inline">No hay facturas que coincidan con los filtros.</div></td></tr>';
  }

  function showInvoiceModuleError(message) {
    if (!E.invoiceModuleError) return;
    E.invoiceModuleError.textContent = message;
    E.invoiceModuleError.classList.remove('d-none');
  }

  function hideInvoiceModuleError() {
    if (!E.invoiceModuleError) return;
    E.invoiceModuleError.textContent = '';
    E.invoiceModuleError.classList.add('d-none');
  }

  function invoiceModuleErrorMessage(error) {
    const message = String(error?.message || '');
    if (message.includes('supplier_invoices') || message.includes('supplier-invoices') || message.includes('schema cache') || String(error?.code || '').includes('PGRST')) {
      return 'El módulo de facturas todavía no está instalado en Supabase. Ejecutá actualizar-control-facturas-proveedor.sql y volvé a intentar.';
    }
    return message || 'No se pudo procesar la factura.';
  }

  async function processInvoiceFiles(fileList) {
    if (!isFullAdmin()) {
      toast('Solo el administrador puede cargar facturas.', 'error');
      return;
    }
    hideInvoiceModuleError();
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const invalid = files.find((file) => !String(file.name || '').toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf');
    if (invalid) {
      showInvoiceModuleError(`El archivo ${invalid.name} no es un PDF válido.`);
      return;
    }
    const oversized = files.find((file) => file.size > INVOICE_MAX_FILE_SIZE);
    if (oversized) {
      showInvoiceModuleError(`El archivo ${oversized.name} supera el máximo de 20 MB.`);
      return;
    }

    S.invoiceUploadRows = files.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      name: file.name,
      status: 'queued',
      message: 'En espera'
    }));
    renderInvoiceUploadQueue();

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const row = S.invoiceUploadRows[index];
      let storagePath = null;
      try {
        row.status = 'reading';
        row.message = 'Preparando factura...';
        renderInvoiceUploadQueue();

        const buffer = await file.arrayBuffer();
        const fileHash = await sha256Hex(buffer);
        const duplicate = S.invoices.find((item) => item.file_hash && item.file_hash === fileHash);
        if (duplicate) throw new Error(`Esta factura ya fue cargada como ${duplicate.invoice_number || duplicate.file_name}.`);

        // La factura se guarda primero en Storage. El analizador del servidor lee el PDF
        // directamente desde allí, evitando límites de tamaño y problemas de OCR del navegador.
        row.message = 'Guardando PDF privado...';
        renderInvoiceUploadQueue();
        const objectId = window.crypto?.randomUUID ? window.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        storagePath = `${new Date().getFullYear()}/${objectId}-${sanitizeStorageFileName(file.name)}`;
        const { error: uploadError } = await S.sb.storage.from(INVOICE_BUCKET).upload(storagePath, file, {
          contentType: 'application/pdf',
          upsert: false,
          cacheControl: '3600'
        });
        if (uploadError) throw uploadError;

        const analyzed = await analyzeInvoicePdf(buffer.slice(0), file.name, {
          forceOcr: false,
          storagePath,
          onProgress: (message) => {
            row.status = 'reading';
            row.message = message;
            renderInvoiceUploadQueue();
          }
        });
        const extracted = analyzed.extracted;
        const parsed = analyzed.parsed;
        row.message = analyzed.method === 'ia_pdf' ? 'Comparando lectura inteligente...' : (analyzed.method === 'ocr' ? 'Comparando lectura OCR...' : 'Analizando factura...');
        renderInvoiceUploadQueue();

        const match = findBestInvoiceOrderMatch(parsed, extracted.text);
        const selectedOrder = match.order || null;
        const comparison = selectedOrder
          ? compareInvoiceAgainstOrder(parsed, selectedOrder)
          : emptyInvoiceComparison(extracted.text.trim() ? 'sin_match' : 'sin_lectura');
        applyInvoiceExtractionMeta(comparison, analyzed);
        const comparisonStatus = selectedOrder ? comparison.status : (extracted.text.trim() ? 'sin_match' : 'sin_lectura');

        const payload = {
          file_name: file.name,
          storage_path: storagePath,
          file_size: file.size,
          file_hash: fileHash,
          pdf_page_count: extracted.pageCount,
          extracted_text: extracted.text.slice(0, 250000),
          invoice_number: parsed.invoiceNumber || null,
          invoice_date: parsed.invoiceDate || null,
          supplier_name: parsed.supplierName || null,
          supplier_tax_id: parsed.supplierTaxId || null,
          currency: parsed.currency || 'ARS',
          subtotal: parsed.subtotal,
          tax_amount: parsed.taxAmount,
          total_amount: parsed.totalAmount,
          parsed_items: parsed.items,
          unmatched_lines: parsed.unmatchedLines,
          matched_order_id: selectedOrder?.id || null,
          match_score: match.score,
          match_method: selectedOrder ? 'automatico' : 'sin_match',
          match_candidates: match.candidates,
          comparison_status: comparisonStatus,
          comparison_summary: comparison,
          created_by: S.profile.id
        };

        const { data: inserted, error: insertError } = await S.sb.from('supplier_invoices').insert(payload).select('*').single();
        if (insertError) throw insertError;
        storagePath = null; // ya quedó asociado a la factura guardada
        S.invoices.unshift(inserted);
        row.status = 'done';
        row.message = selectedOrder
          ? `${selectedOrder.order_code} · ${INVOICE_STATUS_LABELS[comparisonStatus]}`
          : INVOICE_STATUS_LABELS[comparisonStatus];
      } catch (error) {
        console.error(error);
        if (storagePath) {
          try { await S.sb.storage.from(INVOICE_BUCKET).remove([storagePath]); } catch (_) { /* no-op */ }
        }
        row.status = 'error';
        row.message = invoiceModuleErrorMessage(error);
      }
      renderInvoiceUploadQueue();
    }

    E.invoicePdfInput.value = '';
    renderInvoices();
    const successful = S.invoiceUploadRows.filter((item) => item.status === 'done').length;
    if (successful) toast(`${successful} ${successful === 1 ? 'factura procesada' : 'facturas procesadas'}.`, 'success');
  }

  function renderInvoiceUploadQueue() {
    if (!E.invoiceUploadQueue) return;
    E.invoiceUploadQueue.classList.toggle('d-none', !S.invoiceUploadRows.length);
    E.invoiceUploadQueue.innerHTML = S.invoiceUploadRows.map((row) => {
      const icon = row.status === 'done' ? 'bi-check2-circle' : (row.status === 'error' ? 'bi-exclamation-triangle' : (row.status === 'reading' ? 'bi-arrow-repeat invoice-spin' : 'bi-clock'));
      return `<div class="invoice-upload-row is-${ea(row.status)}"><i class="bi ${icon}"></i><div><strong>${eh(row.name)}</strong><span>${eh(row.message)}</span></div></div>`;
    }).join('');
  }

  async function sha256Hex(buffer) {
    if (!window.crypto?.subtle) return null;
    const digest = await window.crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function analyzeInvoicePdf(buffer, fileName, options = {}) {
    const { forceOcr = false, onProgress = null, storagePath = null } = options;
    let pdf = null;
    let embedded = { text: '', lines: [], pageCount: 0, confidence: null };
    let parsed = parseSupplierInvoice('', [], fileName);
    let quality = 0;
    let embeddedError = null;

    // 1) Si el PDF tiene texto real, se usa primero porque es inmediato y no consume IA.
    if (window.pdfjsLib) {
      try {
        const task = window.pdfjsLib.getDocument({ data: new Uint8Array(buffer), disableFontFace: false });
        pdf = await task.promise;
        if (onProgress) onProgress('Leyendo texto incorporado al PDF...');
        embedded = await extractEmbeddedPdfTextFromDocument(pdf);
        parsed = parseSupplierInvoice(embedded.text, embedded.lines, fileName);
        quality = invoiceParseQuality(parsed, embedded.text);
        if (!forceOcr && !invoiceExtractionNeedsOcr(embedded, parsed, quality)) {
          parsed.extractionMethod = 'texto_pdf';
          parsed.extractionConfidence = null;
          parsed.parseQuality = quality;
          return { extracted: embedded, parsed, method: 'texto_pdf', confidence: null, quality, pageCount: embedded.pageCount };
        }
      } catch (error) {
        embeddedError = error;
        console.warn('No se pudo leer la capa de texto del PDF:', error);
      }
    }

    // 2) Para PDFs escaneados o tablas difíciles se usa análisis multimodal en el servidor.
    // Esto evita depender del OCR del navegador y funciona con facturas de distintos formatos.
    if (storagePath) {
      try {
        if (onProgress) onProgress('Leyendo factura escaneada con análisis inteligente...');
        const ai = await analyzeInvoiceWithServerAi(storagePath, fileName, onProgress);
        const aiParsed = normalizeAiInvoiceParse(ai, fileName);
        const rawText = buildAiInvoiceText(aiParsed, ai);
        const aiExtracted = {
          text: rawText,
          lines: rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
          pageCount: number(ai.pageCount) || number(embedded.pageCount) || number(pdf?.numPages) || 0,
          confidence: nullableNumber(ai.confidence)
        };
        const aiQuality = invoiceParseQuality(aiParsed, aiExtracted.text);
        aiParsed.extractionMethod = 'ia_pdf';
        aiParsed.extractionConfidence = aiExtracted.confidence;
        aiParsed.parseQuality = aiQuality;
        return {
          extracted: aiExtracted,
          parsed: aiParsed,
          method: 'ia_pdf',
          confidence: aiExtracted.confidence,
          quality: aiQuality,
          pageCount: aiExtracted.pageCount
        };
      } catch (aiError) {
        console.warn('Falló el analizador inteligente de facturas:', aiError);

        // 3) Respaldo: conservar el OCR local existente si el navegador logra iniciarlo.
        if (pdf) {
          try {
            if (onProgress) onProgress('El análisis inteligente no respondió. Intentando OCR local...');
            const ocr = await extractPdfTextWithOcr(pdf, onProgress);
            const ocrParsed = parseSupplierInvoice(ocr.text, ocr.lines, fileName);
            const ocrQuality = invoiceParseQuality(ocrParsed, ocr.text);
            ocrParsed.extractionMethod = 'ocr';
            ocrParsed.extractionConfidence = ocr.confidence;
            ocrParsed.parseQuality = ocrQuality;
            return { extracted: ocr, parsed: mergeInvoiceParses(ocrParsed, parsed), method: 'ocr', confidence: ocr.confidence, quality: ocrQuality, pageCount: ocr.pageCount };
          } catch (ocrError) {
            console.warn('También falló el OCR local:', ocrError);
            const aiMessage = invoiceAiErrorMessage(aiError);
            const ocrMessage = String(ocrError?.message || 'OCR local no disponible');
            throw new Error(`${aiMessage} Respaldo OCR: ${ocrMessage}`);
          }
        }
        throw new Error(invoiceAiErrorMessage(aiError));
      } finally {
        try { if (pdf) await pdf.destroy(); } catch (_) { /* no-op */ }
      }
    }

    try { if (pdf) await pdf.destroy(); } catch (_) { /* no-op */ }
    if (embedded.text.trim()) {
      parsed.extractionMethod = 'texto_pdf';
      parsed.extractionConfidence = null;
      parsed.parseQuality = quality;
      return { extracted: embedded, parsed, method: 'texto_pdf', confidence: null, quality, pageCount: embedded.pageCount };
    }
    throw embeddedError || new Error('El PDF no contiene texto legible y no se pudo iniciar el analizador de facturas.');
  }

  async function analyzeInvoiceWithServerAi(storagePath, fileName, onProgress) {
    if (!S.session?.access_token) throw new Error('La sesión venció. Volvé a iniciar sesión.');
    if (!storagePath) throw new Error('No se encontró el PDF almacenado para analizar.');
    if (onProgress) onProgress('Analizando estructura, artículos, SKU e importes...');

    const knownMaterials = S.materials
      .filter((material) => material?.sku)
      .slice(0, 1500)
      .map((material) => ({
        sku: String(material.sku),
        name: String(material.name || ''),
        unitPrice: number(material.unit_price)
      }));

    const response = await fetch(`${String(cfg.SUPABASE_URL).replace(/\/$/, '')}/functions/v1/${INVOICE_AI_FUNCTION}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${S.session.access_token}`,
        'apikey': cfg.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        bucket: INVOICE_BUCKET,
        storagePath,
        fileName,
        knownMaterials
      })
    });

    let payload = null;
    try { payload = await response.json(); } catch (_) { /* no-op */ }
    if (!response.ok || !payload?.ok) {
      const message = payload?.error || payload?.message || `El servidor devolvió ${response.status}.`;
      const error = new Error(message);
      error.status = response.status;
      error.code = payload?.code || null;
      throw error;
    }
    return payload.data || {};
  }

  function invoiceAiErrorMessage(error) {
    const status = number(error?.status);
    const code = String(error?.code || '');
    const message = String(error?.message || '');
    if (status === 404 || /function|not found/i.test(message)) {
      return 'El lector inteligente todavía no está publicado en Supabase. Desplegá la función analyze-invoice incluida en esta actualización.';
    }
    if (code === 'GEMINI_KEY_MISSING' || /GEMINI_API_KEY/i.test(message)) {
      return 'Falta configurar GEMINI_API_KEY en Supabase Edge Functions. Una vez cargada la clave, la app podrá leer PDFs escaneados.';
    }
    if (status === 401) return 'La sesión no está autorizada para analizar facturas. Cerrá sesión e ingresá nuevamente como administrador.';
    if (status === 403) return 'Solo el administrador puede ejecutar el análisis de facturas.';
    return `No se pudo leer la factura con el analizador inteligente: ${message || 'error desconocido'}.`;
  }

  function normalizeAiInvoiceParse(ai, fileName = '') {
    const normalizeMoney = (value) => nullableNumber(value);
    const invoiceDateRaw = String(ai.invoiceDate || '').trim();
    const invoiceDate = /^\d{4}-\d{2}-\d{2}$/.test(invoiceDateRaw) ? invoiceDateRaw : parseInvoiceDateToIso(invoiceDateRaw);
    const items = Array.isArray(ai.items) ? ai.items.map((item) => ({
      sku: String(item?.sku || '').trim(),
      description: String(item?.description || item?.name || '').trim(),
      quantity: normalizeMoney(item?.quantity),
      unit_price: normalizeMoney(item?.unitPrice ?? item?.unit_price),
      line_total: normalizeMoney(item?.lineTotal ?? item?.line_total),
      raw_line: String(item?.rawLine || item?.raw_line || '').slice(0, 500),
      context: String(item?.context || '').slice(0, 800)
    })).filter((item) => item.sku || item.description) : [];

    return {
      invoiceNumber: String(ai.invoiceNumber || '').trim() || extractInvoiceNumber(String(ai.rawText || ''), fileName),
      invoiceDate: invoiceDate || extractInvoiceDate(String(ai.rawText || '')),
      supplierTaxId: String(ai.supplierTaxId || '').trim() || extractTaxId(String(ai.rawText || '')),
      supplierName: String(ai.supplierName || '').trim() || null,
      currency: String(ai.currency || 'ARS').toUpperCase() === 'USD' ? 'USD' : 'ARS',
      subtotal: normalizeMoney(ai.subtotal),
      taxAmount: normalizeMoney(ai.taxAmount),
      totalAmount: normalizeMoney(ai.totalAmount),
      items,
      unmatchedLines: Array.isArray(ai.unmatchedLines) ? ai.unmatchedLines.map((line) => String(line)).slice(0, 100) : [],
      detectedSkus: items.map((item) => normalizeSku(item.sku)).filter(Boolean)
    };
  }

  function buildAiInvoiceText(parsed, ai = {}) {
    const parts = [];
    const raw = String(ai.rawText || '').trim();
    if (raw) parts.push(raw);
    if (parsed.invoiceNumber) parts.push(`Factura: ${parsed.invoiceNumber}`);
    if (parsed.invoiceDate) parts.push(`Fecha: ${parsed.invoiceDate}`);
    if (parsed.supplierName) parts.push(`Proveedor: ${parsed.supplierName}`);
    if (parsed.supplierTaxId) parts.push(`CUIT: ${parsed.supplierTaxId}`);
    (parsed.items || []).forEach((item) => {
      parts.push([item.sku, item.quantity, item.description, item.unit_price, item.line_total].filter((value) => value !== null && value !== undefined && value !== '').join(' | '));
    });
    if (parsed.subtotal != null) parts.push(`Subtotal: ${parsed.subtotal}`);
    if (parsed.taxAmount != null) parts.push(`Impuestos: ${parsed.taxAmount}`);
    if (parsed.totalAmount != null) parts.push(`Total: ${parsed.totalAmount}`);
    return [...new Set(parts.filter(Boolean))].join('\n').trim();
  }

  async function extractEmbeddedPdfTextFromDocument(pdf) {
    const allLines = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ normalizeWhitespace: true });
      const pageLines = groupPdfTextItemsIntoLines(content.items || []);
      pageLines.forEach((line) => allLines.push(line));
      if (pageNumber < pdf.numPages) allLines.push('');
    }
    const text = allLines.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n').trim();
    return { text, lines: allLines.filter((line) => String(line).trim()), pageCount: pdf.numPages, confidence: null };
  }

  function invoiceExtractionNeedsOcr(extracted, parsed, quality) {
    const text = String(extracted?.text || '').trim();
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    const structuredItems = items.filter((item) => item.quantity != null && (item.unit_price != null || item.line_total != null));
    if (text.length < 120) return true;
    if (parsed?.totalAmount == null && !structuredItems.length) return true;
    if (!items.length && quality < 45) return true;
    return quality < 30;
  }

  function invoiceParseQuality(parsed, text) {
    let score = 0;
    if (parsed?.invoiceNumber) score += 12;
    if (parsed?.invoiceDate) score += 7;
    if (parsed?.supplierName) score += 5;
    if (parsed?.supplierTaxId) score += 5;
    if (parsed?.totalAmount != null) score += 25;
    if (parsed?.subtotal != null) score += 5;
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    items.forEach((item) => {
      score += 3;
      if (item.sku) score += 2;
      if (item.quantity != null) score += 2;
      if (item.unit_price != null) score += 2;
      if (item.line_total != null) score += 3;
    });
    score += Math.min(8, String(text || '').trim().length / 250);
    return Math.round(Math.min(100, score));
  }

  function mergeInvoiceParses(primary, fallback) {
    const result = { ...primary };
    ['invoiceNumber','invoiceDate','supplierTaxId','supplierName','currency','subtotal','taxAmount','totalAmount'].forEach((key) => {
      if (result[key] == null || result[key] === '') result[key] = fallback?.[key] ?? result[key];
    });
    if ((!Array.isArray(result.items) || !result.items.length) && Array.isArray(fallback?.items)) result.items = fallback.items;
    if ((!Array.isArray(result.unmatchedLines) || !result.unmatchedLines.length) && Array.isArray(fallback?.unmatchedLines)) result.unmatchedLines = fallback.unmatchedLines;
    result.detectedSkus = (result.items || []).map((item) => normalizeSku(item.sku)).filter(Boolean);
    return result;
  }

  function withOcrTimeout(promise, timeoutMs, message) {
    let timer;
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]).finally(() => window.clearTimeout(timer));
  }

  function loadOcrScript(src) {
    return new Promise((resolve, reject) => {
      const existing = [...document.scripts].find((script) => script.src === src);
      if (existing && window.Tesseract?.createWorker) return resolve();
      const script = existing || document.createElement('script');
      if (!existing) {
        script.src = src;
        script.async = true;
        script.crossOrigin = 'anonymous';
        document.head.appendChild(script);
      }
      const timer = window.setTimeout(() => reject(new Error(`Tiempo agotado al cargar ${src}`)), 25000);
      script.addEventListener('load', () => { window.clearTimeout(timer); resolve(); }, { once: true });
      script.addEventListener('error', () => { window.clearTimeout(timer); reject(new Error(`No se pudo cargar ${src}`)); }, { once: true });
    });
  }

  async function ensureTesseractLoaded() {
    if (window.Tesseract?.createWorker) return window.Tesseract;
    const sources = [
      'https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js',
      'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
    ];
    let lastError = null;
    for (const source of sources) {
      try {
        await loadOcrScript(source);
        if (window.Tesseract?.createWorker) return window.Tesseract;
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(`No se pudo iniciar el motor OCR desde ninguno de los servidores disponibles.${lastError?.message ? ` ${lastError.message}` : ''}`);
  }

  async function getInvoiceOcrWorker() {
    const TesseractApi = await ensureTesseractLoaded();
    if (!S.invoiceOcrWorkerPromise) {
      // Se usa inglés porque reconoce correctamente letras latinas, SKU y números y
      // evita descargar dos modelos pesados. Las descripciones en español no son
      // necesarias para el cruce principal, que se realiza por SKU.
      const logger = (message) => {
        if (typeof S.invoiceOcrLogger === 'function') S.invoiceOcrLogger(message || {});
      };
      const attempts = [
        { logger },
        { logger, workerPath: 'https://unpkg.com/tesseract.js@5.1.1/dist/worker.min.js' },
        { logger, workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js' }
      ];
      S.invoiceOcrWorkerPromise = (async () => {
        let lastError = null;
        for (const options of attempts) {
          try {
            const worker = await withOcrTimeout(
              TesseractApi.createWorker('eng', 1, options),
              70000,
              'El motor OCR tardó demasiado en inicializarse.'
            );
            await worker.setParameters({
              tessedit_pageseg_mode: '6',
              preserve_interword_spaces: '1',
              user_defined_dpi: '240'
            });
            return worker;
          } catch (error) {
            lastError = error;
          }
        }
        throw lastError || new Error('No se pudo crear el motor OCR.');
      })().catch((error) => {
        S.invoiceOcrWorkerPromise = null;
        throw error;
      });
    }
    return S.invoiceOcrWorkerPromise;
  }

  async function extractPdfTextWithOcr(pdf, onProgress) {
    S.invoiceOcrTotalPages = pdf.numPages;
    S.invoiceOcrCurrentPage = 0;
    S.invoiceOcrLogger = (message) => {
      if (!onProgress) return;
      const status = String(message.status || '').toLowerCase();
      const progress = Number.isFinite(message.progress) ? Math.round(message.progress * 100) : null;
      if (status.includes('recognizing')) {
        onProgress(`OCR página ${S.invoiceOcrCurrentPage}/${S.invoiceOcrTotalPages}${progress == null ? '' : ` · ${progress}%`}`);
      } else if (status.includes('loading language') || status.includes('initializing')) {
        onProgress('Preparando reconocimiento de texto...');
      }
    };

    const worker = await getInvoiceOcrWorker();
    const pageBlocks = [];
    let confidenceSum = 0;
    let confidenceCount = 0;
    try {
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        S.invoiceOcrCurrentPage = pageNumber;
        if (onProgress) onProgress(`Renderizando página ${pageNumber}/${pdf.numPages} para OCR...`);
        const page = await pdf.getPage(pageNumber);
        const canvas = await renderPdfPageForOcr(page);
        const result = await withOcrTimeout(
          worker.recognize(canvas),
          150000,
          `La lectura OCR de la página ${pageNumber} tardó demasiado.`
        );
        const pageText = normalizeOcrInvoiceText(result?.data?.text || '');
        const pageLines = pageText.split(/\r?\n/).map((line) => line.replace(/\s+/g, ' ').trim()).filter(Boolean);
        const normalizedPage = normalize(pageText);
        const remitoOnly = /documento\s+no\s+valido\s+como\s+factura/.test(normalizedPage) && /remito/.test(normalizedPage);
        pageBlocks.push({ pageNumber, text: pageText, lines: pageLines, remitoOnly });
        const pageConfidence = Number(result?.data?.confidence);
        if (Number.isFinite(pageConfidence)) {
          confidenceSum += pageConfidence;
          confidenceCount += 1;
        }
        canvas.width = 1;
        canvas.height = 1;
      }
    } finally {
      S.invoiceOcrLogger = null;
      S.invoiceOcrCurrentPage = 0;
      S.invoiceOcrTotalPages = 0;
    }
    const hasInvoicePage = pageBlocks.some((block) => !block.remitoOnly);
    const selectedBlocks = hasInvoicePage ? pageBlocks.filter((block) => !block.remitoOnly) : pageBlocks;
    const allLines = [];
    selectedBlocks.forEach((block, index) => {
      block.lines.forEach((line) => allLines.push(line));
      if (index < selectedBlocks.length - 1) allLines.push('');
    });
    const text = allLines.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{4,}/g, '\n\n').trim();
    if (!text) throw new Error('El OCR terminó, pero no detectó texto. Probá nuevamente o verificá que el PDF no esté protegido.');
    return {
      text,
      lines: allLines.filter((line) => String(line).trim()),
      pageCount: pdf.numPages,
      confidence: confidenceCount ? Math.round(confidenceSum / confidenceCount) : null
    };
  }

  async function renderPdfPageForOcr(page) {
    const base = page.getViewport({ scale: 1 });
    const maxDimension = 3000;
    const scale = Math.max(1.6, Math.min(2.5, maxDimension / Math.max(base.width, base.height)));
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport, background: '#ffffff' }).promise;
    return canvas;
  }

  function normalizeOcrInvoiceText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[“”]/g, '"')
      .replace(/[’`]/g, "'")
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .trim();
  }

  function applyInvoiceExtractionMeta(comparison, analyzed) {
    if (!comparison || !analyzed) return comparison;
    comparison.extraction_method = analyzed.method || null;
    comparison.extraction_confidence = analyzed.confidence == null ? null : number(analyzed.confidence);
    comparison.parse_quality = analyzed.quality == null ? null : number(analyzed.quality);
    comparison.ocr_used = analyzed.method === 'ocr';
    return comparison;
  }

  function groupPdfTextItemsIntoLines(items) {
    const rows = [];
    items.forEach((item) => {
      const text = String(item.str || '').trim();
      if (!text) return;
      const x = number(item.transform?.[4]);
      const y = number(item.transform?.[5]);
      let row = rows.find((candidate) => Math.abs(candidate.y - y) <= 2.5);
      if (!row) {
        row = { y, parts: [] };
        rows.push(row);
      }
      row.parts.push({ x, text });
    });
    return rows
      .sort((a, b) => b.y - a.y)
      .map((row) => row.parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
  }

  function parseSupplierInvoice(text, lines, fileName = '') {
    const cleanText = String(text || '').replace(/\u00a0/g, ' ');
    const invoiceNumber = extractInvoiceNumber(cleanText, fileName);
    const invoiceDate = extractInvoiceDate(cleanText);
    const supplierTaxId = extractTaxId(cleanText);
    const supplierName = extractSupplierName(lines, supplierTaxId);
    const totals = extractInvoiceTotals(cleanText, lines);
    const itemResult = extractInvoiceItems(lines, cleanText);
    return {
      invoiceNumber,
      invoiceDate,
      supplierTaxId,
      supplierName,
      currency: /\bUSD\b|U\$S|D[ÓO]LAR/i.test(cleanText) ? 'USD' : 'ARS',
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      totalAmount: totals.total,
      items: itemResult.items,
      unmatchedLines: itemResult.unmatchedLines,
      detectedSkus: itemResult.items.map((item) => normalizeSku(item.sku)).filter(Boolean)
    };
  }

  function extractInvoiceNumber(text, fileName = '') {
    const patterns = [
      /(?:factura|comprobante)\s*(?:electr[oó]nica)?\s*(?:n[º°o.]|nro\.?|n[uú]mero|#)?\s*[:\-]?\s*([A-Z]?\s*\d{1,5}\s*[-–]\s*\d{4,12})/i,
      /(?:factura\s*)?(?:n[º°o.]|nro\.?)\s*([0-9][0-9\s]{2,7})\s*[-–]\s*(\d{6,12})/i,
      /\b([ABCEMT])\s+(\d{4,5}\s*[-–]\s*\d{6,12})\b/i
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      if (match.length >= 3 && /^\d[\d\s]+$/.test(String(match[1] || '').trim())) {
        const point = String(match[1]).replace(/\D/g, '').padStart(4, '0').slice(-5);
        const numberPart = String(match[2]).replace(/\D/g, '').padStart(8, '0');
        return `${point}-${numberPart}`;
      }
      const raw = match[2] ? `${match[1]} ${match[2]}` : match[1];
      return String(raw).replace(/\s+/g, '').replace('–', '-');
    }

    const fileMatch = String(fileName || '').match(/(?:FAC(?:TURA)?[^0-9]*)?(\d{3,5})\s*[-_]\s*(\d{6,12})/i);
    if (fileMatch) return `${fileMatch[1].padStart(4, '0')}-${fileMatch[2].padStart(8, '0')}`;
    return null;
  }

  function extractInvoiceDate(text) {
    const patterns = [
      /(?:fecha\s+de\s+emisi[oó]n|fecha\s+emisi[oó]n|fecha)\s*[:\-]?\s*(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})/i,
      /(?:fecha\s+de\s+emisi[oó]n|fecha\s+emisi[oó]n|fecha)\s*[:\-]?\s*(\d{4}-\d{2}-\d{2})/i,
      /\b(\d{1,2}[\/]\d{1,2}[\/]\d{4})\b/
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (!match) continue;
      const iso = parseInvoiceDateToIso(match[1]);
      if (iso) return iso;
    }
    return null;
  }

  function parseInvoiceDateToIso(value) {
    const parts = String(value || '').trim().split(/[\/\-.]/).map(Number);
    if (parts.length !== 3) return null;
    let [day, month, year] = parts;
    if (parts[0] > 1900) [year, month, day] = parts;
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  function extractTaxId(text) {
    const match = text.match(/(?:CUIT|C\.U\.I\.T\.?|CUIL)\s*(?:N[°ºO]\.?\s*)?[:\-]?\s*(\d{2})\s*[- ]?\s*(\d{8})\s*[- ]?\s*(\d)/i);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
  }

  function extractSupplierName(lines, taxId) {
    const candidates = (lines || []).slice(0, 24).map((line) => String(line || '').trim()).filter(Boolean);
    const blocked = /factura|original|duplicado|triplicado|cuit|ingresos brutos|inicio de actividades|fecha|cliente|señor|domicilio|iva|responsable|condici[oó]n de venta|punto de venta/i;
    const taxDigits = String(taxId || '').replace(/\D/g, '');
    const best = candidates
      .filter((line) => line.length >= 4 && line.length <= 100)
      .filter((line) => !blocked.test(line))
      .filter((line) => !taxDigits || !line.replace(/\D/g, '').includes(taxDigits))
      .map((line, index) => ({ line, score: supplierNameScore(line, index) }))
      .sort((a, b) => b.score - a.score)[0];
    return best?.score > 0 ? cleanSupplierName(best.line) : null;
  }

  function cleanSupplierName(value) {
    let text = String(value || '').replace(/^[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9]+/, '').replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ0-9.)]+$/, '').trim();
    text = text.replace(/\s+/g, ' ');
    return text || null;
  }

  function supplierNameScore(line, index) {
    let score = Math.max(0, 25 - index);
    if (/[A-ZÁÉÍÓÚÑ]{3,}/.test(line)) score += 12;
    if (/\b(SA|S\s*[.,]?\s*A\s*[.,]?|SRL|S\s*[.,]?\s*R\s*[.,]?\s*L\s*[.,]?|SAS|SOCIEDAD|COOPERATIVA)\b/i.test(line)) score += 25;
    if (/\d{4,}/.test(line)) score -= 15;
    if (/\$|%/.test(line)) score -= 20;
    return score;
  }

  function extractInvoiceTotals(text, lines) {
    const candidates = [];
    (lines || []).forEach((line, index) => {
      const normalizedLine = normalize(line);
      const numbers = extractLocalizedNumbers(line).filter((item) => item.value >= 0);
      if (!numbers.length) return;
      const value = numbers[numbers.length - 1].value;
      let kind = null;
      let score = index / Math.max(1, lines.length) * 10;
      if (/\btotal\s+(?:a\s+pagar|final|factura|comprobante)\b/.test(normalizedLine)) { kind = 'total'; score += 100; }
      else if (/\bimporte\s+total\b/.test(normalizedLine)) { kind = 'total'; score += 95; }
      else if (/^\s*total\b/.test(normalizedLine) && !/subtotal/.test(normalizedLine)) { kind = 'total'; score += 85; }
      else if (/\bsubtotal\b/.test(normalizedLine)) { kind = 'subtotal'; score += 70; }
      else if ((/\biva\b|impuesto/.test(normalizedLine)) && !/responsable|cuit|cuil/.test(normalizedLine) && (/%|importe|monto|\biva\s+\d/.test(normalizedLine))) { kind = 'tax'; score += 55; }
      if (kind) candidates.push({ kind, value, score, line });
    });

    const totalCandidate = candidates.filter((item) => item.kind === 'total').sort((a, b) => b.score - a.score || b.value - a.value)[0];
    const subtotalCandidate = candidates.filter((item) => item.kind === 'subtotal').sort((a, b) => b.score - a.score)[0];
    const taxValues = candidates
      .filter((item) => item.kind === 'tax' && item.value > 0)
      .map((item) => roundMoney(item.value));
    const uniqueTaxValues = [...new Set(taxValues.map((value) => value.toFixed(2)))].map(Number);
    const taxAmount = uniqueTaxValues.length ? roundMoney(uniqueTaxValues.reduce((sum, value) => sum + value, 0)) : null;

    const total = totalCandidate?.value ?? null;
    return {
      subtotal: subtotalCandidate?.value ?? null,
      taxAmount,
      total
    };
  }

  function extractInvoiceItems(lines, fullText) {
    const known = new Map();
    S.materials.forEach((material) => {
      const sku = normalizeSku(material.sku);
      if (sku) known.set(sku, { sku: material.sku, name: material.name, unitPrice: number(material.unit_price) });
    });
    S.orderItems.forEach((item) => {
      const sku = normalizeSku(item.item_sku);
      if (sku && !known.has(sku)) known.set(sku, { sku: item.item_sku, name: item.item_name, unitPrice: number(item.unit_price) });
    });

    const found = [];
    const usedLineIndexes = new Set();
    (lines || []).forEach((line, index) => {
      const compactLine = normalizeSku(line);
      if (!compactLine) return;
      const matchedSku = matchKnownSkuInInvoiceLine(line, compactLine, known);
      if (!matchedSku) return;
      const { normalizedSku, meta, detectedToken, fuzzy, similarity } = matchedSku;
      const contextLines = [lines[index - 1], line, lines[index + 1]].filter(Boolean);
      const context = contextLines.join(' ');
      const values = extractLocalizedNumbers(line, detectedToken || normalizedSku);
      const inferred = inferInvoiceLineValues(values, meta.unitPrice);
      found.push({
        sku: meta.sku,
        description: meta.name || extractInvoiceItemDescription(line, detectedToken || meta.sku, meta.name),
        quantity: inferred.quantity,
        unit_price: inferred.unitPrice,
        line_total: inferred.lineTotal,
        raw_line: String(line).slice(0, 500),
        context: context.slice(0, 800),
        ocr_sku_detected: fuzzy ? detectedToken : null,
        ocr_sku_similarity: fuzzy ? roundMoney(similarity * 100) : 100
      });
      usedLineIndexes.add(index);
    });

    // También detecta líneas con un SKU nuevo o desconocido para señalar artículos extra.
    (lines || []).forEach((line, index) => {
      if (usedLineIndexes.has(index)) return;
      const generic = extractGenericInvoiceItemLine(line, known);
      if (!generic) return;
      found.push(generic);
      usedLineIndexes.add(index);
    });

    const deduped = [];
    const bySku = new Map();
    found.forEach((item) => {
      const key = normalizeSku(item.sku);
      if (!bySku.has(key)) {
        bySku.set(key, item);
        deduped.push(item);
      } else {
        const existing = bySku.get(key);
        if ((item.quantity != null ? 1 : 0) + (item.line_total != null ? 1 : 0) > (existing.quantity != null ? 1 : 0) + (existing.line_total != null ? 1 : 0)) {
          Object.assign(existing, item);
        }
      }
    });

    // Cuando el PDF parte un SKU con espacios o guiones, buscarlo también sobre todo el texto compactado.
    const compactText = normalizeSku(fullText);
    known.forEach((meta, sku) => {
      if (deduped.some((item) => normalizeSku(item.sku) === sku)) return;
      if (sku.length >= 6 && compactText.includes(sku)) {
        deduped.push({ sku: meta.sku, description: meta.name, quantity: null, unit_price: null, line_total: null, raw_line: 'SKU detectado en el PDF sin línea estructurada' });
      }
    });

    const unmatchedLines = (lines || [])
      .map((line, index) => ({ line, index }))
      .filter((item) => !usedLineIndexes.has(item.index))
      .filter((item) => /\$|\d+[.,]\d{2}/.test(item.line) && item.line.length < 500)
      .slice(0, 100)
      .map((item) => item.line);
    return { items: deduped, unmatchedLines };
  }

  function matchKnownSkuInInvoiceLine(line, compactLine, known) {
    const exact = [...known.entries()]
      .filter(([sku]) => sku.length >= 4 && compactLine.includes(sku))
      .sort((a, b) => b[0].length - a[0].length)[0];
    if (exact) return { normalizedSku: exact[0], meta: exact[1], detectedToken: exact[0], fuzzy: false, similarity: 1 };

    const rawTokens = String(line || '').trim().split(/\s+/).slice(0, 3);
    const candidates = rawTokens
      .map((token) => normalizeSku(token))
      .filter((token) => token.length >= 6 && token.length <= 36 && /[A-Z]/.test(token) && /\d/.test(token));
    if (!candidates.length) return null;

    let best = null;
    let second = null;
    for (const candidate of candidates) {
      for (const [sku, meta] of known.entries()) {
        if (sku.length < 6 || Math.abs(sku.length - candidate.length) > 2) continue;
        const distance = levenshteinDistance(candidate, sku, 3);
        const maxDistance = Math.max(candidate.length, sku.length) >= 13 ? 2 : 1;
        if (distance > maxDistance) continue;
        const similarity = 1 - distance / Math.max(candidate.length, sku.length);
        const result = { normalizedSku: sku, meta, detectedToken: candidate, fuzzy: true, similarity, distance };
        if (!best || similarity > best.similarity) {
          second = best;
          best = result;
        } else if (!second || similarity > second.similarity) {
          second = result;
        }
      }
    }
    if (!best || best.similarity < 0.88) return null;
    if (second && second.normalizedSku !== best.normalizedSku && Math.abs(best.similarity - second.similarity) < 0.025) return null;
    return best;
  }

  function levenshteinDistance(a, b, stopAfter = Infinity) {
    const left = String(a || '');
    const right = String(b || '');
    if (left === right) return 0;
    if (!left.length) return right.length;
    if (!right.length) return left.length;
    if (Math.abs(left.length - right.length) > stopAfter) return stopAfter + 1;
    let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
      const current = [i];
      let rowMin = current[0];
      for (let j = 1; j <= right.length; j += 1) {
        const cost = left[i - 1] === right[j - 1] ? 0 : 1;
        const value = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
        current[j] = value;
        rowMin = Math.min(rowMin, value);
      }
      if (rowMin > stopAfter) return stopAfter + 1;
      previous = current;
    }
    return previous[right.length];
  }

  function extractGenericInvoiceItemLine(line, known = new Map()) {
    const text = String(line || '').trim();
    if (text.length < 8 || text.length > 500) return null;
    if (/\b(total|subtotal|iva|impuesto|factura|cuit|cuil|fecha|vencimiento|cae|remito|pedido|orden|importe|neto|exento|percepcion|percepción)\b/i.test(text)) return null;
    const tokens = text.split(/\s+/).slice(0, 7);
    const skuToken = tokens.find((token, index) => {
      if (index > 1) return false;
      const cleaned = token.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9._\/-]+$/g, '');
      const compact = normalizeSku(cleaned);
      const alphaNumericSku = compact.length >= 4 && compact.length <= 30 && /[A-Z]/.test(compact) && /\d/.test(compact);
      const numericSku = /^\d{6,18}$/.test(compact) && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(text.replace(cleaned, ''));
      return alphaNumericSku || numericSku;
    });
    if (!skuToken) return null;
    const sku = skuToken.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9._\/-]+$/g, '');
    const compactSku = normalizeSku(sku);
    const closeKnownSku = [...known.keys()].some((knownSku) => {
      if (Math.abs(knownSku.length - compactSku.length) > 2) return false;
      const distance = levenshteinDistance(compactSku, knownSku, 3);
      return distance <= (Math.max(compactSku.length, knownSku.length) >= 13 ? 2 : 1);
    });
    if (closeKnownSku) return null;
    const values = extractLocalizedNumbers(text, compactSku);
    if (values.length < 2) return null;
    const inferred = inferInvoiceLineValues(values, 0);
    if (inferred.lineTotal == null) return null;
    const description = extractInvoiceItemDescription(text, sku, sku);
    return {
      sku,
      description: description || sku,
      quantity: inferred.quantity,
      unit_price: inferred.unitPrice,
      line_total: inferred.lineTotal,
      raw_line: text.slice(0, 500),
      context: text.slice(0, 800),
      unknown_sku: true
    };
  }

  function extractInvoiceItemDescription(line, sku, fallback) {
    let value = String(line || '');
    const skuPattern = String(sku || '').split('').map((char) => /[a-z0-9]/i.test(char) ? `${char}[\\s\\-_.]*` : '').join('');
    if (skuPattern) value = value.replace(new RegExp(skuPattern, 'i'), ' ');
    value = value.replace(/(?:\$\s*)?[-+]?\d[\d.,]*/g, ' ').replace(/\s+/g, ' ').trim();
    return value.length >= 3 ? value.slice(0, 180) : fallback;
  }

  function inferInvoiceLineValues(values, catalogPrice) {
    const nums = values.map((item) => item.value).filter((value) => value >= 0 && Number.isFinite(value));
    if (nums.length >= 3) {
      const quantity = nums[0];
      const unitPrice = nums[nums.length - 2];
      const lineTotal = nums[nums.length - 1];
      const relationError = Math.abs(quantity * unitPrice - lineTotal) / Math.max(1, lineTotal);
      if (quantity > 0 && quantity <= 9999 && unitPrice >= 0 && lineTotal >= 0 && relationError <= 0.035) {
        return { quantity, unitPrice, lineTotal };
      }
    }
    let best = null;
    for (let i = 0; i < nums.length; i += 1) {
      for (let j = i + 1; j < nums.length; j += 1) {
        for (let k = j + 1; k < nums.length; k += 1) {
          const quantity = nums[i];
          const unitPrice = nums[j];
          const lineTotal = nums[k];
          if (quantity <= 0 || quantity > 9999 || unitPrice < 0 || lineTotal < 0) continue;
          const relationError = Math.abs(quantity * unitPrice - lineTotal) / Math.max(1, lineTotal);
          let score = relationError * 100;
          if (catalogPrice > 0) score += Math.abs(unitPrice - catalogPrice) / catalogPrice * 12;
          if (!best || score < best.score) best = { quantity, unitPrice, lineTotal, score };
        }
      }
    }
    if (best && best.score <= 15) return { quantity: best.quantity, unitPrice: best.unitPrice, lineTotal: best.lineTotal };

    if (nums.length >= 2) {
      const lineTotal = nums[nums.length - 1];
      const quantityCandidates = nums.slice(0, -1).filter((value) => value > 0 && value <= 9999);
      let quantity = quantityCandidates[0] ?? null;
      if (catalogPrice > 0 && lineTotal > 0) {
        const inferredQty = lineTotal / catalogPrice;
        const nearest = quantityCandidates.sort((a, b) => Math.abs(a - inferredQty) - Math.abs(b - inferredQty))[0];
        if (nearest != null) quantity = nearest;
      }
      const unitPrice = quantity ? roundMoney(lineTotal / quantity) : (nums.length >= 3 ? nums[nums.length - 2] : null);
      return { quantity, unitPrice, lineTotal };
    }
    return { quantity: null, unitPrice: null, lineTotal: nums.length ? nums[0] : null };
  }

  function extractLocalizedNumbers(text, skuToIgnore = '') {
    let value = String(text || '');
    const compactSku = normalizeSku(skuToIgnore);
    if (compactSku) {
      const chars = compactSku.split('').map((char) => `${escapeRegExp(char)}[\\s\\-_.!|/\\\\]*`).join('');
      value = value.replace(new RegExp(chars, 'ig'), ' ');
    }
    const matches = value.match(/(?:\$|AR\$|U\$S)?\s*-?(?:\d{1,3}(?:\.\d{3})+,\d{1,4}|\d+,\d{1,4}|\d{1,3}(?:\.\d{3})+|\d+\.\d{1,4}|\d+)/gi) || [];
    return matches.map((raw) => ({ raw, value: parseLocalizedNumber(raw) })).filter((item) => Number.isFinite(item.value));
  }

  function parseLocalizedNumber(raw) {
    let value = String(raw || '').replace(/[^0-9,.-]/g, '').trim();
    if (!value) return NaN;
    const lastComma = value.lastIndexOf(',');
    const lastDot = value.lastIndexOf('.');
    if (lastComma >= 0 && lastDot >= 0) {
      if (lastComma > lastDot) value = value.replace(/\./g, '').replace(',', '.');
      else value = value.replace(/,/g, '');
    } else if (lastComma >= 0) {
      const decimals = value.length - lastComma - 1;
      value = decimals >= 1 && decimals <= 4 ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '');
    } else if (lastDot >= 0) {
      const decimals = value.length - lastDot - 1;
      const dotCount = (value.match(/\./g) || []).length;
      if (dotCount > 1 || decimals === 3) value = value.replace(/\./g, '');
    }
    return Number(value);
  }

  function normalizeSku(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function sanitizeStorageFileName(value) {
    const cleaned = String(value || 'factura.pdf').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-');
    return cleaned.slice(-140) || 'factura.pdf';
  }

  function findBestInvoiceOrderMatch(parsed, rawText) {
    const candidates = S.orders
      .filter((order) => order.status !== 'cancelado')
      .map((order) => scoreInvoiceOrderCandidate(parsed, rawText, order))
      .sort((a, b) => b.score - a.score || new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);
    const best = candidates[0];
    const second = candidates[1];
    const hasPrintedReference = Boolean(best?.reasons?.some((reason) => reason.includes('pedido')));
    const hasClearLead = !second || best.score - second.score >= 8;
    const reliable = best && best.score >= INVOICE_MATCH_THRESHOLD && (hasPrintedReference || hasClearLead);
    return {
      order: reliable ? S.orders.find((item) => item.id === best.order_id) || null : null,
      score: reliable ? best.score : (best?.score || 0),
      candidates
    };
  }

  function scoreInvoiceOrderCandidate(parsed, rawText, order) {
    const service = serviceById(order.service_id);
    const orderItems = itemsForOrder(order.id);
    const rawNormalized = normalize(rawText);
    const rawCompact = normalizeSku(rawText);
    const orderCodeCompact = normalizeSku(order.order_code);
    const orderDigits = String(order.order_code || '').replace(/\D/g, '').replace(/^0+/, '');
    let score = 0;
    const reasons = [];

    if (orderCodeCompact && rawCompact.includes(orderCodeCompact)) {
      score += 80;
      reasons.push('Número de pedido exacto');
    } else if (orderDigits.length >= 3 && new RegExp(`(?:pedido|orden|oc|referencia)[^\\d]{0,15}0*${escapeRegExp(orderDigits)}\\b`, 'i').test(rawText)) {
      score += 45;
      reasons.push('Referencia numérica del pedido');
    }

    const invoiceSkus = new Set((parsed.items || []).map((item) => normalizeSku(item.sku)).filter(Boolean));
    const orderSkus = new Set(orderItems.map((item) => normalizeSku(item.item_sku)).filter(Boolean));
    const skuMatches = [...orderSkus].filter((sku) => invoiceSkus.has(sku)).length;
    const skuCoverage = orderSkus.size ? skuMatches / orderSkus.size : 0;
    if (skuMatches) {
      score += Math.min(55, 20 + skuCoverage * 35);
      reasons.push(`${skuMatches} SKU coincidente${skuMatches === 1 ? '' : 's'}`);
    }

    if ((parsed.totalAmount != null || parsed.subtotal != null) && number(order.total_amount) > 0) {
      const comparable = selectInvoiceComparableAmount(parsed, order.total_amount);
      const diffPercent = comparable.value == null ? 100 : Math.abs(number(comparable.value) - number(order.total_amount)) / Math.max(1, number(order.total_amount)) * 100;
      const basisLabel = comparable.basis === 'subtotal' ? 'subtotal' : 'total';
      if (diffPercent <= 0.5) { score += 30; reasons.push(`Importe ${basisLabel} prácticamente exacto`); }
      else if (diffPercent <= 3) { score += 20; reasons.push(`Importe ${basisLabel} cercano`); }
      else if (diffPercent <= 10) { score += 8; reasons.push(`Importe ${basisLabel} aproximado`); }
      else score -= Math.min(20, diffPercent / 3);
    }

    if (parsed.invoiceDate && order.created_at) {
      const invoiceDate = new Date(`${parsed.invoiceDate}T12:00:00`);
      const days = Math.abs(invoiceDate - new Date(order.created_at)) / 86400000;
      if (days <= 7) { score += 10; reasons.push('Fecha cercana'); }
      else if (days <= 30) score += 5;
      else if (days > 180) score -= 10;
    }

    const serviceName = normalize(service?.name || '');
    const serviceAddress = normalize(service?.address || '');
    if (serviceName.length >= 4 && rawNormalized.includes(serviceName)) { score += 12; reasons.push('Servicio mencionado'); }
    if (serviceAddress.length >= 6 && rawNormalized.includes(serviceAddress)) { score += 6; reasons.push('Dirección coincidente'); }

    score = Math.max(0, Math.min(100, roundMoney(score)));
    return {
      order_id: order.id,
      order_code: order.order_code,
      service_name: service?.name || 'Servicio eliminado',
      total_amount: number(order.total_amount),
      created_at: order.created_at,
      score,
      reasons
    };
  }

  function selectInvoiceComparableAmount(source, orderTotal) {
    const total = source?.totalAmount != null ? nullableNumber(source.totalAmount) : nullableNumber(source?.total_amount);
    const subtotal = nullableNumber(source?.subtotal);
    const orderValue = nullableNumber(orderTotal);
    const candidates = [
      { basis: 'total', value: total },
      { basis: 'subtotal', value: subtotal }
    ].filter((item) => item.value != null);
    if (!candidates.length) return { basis: null, value: null };
    if (orderValue == null) return candidates[0];
    return candidates.sort((a, b) => Math.abs(a.value - orderValue) - Math.abs(b.value - orderValue))[0];
  }

  function emptyInvoiceComparison(status = 'pendiente') {
    return {
      status,
      total_ok: false,
      order_total: null,
      invoice_total: null,
      invoice_document_total: null,
      invoice_subtotal: null,
      invoice_comparison_basis: null,
      total_difference: null,
      matched_count: 0,
      ok_count: 0,
      difference_count: 0,
      missing_count: 0,
      extra_count: 0,
      unreadable_count: 0,
      rows: [],
      generated_at: new Date().toISOString()
    };
  }

  function compareInvoiceAgainstOrder(parsedOrInvoice, order) {
    const invoiceItems = Array.isArray(parsedOrInvoice?.items)
      ? parsedOrInvoice.items
      : (Array.isArray(parsedOrInvoice?.parsed_items) ? parsedOrInvoice.parsed_items : []);
    const comparableAmount = selectInvoiceComparableAmount(parsedOrInvoice, order.total_amount);
    const invoiceTotal = comparableAmount.value;
    const invoiceFiscalTotal = parsedOrInvoice?.totalAmount != null ? parsedOrInvoice.totalAmount : parsedOrInvoice?.total_amount;
    const invoiceSubtotal = parsedOrInvoice?.subtotal != null ? parsedOrInvoice.subtotal : null;
    const orderItems = itemsForOrder(order.id);
    const used = new Set();
    const hasStructuredItems = invoiceItems.length > 0;
    const rows = orderItems.map((orderItem) => {
      if (!hasStructuredItems) return unreadableInvoiceLine(orderItem);
      const invoiceIndex = findInvoiceItemForOrderItem(orderItem, invoiceItems, used);
      const invoiceItem = invoiceIndex >= 0 ? invoiceItems[invoiceIndex] : null;
      if (invoiceIndex >= 0) used.add(invoiceIndex);
      return compareInvoiceLine(orderItem, invoiceItem);
    });

    invoiceItems.forEach((item, index) => {
      if (used.has(index)) return;
      rows.push({
        key: `extra-${index}`,
        result: 'extra',
        order_item_id: null,
        item_name: item.description || item.sku || 'Artículo no identificado',
        sku: item.sku || '',
        order_quantity: null,
        invoice_quantity: nullableNumber(item.quantity),
        order_unit_price: null,
        invoice_unit_price: nullableNumber(item.unit_price),
        order_line_total: null,
        invoice_line_total: nullableNumber(item.line_total),
        issues: ['Artículo facturado que no figura en el pedido']
      });
    });

    const totalTolerance = moneyTolerance(order.total_amount);
    const totalDifference = invoiceTotal == null ? null : roundMoney(number(invoiceTotal) - number(order.total_amount));
    const totalOk = totalDifference != null && Math.abs(totalDifference) <= totalTolerance;
    const missingCount = rows.filter((row) => row.result === 'missing').length;
    const extraCount = rows.filter((row) => row.result === 'extra').length;
    const differenceCount = rows.filter((row) => row.result === 'difference').length;
    const unreadableCount = rows.filter((row) => row.result === 'partial').length;
    const okCount = rows.filter((row) => row.result === 'ok').length;
    let status = 'coincide';
    if (missingCount || extraCount || differenceCount || (invoiceTotal != null && !totalOk)) status = 'diferencias';
    else if (!hasStructuredItems || unreadableCount || invoiceTotal == null) status = 'parcial';

    const extractionMeta = invoiceExtractionMetaFrom(parsedOrInvoice);
    return {
      ...extractionMeta,
      status,
      total_ok: totalOk,
      order_total: number(order.total_amount),
      invoice_total: invoiceTotal == null ? null : number(invoiceTotal),
      invoice_document_total: invoiceFiscalTotal == null ? null : number(invoiceFiscalTotal),
      invoice_subtotal: invoiceSubtotal == null ? null : number(invoiceSubtotal),
      invoice_comparison_basis: comparableAmount.basis,
      total_difference: totalDifference,
      matched_count: rows.filter((row) => !['missing', 'extra'].includes(row.result)).length,
      ok_count: okCount,
      difference_count: differenceCount,
      missing_count: missingCount,
      extra_count: extraCount,
      unreadable_count: unreadableCount,
      rows,
      generated_at: new Date().toISOString()
    };
  }

  function invoiceExtractionMetaFrom(source) {
    const summary = source?.comparison_summary && typeof source.comparison_summary === 'object' ? source.comparison_summary : {};
    const method = source?.extractionMethod || summary.extraction_method || null;
    const confidence = source?.extractionConfidence ?? summary.extraction_confidence ?? null;
    const quality = source?.parseQuality ?? summary.parse_quality ?? null;
    return {
      extraction_method: method,
      extraction_confidence: confidence == null ? null : number(confidence),
      parse_quality: quality == null ? null : number(quality),
      ocr_used: method === 'ocr' || Boolean(summary.ocr_used),
      reading_corrected_manually: Boolean(summary.reading_corrected_manually)
    };
  }

  function findInvoiceItemForOrderItem(orderItem, invoiceItems, used) {
    const sku = normalizeSku(orderItem.item_sku);
    if (sku) {
      const exact = invoiceItems.findIndex((item, index) => !used.has(index) && normalizeSku(item.sku) === sku);
      if (exact >= 0) return exact;
    }
    const orderName = normalize(orderItem.item_name);
    let bestIndex = -1;
    let bestScore = 0;
    invoiceItems.forEach((item, index) => {
      if (used.has(index)) return;
      // Si ambos lados tienen SKU y no coinciden, no se fuerza un match por una descripción genérica.
      if (sku && normalizeSku(item.sku)) return;
      const score = textSimilarity(orderName, normalize(item.description || ''));
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    return bestScore >= 0.62 ? bestIndex : -1;
  }

  function textSimilarity(a, b) {
    const stop = new Set(['producto','articulo','artículo','insumo','unidad','unidades','pack','caja','bolsa','litro','litros']);
    const tokenize = (value) => String(value || '').split(/\s+/).filter((token) => token.length >= 3 && !stop.has(token));
    const tokensA = new Set(tokenize(a));
    const tokensB = new Set(tokenize(b));
    if (!tokensA.size || !tokensB.size) return 0;
    const intersection = [...tokensA].filter((token) => tokensB.has(token)).length;
    return intersection / Math.max(tokensA.size, tokensB.size);
  }

  function unreadableInvoiceLine(orderItem) {
    return {
      key: orderItem.id,
      result: 'partial',
      order_item_id: orderItem.id,
      item_name: orderItem.item_name,
      sku: orderItem.item_sku || '',
      order_quantity: number(orderItem.quantity),
      invoice_quantity: null,
      order_unit_price: number(orderItem.unit_price),
      invoice_unit_price: null,
      order_line_total: number(orderItem.line_total),
      invoice_line_total: null,
      issues: [],
      notes: ['No se pudo estructurar esta línea desde el PDF']
    };
  }

  function compareInvoiceLine(orderItem, invoiceItem) {
    if (!invoiceItem) {
      return {
        key: orderItem.id,
        result: 'missing',
        order_item_id: orderItem.id,
        item_name: orderItem.item_name,
        sku: orderItem.item_sku || '',
        order_quantity: number(orderItem.quantity),
        invoice_quantity: null,
        order_unit_price: number(orderItem.unit_price),
        invoice_unit_price: null,
        order_line_total: number(orderItem.line_total),
        invoice_line_total: null,
        issues: ['Artículo pedido no encontrado en la factura'],
        notes: []
      };
    }
    const issues = [];
    const notes = [];
    const invoiceQty = nullableNumber(invoiceItem.quantity);
    const invoiceUnit = nullableNumber(invoiceItem.unit_price);
    const invoiceLine = nullableNumber(invoiceItem.line_total);
    const orderQty = number(orderItem.quantity);
    const finalUnit = number(orderItem.unit_price);
    const listUnit = orderItem.list_unit_price == null ? finalUnit : number(orderItem.list_unit_price);
    const finalLine = number(orderItem.line_total);
    const grossLine = roundMoney(orderQty * listUnit);
    const hasDiscount = number(orderItem.discount_percent) > 0 && Math.abs(listUnit - finalUnit) > moneyTolerance(finalUnit);

    if (invoiceQty != null && Math.abs(invoiceQty - orderQty) > 0.01) issues.push('Cantidad diferente');
    if (invoiceUnit != null) {
      const matchesFinal = Math.abs(invoiceUnit - finalUnit) <= moneyTolerance(finalUnit);
      const matchesList = hasDiscount && Math.abs(invoiceUnit - listUnit) <= moneyTolerance(listUnit);
      if (!matchesFinal && !matchesList) issues.push('Precio unitario diferente');
      else if (matchesList && !matchesFinal) notes.push('La factura muestra precio de lista; el descuento debe reflejarse en el total');
    }
    if (invoiceLine != null) {
      const matchesFinal = Math.abs(invoiceLine - finalLine) <= moneyTolerance(finalLine);
      const matchesGross = hasDiscount && Math.abs(invoiceLine - grossLine) <= moneyTolerance(grossLine);
      if (!matchesFinal && !matchesGross) issues.push('Importe de línea diferente');
      else if (matchesGross && !matchesFinal && !notes.length) notes.push('La línea está expresada antes del descuento');
    }
    const unreadable = invoiceQty == null || invoiceUnit == null || invoiceLine == null;
    return {
      key: orderItem.id,
      result: issues.length ? 'difference' : (unreadable ? 'partial' : 'ok'),
      order_item_id: orderItem.id,
      item_name: orderItem.item_name,
      sku: orderItem.item_sku || invoiceItem.sku || '',
      order_quantity: orderQty,
      invoice_quantity: invoiceQty,
      order_unit_price: finalUnit,
      invoice_unit_price: invoiceUnit,
      order_line_total: finalLine,
      invoice_line_total: invoiceLine,
      issues,
      notes
    };
  }

  function nullableNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function moneyTolerance(reference) {
    return Math.max(1, Math.abs(number(reference)) * INVOICE_MONEY_TOLERANCE_PERCENT / 100);
  }

  async function openInvoice(invoiceId) {
    const invoice = invoiceById(invoiceId);
    if (!invoice) return;
    S.selectedInvoiceId = invoiceId;
    resetInvoiceDetailState();
    renderInvoiceDetail(invoice);
    M.invoiceDetail.show();
    if (invoice.matched_order_id) await syncSelectedInvoiceComparison(invoice);
    // Las facturas cargadas antes de incorporar OCR conservan el texto vacío en la base.
    // Al abrirlas, la app intenta releerlas automáticamente una sola vez por sesión.
    window.setTimeout(() => maybeAutoRunInvoiceOcr(invoice), 350);
  }

  function invoiceNeedsOcr(invoice) {
    const text = String(invoice?.extracted_text || '').trim();
    const parsedItems = Array.isArray(invoice?.parsed_items) ? invoice.parsed_items : [];
    return !text || text.length < 80 || (!parsedItems.length && invoice?.comparison_status === 'sin_lectura');
  }

  async function maybeAutoRunInvoiceOcr(invoice) {
    if (!invoice || !isFullAdmin() || !invoiceNeedsOcr(invoice)) return;
    if (S.invoiceOcrRunning || S.invoiceOcrAutoAttempts.has(invoice.id)) return;
    S.invoiceOcrAutoAttempts.add(invoice.id);
    setInvoiceOcrStatus('El PDF no tiene texto incorporado. Iniciando lectura inteligente automática…', 'info', true);
    await reprocessSelectedInvoiceWithOcr({ automatic: true });
  }

  function setInvoiceOcrStatus(message = '', type = 'info', busy = false) {
    if (!E.invoiceOcrStatus) return;
    if (!message) {
      E.invoiceOcrStatus.className = 'alert d-none mb-3';
      E.invoiceOcrStatus.innerHTML = '';
      return;
    }
    E.invoiceOcrStatus.className = `alert alert-${type} mb-3`;
    E.invoiceOcrStatus.innerHTML = `${busy ? '<span class="spinner-border spinner-border-sm me-2" role="status"></span>' : '<i class="bi bi-info-circle me-2"></i>'}${eh(message)}`;
  }

  function renderInvoiceDetail(invoice) {
    const order = S.orders.find((item) => item.id === invoice.matched_order_id) || null;
    const service = order ? serviceById(order.service_id) : null;
    const summary = normalizeInvoiceComparisonSummary(invoice.comparison_summary, invoice.comparison_status);
    E.invoiceDetailTitle.textContent = invoice.invoice_number ? `Factura ${invoice.invoice_number}` : invoice.file_name;
    E.invoiceDetailSubtitle.textContent = `${invoice.file_name} · ${invoiceMethodLabel(invoice.match_method)} · ${invoiceExtractionLabel(summary)}`;
    E.invoiceRawText.textContent = invoice.extracted_text || 'No se pudo extraer texto del PDF.';
    E.invoiceMatchConfidence.textContent = invoice.match_method === 'manual' ? 'Manual' : `${Math.round(number(invoice.match_score))}%`;
    E.invoiceMatchConfidence.className = `invoice-confidence-pill is-${invoiceStatusClass(invoice.comparison_status)}`;

    const meta = [
      ['Proveedor', invoice.supplier_name || 'No identificado'],
      ['CUIT', invoice.supplier_tax_id || 'No detectado'],
      ['Fecha factura', invoice.invoice_date ? new Intl.DateTimeFormat('es-AR').format(new Date(`${invoice.invoice_date}T12:00:00`)) : 'No detectada'],
      ['Total facturado', invoice.total_amount == null ? 'No detectado' : formatCurrency(invoice.total_amount)],
      ['Subtotal', invoice.subtotal == null ? 'No detectado' : formatCurrency(invoice.subtotal)],
      ['Impuestos', invoice.tax_amount == null ? 'No detectados' : formatCurrency(invoice.tax_amount)],
      ['PDF', `${invoice.pdf_page_count || 0} páginas · ${formatFileSize(invoice.file_size)}`],
      ['Lectura', invoiceExtractionLabel(summary, true)],
      ['Cargada', dtf.format(new Date(invoice.created_at))]
    ];
    E.invoiceDetailMeta.innerHTML = meta.map(([label, value]) => `<div class="order-meta-card"><div class="order-meta-label">${eh(label)}</div><div class="order-meta-value">${eh(value)}</div></div>`).join('');

    populateInvoiceOrderSelect(invoice.matched_order_id);
    renderInvoiceCandidateHints(invoice);
    renderInvoiceAnalysisSummary(invoice, summary, order, service);
    renderInvoiceComparison(summary);
    E.toggleInvoiceReviewedButton.innerHTML = invoice.reviewed
      ? '<i class="bi bi-arrow-counterclockwise me-2"></i>Marcar pendiente'
      : '<i class="bi bi-check2-square me-2"></i>Marcar revisada';
    E.toggleInvoiceReviewedButton.classList.toggle('btn-outline-success', !invoice.reviewed);
    E.toggleInvoiceReviewedButton.classList.toggle('btn-outline-secondary', invoice.reviewed);
    E.invoiceDetailError.classList.add('d-none');
  }

  function invoiceExtractionLabel(summary, detailed = false) {
    const method = summary?.extraction_method;
    if (method === 'ia_pdf') {
      const confidence = summary?.extraction_confidence == null ? '' : ` · confianza ${Math.round(number(summary.extraction_confidence))}%`;
      const corrected = summary?.reading_corrected_manually ? ' · corregida manualmente' : '';
      return detailed ? `Lectura inteligente del PDF${confidence}${corrected}` : 'Lectura inteligente';
    }
    if (method === 'ocr') {
      const confidence = summary?.extraction_confidence == null ? '' : ` · confianza ${Math.round(number(summary.extraction_confidence))}%`;
      const corrected = summary?.reading_corrected_manually ? ' · corregida manualmente' : '';
      return detailed ? `OCR automático${confidence}${corrected}` : 'Lectura OCR';
    }
    if (summary?.reading_corrected_manually) return 'Lectura corregida manualmente';
    if (method === 'texto_pdf') return detailed ? 'Texto incorporado en el PDF' : 'Texto PDF';
    return 'Método no registrado';
  }

  function formatFileSize(bytes) {
    const value = number(bytes);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} KB`;
    return `${(value / (1024 * 1024)).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`;
  }

  function populateInvoiceOrderSelect(selectedId = '') {
    const options = [...S.orders]
      .filter((order) => order.status !== 'cancelado' || order.id === selectedId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .map((order) => {
        const service = serviceById(order.service_id);
        return `<option value="${ea(order.id)}" ${order.id === selectedId ? 'selected' : ''}>${eh(order.order_code)} · ${eh(service?.name || 'Servicio')} · ${eh(formatCurrency(order.total_amount))} · ${eh(new Intl.DateTimeFormat('es-AR').format(new Date(order.created_at)))}</option>`;
      }).join('');
    E.invoiceOrderSelect.innerHTML = `<option value="">Sin pedido vinculado</option>${options}`;
    E.invoiceOrderSelect.value = selectedId || '';
  }

  function renderInvoiceCandidateHints(invoice) {
    const candidates = Array.isArray(invoice.match_candidates) ? invoice.match_candidates : [];
    E.invoiceCandidateHints.innerHTML = candidates.length
      ? `<div class="invoice-candidate-label">Sugerencias del análisis</div><div class="invoice-candidate-list">${candidates.map((candidate) => `<button class="invoice-candidate" type="button" data-invoice-candidate="${ea(candidate.order_id)}"><strong>${eh(candidate.order_code || 'Pedido')}</strong><span>${eh(candidate.service_name || '')} · ${eh(formatCurrency(candidate.total_amount))}</span><em>${Math.round(number(candidate.score))}%${candidate.reasons?.length ? ` · ${eh(candidate.reasons.join(', '))}` : ''}</em></button>`).join('')}</div>`
      : '<div class="text-secondary small">No hubo candidatos confiables. Seleccioná el pedido manualmente.</div>';
    E.invoiceCandidateHints.querySelectorAll('[data-invoice-candidate]').forEach((button) => {
      button.addEventListener('click', () => { E.invoiceOrderSelect.value = button.dataset.invoiceCandidate; });
    });
  }

  function renderInvoiceAnalysisSummary(invoice, summary, order, service) {
    const status = summary.status || invoice.comparison_status || 'pendiente';
    if (!order) {
      E.invoiceAnalysisSummary.innerHTML = `<div class="invoice-summary-card is-${invoiceStatusClass(status)}"><div><span class="eyebrow">Resultado</span><h6>${eh(INVOICE_STATUS_LABELS[status] || status)}</h6><p>No se pudo vincular esta factura con un pedido de manera confiable. Seleccioná uno para comparar.</p></div></div>`;
      return;
    }
    const comparisonBasis = summary.invoice_comparison_basis === 'subtotal' ? 'subtotal' : 'total';
    const basisLabel = comparisonBasis === 'subtotal' ? 'subtotal de la factura' : 'total de la factura';
    const totalText = summary.invoice_total == null
      ? 'No se pudo leer un importe comparable de la factura.'
      : (summary.total_ok ? `El ${basisLabel} coincide.` : `Diferencia contra el ${basisLabel}: ${formatSignedCurrency(summary.total_difference)}.`);
    const fiscalNote = comparisonBasis === 'subtotal' && summary.invoice_document_total != null
      ? `<small>Total fiscal con impuestos: ${eh(formatCurrency(summary.invoice_document_total))}</small>`
      : '';
    E.invoiceAnalysisSummary.innerHTML = `<div class="invoice-summary-card is-${invoiceStatusClass(status)}">
      <div><span class="eyebrow">Resultado</span><h6>${eh(INVOICE_STATUS_LABELS[status] || status)}</h6><p>${eh(totalText)} Pedido ${eh(order.order_code)} · ${eh(service?.name || 'Servicio')}.</p></div>
      <div class="invoice-summary-metrics"><span><strong>${summary.ok_count || 0}</strong> correctos</span><span><strong>${summary.difference_count || 0}</strong> diferencias</span><span><strong>${summary.missing_count || 0}</strong> faltantes</span><span><strong>${summary.extra_count || 0}</strong> extras</span></div>
      <div class="invoice-total-compare"><div><span>Pedido</span><strong>${eh(formatCurrency(order.total_amount))}</strong></div><i class="bi bi-arrow-left-right"></i><div><span>${comparisonBasis === 'subtotal' ? 'Subtotal factura' : 'Total factura'}</span><strong>${summary.invoice_total == null ? 'No leído' : eh(formatCurrency(summary.invoice_total))}</strong>${fiscalNote}</div></div>
    </div>`;
  }

  function formatSignedCurrency(value) {
    if (value == null) return 'No calculada';
    return `${number(value) > 0 ? '+' : ''}${formatCurrency(value)}`;
  }

  function normalizeInvoiceComparisonSummary(value, fallbackStatus) {
    const parsed = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return { ...emptyInvoiceComparison(fallbackStatus || 'pendiente'), ...parsed, rows: Array.isArray(parsed.rows) ? parsed.rows : [] };
  }

  function renderInvoiceComparison(summary) {
    const rows = Array.isArray(summary.rows) ? summary.rows : [];
    E.invoiceComparisonBody.innerHTML = rows.map((row) => {
      const result = row.result || 'partial';
      const resultLabel = ({ ok: 'Coincide', difference: 'Diferencia', missing: 'No facturado', extra: 'No pedido', partial: 'Lectura parcial' })[result] || result;
      const resultClass = ({ ok: 'success', difference: 'danger', missing: 'warning', extra: 'warning', partial: 'secondary' })[result] || 'secondary';
      return `<tr class="invoice-comparison-row is-${ea(result)}">
        <td><strong>${eh(row.item_name || 'Artículo')}</strong><div class="table-subtitle">${row.sku ? `SKU ${eh(row.sku)}` : 'Sin SKU'}</div>${row.issues?.length ? `<div class="invoice-issues">${row.issues.map((issue) => `<span>${eh(issue)}</span>`).join('')}</div>` : ''}${row.notes?.length ? `<div class="invoice-notes">${row.notes.map((note) => `<span>${eh(note)}</span>`).join('')}</div>` : ''}</td>
        <td>${invoiceValuePair('Cantidad', row.order_quantity, 'qty')}</td>
        <td>${invoiceValuePair('Cantidad', row.invoice_quantity, 'qty')}</td>
        <td>${invoicePricePair(row.order_unit_price, row.invoice_unit_price)}</td>
        <td>${invoicePricePair(row.order_line_total, row.invoice_line_total)}</td>
        <td><span class="badge text-bg-${resultClass}">${eh(resultLabel)}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6"><div class="empty-inline">No hay artículos estructurados para comparar. Revisá el texto extraído o corregí la lectura.</div></td></tr>';
  }

  function invoiceValuePair(label, value, kind) {
    if (value == null) return '<span class="text-secondary">No leído</span>';
    return `<strong>${kind === 'qty' ? eh(formatQty(value)) : eh(value)}</strong><div class="table-subtitle">${eh(label)}</div>`;
  }

  function invoicePricePair(orderValue, invoiceValue) {
    return `<div class="invoice-price-pair"><span>Ped.: ${orderValue == null ? '—' : eh(formatCurrency(orderValue))}</span><strong>Fact.: ${invoiceValue == null ? 'No leído' : eh(formatCurrency(invoiceValue))}</strong></div>`;
  }

  async function syncSelectedInvoiceComparison(invoice) {
    const order = S.orders.find((item) => item.id === invoice.matched_order_id);
    if (!order) return;
    const comparison = compareInvoiceAgainstOrder(invoice, order);
    const stored = normalizeInvoiceComparisonSummary(invoice.comparison_summary, invoice.comparison_status);
    const changed = invoice.comparison_status !== comparison.status || JSON.stringify(stored.rows) !== JSON.stringify(comparison.rows) || stored.invoice_total !== comparison.invoice_total || stored.order_total !== comparison.order_total;
    if (!changed) return;
    invoice.comparison_status = comparison.status;
    invoice.comparison_summary = comparison;
    renderInvoiceDetail(invoice);
    try {
      const { error } = await S.sb.from('supplier_invoices').update({ comparison_status: comparison.status, comparison_summary: comparison }).eq('id', invoice.id);
      if (error) throw error;
      renderInvoices();
    } catch (error) {
      console.error(error);
    }
  }

  async function saveInvoiceManualMatch() {
    const invoice = invoiceById(S.selectedInvoiceId);
    if (!invoice) return;
    const orderId = E.invoiceOrderSelect.value || null;
    buttonBusy(E.saveInvoiceMatchButton, true, 'Comparando...');
    try {
      let comparison;
      let status;
      if (orderId) {
        const order = S.orders.find((item) => item.id === orderId);
        if (!order) throw new Error('El pedido seleccionado ya no existe.');
        comparison = compareInvoiceAgainstOrder(invoice, order);
        status = comparison.status;
      } else {
        status = invoice.extracted_text?.trim() ? 'sin_match' : 'sin_lectura';
        comparison = emptyInvoiceComparison(status);
        Object.assign(comparison, invoiceExtractionMetaFrom(invoice));
      }
      const update = {
        matched_order_id: orderId,
        match_method: orderId ? 'manual' : 'sin_match',
        match_score: orderId ? 100 : 0,
        comparison_status: status,
        comparison_summary: comparison,
        reviewed: false
      };
      const { data, error } = await S.sb.from('supplier_invoices').update(update).eq('id', invoice.id).select('*').single();
      if (error) throw error;
      replaceInvoiceState(data);
      renderInvoiceDetail(data);
      renderInvoices();
      toast(orderId ? 'Factura vinculada y comparada.' : 'Vinculación eliminada.', 'success');
    } catch (error) {
      console.error(error);
      showInvoiceDetailError(invoiceModuleErrorMessage(error));
    } finally {
      buttonBusy(E.saveInvoiceMatchButton, false);
    }
  }

  async function openSelectedInvoicePdf() {
    const invoice = invoiceById(S.selectedInvoiceId);
    if (!invoice) return;
    buttonBusy(E.openInvoicePdfButton, true, 'Abriendo...');
    try {
      const { data, error } = await S.sb.storage.from(INVOICE_BUCKET).createSignedUrl(invoice.storage_path, 120);
      if (error) throw error;
      const opened = window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
      if (!opened) window.location.href = data.signedUrl;
    } catch (error) {
      console.error(error);
      showInvoiceDetailError(invoiceModuleErrorMessage(error));
    } finally {
      buttonBusy(E.openInvoicePdfButton, false);
    }
  }

  async function reprocessSelectedInvoiceWithOcr(options = {}) {
    const invoice = invoiceById(S.selectedInvoiceId);
    if (!invoice || !isFullAdmin() || S.invoiceOcrRunning) return;
    const automatic = Boolean(options?.automatic);
    S.invoiceOcrRunning = true;
    E.invoiceDetailError.classList.add('d-none');
    setInvoiceOcrStatus('Preparando lectura inteligente de la factura…', 'info', true);
    buttonBusy(E.reprocessInvoiceOcrButton, true, 'Analizando...');
    try {
      const { data: pdfBlob, error: downloadError } = await S.sb.storage.from(INVOICE_BUCKET).download(invoice.storage_path);
      if (downloadError) throw downloadError;
      const buffer = await pdfBlob.arrayBuffer();
      const analyzed = await analyzeInvoicePdf(buffer, invoice.file_name, {
        forceOcr: true,
        storagePath: invoice.storage_path,
        onProgress: (message) => {
          E.reprocessInvoiceOcrButton.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${eh(message)}`;
          setInvoiceOcrStatus(message, 'info', true);
        }
      });
      const parsed = analyzed.parsed;
      let selectedOrder = null;
      let match;
      if (invoice.match_method === 'manual' && invoice.matched_order_id) {
        selectedOrder = S.orders.find((item) => item.id === invoice.matched_order_id) || null;
        match = { score: 100, candidates: Array.isArray(invoice.match_candidates) ? invoice.match_candidates : [] };
      } else {
        match = findBestInvoiceOrderMatch(parsed, analyzed.extracted.text);
        selectedOrder = match.order || null;
      }
      const statusWithoutOrder = analyzed.extracted.text.trim() ? 'sin_match' : 'sin_lectura';
      const comparison = selectedOrder
        ? compareInvoiceAgainstOrder(parsed, selectedOrder)
        : emptyInvoiceComparison(statusWithoutOrder);
      applyInvoiceExtractionMeta(comparison, analyzed);
      const comparisonStatus = selectedOrder ? comparison.status : statusWithoutOrder;
      const update = {
        pdf_page_count: analyzed.extracted.pageCount,
        extracted_text: analyzed.extracted.text.slice(0, 250000),
        invoice_number: parsed.invoiceNumber || invoice.invoice_number || null,
        invoice_date: parsed.invoiceDate || invoice.invoice_date || null,
        supplier_name: parsed.supplierName || invoice.supplier_name || null,
        supplier_tax_id: parsed.supplierTaxId || invoice.supplier_tax_id || null,
        currency: parsed.currency || invoice.currency || 'ARS',
        subtotal: parsed.subtotal,
        tax_amount: parsed.taxAmount,
        total_amount: parsed.totalAmount,
        parsed_items: parsed.items,
        unmatched_lines: parsed.unmatchedLines,
        matched_order_id: selectedOrder?.id || null,
        match_score: invoice.match_method === 'manual' && selectedOrder ? 100 : number(match.score),
        match_method: invoice.match_method === 'manual' && selectedOrder ? 'manual' : (selectedOrder ? 'automatico' : 'sin_match'),
        match_candidates: match.candidates || [],
        comparison_status: comparisonStatus,
        comparison_summary: comparison,
        reviewed: false
      };
      const { data, error } = await S.sb.from('supplier_invoices').update(update).eq('id', invoice.id).select('*').single();
      if (error) throw error;
      replaceInvoiceState(data);
      renderInvoiceDetail(data);
      renderInvoices();
      setInvoiceOcrStatus(`Lectura terminada. Se detectaron ${(parsed.items || []).length} artículos.`, 'success', false);
      toast(`${automatic ? 'Lectura automática finalizada' : 'Factura reanalizada'}. Se detectaron ${(parsed.items || []).length} artículos.`, 'success');
    } catch (error) {
      console.error(error);
      const message = invoiceModuleErrorMessage(error);
      setInvoiceOcrStatus(message, 'danger', false);
      showInvoiceDetailError(message);
    } finally {
      S.invoiceOcrRunning = false;
      buttonBusy(E.reprocessInvoiceOcrButton, false);
    }
  }

  async function deleteInvoice(invoiceId) {
    if (!isFullAdmin()) return;
    const invoice = invoiceById(invoiceId);
    if (!invoice || !confirm(`¿Eliminar la factura ${invoice.invoice_number || invoice.file_name}? También se eliminará el PDF privado.`)) return;
    try {
      const { error } = await S.sb.from('supplier_invoices').delete().eq('id', invoice.id);
      if (error) throw error;
      const { error: storageError } = await S.sb.storage.from(INVOICE_BUCKET).remove([invoice.storage_path]);
      if (storageError) console.warn('No se pudo eliminar el archivo físico de la factura:', storageError);
      S.invoices = S.invoices.filter((item) => item.id !== invoice.id);
      if (S.selectedInvoiceId === invoice.id) M.invoiceDetail.hide();
      renderInvoices();
      toast(storageError ? 'Factura eliminada. El archivo privado deberá limpiarse desde Storage.' : 'Factura eliminada.', storageError ? 'info' : 'success');
    } catch (error) {
      console.error(error);
      const message = invoiceModuleErrorMessage(error);
      if (S.selectedInvoiceId === invoice.id) showInvoiceDetailError(message);
      else showInvoiceModuleError(message);
    }
  }

  async function toggleInvoiceReviewed() {
    const invoice = invoiceById(S.selectedInvoiceId);
    if (!invoice) return;
    E.toggleInvoiceReviewedButton.disabled = true;
    try {
      const next = !invoice.reviewed;
      const payload = { reviewed: next, reviewed_by: next ? S.profile.id : null, reviewed_at: next ? new Date().toISOString() : null };
      const { data, error } = await S.sb.from('supplier_invoices').update(payload).eq('id', invoice.id).select('*').single();
      if (error) throw error;
      replaceInvoiceState(data);
      renderInvoiceDetail(data);
      renderInvoices();
      toast(next ? 'Factura marcada como revisada.' : 'Factura marcada como pendiente.', 'success');
    } catch (error) {
      console.error(error);
      showInvoiceDetailError(invoiceModuleErrorMessage(error));
    } finally {
      E.toggleInvoiceReviewedButton.disabled = false;
    }
  }

  function startInvoiceReadingEdit() {
    const invoice = invoiceById(S.selectedInvoiceId);
    if (!invoice) return;
    S.invoiceReadingEditMode = true;
    S.invoiceReadingTotalDraft = invoice.total_amount ?? '';
    E.invoiceReadingTotal.value = S.invoiceReadingTotalDraft;
    S.invoiceReadingDraft = (Array.isArray(invoice.parsed_items) ? invoice.parsed_items : []).map((item, index) => ({
      key: `${index}-${Date.now()}`,
      sku: item.sku || '',
      description: item.description || '',
      quantity: item.quantity ?? '',
      unit_price: item.unit_price ?? '',
      line_total: item.line_total ?? ''
    }));
    E.invoiceReadingEditPanel.classList.remove('d-none');
    E.toggleInvoiceReadingEditButton.classList.add('d-none');
    renderInvoiceReadingEditor();
  }

  function cancelInvoiceReadingEdit() {
    S.invoiceReadingEditMode = false;
    S.invoiceReadingDraft = [];
    S.invoiceReadingTotalDraft = '';
    E.invoiceReadingTotal.value = '';
    E.invoiceReadingEditPanel.classList.add('d-none');
    E.toggleInvoiceReadingEditButton.classList.remove('d-none');
  }

  function addInvoiceReadingItem() {
    S.invoiceReadingDraft.push({ key: `${Date.now()}-${Math.random()}`, sku: '', description: '', quantity: '', unit_price: '', line_total: '' });
    renderInvoiceReadingEditor();
  }

  function renderInvoiceReadingEditor() {
    E.invoiceReadingItems.innerHTML = S.invoiceReadingDraft.map((item) => `<div class="invoice-reading-item" data-invoice-reading-key="${ea(item.key)}">
      <div><label class="form-label">SKU</label><input class="form-control" data-invoice-reading-field="sku" value="${ea(item.sku)}" placeholder="SKU"></div>
      <div class="invoice-reading-description"><label class="form-label">Descripción</label><input class="form-control" data-invoice-reading-field="description" value="${ea(item.description)}" placeholder="Artículo"></div>
      <div><label class="form-label">Cantidad</label><input class="form-control" type="number" step="0.01" min="0" data-invoice-reading-field="quantity" value="${ea(item.quantity)}"></div>
      <div><label class="form-label">Precio unitario</label><input class="form-control" type="number" step="0.01" min="0" data-invoice-reading-field="unit_price" value="${ea(item.unit_price)}"></div>
      <div><label class="form-label">Importe</label><input class="form-control" type="number" step="0.01" min="0" data-invoice-reading-field="line_total" value="${ea(item.line_total)}"></div>
      <button class="btn btn-outline-danger invoice-reading-remove" type="button" data-invoice-reading-remove="${ea(item.key)}" title="Quitar línea"><i class="bi bi-trash3"></i></button>
    </div>`).join('') || '<div class="empty-inline">No hay líneas. Agregá manualmente los artículos facturados.</div>';
  }

  function handleInvoiceReadingInput(event) {
    const input = event.target.closest('[data-invoice-reading-field]');
    if (!input) return;
    const row = input.closest('[data-invoice-reading-key]');
    const item = S.invoiceReadingDraft.find((entry) => String(entry.key) === String(row?.dataset.invoiceReadingKey));
    if (!item) return;
    item[input.dataset.invoiceReadingField] = input.value;
  }

  function handleInvoiceReadingClick(event) {
    const remove = event.target.closest('[data-invoice-reading-remove]');
    if (!remove) return;
    S.invoiceReadingDraft = S.invoiceReadingDraft.filter((item) => String(item.key) !== String(remove.dataset.invoiceReadingRemove));
    renderInvoiceReadingEditor();
  }

  async function saveInvoiceReading() {
    const invoice = invoiceById(S.selectedInvoiceId);
    if (!invoice) return;
    const parsedItems = S.invoiceReadingDraft
      .map((item) => ({
        sku: String(item.sku || '').trim() || null,
        description: String(item.description || '').trim() || String(item.sku || '').trim() || 'Artículo',
        quantity: nullableNumber(item.quantity),
        unit_price: nullableNumber(item.unit_price),
        line_total: nullableNumber(item.line_total),
        raw_line: 'Lectura corregida manualmente'
      }))
      .filter((item) => item.sku || item.description || item.quantity != null || item.line_total != null);
    buttonBusy(E.saveInvoiceReadingButton, true, 'Guardando...');
    try {
      const correctedTotal = nullableNumber(S.invoiceReadingTotalDraft);
      const order = S.orders.find((item) => item.id === invoice.matched_order_id) || null;
      const comparisonSource = { parsed_items: parsedItems, total_amount: correctedTotal, comparison_summary: invoice.comparison_summary };
      const comparison = order ? compareInvoiceAgainstOrder(comparisonSource, order) : emptyInvoiceComparison(invoice.extracted_text?.trim() ? 'sin_match' : 'sin_lectura');
      Object.assign(comparison, invoiceExtractionMetaFrom(invoice), { reading_corrected_manually: true });
      const status = comparison.status;
      const { data, error } = await S.sb.from('supplier_invoices').update({
        parsed_items: parsedItems,
        total_amount: correctedTotal,
        comparison_status: status,
        comparison_summary: comparison,
        reviewed: false
      }).eq('id', invoice.id).select('*').single();
      if (error) throw error;
      replaceInvoiceState(data);
      cancelInvoiceReadingEdit();
      renderInvoiceDetail(data);
      renderInvoices();
      toast('Lectura corregida y comparación actualizada.', 'success');
    } catch (error) {
      console.error(error);
      showInvoiceDetailError(invoiceModuleErrorMessage(error));
    } finally {
      buttonBusy(E.saveInvoiceReadingButton, false);
    }
  }

  function replaceInvoiceState(invoice) {
    const index = S.invoices.findIndex((item) => item.id === invoice.id);
    if (index >= 0) S.invoices[index] = invoice;
    else S.invoices.unshift(invoice);
    return invoice;
  }

  function showInvoiceDetailError(message) {
    E.invoiceDetailError.textContent = message;
    E.invoiceDetailError.classList.remove('d-none');
  }

  function resetInvoiceDetailState() {
    setInvoiceOcrStatus();
    S.invoiceReadingEditMode = false;
    S.invoiceReadingDraft = [];
    S.invoiceReadingTotalDraft = '';
    if (E.invoiceReadingTotal) E.invoiceReadingTotal.value = '';
    if (E.invoiceReadingEditPanel) E.invoiceReadingEditPanel.classList.add('d-none');
    if (E.toggleInvoiceReadingEditButton) E.toggleInvoiceReadingEditButton.classList.remove('d-none');
    if (E.invoiceDetailError) {
      E.invoiceDetailError.textContent = '';
      E.invoiceDetailError.classList.add('d-none');
    }
  }

  function openPriceImport() {
    if (!canManageMasterData()) {
      toast('Solo el administrador puede actualizar precios.', 'error');
      return;
    }
    hidePriceImportError();
    if (!window.XLSX) {
      E.priceImportLibraryError.textContent = 'No se pudo cargar el lector de Excel. Revisá la conexión a internet y volvé a abrir la aplicación.';
      E.priceImportLibraryError.classList.remove('d-none');
    } else {
      E.priceImportLibraryError.classList.add('d-none');
    }
    if (!S.priceImportWorkbook) resetPriceImport(false);
    M.priceImport.show();
  }

  function clearPriceImportState() {
    S.priceImportWorkbook = null;
    S.priceImportRows = [];
    S.priceImportFileName = '';
    S.priceImportSheetName = '';
    S.priceImportComparison = null;
    S.priceImportSelected = new Set();
    S.priceImportFilter = 'changes';
    S.priceImportSearch = '';
  }

  function resetPriceImport(clearFile = true) {
    clearPriceImportState();
    if (clearFile && E.priceImportFile) E.priceImportFile.value = '';
    E.priceImportMapping.classList.add('d-none');
    E.priceImportResults.classList.add('d-none');
    E.priceImportAnalyzeButton.classList.add('d-none');
    E.priceImportApplyButton.classList.add('d-none');
    E.priceImportResetButton.classList.add('d-none');
    E.priceImportResultFilter.value = 'changes';
    E.priceImportSearch.value = '';
    E.priceImportResultsBody.innerHTML = '';
    E.priceImportPreviewHead.innerHTML = '';
    E.priceImportPreviewBody.innerHTML = '';
    E.priceImportSelectAll.checked = false;
    E.priceImportSelectAll.indeterminate = false;
    hidePriceImportError();
  }

  async function handlePriceImportFile() {
    hidePriceImportError();
    const file = E.priceImportFile.files?.[0];
    if (!file) {
      resetPriceImport(false);
      return;
    }
    if (!window.XLSX) {
      showPriceImportError('No está disponible el lector de Excel. Revisá la conexión y recargá la aplicación.');
      return;
    }
    const extension = String(file.name.split('.').pop() || '').toLowerCase();
    if (!['xlsx', 'xls', 'xlsb', 'csv'].includes(extension)) {
      showPriceImportError('El archivo debe ser XLSX, XLS, XLSB o CSV.');
      E.priceImportFile.value = '';
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      showPriceImportError('El archivo supera los 20 MB. Reducilo antes de cargarlo.');
      E.priceImportFile.value = '';
      return;
    }

    buttonBusy(E.priceImportAnalyzeButton, true, 'Leyendo archivo...');
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: false, cellNF: false, cellText: true });
      if (!workbook?.SheetNames?.length) throw new Error('El archivo no contiene hojas legibles.');
      S.priceImportWorkbook = workbook;
      S.priceImportFileName = file.name;
      S.priceImportComparison = null;
      S.priceImportSelected = new Set();
      E.priceImportSheet.innerHTML = workbook.SheetNames.map((name) => `<option value="${ea(name)}">${eh(name)}</option>`).join('');
      E.priceImportSheet.value = workbook.SheetNames[0];
      E.priceImportFileSummary.textContent = `${file.name} · ${formatFileSize(file.size)}`;
      loadPriceImportSheet(workbook.SheetNames[0]);
      E.priceImportMapping.classList.remove('d-none');
      E.priceImportResults.classList.add('d-none');
      E.priceImportAnalyzeButton.classList.remove('d-none');
      E.priceImportApplyButton.classList.add('d-none');
      E.priceImportResetButton.classList.remove('d-none');
    } catch (error) {
      console.error(error);
      resetPriceImport(true);
      showPriceImportError(error.message || 'No se pudo leer el archivo de precios.');
    } finally {
      buttonBusy(E.priceImportAnalyzeButton, false);
    }
  }

  function handlePriceImportSheetChange() {
    if (!S.priceImportWorkbook) return;
    loadPriceImportSheet(E.priceImportSheet.value);
  }

  function loadPriceImportSheet(sheetName) {
    const sheet = S.priceImportWorkbook?.Sheets?.[sheetName];
    if (!sheet) {
      showPriceImportError('No se pudo leer la hoja seleccionada.');
      return;
    }
    S.priceImportSheetName = sheetName;
    S.priceImportRows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      raw: false,
      blankrows: false
    });
    const detection = detectPriceImportStructure(S.priceImportRows);
    E.priceImportHeaderRow.max = Math.max(1, Math.min(500, S.priceImportRows.length || 1));
    E.priceImportHeaderRow.value = detection.headerRow + 1;
    populatePriceImportColumns(detection);
    E.priceImportMappingWarning.classList.toggle('d-none', detection.confident);
    E.priceImportMappingWarning.textContent = detection.confident
      ? ''
      : 'No se identificaron con suficiente seguridad las columnas. Revisá manualmente la fila de encabezados, SKU y precio antes de analizar.';
    renderPriceImportPreview();
    E.priceImportResults.classList.add('d-none');
    E.priceImportApplyButton.classList.add('d-none');
  }

  function handlePriceImportHeaderChange() {
    const headerIndex = Math.max(0, Math.min(S.priceImportRows.length - 1, Math.round(number(E.priceImportHeaderRow.value)) - 1));
    const detection = detectColumnsInHeader(S.priceImportRows[headerIndex] || []);
    populatePriceImportColumns({ headerRow: headerIndex, ...detection });
    E.priceImportMappingWarning.classList.toggle('d-none', detection.confident);
    E.priceImportMappingWarning.textContent = detection.confident
      ? ''
      : 'Seleccioná manualmente las columnas de SKU y precio.';
    renderPriceImportPreview();
  }

  function detectPriceImportStructure(rows) {
    let best = { headerRow: 0, skuColumn: -1, priceColumn: -1, descriptionColumn: -1, score: -1, confident: false };
    const maxRows = Math.min(rows.length, 50);
    for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
      const detected = detectColumnsInHeader(rows[rowIndex] || []);
      const nonEmpty = (rows[rowIndex] || []).filter((value) => String(value || '').trim()).length;
      const score = detected.score + Math.min(nonEmpty, 10);
      if (score > best.score) best = { headerRow: rowIndex, ...detected, score };
    }
    if (best.score < 0) return { headerRow: 0, skuColumn: -1, priceColumn: -1, descriptionColumn: -1, score: 0, confident: false };
    return best;
  }

  function detectColumnsInHeader(header) {
    let skuColumn = -1;
    let priceColumn = -1;
    let descriptionColumn = -1;
    let skuScore = 0;
    let priceScore = 0;
    let descriptionScore = 0;
    header.forEach((value, index) => {
      const skuCandidate = priceHeaderScore(value, 'sku');
      const priceCandidate = priceHeaderScore(value, 'price');
      const descriptionCandidate = priceHeaderScore(value, 'description');
      if (skuCandidate > skuScore) { skuScore = skuCandidate; skuColumn = index; }
      if (priceCandidate > priceScore) { priceScore = priceCandidate; priceColumn = index; }
      if (descriptionCandidate > descriptionScore) { descriptionScore = descriptionCandidate; descriptionColumn = index; }
    });
    if (descriptionColumn === skuColumn || descriptionColumn === priceColumn) descriptionColumn = -1;
    const confident = skuColumn >= 0 && priceColumn >= 0 && skuColumn !== priceColumn && skuScore >= 55 && priceScore >= 55;
    return { skuColumn, priceColumn, descriptionColumn, score: skuScore + priceScore + Math.min(descriptionScore, 40), confident };
  }

  function priceHeaderScore(value, kind) {
    const text = normalize(value).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!text) return 0;
    const aliases = {
      sku: ['sku', 'codigo sku', 'cod sku', 'codigo articulo', 'cod articulo', 'codigo de articulo', 'cod de articulo', 'codigo producto', 'cod producto', 'codigo proveedor', 'codigo interno', 'referencia', 'codigo', 'cod'],
      price: ['precio unitario', 'precio lista', 'precio de lista', 'precio venta', 'precio de venta', 'precio neto', 'precio final', 'p unitario', 'p unit', 'precio', 'valor unitario', 'importe unitario', 'costo unitario', 'valor', 'importe', 'costo', 'price'],
      description: ['descripcion', 'producto', 'articulo', 'insumo', 'detalle', 'nombre', 'denominacion']
    }[kind] || [];
    let best = 0;
    aliases.forEach((alias, index) => {
      if (text === alias) best = Math.max(best, 100 - index);
      else if (text.startsWith(`${alias} `) || text.endsWith(` ${alias}`)) best = Math.max(best, 75 - Math.min(index, 20));
      else if (text.includes(alias)) best = Math.max(best, 55 - Math.min(index, 20));
    });
    if (kind === 'price' && /iva|lista|neto|unitario/.test(text) && /precio|valor|importe|costo/.test(text)) best += 12;
    if (kind === 'sku' && /barra|ean|upc/.test(text) && !text.includes('sku')) best = Math.min(best, 35);
    return best;
  }

  function populatePriceImportColumns(detection) {
    const headerIndex = Math.max(0, Math.min(S.priceImportRows.length - 1, number(E.priceImportHeaderRow.value) - 1));
    const header = S.priceImportRows[headerIndex] || [];
    const maxColumns = Math.max(header.length, ...S.priceImportRows.slice(headerIndex, headerIndex + 10).map((row) => row.length), 0);
    const options = Array.from({ length: maxColumns }, (_, index) => {
      const label = String(header[index] || '').trim() || 'Sin encabezado';
      return `<option value="${index}">${columnLetter(index)} · ${eh(label)}</option>`;
    }).join('');
    E.priceImportSkuColumn.innerHTML = '<option value="">Seleccionar...</option>' + options;
    E.priceImportPriceColumn.innerHTML = '<option value="">Seleccionar...</option>' + options;
    E.priceImportDescriptionColumn.innerHTML = '<option value="">No usar</option>' + options;
    if (detection.skuColumn >= 0) E.priceImportSkuColumn.value = String(detection.skuColumn);
    if (detection.priceColumn >= 0) E.priceImportPriceColumn.value = String(detection.priceColumn);
    if (detection.descriptionColumn >= 0) E.priceImportDescriptionColumn.value = String(detection.descriptionColumn);
  }

  function renderPriceImportPreview() {
    if (!S.priceImportRows.length) return;
    const headerIndex = Math.max(0, Math.min(S.priceImportRows.length - 1, Math.round(number(E.priceImportHeaderRow.value)) - 1));
    const skuColumn = optionalColumnIndex(E.priceImportSkuColumn.value);
    const priceColumn = optionalColumnIndex(E.priceImportPriceColumn.value);
    const descriptionColumn = optionalColumnIndex(E.priceImportDescriptionColumn.value);
    const selectedColumns = [...new Set([skuColumn, descriptionColumn, priceColumn].filter((index) => index >= 0))];
    const header = S.priceImportRows[headerIndex] || [];
    if (!selectedColumns.length) {
      E.priceImportPreviewHead.innerHTML = '';
      E.priceImportPreviewBody.innerHTML = '<tr><td class="text-secondary">Seleccioná las columnas para ver la vista previa.</td></tr>';
      E.priceImportPreviewCaption.textContent = '';
      return;
    }
    E.priceImportPreviewHead.innerHTML = `<tr>${selectedColumns.map((index) => `<th>${columnLetter(index)} · ${eh(header[index] || 'Sin encabezado')}</th>`).join('')}</tr>`;
    const previewRows = S.priceImportRows.slice(headerIndex + 1).filter((row) => row.some((value) => String(value || '').trim())).slice(0, 6);
    E.priceImportPreviewBody.innerHTML = previewRows.map((row) => `<tr>${selectedColumns.map((index) => `<td>${eh(row[index] ?? '')}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${selectedColumns.length}" class="text-secondary">No hay filas debajo del encabezado seleccionado.</td></tr>`;
    E.priceImportPreviewCaption.textContent = `${Math.max(0, S.priceImportRows.length - headerIndex - 1)} filas potenciales`;
  }

  function analyzePriceImport() {
    hidePriceImportError();
    if (!S.priceImportRows.length) {
      showPriceImportError('Primero cargá una lista de precios.');
      return;
    }
    const headerRow = Math.round(number(E.priceImportHeaderRow.value)) - 1;
    const skuColumn = optionalColumnIndex(E.priceImportSkuColumn.value);
    const priceColumn = optionalColumnIndex(E.priceImportPriceColumn.value);
    const descriptionColumn = optionalColumnIndex(E.priceImportDescriptionColumn.value);
    if (headerRow < 0 || headerRow >= S.priceImportRows.length) {
      showPriceImportError('La fila de encabezados no es válida.');
      return;
    }
    if (skuColumn < 0 || priceColumn < 0 || skuColumn === priceColumn) {
      showPriceImportError('Seleccioná columnas diferentes para SKU y precio.');
      return;
    }

    const comparison = buildPriceImportComparison({ headerRow, skuColumn, priceColumn, descriptionColumn });
    S.priceImportComparison = comparison;
    S.priceImportSelected = new Set(comparison.changes.map((row) => row.materialId));
    S.priceImportFilter = 'changes';
    S.priceImportSearch = '';
    E.priceImportResultFilter.value = 'changes';
    E.priceImportSearch.value = '';
    E.priceImportResults.classList.remove('d-none');
    E.priceImportApplyButton.classList.remove('d-none');
    renderPriceImportResults();
    E.priceImportResults.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function buildPriceImportComparison(mapping) {
    const { headerRow, skuColumn, priceColumn, descriptionColumn } = mapping;
    const fileGroups = new Map();
    const issues = [];
    const rows = S.priceImportRows.slice(headerRow + 1);
    rows.forEach((row, offset) => {
      const excelRow = headerRow + offset + 2;
      const rawSku = row[skuColumn];
      const sku = spreadsheetSku(rawSku);
      const description = descriptionColumn >= 0 ? String(row[descriptionColumn] || '').trim() : '';
      const parsedPrice = parseSpreadsheetPrice(row[priceColumn]);
      if (!sku && !String(row[priceColumn] || '').trim() && !description) return;
      if (!sku) {
        issues.push({ kind: 'issue', issueType: 'missing-sku', sku: '', name: description || 'Fila sin SKU', fileDescription: description, filePrice: parsedPrice.valid ? parsedPrice.value : null, rowNumber: excelRow, statusLabel: 'Fila sin SKU', detail: `Fila ${excelRow}: no tiene un SKU utilizable.` });
        return;
      }
      const key = skuKey(sku);
      const zeroPrice = parsedPrice.valid && roundMoney(parsedPrice.value) === 0;
      const entry = { sku, key, fileDescription: description, filePrice: parsedPrice.value, validPrice: parsedPrice.valid && !zeroPrice, rawPrice: row[priceColumn], rowNumber: excelRow };
      if (zeroPrice) {
        issues.push({ ...entry, kind: 'issue', issueType: 'zero-price', name: description || sku, statusLabel: 'Precio en cero', detail: `Fila ${excelRow}: el precio es $ 0 y se excluyó de la actualización para evitar un cambio accidental.` });
      }
      if (!fileGroups.has(key)) fileGroups.set(key, []);
      fileGroups.get(key).push(entry);
    });

    const canonicalFile = new Map();
    const fileKeysSeen = new Set(fileGroups.keys());
    fileGroups.forEach((entries, key) => {
      const valid = entries.filter((entry) => entry.validPrice);
      const invalid = entries.filter((entry) => !entry.validPrice);
      invalid.forEach((entry) => issues.push({ ...entry, kind: 'issue', issueType: 'invalid-price', name: entry.fileDescription || 'Precio inválido', statusLabel: 'Precio inválido', detail: `Fila ${entry.rowNumber}: el precio “${String(entry.rawPrice || '')}” no se pudo interpretar.` }));
      const distinctPrices = [...new Set(valid.map((entry) => roundMoney(entry.filePrice).toFixed(2)))];
      if (distinctPrices.length > 1) {
        const first = entries[0];
        issues.push({ ...first, kind: 'issue', issueType: 'conflicting-duplicate', name: first.fileDescription || first.sku, statusLabel: 'SKU duplicado con precios distintos', detail: `El SKU aparece ${entries.length} veces con precios diferentes: ${distinctPrices.map((price) => formatCurrency(price)).join(', ')}.` });
        return;
      }
      if (!valid.length) return;
      const canonical = valid[0];
      canonical.duplicateCount = entries.length;
      canonicalFile.set(key, canonical);
      if (entries.length > 1) {
        issues.push({ ...canonical, kind: 'issue', issueType: 'duplicate', name: canonical.fileDescription || canonical.sku, statusLabel: 'SKU repetido', detail: `El SKU aparece ${entries.length} veces con el mismo precio. Se usó la primera coincidencia válida.` });
      }
    });

    const appMap = new Map();
    const noSkuInApp = [];
    S.materials.forEach((material) => {
      const sku = spreadsheetSku(material.sku);
      if (!sku) {
        noSkuInApp.push({ kind: 'issue', issueType: 'app-without-sku', materialId: material.id, sku: '', name: material.name, currentPrice: roundMoney(material.unit_price), statusLabel: 'Insumo sin SKU', detail: 'No puede compararse hasta que se cargue un SKU en la app.', active: material.active !== false });
        return;
      }
      appMap.set(skuKey(sku), { ...material, comparableSku: sku });
    });

    const changes = [];
    const unchanged = [];
    const missingInFile = [];
    const matched = [];

    appMap.forEach((material, key) => {
      const fileEntry = canonicalFile.get(key);
      if (!fileEntry) {
        if (!fileKeysSeen.has(key)) {
          missingInFile.push({ kind: 'missing-file', materialId: material.id, sku: material.comparableSku, name: material.name, currentPrice: roundMoney(material.unit_price), active: material.active !== false, statusLabel: 'No aparece en el Excel', detail: 'Puede haber sido eliminado o haber cambiado de SKU en la lista nueva.' });
        }
        return;
      }
      const currentPrice = roundMoney(material.unit_price);
      const filePrice = roundMoney(fileEntry.filePrice);
      const difference = roundMoney(filePrice - currentPrice);
      const percent = currentPrice > 0 ? difference / currentPrice * 100 : null;
      const common = {
        materialId: material.id,
        kind: Math.abs(difference) >= 0.01 ? (difference > 0 ? 'increase' : 'decrease') : 'unchanged',
        sku: material.comparableSku,
        name: material.name,
        currentPrice,
        filePrice,
        difference,
        percent,
        fileDescription: fileEntry.fileDescription,
        rowNumber: fileEntry.rowNumber,
        active: material.active !== false,
        duplicateCount: fileEntry.duplicateCount || 1
      };
      matched.push(common);
      if (common.kind === 'unchanged') unchanged.push({ ...common, statusLabel: 'Sin cambios' });
      else changes.push({ ...common, statusLabel: difference > 0 ? 'Aumento' : 'Disminución' });
    });

    const missingInApp = [];
    canonicalFile.forEach((entry, key) => {
      if (appMap.has(key)) return;
      missingInApp.push({ kind: 'missing-app', sku: entry.sku, name: entry.fileDescription || 'Artículo del archivo', fileDescription: entry.fileDescription, filePrice: roundMoney(entry.filePrice), rowNumber: entry.rowNumber, statusLabel: 'No existe en la app', detail: 'Puede ser un artículo nuevo o un SKU renombrado.' });
    });

    addPossibleSkuChangeSuggestions(missingInFile, missingInApp);
    const allIssues = [...issues, ...noSkuInApp];
    const increases = changes.filter((row) => row.kind === 'increase');
    const decreases = changes.filter((row) => row.kind === 'decrease');
    const allRows = [...changes, ...unchanged, ...missingInFile, ...missingInApp, ...allIssues];
    return { mapping, matched, changes, increases, decreases, unchanged, missingInFile, missingInApp, issues: allIssues, allRows, sourceRows: rows.length };
  }


  function addPossibleSkuChangeSuggestions(missingInFile, missingInApp) {
    const claimed = new Set();
    missingInApp.forEach((fileRow) => {
      let best = null;
      let bestScore = 0;
      missingInFile.forEach((appRow) => {
        if (claimed.has(appRow.materialId)) return;
        const score = priceImportNameSimilarity(fileRow.fileDescription || fileRow.name, appRow.name);
        if (score > bestScore) { bestScore = score; best = appRow; }
      });
      if (!best || bestScore < 0.72) return;
      claimed.add(best.materialId);
      fileRow.detail = `Posible cambio de SKU: el nombre se parece a “${best.name}” (SKU actual ${best.sku}). Revisalo antes de crear o editar el artículo.`;
      best.detail = `Posible cambio de SKU: en el archivo aparece “${fileRow.fileDescription || fileRow.name}” con SKU ${fileRow.sku}. Revisá si corresponde al mismo artículo.`;
      fileRow.possibleMatchSku = best.sku;
      best.possibleMatchSku = fileRow.sku;
    });
  }

  function priceImportNameSimilarity(left, right) {
    const a = normalize(left).replace(/[^a-z0-9]+/g, ' ').trim();
    const b = normalize(right).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (Math.min(a.length, b.length) >= 7 && (a.includes(b) || b.includes(a))) return 0.88;
    const stop = new Set(['de','del','la','las','el','los','x','por','con','sin','unidad','unidades','paquete','pack']);
    const ta = new Set(a.split(/\s+/).filter((token) => token.length > 1 && !stop.has(token)));
    const tb = new Set(b.split(/\s+/).filter((token) => token.length > 1 && !stop.has(token)));
    if (!ta.size || !tb.size) return 0;
    const intersection = [...ta].filter((token) => tb.has(token)).length;
    const union = new Set([...ta, ...tb]).size;
    return union ? intersection / union : 0;
  }

  function renderPriceImportResults() {
    const comparison = S.priceImportComparison;
    if (!comparison) return;
    E.priceImportKpiMatched.textContent = comparison.matched.length;
    E.priceImportKpiIncreases.textContent = comparison.increases.length;
    E.priceImportKpiDecreases.textContent = comparison.decreases.length;
    E.priceImportKpiUnchanged.textContent = comparison.unchanged.length;
    E.priceImportKpiMissingFile.textContent = comparison.missingInFile.length;
    E.priceImportKpiMissingApp.textContent = comparison.missingInApp.length;
    E.priceImportKpiIssues.textContent = comparison.issues.length;

    const selectedChanges = comparison.changes.filter((row) => S.priceImportSelected.has(row.materialId));
    E.priceImportSummaryAlert.className = `alert ${comparison.changes.length ? 'alert-warning' : 'alert-success'}`;
    E.priceImportSummaryAlert.innerHTML = comparison.changes.length
      ? `<i class="bi bi-exclamation-triangle-fill me-2"></i>Se detectaron <strong>${comparison.changes.length}</strong> cambios de precio: ${comparison.increases.length} aumentos y ${comparison.decreases.length} disminuciones. Hay <strong>${selectedChanges.length}</strong> seleccionados para actualizar.`
      : '<i class="bi bi-check-circle-fill me-2"></i>No se detectaron diferencias de precio entre el archivo y el catálogo.';

    const visible = filteredPriceImportRows();
    E.priceImportResultsBody.innerHTML = visible.map(priceImportRowHtml).join('') || '<tr><td colspan="8"><div class="empty-inline">No hay resultados para el filtro seleccionado.</div></td></tr>';
    E.priceImportResultsCaption.textContent = `${visible.length} resultados visibles · ${comparison.sourceRows} filas analizadas en “${S.priceImportSheetName}”`;
    updatePriceImportSelectionControls(visible);
  }

  function filteredPriceImportRows() {
    const comparison = S.priceImportComparison;
    if (!comparison) return [];
    const filter = S.priceImportFilter;
    let rows;
    if (filter === 'changes') rows = comparison.changes;
    else if (filter === 'increase') rows = comparison.increases;
    else if (filter === 'decrease') rows = comparison.decreases;
    else if (filter === 'unchanged') rows = comparison.unchanged;
    else if (filter === 'missing-file') rows = comparison.missingInFile;
    else if (filter === 'missing-app') rows = comparison.missingInApp;
    else if (filter === 'issues') rows = comparison.issues;
    else rows = comparison.allRows;
    const query = normalize(S.priceImportSearch);
    return rows.filter((row) => !query || normalize(`${row.sku || ''} ${row.name || ''} ${row.fileDescription || ''} ${row.detail || ''}`).includes(query));
  }

  function priceImportRowHtml(row) {
    const canUpdate = row.kind === 'increase' || row.kind === 'decrease';
    const checked = canUpdate && S.priceImportSelected.has(row.materialId);
    const currentPrice = row.currentPrice == null ? '—' : formatCurrency(row.currentPrice);
    const filePrice = row.filePrice == null ? '—' : formatCurrency(row.filePrice);
    const variation = canUpdate
      ? `<span class="price-change-pill is-${row.kind}"><i class="bi ${row.kind === 'increase' ? 'bi-arrow-up-right' : 'bi-arrow-down-right'}"></i>${row.difference > 0 ? '+' : ''}${eh(formatCurrency(row.difference))}${row.percent == null ? '' : ` · ${row.percent > 0 ? '+' : ''}${eh(formatPercent(row.percent))}`}</span>`
      : (row.kind === 'unchanged' ? '<span class="price-change-pill is-unchanged">$ 0 · 0%</span>' : '—');
    const statusClass = canUpdate ? row.kind : row.kind === 'unchanged' ? 'unchanged' : (row.kind === 'issue' ? 'issue' : 'warning');
    const subtitle = row.fileDescription && normalize(row.fileDescription) !== normalize(row.name)
      ? `<small>${eh(row.fileDescription)}</small>`
      : (row.detail ? `<small>${eh(row.detail)}</small>` : '');
    const inactive = row.active === false ? '<span class="badge text-bg-secondary ms-1">Inactivo</span>' : '';
    return `<tr class="price-import-row is-${ea(statusClass)}">
      <td class="price-import-check-col">${canUpdate ? `<input class="form-check-input" type="checkbox" data-price-import-select="${ea(row.materialId)}" ${checked ? 'checked' : ''} aria-label="Seleccionar ${ea(row.sku)}">` : ''}</td>
      <td><span class="sku-chip">${eh(row.sku || 'Sin SKU')}</span>${row.rowNumber ? `<small class="price-import-row-number">Fila ${row.rowNumber}</small>` : ''}</td>
      <td><div class="price-import-item-name">${eh(row.name || 'Sin descripción')}${inactive}</div>${subtitle}</td>
      <td><strong>${eh(currentPrice)}</strong></td>
      <td><strong>${eh(filePrice)}</strong></td>
      <td>${variation}</td>
      <td><span class="price-import-status is-${ea(statusClass)}">${eh(row.statusLabel || 'Revisar')}</span></td>
      <td>${canUpdate ? `<button class="btn btn-sm btn-outline-primary fw-bold" type="button" data-price-import-update="${ea(row.materialId)}">Actualizar</button>` : ''}</td>
    </tr>`;
  }

  function handlePriceImportFilterChange() {
    S.priceImportFilter = E.priceImportResultFilter.value;
    renderPriceImportResults();
  }

  function handlePriceImportSearch() {
    S.priceImportSearch = E.priceImportSearch.value;
    renderPriceImportResults();
  }

  function handlePriceImportResultChange(event) {
    const checkbox = event.target.closest('[data-price-import-select]');
    if (!checkbox) return;
    const id = checkbox.dataset.priceImportSelect;
    if (checkbox.checked) S.priceImportSelected.add(id);
    else S.priceImportSelected.delete(id);
    renderPriceImportResults();
  }

  async function handlePriceImportResultClick(event) {
    const button = event.target.closest('[data-price-import-update]');
    if (!button) return;
    const change = S.priceImportComparison?.changes.find((row) => row.materialId === button.dataset.priceImportUpdate);
    if (!change) return;
    await applyPriceUpdates([change], button);
  }

  function toggleVisiblePriceImportSelections() {
    const visibleChanges = filteredPriceImportRows().filter((row) => row.kind === 'increase' || row.kind === 'decrease');
    const select = E.priceImportSelectAll.checked;
    visibleChanges.forEach((row) => {
      if (select) S.priceImportSelected.add(row.materialId);
      else S.priceImportSelected.delete(row.materialId);
    });
    renderPriceImportResults();
  }

  function updatePriceImportSelectionControls(visibleRows) {
    const visibleChanges = visibleRows.filter((row) => row.kind === 'increase' || row.kind === 'decrease');
    const visibleSelected = visibleChanges.filter((row) => S.priceImportSelected.has(row.materialId)).length;
    E.priceImportSelectAll.disabled = visibleChanges.length === 0;
    E.priceImportSelectAll.checked = visibleChanges.length > 0 && visibleSelected === visibleChanges.length;
    E.priceImportSelectAll.indeterminate = visibleSelected > 0 && visibleSelected < visibleChanges.length;
    const totalSelected = S.priceImportComparison.changes.filter((row) => S.priceImportSelected.has(row.materialId)).length;
    E.priceImportApplyButton.disabled = totalSelected === 0;
    E.priceImportApplyButton.innerHTML = `<i class="bi bi-check2-all me-2"></i>Actualizar seleccionados (${totalSelected})`;
  }

  async function applySelectedPriceUpdates() {
    const selected = S.priceImportComparison?.changes.filter((row) => S.priceImportSelected.has(row.materialId)) || [];
    if (!selected.length) {
      toast('Seleccioná al menos un cambio de precio.', 'error');
      return;
    }
    const increases = selected.filter((row) => row.kind === 'increase').length;
    const decreases = selected.filter((row) => row.kind === 'decrease').length;
    const confirmed = window.confirm(`Se actualizarán ${selected.length} precios (${increases} aumentos y ${decreases} disminuciones). Los pedidos ya creados conservarán sus precios históricos. ¿Continuar?`);
    if (!confirmed) return;
    await applyPriceUpdates(selected, E.priceImportApplyButton);
  }

  async function applyPriceUpdates(changes, button) {
    if (!canManageMasterData()) {
      toast('Solo el administrador puede actualizar precios.', 'error');
      return;
    }
    buttonBusy(button, true, changes.length === 1 ? 'Actualizando...' : 'Actualizando precios...');
    hidePriceImportError();
    try {
      const updates = changes.map((change) => ({
        material_id: change.materialId,
        sku: change.sku,
        expected_old_price: change.currentPrice,
        new_price: change.filePrice
      }));
      const { data, error } = await S.sb.rpc('admin_bulk_update_material_prices', {
        p_updates: updates,
        p_source_file: S.priceImportFileName || null,
        p_source_sheet: S.priceImportSheetName || null
      });
      if (error) throw error;
      const result = typeof data === 'string' ? JSON.parse(data) : (data || {});
      await refreshAdmin(false);
      const mapping = S.priceImportComparison?.mapping;
      if (mapping) {
        S.priceImportComparison = buildPriceImportComparison(mapping);
        S.priceImportSelected = new Set(S.priceImportComparison.changes.map((row) => row.materialId));
        renderPriceImportResults();
      }
      toast(`${number(result.updated_count) || changes.length} precio${changes.length === 1 ? '' : 's'} actualizado${changes.length === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      console.error(error);
      const message = String(error?.message || '');
      showPriceImportError(message.includes('admin_bulk_update_material_prices') || message.includes('schema cache')
        ? 'Falta instalar la actualización de base de datos. Ejecutá actualizar-importacion-precios-excel.sql en Supabase.'
        : (message || 'No se pudieron actualizar los precios. Volvé a analizar el archivo e intentá nuevamente.'));
    } finally {
      buttonBusy(button, false);
      if (S.priceImportComparison) renderPriceImportResults();
    }
  }


  function setupPwa() {
    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
      navigator.serviceWorker.register('./sw.js').catch((error) => console.warn('No se pudo registrar el service worker:', error));
    }
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (standalone && E.installAppButton) E.installAppButton.classList.add('d-none');
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      S.deferredInstallPrompt = event;
      if (E.installAppButton && !standalone) E.installAppButton.classList.remove('d-none');
    });
    window.addEventListener('appinstalled', () => {
      S.deferredInstallPrompt = null;
      if (E.installAppButton) E.installAppButton.classList.add('d-none');
      toast('Pedidos Clean It quedó instalada.', 'success');
    });
  }

  async function installPwa() {
    if (!S.deferredInstallPrompt) {
      toast('Si Chrome no muestra el botón de instalación, abrí el menú del navegador y elegí “Instalar Pedidos Clean It”.', 'error');
      return;
    }
    const prompt = S.deferredInstallPrompt;
    S.deferredInstallPrompt = null;
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
    if (E.installAppButton) E.installAppButton.classList.add('d-none');
  }

  function openBillingImport() {
    if (!canManageMasterData()) { toast('Solo el administrador puede actualizar la facturación.', 'error'); return; }
    hideBillingImportError();
    if (!window.XLSX) {
      E.billingImportLibraryError.textContent = 'No se pudo cargar el lector de Excel. Revisá la conexión a internet y volvé a abrir la aplicación.';
      E.billingImportLibraryError.classList.remove('d-none');
    } else E.billingImportLibraryError.classList.add('d-none');
    if (!S.billingImportWorkbook) resetBillingImport(false);
    M.billingImport.show();
  }

  function clearBillingImportState() {
    S.billingImportWorkbook = null;
    S.billingImportRows = [];
    S.billingImportFileName = '';
    S.billingImportSheetName = '';
    S.billingImportComparison = null;
    S.billingImportSelected = new Set();
    S.billingImportManualMatches = new Map();
    S.billingImportFilter = 'changes';
    S.billingImportSearch = '';
  }

  function resetBillingImport(clearFile = true) {
    clearBillingImportState();
    if (clearFile && E.billingImportFile) E.billingImportFile.value = '';
    E.billingImportMapping.classList.add('d-none');
    E.billingImportResults.classList.add('d-none');
    E.billingImportAnalyzeButton.classList.add('d-none');
    E.billingImportApplyButton.classList.add('d-none');
    E.billingImportApplyAllButton.classList.add('d-none');
    E.billingImportResetButton.classList.add('d-none');
    E.billingImportResultFilter.value = 'changes';
    E.billingImportSearch.value = '';
    E.billingImportResultsBody.innerHTML = '';
    E.billingImportPreviewHead.innerHTML = '';
    E.billingImportPreviewBody.innerHTML = '';
    E.billingImportSelectAll.checked = false;
    E.billingImportSelectAll.indeterminate = false;
    hideBillingImportError();
  }

  async function handleBillingImportFile() {
    hideBillingImportError();
    const file = E.billingImportFile.files?.[0];
    if (!file) { resetBillingImport(false); return; }
    if (!window.XLSX) { showBillingImportError('No está disponible el lector de Excel. Revisá la conexión y recargá la aplicación.'); return; }
    const extension = String(file.name.split('.').pop() || '').toLowerCase();
    if (!['xlsx','xls','xlsb','csv'].includes(extension)) { showBillingImportError('El archivo debe ser XLSX, XLS, XLSB o CSV.'); E.billingImportFile.value=''; return; }
    if (file.size > 25 * 1024 * 1024) { showBillingImportError('El archivo supera los 25 MB.'); E.billingImportFile.value=''; return; }
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: false, cellNF: false, cellText: true });
      if (!workbook?.SheetNames?.length) throw new Error('El archivo no contiene hojas legibles.');
      S.billingImportWorkbook = workbook;
      S.billingImportFileName = file.name;
      S.billingImportComparison = null;
      S.billingImportSelected = new Set();
      S.billingImportManualMatches = new Map();
      E.billingImportSheet.innerHTML = workbook.SheetNames.map((name) => `<option value="${ea(name)}">${eh(name)}</option>`).join('');
      const preferred = workbook.SheetNames.find((name) => normalize(name) === 'prefacturacion') || workbook.SheetNames[0];
      E.billingImportSheet.value = preferred;
      E.billingImportFileSummary.textContent = `${file.name} · ${formatFileSize(file.size)}`;
      loadBillingImportSheet(preferred);
      E.billingImportMapping.classList.remove('d-none');
      E.billingImportResults.classList.add('d-none');
      E.billingImportAnalyzeButton.classList.remove('d-none');
      E.billingImportApplyButton.classList.add('d-none');
      E.billingImportApplyAllButton.classList.add('d-none');
      E.billingImportResetButton.classList.remove('d-none');
    } catch (error) {
      console.error(error);
      resetBillingImport(true);
      showBillingImportError(error.message || 'No se pudo leer el archivo.');
    }
  }

  function handleBillingImportSheetChange() {
    if (S.billingImportWorkbook) loadBillingImportSheet(E.billingImportSheet.value);
  }

  function loadBillingImportSheet(sheetName) {
    const sheet = S.billingImportWorkbook?.Sheets?.[sheetName];
    if (!sheet) { showBillingImportError('No se pudo leer la hoja seleccionada.'); return; }
    S.billingImportSheetName = sheetName;
    S.billingImportRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
    const detection = detectBillingImportStructure(S.billingImportRows);
    E.billingImportHeaderRow.max = Math.max(1, Math.min(500, S.billingImportRows.length || 1));
    E.billingImportHeaderRow.value = detection.headerRow + 1;
    populateBillingImportColumns(detection);
    E.billingImportMappingWarning.classList.toggle('d-none', detection.confident);
    E.billingImportMappingWarning.textContent = detection.confident ? '' : 'No se identificaron con seguridad “Nombre” y “Subtotal”. Revisá las columnas antes de analizar.';
    renderBillingImportPreview();
    E.billingImportResults.classList.add('d-none');
    E.billingImportApplyButton.classList.add('d-none');
    E.billingImportApplyAllButton.classList.add('d-none');
  }

  function handleBillingImportHeaderChange() {
    const headerIndex = Math.max(0, Math.min(S.billingImportRows.length - 1, Math.round(number(E.billingImportHeaderRow.value)) - 1));
    const detection = detectBillingColumnsInHeader(S.billingImportRows[headerIndex] || []);
    populateBillingImportColumns({ headerRow: headerIndex, ...detection });
    E.billingImportMappingWarning.classList.toggle('d-none', detection.confident);
    E.billingImportMappingWarning.textContent = detection.confident ? '' : 'Seleccioná manualmente la columna del servicio y la columna Subtotal sin IVA.';
    renderBillingImportPreview();
  }

  function detectBillingImportStructure(rows) {
    let best = { headerRow:0, nameColumn:-1, cuitColumn:-1, subtotalColumn:-1, score:-1, confident:false };
    for (let i=0; i<Math.min(rows.length,40); i+=1) {
      const detected = detectBillingColumnsInHeader(rows[i] || []);
      const score = detected.score + Math.min((rows[i] || []).filter((v)=>String(v||'').trim()).length, 12);
      if (score > best.score) best = { headerRow:i, ...detected, score };
    }
    return best;
  }

  function detectBillingColumnsInHeader(header) {
    let nameColumn=-1, cuitColumn=-1, subtotalColumn=-1, nameScore=0, cuitScore=0, subtotalScore=0;
    header.forEach((value,index)=>{
      const text=normalize(value).replace(/[^a-z0-9]+/g,' ').trim();
      let ns=0, cs=0, ss=0;
      if (text === 'nombre') ns=100;
      else if (['servicio','nombre servicio','servicio nombre','establecimiento'].includes(text)) ns=92;
      else if (text.includes('servicio') || text.includes('nombre')) ns=65;
      if (['cuit','c u i t','cuit cliente','cuit servicio'].includes(text)) cs=120;
      else if (text.includes('cuit')) cs=100;
      else if (text.includes('cuil')) cs=55;
      if (text === 'subtotal') ss=110;
      else if (text === 'subtotal sin iva' || text === 'neto sin iva' || text === 'importe neto') ss=105;
      else if (text.includes('subtotal')) ss=92;
      else if ((text.includes('neto') || text.includes('importe')) && !text.includes('iva') && !text.includes('total')) ss=60;
      if (ns>nameScore) { nameScore=ns; nameColumn=index; }
      if (cs>cuitScore) { cuitScore=cs; cuitColumn=index; }
      if (ss>subtotalScore) { subtotalScore=ss; subtotalColumn=index; }
    });
    const confident = nameColumn>=0 && subtotalColumn>=0 && nameColumn!==subtotalColumn && nameScore>=80 && subtotalScore>=80;
    return { nameColumn, cuitColumn, subtotalColumn, score:nameScore+cuitScore+subtotalScore, confident };
  }

  function populateBillingImportColumns(detection) {
    const header = S.billingImportRows[detection.headerRow] || [];
    const maxCols = Math.max(header.length, ...S.billingImportRows.slice(0,10).map((row)=>row.length), 0);
    const requiredOptions = Array.from({length:maxCols},(_,index)=>{
      const label=String(header[index] ?? '').trim();
      return `<option value="${index}">${columnLetter(index)}${label ? ` · ${eh(label)}` : ''}</option>`;
    }).join('');
    const optionalOptions = `<option value="">No usar CUIT</option>${requiredOptions}`;
    E.billingImportNameColumn.innerHTML = requiredOptions;
    E.billingImportCuitColumn.innerHTML = optionalOptions;
    E.billingImportSubtotalColumn.innerHTML = requiredOptions;
    if (detection.nameColumn>=0) E.billingImportNameColumn.value=String(detection.nameColumn);
    E.billingImportCuitColumn.value=detection.cuitColumn>=0 ? String(detection.cuitColumn) : '';
    if (detection.subtotalColumn>=0) E.billingImportSubtotalColumn.value=String(detection.subtotalColumn);
  }

  function renderBillingImportPreview() {
    if (!S.billingImportRows.length) return;
    const headerIndex=Math.max(0,Math.round(number(E.billingImportHeaderRow.value))-1);
    const nameCol=optionalColumnIndex(E.billingImportNameColumn.value);
    const cuitCol=optionalColumnIndex(E.billingImportCuitColumn.value);
    const subtotalCol=optionalColumnIndex(E.billingImportSubtotalColumn.value);
    const header=S.billingImportRows[headerIndex] || [];
    E.billingImportPreviewHead.innerHTML=`<tr><th>Fila</th><th>${eh(header[nameCol] || 'Servicio')}</th><th>${cuitCol>=0 ? eh(header[cuitCol] || 'CUIT') : 'CUIT'}</th><th>${eh(header[subtotalCol] || 'Subtotal')}</th><th>5% calculado</th><th>7% calculado</th></tr>`;
    const examples=[];
    for (let i=headerIndex+1; i<S.billingImportRows.length && examples.length<6; i+=1) {
      const row=S.billingImportRows[i] || [];
      const name=String(row[nameCol] ?? '').trim();
      if (!name || normalize(name)==='total') continue;
      const cuit=cuitCol>=0 ? normalizeCuit(row[cuitCol]) : '';
      const parsed=parseSpreadsheetPrice(row[subtotalCol]);
      examples.push(`<tr><td>${i+1}</td><td>${eh(name)}</td><td>${cuit ? eh(formatCuit(cuit)) : '<span class="text-secondary">—</span>'}</td><td>${parsed.valid ? eh(formatCurrency(parsed.value)) : '<span class="text-danger">No legible</span>'}</td><td>${parsed.valid ? eh(formatCurrency(parsed.value*0.05)) : '—'}</td><td>${parsed.valid ? eh(formatCurrency(parsed.value*0.07)) : '—'}</td></tr>`);
    }
    E.billingImportPreviewBody.innerHTML=examples.join('') || '<tr><td colspan="6">No hay filas de datos para previsualizar.</td></tr>';
    E.billingImportPreviewCaption.textContent=`${Math.max(0,S.billingImportRows.length-headerIndex-1)} filas debajo del encabezado${cuitCol>=0 ? ' · CUIT habilitado para matching' : ' · matching por nombre/dirección'}`;
  }

  function analyzeBillingImport() {
    hideBillingImportError();
    if (!S.billingImportRows.length) { showBillingImportError('Primero cargá un archivo.'); return; }
    const mapping={
      headerRow:Math.max(0,Math.round(number(E.billingImportHeaderRow.value))-1),
      nameColumn:optionalColumnIndex(E.billingImportNameColumn.value),
      cuitColumn:optionalColumnIndex(E.billingImportCuitColumn.value),
      subtotalColumn:optionalColumnIndex(E.billingImportSubtotalColumn.value)
    };
    if (mapping.nameColumn<0 || mapping.subtotalColumn<0 || mapping.nameColumn===mapping.subtotalColumn) { showBillingImportError('Seleccioná columnas distintas para servicio y Subtotal.'); return; }
    if (mapping.cuitColumn>=0 && [mapping.nameColumn,mapping.subtotalColumn].includes(mapping.cuitColumn)) { showBillingImportError('La columna CUIT debe ser distinta de Servicio y Subtotal.'); return; }
    S.billingImportComparison=buildBillingImportComparison(mapping);
    S.billingImportSelected=new Set(S.billingImportComparison.rows.filter((row)=>row.kind==='change' && row.fileSubtotal>0 && row.canUpdate).map((row)=>row.rowKey));
    S.billingImportFilter='changes';
    S.billingImportSearch='';
    E.billingImportResultFilter.value='changes';
    E.billingImportSearch.value='';
    E.billingImportResults.classList.remove('d-none');
    E.billingImportApplyButton.classList.remove('d-none');
    E.billingImportApplyAllButton.classList.remove('d-none');
    renderBillingImportResults();
  }

  function buildBillingImportComparison(mapping) {
    const excelRows=[];
    for (let i=mapping.headerRow+1; i<S.billingImportRows.length; i+=1) {
      const source=S.billingImportRows[i] || [];
      const excelName=String(source[mapping.nameColumn] ?? '').replace(/\s+/g,' ').trim();
      if (!excelName || normalize(excelName)==='total') continue;
      const excelCuitRaw=mapping.cuitColumn>=0 ? String(source[mapping.cuitColumn] ?? '').trim() : '';
      const excelCuit=normalizeCuit(excelCuitRaw);
      const excelCuitValid=!excelCuitRaw || isCuitFormatValid(excelCuit);
      const subtotalParsed=parseSpreadsheetPrice(source[mapping.subtotalColumn]);
      const rowKey=`${i+1}:${billingServiceKey(excelName)}:${excelCuit || 'sin-cuit'}`;
      excelRows.push({
        rowNumber:i+1,
        rowKey,
        excelName,
        excelCuitRaw,
        excelCuit,
        excelCuitValid,
        subtotalParsed,
        rawCells:[...source],
        headers:[...(S.billingImportRows[mapping.headerRow] || [])]
      });
    }

    const duplicateNames=new Set();
    const nameCounts=new Map();
    excelRows.forEach((row)=>{ const key=billingServiceKey(row.excelName); nameCounts.set(key,(nameCounts.get(key)||0)+1); });
    nameCounts.forEach((count,key)=>{ if (count>1) duplicateNames.add(key); });

    const excelCuitGroups=new Map();
    excelRows.forEach((row)=>{
      if (!row.excelCuit || !row.excelCuitValid) return;
      if (!excelCuitGroups.has(row.excelCuit)) excelCuitGroups.set(row.excelCuit,[]);
      excelCuitGroups.get(row.excelCuit).push(row);
    });
    const duplicateExcelCuits=new Map([...excelCuitGroups].filter(([,items])=>items.length>1));
    const duplicateAppCuits=duplicateServiceCuitGroups();

    const rows=excelRows.map((row)=>buildBillingImportRow(row, {
      duplicateName:duplicateNames.has(billingServiceKey(row.excelName)),
      duplicateExcelCuit:row.excelCuit ? duplicateExcelCuits.get(row.excelCuit) || [] : [],
      duplicateAppCuit:row.excelCuit ? duplicateAppCuits.get(row.excelCuit) || [] : []
    }));

    const byService=new Map();
    rows.forEach((row)=>{ if (row.serviceId) { if (!byService.has(row.serviceId)) byService.set(row.serviceId,[]); byService.get(row.serviceId).push(row); } });
    byService.forEach((items)=>{
      if (items.length>1) items.forEach((row)=>{
        row.kind='review';
        row.canUpdate=false;
        row.statusLabel='Servicio duplicado en el Excel';
        row.issue='Más de una fila termina vinculada al mismo servicio. Revisá el CUIT y elegí manualmente el servicio correcto.';
      });
    });

    const matchedIds=new Set(rows.filter((r)=>r.serviceId).map((r)=>r.serviceId));
    const missingFile=S.services.filter((service)=>service.active!==false && !matchedIds.has(service.id)).map((service)=>({
      kind:'missing-file', rowKey:`missing:${service.id}`, serviceId:service.id, serviceName:service.name, serviceCuit:normalizeCuit(service.cuit), excelName:'', excelCuit:'', currentBilling:roundMoney(service.monthly_billing), fileSubtotal:null,
      currentFive:roundMoney(number(service.monthly_billing)*0.05), fileFive:null, currentSeven:roundMoney(number(service.monthly_billing)*0.07), fileSeven:null,
      limitPercent:number(service.budget_limit_percent||5), currentLimit:roundMoney(number(service.monthly_billing)*number(service.budget_limit_percent||5)/100), fileLimit:null,
      canUpdate:false, statusLabel:'No aparece en el Excel', searchText:normalize(`${service.name} ${service.cuit||''} ${service.address||''} faltante excel`)
    }));

    const duplicateCuitKeys=new Set([...duplicateAppCuits.keys(),...duplicateExcelCuits.keys()]);
    const summary={
      sourceRows:rows.length,
      unchanged:rows.filter((r)=>r.kind==='unchanged').length,
      changes:rows.filter((r)=>r.kind==='change').length,
      review:rows.filter((r)=>r.kind==='review').length,
      unmatched:rows.filter((r)=>r.kind==='unmatched').length,
      missingFile:missingFile.length,
      duplicateCuits:duplicateCuitKeys.size,
      duplicateAppCuits:duplicateAppCuits.size,
      duplicateExcelCuits:duplicateExcelCuits.size
    };
    return { mapping, rows, missingFile, summary, duplicateAppCuits, duplicateExcelCuits };
  }

  function buildBillingImportRow(sourceRow, flags={}) {
    const { rowNumber,rowKey,excelName,excelCuit,excelCuitRaw,excelCuitValid,subtotalParsed }=sourceRow;
    const manualId=S.billingImportManualMatches.get(rowKey) || '';
    let match=null, suggested=null, matchType='', matchInfo={};
    if (manualId) {
      match=S.services.find((s)=>s.id===manualId) || null;
      matchType='manual';
    } else {
      const found=findBillingServiceMatch(excelName,excelCuit);
      match=found.autoService;
      suggested=found.suggestedService;
      matchType=match ? found.matchType : (found.matchType || '');
      matchInfo=found;
    }

    if (excelCuitRaw && !excelCuitValid && !manualId) {
      return billingIssueRow(sourceRow, match, suggested, 'CUIT no válido', `El CUIT “${excelCuitRaw}” no tiene 11 dígitos. Revisá la fila antes de vincularla.`);
    }
    if (flags.duplicateName && !manualId) {
      return billingIssueRow(sourceRow, match, suggested, 'Nombre duplicado en el Excel', 'Hay más de una fila con el mismo nombre de servicio. Usá el CUIT y la vinculación manual para confirmar cuál corresponde.');
    }
    if (matchInfo.cuitConflict && !manualId) {
      return billingIssueRow(sourceRow, null, suggested, 'CUIT no coincide', `El nombre se parece a un servicio de la app, pero el CUIT del Excel (${formatCuit(excelCuit)}) es distinto del CUIT cargado en ese servicio.`);
    }
    if (matchInfo.duplicateCuitServices?.length && !manualId) {
      const names=matchInfo.duplicateCuitServices.map((service)=>service.name).join(', ');
      return billingIssueRow(sourceRow, null, suggested, 'CUIT compartido · revisar', `El CUIT ${formatCuit(excelCuit)} está cargado en ${matchInfo.duplicateCuitServices.length} servicios: ${names}. Elegí manualmente cuál corresponde a esta fila.`);
    }
    if (!subtotalParsed.valid) return billingIssueRow(sourceRow, match, suggested, 'Subtotal no legible', 'La columna Subtotal no contiene un importe válido.');
    if (!match) {
      return { kind:'unmatched', rowNumber,rowKey,excelName,excelCuit,fileSubtotal:subtotalParsed.value,serviceId:null,serviceName:'',serviceCuit:'',suggestedServiceId:suggested?.id||null,suggestedServiceName:suggested?.name||'',suggestedScore:suggested?.score||0,matchType,canUpdate:false,statusLabel:suggested?'Revisar coincidencia':'Servicio no encontrado',rawCells:sourceRow.rawCells||[],headers:sourceRow.headers||[],searchText:normalize(`${excelName} ${excelCuit} ${(sourceRow.rawCells||[]).join(' ')} ${suggested?.name||''} no encontrado`) };
    }

    const currentBilling=roundMoney(match.monthly_billing);
    const fileSubtotal=roundMoney(subtotalParsed.value);
    const diff=roundMoney(fileSubtotal-currentBilling);
    const unchanged=Math.abs(diff)<0.01;
    const limitPercent=number(match.budget_limit_percent||5);
    const zeroReview=fileSubtotal===0 && currentBilling!==0;
    const serviceCuit=normalizeCuit(match.cuit);
    const cuitMismatch=Boolean(excelCuit && serviceCuit && excelCuit!==serviceCuit);
    const sharedCuitCount=serviceCuit ? (duplicateServiceCuitGroups().get(serviceCuit)?.length || 0) : 0;
    const issueParts=[];
    if (cuitMismatch) issueParts.push(`CUIT Excel ${formatCuit(excelCuit)} ≠ CUIT app ${formatCuit(serviceCuit)}.`);
    if (sharedCuitCount>1) issueParts.push(`El CUIT de la app está compartido por ${sharedCuitCount} servicios.`);
    if (zeroReview) issueParts.push('El Excel informa subtotal $0. Verificá el dato antes de reemplazar una facturación existente.');
    return {
      kind: zeroReview ? 'review' : (unchanged ? 'unchanged' : 'change'), rowNumber,rowKey,excelName,excelCuit,serviceId:match.id,serviceName:match.name,serviceCuit,serviceAddress:match.address||'',matchType,
      fileSubtotal,currentBilling,difference:diff,percent:currentBilling>0 ? (diff/currentBilling)*100 : null,
      currentFive:roundMoney(currentBilling*0.05),fileFive:roundMoney(fileSubtotal*0.05),currentSeven:roundMoney(currentBilling*0.07),fileSeven:roundMoney(fileSubtotal*0.07),
      limitPercent,currentLimit:roundMoney(currentBilling*limitPercent/100),fileLimit:roundMoney(fileSubtotal*limitPercent/100),
      canUpdate:true,statusLabel:zeroReview?'Subtotal $0 · revisar':(unchanged?'Coincide':'Requiere ajuste'),issue:issueParts.join(' '),
      rawCells:sourceRow.rawCells||[],headers:sourceRow.headers||[],
      searchText:normalize(`${excelName} ${excelCuit} ${match.cuit||''} ${(sourceRow.rawCells||[]).join(' ')} ${match.name} ${match.address||''} ${unchanged?'coincide':'ajuste'}`)
    };
  }

  function billingIssueRow(sourceRow, match, suggested, label, issue) {
    return { kind:'review', rowNumber:sourceRow.rowNumber,rowKey:sourceRow.rowKey,excelName:sourceRow.excelName,excelCuit:sourceRow.excelCuit||'',fileSubtotal:sourceRow.subtotalParsed.valid?sourceRow.subtotalParsed.value:null,
      serviceId:match?.id||null,serviceName:match?.name||'',serviceCuit:normalizeCuit(match?.cuit),suggestedServiceId:suggested?.id||null,suggestedServiceName:suggested?.name||'',suggestedScore:suggested?.score||0,canUpdate:false,statusLabel:label,issue,
      rawCells:sourceRow.rawCells||[],headers:sourceRow.headers||[],
      searchText:normalize(`${sourceRow.excelName} ${sourceRow.excelCuit||''} ${(sourceRow.rawCells||[]).join(' ')} ${match?.name||''} ${match?.cuit||''} ${suggested?.name||''} revisar`) };
  }

  function billingServiceKey(value) {
    return normalize(value).replace(/\b(consorcio|cons|de|del|la|las|los|propietarios|propietario|copropietarios|coprop|edificio|calle|finca)\b/g,' ').replace(/\bavenida\b/g,' av ').replace(/\bavda\b/g,' av ').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }

  function billingTokens(value) { return billingServiceKey(value).split(' ').filter((token)=>token.length>1); }
  function billingNumbers(value) { return (billingServiceKey(value).match(/\b\d{2,5}\b/g) || []); }
  function jaccardScore(a,b) {
    const A=new Set(billingTokens(a)), B=new Set(billingTokens(b));
    if (!A.size || !B.size) return 0;
    let intersection=0; A.forEach((t)=>{ if (B.has(t)) intersection+=1; });
    return intersection/(A.size+B.size-intersection);
  }
  function stringSimilarity(a,b) {
    const x=billingServiceKey(a), y=billingServiceKey(b);
    if (!x || !y) return 0;
    if (x===y) return 1;
    const longer=x.length>=y.length?x:y, shorter=x.length>=y.length?y:x;
    const costs=Array.from({length:shorter.length+1},(_,i)=>i);
    for (let i=1;i<=longer.length;i+=1) {
      let prev=costs[0]; costs[0]=i;
      for (let j=1;j<=shorter.length;j+=1) {
        const temp=costs[j]; costs[j]=Math.min(costs[j]+1,costs[j-1]+1,prev+(longer[i-1]===shorter[j-1]?0:1)); prev=temp;
      }
    }
    return 1-costs[shorter.length]/longer.length;
  }
  function serviceCandidateScore(excelName, service, excelCuit='') {
    const candidates=[service.name,service.address].filter(Boolean);
    let best=0;
    candidates.forEach((candidate)=>{
      let score=Math.max(stringSimilarity(excelName,candidate)*0.65+jaccardScore(excelName,candidate)*0.35, jaccardScore(excelName,candidate));
      const aNums=billingNumbers(excelName), bNums=billingNumbers(candidate);
      if (aNums.length && bNums.length) {
        const overlap=aNums.some((n)=>bNums.includes(n));
        if (overlap) score=Math.min(1,score+0.12); else score*=0.58;
      }
      const serviceCuit=normalizeCuit(service.cuit);
      if (excelCuit && serviceCuit && excelCuit!==serviceCuit) score*=0.28;
      best=Math.max(best,score);
    });
    return best;
  }

  function findBillingServiceMatch(excelName, excelCuit='') {
    const normalizedCuit=normalizeCuit(excelCuit);
    if (isCuitFormatValid(normalizedCuit)) {
      const cuitMatches=S.services.filter((service)=>normalizeCuit(service.cuit)===normalizedCuit);
      if (cuitMatches.length===1) return { autoService:cuitMatches[0],suggestedService:null,matchType:'cuit' };
      if (cuitMatches.length>1) {
        const ranked=cuitMatches.map((service)=>({service,score:serviceCandidateScore(excelName,service,normalizedCuit)})).sort((a,b)=>b.score-a.score);
        const best=ranked[0];
        return { autoService:null,suggestedService:best?{...best.service,score:best.score}:null,matchType:'cuit-duplicate',duplicateCuitServices:cuitMatches };
      }
    }

    const exactKey=billingServiceKey(excelName);
    const exact=S.services.find((service)=>billingServiceKey(service.name)===exactKey || (service.address && billingServiceKey(service.address)===exactKey));
    if (exact) {
      const serviceCuit=normalizeCuit(exact.cuit);
      if (normalizedCuit && serviceCuit && normalizedCuit!==serviceCuit) return { autoService:null,suggestedService:{...exact,score:1},matchType:'cuit-conflict',cuitConflict:true };
      return { autoService:exact,suggestedService:null,matchType:'exact' };
    }

    const ranked=S.services.map((service)=>({service,score:serviceCandidateScore(excelName,service,normalizedCuit)})).sort((a,b)=>b.score-a.score);
    const best=ranked[0], second=ranked[1];
    if (best && best.score>=0.88 && (!second || best.score-second.score>=0.10)) return { autoService:best.service,suggestedService:null,matchType:'auto' };
    if (best && best.score>=0.52) return { autoService:null,suggestedService:{...best.service,score:best.score},matchType:'suggested' };
    return { autoService:null,suggestedService:null,matchType:'' };
  }

  function duplicateServiceCuitGroups() {
    const groups=new Map();
    S.services.forEach((service)=>{
      const cuit=normalizeCuit(service.cuit);
      if (!isCuitFormatValid(cuit)) return;
      if (!groups.has(cuit)) groups.set(cuit,[]);
      groups.get(cuit).push(service);
    });
    return new Map([...groups].filter(([,items])=>items.length>1));
  }

  function filteredBillingImportRows() {
    if (!S.billingImportComparison) return [];
    const all=[...S.billingImportComparison.rows,...S.billingImportComparison.missingFile];
    const filter=S.billingImportFilter || 'changes';
    const q=normalize(S.billingImportSearch||'');
    return all.filter((row)=>{
      const matchesFilter=filter==='all' || (filter==='changes' ? row.kind==='change' : filter==='unchanged' ? row.kind==='unchanged' : filter==='review' ? ['review','unmatched'].includes(row.kind) : filter==='missing-file' ? row.kind==='missing-file' : true);
      return matchesFilter && (!q || (row.searchText||'').includes(q));
    });
  }

  function renderBillingImportResults() {
    const comparison=S.billingImportComparison;
    if (!comparison) return;
    const s=comparison.summary;
    E.billingImportKpiRows.textContent=s.sourceRows;
    E.billingImportKpiUnchanged.textContent=s.unchanged;
    E.billingImportKpiChanges.textContent=s.changes;
    E.billingImportKpiReview.textContent=s.review;
    E.billingImportKpiUnmatched.textContent=s.unmatched;
    E.billingImportKpiMissingFile.textContent=s.missingFile;
    E.billingImportKpiDuplicateCuits.textContent=s.duplicateCuits || 0;
    E.billingImportSummaryAlert.innerHTML=`<strong>${s.changes ? `${s.changes} servicio${s.changes===1?' requiere':'s requieren'} ajuste.` : 'La facturación encontrada coincide en todos los servicios vinculados.'}</strong> El matching prioriza <strong>CUIT único</strong> y luego nombre/dirección. Los valores de 5%, límite operativo y 7% se calculan siempre sobre el <strong>Subtotal sin IVA</strong>.${(s.review+s.unmatched)>0 ? ' En las filas amarillas podés abrir <strong>“Ver fila original del Excel”</strong> y vincular manualmente el servicio.' : ''}`;
    renderBillingDuplicateCuitAlert(comparison);
    const visible=filteredBillingImportRows();
    E.billingImportResultsBody.innerHTML=visible.map(renderBillingImportRow).join('') || '<tr><td colspan="9"><div class="empty-inline">No hay resultados para este filtro.</div></td></tr>';
    E.billingImportResultsCaption.textContent=`${visible.length} filas visibles · ${s.sourceRows} servicios leídos del Excel · ${s.missingFile} servicios de la app sin fila vinculada`;
    updateBillingImportSelectionControls(visible);
  }

  function renderBillingDuplicateCuitAlert(comparison) {
    const appGroups=[...(comparison.duplicateAppCuits || new Map()).entries()];
    const excelGroups=[...(comparison.duplicateExcelCuits || new Map()).entries()];
    if (!appGroups.length && !excelGroups.length) {
      E.billingImportDuplicateCuitAlert.classList.add('d-none');
      E.billingImportDuplicateCuitAlert.innerHTML='';
      return;
    }
    const appHtml=appGroups.slice(0,5).map(([cuit,services])=>`<li><strong>${eh(formatCuit(cuit))}</strong> en la app: ${services.map((service)=>eh(service.name)).join(', ')}</li>`).join('');
    const excelHtml=excelGroups.slice(0,5).map(([cuit,rows])=>`<li><strong>${eh(formatCuit(cuit))}</strong> en el Excel: ${rows.map((row)=>eh(row.excelName)).join(', ')}</li>`).join('');
    const extra=(appGroups.length>5 || excelGroups.length>5) ? '<li>Hay más CUIT compartidos. Filtrá “Revisar / no encontrados” para verlos.</li>' : '';
    E.billingImportDuplicateCuitAlert.innerHTML=`<div class="d-flex gap-2"><i class="bi bi-exclamation-triangle-fill"></i><div><strong>Hay CUIT repetidos.</strong> Esto puede ser correcto cuando un mismo titular corresponde a varios consorcios, pero la app no va a elegir a ciegas entre ellos.<ul class="mb-0 mt-2">${appHtml}${excelHtml}${extra}</ul></div></div>`;
    E.billingImportDuplicateCuitAlert.classList.remove('d-none');
  }

  function billingValueChangeHtml(oldValue,newValue) {
    if (newValue==null) return `<strong>${eh(formatCurrency(oldValue))}</strong>`;
    const changed=Math.abs(roundMoney(newValue)-roundMoney(oldValue))>=0.01;
    return `<div class="billing-value-change ${changed?'is-changed':''}"><span>${eh(formatCurrency(oldValue))}</span>${changed?'<i class="bi bi-arrow-right"></i>':''}<strong>${changed?eh(formatCurrency(newValue)):''}</strong></div>`;
  }

  function billingSourcePreview(row) {
    if (!['review','unmatched'].includes(row.kind)) return '';
    const cells=(row.rawCells||[]).map((value,index)=>{
      const text=String(value ?? '').replace(/\s+/g,' ').trim();
      if (!text) return null;
      const header=String((row.headers||[])[index] ?? '').replace(/\s+/g,' ').trim() || `Columna ${columnLetter(index)}`;
      return `<div class="billing-source-field"><span>${eh(header)}</span><strong>${eh(text)}</strong></div>`;
    }).filter(Boolean);
    if (!cells.length) return '';
    return `<details class="billing-source-preview mt-2"><summary><i class="bi bi-file-earmark-spreadsheet me-1"></i>Ver fila ${eh(String(row.rowNumber || ''))} original del Excel</summary><div class="billing-source-grid">${cells.join('')}</div></details>`;
  }

  function billingMatchSelect(row) {
    if (row.kind==='missing-file') return `<div class="billing-match-name"><strong>${eh(row.serviceName)}</strong>${row.serviceCuit?`<span class="cuit-chip mt-1">${eh(formatCuit(row.serviceCuit))}</span>`:''}<small>Sin fila vinculada en el Excel</small></div>`;
    const selected=row.serviceId || '';
    const options=['<option value="">— Vincular manualmente —</option>',...S.services.map((service)=>{
      const cuit=normalizeCuit(service.cuit);
      return `<option value="${ea(service.id)}" ${service.id===selected?'selected':''}>${eh(service.name)}${cuit?` · ${eh(formatCuit(cuit))}`:''}</option>`;
    })].join('');
    const suggestion=row.suggestedServiceName ? `<small class="billing-match-suggestion">Sugerencia: ${eh(row.suggestedServiceName)} (${Math.round(number(row.suggestedScore)*100)}%)</small>` : '';
    const matchText=row.matchType==='manual'?'Vinculación manual':row.matchType==='cuit'?'Coincidencia por CUIT':row.matchType==='exact'?'Coincidencia exacta por nombre':'Coincidencia automática';
    const matchLabel=row.serviceId ? `<small>${matchText}${row.serviceCuit?` · App ${eh(formatCuit(row.serviceCuit))}`:''}</small>` : suggestion;
    const excelCuit=row.excelCuit ? `<span class="cuit-chip mt-1">Excel ${eh(formatCuit(row.excelCuit))}</span>` : '<small>Excel sin CUIT legible</small>';
    return `<div class="billing-match-name"><strong>${eh(row.excelName)}</strong>${excelCuit}${matchLabel}<select class="form-select form-select-sm mt-2" data-billing-import-match="${ea(row.rowKey)}">${options}</select>${billingSourcePreview(row)}</div>`;
  }

  function renderBillingImportRow(row) {
    if (row.kind==='missing-file') return `<tr class="billing-import-row is-missing"><td></td><td>${billingMatchSelect(row)}</td><td>—</td><td><strong>${eh(formatCurrency(row.currentBilling))}</strong></td><td>${eh(formatCurrency(row.currentFive))}</td><td>${eh(formatCurrency(row.currentLimit))} <small>${eh(formatPercent(row.limitPercent))}</small></td><td>${eh(formatCurrency(row.currentSeven))}</td><td><span class="price-import-status is-warning">No aparece en Excel</span></td><td></td></tr>`;
    const canSelect=row.kind==='change' && row.canUpdate;
    const checked=S.billingImportSelected.has(row.rowKey);
    const statusClass=row.kind==='unchanged'?'unchanged':row.kind==='change'?'issue':'warning';
    const statusDetail=row.issue ? `<small class="billing-status-detail">${eh(row.issue)}</small>` : '';
    const fileBilling=row.fileSubtotal==null?'—':formatCurrency(row.fileSubtotal);
    return `<tr class="billing-import-row is-${ea(row.kind)}">
      <td class="price-import-check-col">${canSelect?`<input class="form-check-input" type="checkbox" data-billing-import-select="${ea(row.rowKey)}" ${checked?'checked':''}>`:''}</td>
      <td>${billingMatchSelect(row)}</td>
      <td><strong>${eh(fileBilling)}</strong><small>Base sin IVA</small></td>
      <td>${row.currentBilling==null?'—':billingValueChangeHtml(row.currentBilling,row.fileSubtotal)}</td>
      <td>${row.currentFive==null?'—':billingValueChangeHtml(row.currentFive,row.fileFive)}</td>
      <td>${row.currentLimit==null?'—':`${billingValueChangeHtml(row.currentLimit,row.fileLimit)}<small>${eh(formatPercent(row.limitPercent))} se mantiene</small>`}</td>
      <td>${row.currentSeven==null?'—':billingValueChangeHtml(row.currentSeven,row.fileSeven)}</td>
      <td><span class="price-import-status is-${statusClass}">${eh(row.statusLabel||'Revisar')}</span>${statusDetail}</td>
      <td>${row.canUpdate && row.serviceId && row.kind!=='unchanged'?`<button class="btn btn-sm btn-outline-primary fw-bold" type="button" data-billing-import-update="${ea(row.rowKey)}">Actualizar</button>`:''}</td>
    </tr>`;
  }

  function handleBillingImportResultChange(event) {
    const select=event.target.closest('[data-billing-import-match]');
    if (select) {
      const rowKey=select.dataset.billingImportMatch;
      if (select.value) S.billingImportManualMatches.set(rowKey,select.value); else S.billingImportManualMatches.delete(rowKey);
      const mapping=S.billingImportComparison?.mapping;
      if (mapping) {
        S.billingImportComparison=buildBillingImportComparison(mapping);
        const validKeys=new Set(S.billingImportComparison.rows.filter((r)=>r.kind==='change'&&r.canUpdate).map((r)=>r.rowKey));
        S.billingImportSelected=new Set([...S.billingImportSelected].filter((key)=>validKeys.has(key)));
        renderBillingImportResults();
      }
      return;
    }
    const checkbox=event.target.closest('[data-billing-import-select]');
    if (!checkbox) return;
    const key=checkbox.dataset.billingImportSelect;
    if (checkbox.checked) S.billingImportSelected.add(key); else S.billingImportSelected.delete(key);
    renderBillingImportResults();
  }

  async function handleBillingImportResultClick(event) {
    const button=event.target.closest('[data-billing-import-update]');
    if (!button) return;
    const row=S.billingImportComparison?.rows.find((item)=>item.rowKey===button.dataset.billingImportUpdate);
    if (!row || !row.canUpdate || !row.serviceId) return;
    if (row.fileSubtotal===0 && row.currentBilling!==0 && !confirm(`El Excel informa $0 de subtotal para ${row.serviceName}. ¿Querés reemplazar igualmente la facturación actual?`)) return;
    await applyBillingUpdates([row],button);
  }

  function toggleVisibleBillingImportSelections() {
    const rows=filteredBillingImportRows().filter((row)=>row.kind==='change'&&row.canUpdate&&row.fileSubtotal>0);
    rows.forEach((row)=>{ if (E.billingImportSelectAll.checked) S.billingImportSelected.add(row.rowKey); else S.billingImportSelected.delete(row.rowKey); });
    renderBillingImportResults();
  }

  function updateBillingImportSelectionControls(visibleRows) {
    const changes=visibleRows.filter((row)=>row.kind==='change'&&row.canUpdate&&row.fileSubtotal>0);
    const selectedVisible=changes.filter((row)=>S.billingImportSelected.has(row.rowKey)).length;
    E.billingImportSelectAll.disabled=changes.length===0;
    E.billingImportSelectAll.checked=changes.length>0 && selectedVisible===changes.length;
    E.billingImportSelectAll.indeterminate=selectedVisible>0 && selectedVisible<changes.length;
    const totalSelected=S.billingImportComparison.rows.filter((row)=>row.kind==='change'&&row.canUpdate&&S.billingImportSelected.has(row.rowKey)).length;
    const allChanges=S.billingImportComparison.rows.filter((row)=>row.kind==='change'&&row.canUpdate&&row.fileSubtotal>0).length;
    E.billingImportApplyButton.disabled=totalSelected===0;
    E.billingImportApplyButton.innerHTML=`<i class="bi bi-check2-square me-2"></i>Actualizar seleccionados (${totalSelected})`;
    E.billingImportApplyAllButton.disabled=allChanges===0;
    E.billingImportApplyAllButton.innerHTML=`<i class="bi bi-check2-all me-2"></i>Actualizar todos los ajustes (${allChanges})`;
  }

  async function applySelectedBillingUpdates() {
    const rows=S.billingImportComparison?.rows.filter((row)=>row.kind==='change'&&row.canUpdate&&S.billingImportSelected.has(row.rowKey)) || [];
    if (!rows.length) { toast('Seleccioná al menos un ajuste.', 'error'); return; }
    if (!confirm(`Se actualizará la facturación mensual de ${rows.length} servicio${rows.length===1?'':'s'}. Los porcentajes de límite operativo no cambiarán. ¿Continuar?`)) return;
    await applyBillingUpdates(rows,E.billingImportApplyButton);
  }

  async function applyAllBillingUpdates() {
    const rows=S.billingImportComparison?.rows.filter((row)=>row.kind==='change'&&row.canUpdate&&row.fileSubtotal>0) || [];
    if (!rows.length) { toast('No hay ajustes seguros para aplicar.', 'error'); return; }
    if (!confirm(`Se actualizarán todos los ${rows.length} servicios con diferencias seguras. Las filas a revisar, sin coincidencia o con subtotal $0 quedarán sin cambios. ¿Continuar?`)) return;
    await applyBillingUpdates(rows,E.billingImportApplyAllButton);
  }

  async function applyBillingUpdates(rows,button) {
    if (!canManageMasterData()) { toast('Solo el administrador puede actualizar la facturación.', 'error'); return; }
    buttonBusy(button,true,rows.length===1?'Actualizando...':'Actualizando servicios...');
    hideBillingImportError();
    const failures=[];
    let updated=0;
    try {
      for (const row of rows) {
        const { error }=await S.sb.from('services').update({ monthly_billing:roundMoney(row.fileSubtotal) }).eq('id',row.serviceId);
        if (error) failures.push(`${row.serviceName}: ${error.message}`); else updated+=1;
      }
      await refreshAdmin(false);
      const mapping=S.billingImportComparison?.mapping;
      if (mapping) {
        S.billingImportComparison=buildBillingImportComparison(mapping);
        S.billingImportSelected=new Set(S.billingImportComparison.rows.filter((row)=>row.kind==='change'&&row.canUpdate&&row.fileSubtotal>0).map((row)=>row.rowKey));
        renderBillingImportResults();
      }
      const pendingReferences = ordersNeedingBillingReferenceReview();
      if (failures.length) showBillingImportError(`Se actualizaron ${updated} servicios, pero ${failures.length} fallaron: ${failures.slice(0,3).join(' · ')}`);
      else toast(`${updated} servicio${updated===1?'':'s'} actualizado${updated===1?'':'s'}.${pendingReferences.length ? ` ${pendingReferences.length} pedido${pendingReferences.length===1?'':'s'} abierto${pendingReferences.length===1?'':'s'} debe${pendingReferences.length===1?'':'n'} confirmar la nueva referencia.` : ''}`, 'success');
    } catch (error) {
      console.error(error); showBillingImportError(error.message || 'No se pudo actualizar la facturación.');
    } finally { buttonBusy(button,false); if (S.billingImportComparison) renderBillingImportResults(); }
  }

  function showBillingImportError(message) {
    E.billingImportError.textContent=message;
    E.billingImportError.classList.remove('d-none');
    E.billingImportError.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function hideBillingImportError() {
    if (!E.billingImportError) return;
    E.billingImportError.textContent=''; E.billingImportError.classList.add('d-none');
  }

  function optionalColumnIndex(value) {
    if (value === '' || value == null) return -1;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1;
  }

  function spreadsheetSku(value) {
    let sku = String(value ?? '').replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\u00a0/g, ' ').trim();
    if (/^\d+\.0$/.test(sku)) sku = sku.slice(0, -2);
    return sku.slice(0, 120);
  }

  function skuKey(value) {
    return spreadsheetSku(value).toLocaleUpperCase('es-AR');
  }

  function parseSpreadsheetPrice(value) {
    if (typeof value === 'number') return { valid: Number.isFinite(value) && value >= 0, value: roundMoney(value) };
    let text = String(value ?? '').replace(/\u00a0/g, ' ').trim();
    if (!text) return { valid: false, value: null };
    const negative = /^\s*\(.*\)\s*$/.test(text) || /^\s*-/.test(text);
    text = text.replace(/[^0-9,.-]/g, '').replace(/-/g, '');
    if (!text || !/[0-9]/.test(text)) return { valid: false, value: null };
    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    let normalized = text;
    if (lastComma >= 0 && lastDot >= 0) {
      const decimal = lastComma > lastDot ? ',' : '.';
      const thousands = decimal === ',' ? /\./g : /,/g;
      normalized = text.replace(thousands, '').replace(decimal, '.');
    } else if (lastComma >= 0 || lastDot >= 0) {
      const separator = lastComma >= 0 ? ',' : '.';
      const pieces = text.split(separator);
      const decimals = pieces[pieces.length - 1].length;
      if (pieces.length === 2 && decimals > 0 && decimals <= 2) normalized = `${pieces[0]}.${pieces[1]}`;
      else if (pieces.length > 2 && decimals > 0 && decimals <= 2) normalized = `${pieces.slice(0, -1).join('')}.${pieces[pieces.length - 1]}`;
      else normalized = pieces.join('');
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed) || negative || parsed < 0 || parsed > 999999999.99) return { valid: false, value: null };
    return { valid: true, value: roundMoney(parsed) };
  }

  function columnLetter(index) {
    let value = Math.max(0, Math.round(number(index))) + 1;
    let label = '';
    while (value > 0) {
      value -= 1;
      label = String.fromCharCode(65 + (value % 26)) + label;
      value = Math.floor(value / 26);
    }
    return label;
  }

  function formatFileSize(bytes) {
    const size = number(bytes);
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} KB`;
    return `${(size / 1024 / 1024).toLocaleString('es-AR', { maximumFractionDigits: 1 })} MB`;
  }

  function showPriceImportError(message) {
    E.priceImportError.textContent = message;
    E.priceImportError.classList.remove('d-none');
    E.priceImportError.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hidePriceImportError() {
    E.priceImportError.classList.add('d-none');
    E.priceImportError.textContent = '';
  }

  function renderMaterials() {
    if (!canManageMasterData()) return;
    const query = normalize(E.materialsSearch.value);
    const status = E.materialsStatusFilter.value;
    const filtered = S.materials.filter((material) => {
      const matchesQuery = !query || normalize(`${material.name} ${material.sku || ''} ${material.category} ${material.detail || ''}`).includes(query);
      const matchesStatus = status === 'all' || (status === 'active' ? material.active : !material.active);
      return matchesQuery && matchesStatus;
    });

    E.materialsTableBody.innerHTML = filtered.map((material) => `
      <tr>
        <td><div class="table-material"><img class="table-thumb" src="${ea(material.image_url || 'assets/materials/default.svg')}" alt="${ea(material.name)}" onerror="this.src='assets/materials/default.svg'"><div><div class="table-title">${eh(material.name)}</div><div class="table-subtitle">${eh(material.detail || '')}</div></div></div></td>
        <td><span class="sku-chip">${eh(material.sku || 'Sin SKU')}</span></td>
        <td>${eh(material.category)}</td>
        <td>${eh(material.unit)}</td>
        <td><strong>${eh(formatCurrency(material.unit_price))}</strong></td>
        <td>${formatQty(material.suggested_quantity || 1)}</td>
        <td><span class="badge ${material.active ? 'text-bg-success' : 'text-bg-secondary'}">${material.active ? 'Activo' : 'Inactivo'}</span></td>
        <td><div class="action-group"><button class="btn btn-outline-primary" type="button" data-edit-material="${ea(material.id)}"><i class="bi bi-pencil"></i></button><button class="btn btn-outline-secondary" type="button" data-toggle-material="${ea(material.id)}" title="${material.active ? 'Desactivar' : 'Activar'}"><i class="bi ${material.active ? 'bi-pause-circle' : 'bi-play-circle'}"></i></button><button class="btn btn-outline-danger" type="button" data-delete-material="${ea(material.id)}"><i class="bi bi-trash3"></i></button></div></td>
      </tr>`).join('') || '<tr><td colspan="8"><div class="empty-inline">No hay insumos para mostrar.</div></td></tr>';
  }

  function openMaterial(materialId = null) {
    if (!canManageMasterData()) { toast('No tenés permisos para gestionar insumos.', 'error'); return; }
    const material = materialId ? S.materials.find((item) => item.id === materialId) : null;
    E.materialForm.reset();
    E.materialId.value = material?.id || '';
    E.materialCurrentImage.value = material?.image_url || '';
    E.materialModalTitle.textContent = material ? 'Editar insumo' : 'Nuevo insumo';
    E.materialName.value = material?.name || '';
    E.materialSku.value = material?.sku || '';
    E.materialCategory.value = material?.category || '';
    E.materialDetail.value = material?.detail || '';
    E.materialUnit.value = material?.unit || 'unidad';
    E.materialUnitPrice.value = formatMoneyInput(material?.unit_price || 0);
    E.materialSuggestedQuantity.value = formatInputQty(material?.suggested_quantity || 1);
    E.materialSortOrder.value = material?.sort_order ?? 100;
    E.materialActive.checked = material ? material.active !== false : true;
    E.materialImagePreview.src = material?.image_url || 'assets/materials/default.svg';
    E.materialImageFile.value = '';
    M.material.show();
  }

  async function previewMaterialImage() {
    const file = E.materialImageFile.files?.[0];
    if (!file) {
      E.materialImagePreview.src = E.materialCurrentImage.value || 'assets/materials/default.svg';
      return;
    }
    E.materialImagePreview.src = URL.createObjectURL(file);
  }

  async function saveMaterial(event) {
    event.preventDefault();
    if (!canManageMasterData()) { toast('No tenés permisos para guardar insumos.', 'error'); return; }
    buttonBusy(E.saveMaterialButton, true, 'Guardando...');
    try {
      let imageUrl = E.materialCurrentImage.value || 'assets/materials/default.svg';
      const file = E.materialImageFile.files?.[0];
      if (file) imageUrl = await uploadMaterialImage(file);

      const payload = {
        slug: slugify(E.materialName.value),
        name: E.materialName.value.trim(),
        sku: E.materialSku.value.trim() || null,
        category: E.materialCategory.value.trim(),
        detail: E.materialDetail.value.trim() || null,
        unit: E.materialUnit.value.trim() || 'unidad',
        unit_price: clampMoney(E.materialUnitPrice.value),
        suggested_quantity: clampQty(E.materialSuggestedQuantity.value, 0.01),
        sort_order: Math.max(0, Math.round(number(E.materialSortOrder.value))),
        image_url: imageUrl,
        active: E.materialActive.checked
      };

      const id = E.materialId.value;
      const query = id ? S.sb.from('materials').update(payload).eq('id', id) : S.sb.from('materials').insert(payload);
      const { error } = await query;
      if (error) throw error;
      M.material.hide();
      await refreshAdmin(false);
      toast(id ? 'Insumo actualizado.' : 'Insumo creado.', 'success');
    } catch (error) {
      console.error(error);
      const message = String(error.message || '');
      toast(message.includes('idx_materials_sku_unique') || message.includes('duplicate key') ? 'Ese SKU ya está asignado a otro insumo.' : (message || 'No se pudo guardar el insumo.'), 'error');
    } finally {
      buttonBusy(E.saveMaterialButton, false);
    }
  }

  async function uploadMaterialImage(file) {
    if (file.size > 5 * 1024 * 1024) throw new Error('La imagen supera el máximo de 5 MB.');
    const extension = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
    const path = `${Date.now()}-${crypto.randomUUID()}.${extension}`;
    const { error } = await S.sb.storage.from(cfg.MATERIAL_IMAGE_BUCKET || 'material-images').upload(path, file, { upsert: false, contentType: file.type });
    if (error) throw error;
    const { data } = S.sb.storage.from(cfg.MATERIAL_IMAGE_BUCKET || 'material-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async function toggleMaterial(materialId) {
    if (!canManageMasterData()) { toast('No tenés permisos para cambiar insumos.', 'error'); return; }
    const material = S.materials.find((item) => item.id === materialId);
    if (!material) return;
    try {
      const { error } = await S.sb.from('materials').update({ active: !material.active }).eq('id', materialId);
      if (error) throw error;
      await refreshAdmin(false);
      toast(material.active ? 'Insumo desactivado.' : 'Insumo activado.', 'success');
    } catch (error) {
      toast(error.message || 'No se pudo cambiar el estado.', 'error');
    }
  }

  async function deleteMaterial(materialId) {
    if (!canManageMasterData()) { toast('No tenés permisos para eliminar insumos.', 'error'); return; }
    const material = S.materials.find((item) => item.id === materialId);
    if (!material || !confirm(`¿Eliminar ${material.name}? Los pedidos anteriores conservarán el nombre y la imagen registrados.`)) return;
    try {
      const { error } = await S.sb.from('materials').delete().eq('id', materialId);
      if (error) throw error;
      await refreshAdmin(false);
      toast('Insumo eliminado.', 'success');
    } catch (error) {
      toast(error.message || 'No se pudo eliminar el insumo.', 'error');
    }
  }

  function renderServices() {
    if (!canManageMasterData()) return;
    const query = normalize(E.adminServiceSearch.value);
    const duplicateCuits=duplicateServiceCuitGroups();
    renderServiceDuplicateCuitAlert(duplicateCuits);
    const filtered = S.services.filter((service) => !query || normalize(`${service.name} ${service.cuit || ''} ${formatCuit(service.cuit || '')} ${service.zone || ''} ${service.address || ''} ${service.supervisor || ''}`).includes(query));
    const activeMaterials = S.materials.filter((material) => material.active !== false);

    E.servicesTableBody.innerHTML = filtered.map((service) => {
      const orderCount = S.orders.filter((order) => order.service_id === service.id).length;
      const hiddenCount = activeMaterials.filter((material) => isMaterialHiddenForService(material.id, service.id)).length;
      const visibleCount = Math.max(0, activeMaterials.length - hiddenCount);
      const limitAmount = number(service.monthly_billing) * number(service.budget_limit_percent || 5) / 100;
      const cuit=normalizeCuit(service.cuit);
      const sharedCount=cuit ? (duplicateCuits.get(cuit)?.length || 0) : 0;
      const cuitHtml=cuit
        ? `<div class="service-cuit-cell"><strong>${eh(formatCuit(cuit))}</strong>${sharedCount>1?`<span class="badge text-bg-warning">Compartido · ${sharedCount}</span>`:''}</div>`
        : '<span class="text-secondary small">Sin CUIT</span>';
      return `<tr>
        <td><div class="table-title">${eh(service.name)}</div><div class="table-subtitle">${eh(service.address || '')}</div></td>
        <td>${cuitHtml}</td>
        <td>${eh(service.zone || '—')}</td>
        <td><strong>${eh(formatCurrency(service.monthly_billing))}</strong></td>
        <td><div class="service-material-count">${eh(formatPercent(service.budget_limit_percent || 5))}</div><div class="table-subtitle">${eh(formatCurrency(limitAmount))}</div></td>
        <td><div class="service-description-preview">${eh(service.description || '—')}</div></td>
        <td>${eh(service.supervisor || '—')}</td>
        <td><div class="service-material-count">${visibleCount} de ${activeMaterials.length}</div><div class="table-subtitle">${hiddenCount ? `${hiddenCount} oculto${hiddenCount === 1 ? '' : 's'}` : 'Catálogo completo'}</div></td>
        <td>${orderCount}</td>
        <td><span class="badge ${service.active ? 'text-bg-success' : 'text-bg-secondary'}">${service.active ? 'Activo' : 'Inactivo'}</span></td>
        <td><div class="action-group"><button class="btn btn-outline-primary" type="button" data-configure-service-materials="${ea(service.id)}" title="Configurar insumos"><i class="bi bi-sliders"></i></button><button class="btn btn-outline-primary" type="button" data-edit-service="${ea(service.id)}" title="Editar servicio"><i class="bi bi-pencil"></i></button><button class="btn btn-outline-secondary" type="button" data-toggle-service="${ea(service.id)}" title="${service.active ? 'Desactivar' : 'Activar'}"><i class="bi ${service.active ? 'bi-pause-circle' : 'bi-play-circle'}"></i></button><button class="btn btn-outline-danger" type="button" data-delete-service="${ea(service.id)}" title="Eliminar"><i class="bi bi-trash3"></i></button></div></td>
      </tr>`;
    }).join('') || '<tr><td colspan="11"><div class="empty-inline">No hay servicios para mostrar.</div></td></tr>';
  }

  function renderServiceDuplicateCuitAlert(groups=duplicateServiceCuitGroups()) {
    if (!E.serviceDuplicateCuitAlert) return;
    const entries=[...groups.entries()];
    if (!entries.length) {
      E.serviceDuplicateCuitAlert.classList.add('d-none');
      E.serviceDuplicateCuitAlert.innerHTML='';
      return;
    }
    const list=entries.slice(0,6).map(([cuit,services])=>`<li><strong>${eh(formatCuit(cuit))}</strong>: ${services.map((service)=>eh(service.name)).join(', ')}</li>`).join('');
    const extra=entries.length>6 ? `<li>Y ${entries.length-6} CUIT compartido${entries.length-6===1?'':'s'} más.</li>` : '';
    E.serviceDuplicateCuitAlert.innerHTML=`<div class="d-flex gap-2"><i class="bi bi-exclamation-triangle-fill"></i><div><strong>${entries.length} CUIT ${entries.length===1?'está':'están'} asignado${entries.length===1?'':'s'} a más de un servicio.</strong> Puede ser correcto, pero al importar facturación esos casos requerirán revisión para no matchear el consorcio equivocado.<ul class="mb-0 mt-2">${list}${extra}</ul></div></div>`;
    E.serviceDuplicateCuitAlert.classList.remove('d-none');
  }

  function openServiceMaterials(serviceId) {
    if (!canManageMasterData()) { toast('No tenés permisos para configurar insumos por servicio.', 'error'); return; }
    const service = serviceById(serviceId);
    if (!service) return;
    S.selectedServiceMaterialsId = serviceId;
    S.serviceMaterialsDraftHidden = new Set(
      S.serviceMaterialExclusions
        .filter((item) => item.service_id === serviceId)
        .map((item) => item.material_id)
    );
    E.serviceMaterialsModalTitle.textContent = `Insumos de ${service.name}`;
    E.serviceMaterialsModalSubtitle.textContent = 'Activá o desactivá lo que el operario podrá ver y pedir.';
    E.serviceMaterialsSearch.value = '';
    E.serviceMaterialsFilter.value = 'all';
    renderServiceMaterials();
    M.serviceMaterials.show();
  }

  function renderServiceMaterials() {
    const serviceId = S.selectedServiceMaterialsId;
    if (!serviceId) return;
    const query = normalize(E.serviceMaterialsSearch.value);
    const filter = E.serviceMaterialsFilter.value;
    const allMaterials = [...S.materials].sort(materialSort);
    const filtered = allMaterials.filter((material) => {
      const hidden = S.serviceMaterialsDraftHidden.has(material.id);
      const matchesQuery = !query || normalize(`${material.name} ${material.category} ${material.detail || ''}`).includes(query);
      const matchesFilter = filter === 'all' || (filter === 'visible' ? !hidden : hidden);
      return matchesQuery && matchesFilter;
    });

    const activeMaterials = allMaterials.filter((material) => material.active !== false);
    const hiddenActive = activeMaterials.filter((material) => S.serviceMaterialsDraftHidden.has(material.id)).length;
    E.serviceMaterialsVisibleCount.textContent = `${activeMaterials.length - hiddenActive} visibles`;
    E.serviceMaterialsHiddenCount.textContent = `${hiddenActive} ocultos`;

    E.serviceMaterialsList.innerHTML = filtered.map((material) => {
      const hidden = S.serviceMaterialsDraftHidden.has(material.id);
      return `<label class="service-material-row ${hidden ? 'is-hidden' : ''}">
        <img class="service-material-thumb" src="${ea(material.image_url || 'assets/materials/default.svg')}" alt="${ea(material.name)}" onerror="this.src='assets/materials/default.svg'">
        <span class="service-material-main"><span class="service-material-name">${eh(material.name)}</span><span class="service-material-meta">${eh(material.category || 'General')}${material.detail ? ` · ${eh(material.detail)}` : ''}${material.active === false ? ' · Inactivo globalmente' : ''}</span></span>
        <span class="form-check form-switch service-material-switch"><input class="form-check-input" type="checkbox" data-service-material-toggle="${ea(material.id)}" ${hidden ? '' : 'checked'}><span class="form-check-label">${hidden ? 'Oculto' : 'Visible'}</span></span>
      </label>`;
    }).join('') || '<div class="empty-inline">No hay insumos que coincidan con el filtro.</div>';
  }

  function handleServiceMaterialToggle(event) {
    const input = event.target.closest('[data-service-material-toggle]');
    if (!input) return;
    const materialId = input.dataset.serviceMaterialToggle;
    if (input.checked) S.serviceMaterialsDraftHidden.delete(materialId);
    else S.serviceMaterialsDraftHidden.add(materialId);
    renderServiceMaterials();
  }

  function setAllServiceMaterialsVisible(visible) {
    S.materials.forEach((material) => {
      if (visible) S.serviceMaterialsDraftHidden.delete(material.id);
      else S.serviceMaterialsDraftHidden.add(material.id);
    });
    renderServiceMaterials();
  }

  async function saveServiceMaterials() {
    if (!canManageMasterData()) { toast('No tenés permisos para guardar esta configuración.', 'error'); return; }
    const serviceId = S.selectedServiceMaterialsId;
    const service = serviceById(serviceId);
    if (!service) return;
    buttonBusy(E.saveServiceMaterialsButton, true, 'Guardando...');
    try {
      const { error } = await S.sb.rpc('admin_set_service_hidden_materials', {
        p_service_id: serviceId,
        p_hidden_material_ids: [...S.serviceMaterialsDraftHidden]
      });
      if (error) throw error;

      M.serviceMaterials.hide();
      S.selectedServiceMaterialsId = null;
      await refreshAdmin(false);
      toast(`Configuración de ${service.name} actualizada.`, 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudo guardar la configuración.', 'error');
    } finally {
      buttonBusy(E.saveServiceMaterialsButton, false);
    }
  }

  function openService(serviceId = null) {
    if (!canManageMasterData()) { toast('No tenés permisos para gestionar servicios.', 'error'); return; }
    const service = serviceId ? S.services.find((item) => item.id === serviceId) : null;
    E.serviceForm.reset();
    E.serviceId.value = service?.id || '';
    E.serviceModalTitle.textContent = service ? 'Editar servicio' : 'Nuevo servicio';
    E.serviceName.value = service?.name || '';
    E.serviceCuit.value = service?.cuit ? formatCuit(service.cuit) : '';
    E.serviceAddress.value = service?.address || '';
    E.serviceZone.value = service?.zone || '';
    E.serviceSupervisor.value = service?.supervisor || '';
    E.serviceBilling.value = formatMoneyInput(service?.monthly_billing || 0);
    E.serviceBudgetPercent.value = formatInputQty(service?.budget_limit_percent || 5);
    E.serviceDescription.value = service?.description || '';
    E.serviceNotes.value = service?.notes || '';
    E.serviceActive.checked = service ? service.active !== false : true;
    renderServiceBudgetPreview();
    renderServiceCuitWarning();
    M.service.show();
  }

  function renderServiceCuitWarning() {
    if (!E.serviceCuitWarning) return;
    const raw=E.serviceCuit.value.trim();
    const cuit=normalizeCuit(raw);
    const currentId=E.serviceId.value;
    if (!raw) {
      E.serviceCuitWarning.classList.add('d-none');
      E.serviceCuitWarning.querySelector('.alert').innerHTML='';
      return;
    }
    if (!isCuitFormatValid(cuit)) {
      E.serviceCuitWarning.querySelector('.alert').innerHTML='<strong>CUIT incompleto.</strong> Debe tener 11 dígitos. Podés escribirlo con o sin guiones.';
      E.serviceCuitWarning.classList.remove('d-none');
      return;
    }
    const duplicates=S.services.filter((service)=>service.id!==currentId && normalizeCuit(service.cuit)===cuit);
    if (!duplicates.length) {
      E.serviceCuitWarning.classList.add('d-none');
      E.serviceCuitWarning.querySelector('.alert').innerHTML='';
      return;
    }
    E.serviceCuitWarning.querySelector('.alert').innerHTML=`<strong>CUIT compartido.</strong> ${eh(formatCuit(cuit))} ya está cargado en ${duplicates.map((service)=>`<strong>${eh(service.name)}</strong>`).join(', ')}. Se puede guardar igualmente, pero el importador pedirá revisar estos casos.`;
    E.serviceCuitWarning.classList.remove('d-none');
  }

  async function saveService(event) {
    event.preventDefault();
    if (!canManageMasterData()) { toast('No tenés permisos para guardar servicios.', 'error'); return; }
    const budgetPercent = number(E.serviceBudgetPercent.value);
    if (budgetPercent < 5 || budgetPercent > 7) {
      toast('El límite operativo debe estar entre 5% y 7%.', 'error');
      E.serviceBudgetPercent.focus();
      return;
    }
    const rawCuit=E.serviceCuit.value.trim();
    const cuit=normalizeCuit(rawCuit);
    if (rawCuit && !isCuitFormatValid(cuit)) {
      toast('El CUIT debe tener 11 dígitos.', 'error');
      E.serviceCuit.focus();
      return;
    }
    const id = E.serviceId.value;
    const duplicateCuitServices=cuit ? S.services.filter((service)=>service.id!==id && normalizeCuit(service.cuit)===cuit) : [];
    if (duplicateCuitServices.length && !confirm(`El CUIT ${formatCuit(cuit)} ya está cargado en ${duplicateCuitServices.map((service)=>service.name).join(', ')}. Puede ser correcto si son consorcios distintos. ¿Querés guardarlo igualmente?`)) return;
    buttonBusy(E.saveServiceButton, true, 'Guardando...');
    try {
      const payload = {
        name: E.serviceName.value.trim(),
        cuit: cuit || null,
        address: E.serviceAddress.value.trim() || null,
        zone: E.serviceZone.value.trim() || null,
        supervisor: E.serviceSupervisor.value.trim() || null,
        monthly_billing: clampMoney(E.serviceBilling.value),
        budget_limit_percent: Math.round(budgetPercent * 100) / 100,
        description: E.serviceDescription.value.trim() || null,
        notes: E.serviceNotes.value.trim() || null,
        active: E.serviceActive.checked
      };
      const query = id ? S.sb.from('services').update(payload).eq('id', id) : S.sb.from('services').insert(payload);
      const { error } = await query;
      if (error) throw error;
      M.service.hide();
      await refreshAdmin(false);
      toast(id ? 'Servicio actualizado.' : 'Servicio creado.', 'success');
    } catch (error) {
      console.error(error);
      const message=String(error?.message || '');
      toast((message.includes('cuit') && (message.includes('column') || message.includes('schema cache')))
        ? 'Falta instalar el CUIT en la base. Ejecutá actualizar-cuit-servicios.sql en Supabase.'
        : (message || 'No se pudo guardar el servicio.'), 'error');
    } finally {
      buttonBusy(E.saveServiceButton, false);
    }
  }

  async function toggleService(serviceId) {
    if (!canManageMasterData()) { toast('No tenés permisos para cambiar servicios.', 'error'); return; }
    const service = S.services.find((item) => item.id === serviceId);
    if (!service) return;
    try {
      const { error } = await S.sb.from('services').update({ active: !service.active }).eq('id', serviceId);
      if (error) throw error;
      await refreshAdmin(false);
      toast(service.active ? 'Servicio desactivado.' : 'Servicio activado.', 'success');
    } catch (error) {
      toast(error.message || 'No se pudo cambiar el estado.', 'error');
    }
  }

  async function deleteService(serviceId) {
    if (!canManageMasterData()) { toast('No tenés permisos para eliminar servicios.', 'error'); return; }
    const service = S.services.find((item) => item.id === serviceId);
    if (!service || !confirm(`¿Eliminar ${service.name}? Solo será posible si no tiene pedidos asociados.`)) return;
    try {
      const { error } = await S.sb.from('services').delete().eq('id', serviceId);
      if (error) throw error;
      await refreshAdmin(false);
      toast('Servicio eliminado.', 'success');
    } catch (error) {
      toast('No se puede eliminar porque tiene pedidos o usuarios asociados. Desactivalo en su lugar.', 'error');
    }
  }

  function renderUsers() {
    if (!canManageUsers()) return;
    E.usersTableBody.innerHTML = S.profiles.map((profile) => {
      const service = serviceById(profile.service_id);
      return `<tr><td><div class="table-title">${eh(profile.full_name || 'Sin nombre')}</div></td><td>${eh(profile.email || '—')}</td><td><span class="badge ${profile.role === 'admin' ? 'text-bg-primary' : (profile.role === 'supplier' ? 'text-bg-info' : 'text-bg-secondary')}">${eh(ROLE_LABELS[profile.role] || profile.role)}</span></td><td>${eh(service?.name || 'Sin asignar')}</td><td><div class="action-group"><button class="btn btn-outline-primary" type="button" data-edit-user="${ea(profile.id)}"><i class="bi bi-pencil"></i></button></div></td></tr>`;
    }).join('') || '<tr><td colspan="5"><div class="empty-inline">No hay usuarios.</div></td></tr>';
  }

  function openUser(userId) {
    if (!canManageUsers()) { toast('No tenés permisos para gestionar usuarios.', 'error'); return; }
    const profile = S.profiles.find((item) => item.id === userId);
    if (!profile) return;
    E.userId.value = profile.id;
    E.userName.value = profile.full_name || '';
    E.userRole.value = profile.role;
    E.userService.value = profile.service_id || '';
    M.user.show();
  }

  async function saveUser(event) {
    event.preventDefault();
    if (!canManageUsers()) { toast('No tenés permisos para modificar usuarios.', 'error'); return; }
    try {
      const payload = {
        full_name: E.userName.value.trim() || null,
        role: E.userRole.value,
        service_id: E.userService.value || null
      };
      const { error } = await S.sb.from('profiles').update(payload).eq('id', E.userId.value);
      if (error) throw error;
      M.user.hide();
      await refreshAdmin(false);
      toast('Usuario actualizado.', 'success');
    } catch (error) {
      toast(error.message || 'No se pudo actualizar el usuario.', 'error');
    }
  }


  async function loadConsumptionReport(force = false) {
    if (!isFullAdmin() || S.mode !== 'admin') return;

    const month = E.consumptionMonth.value || monthInputValue(new Date());
    E.consumptionMonth.value = month;
    const serviceId = E.consumptionServiceFilter.value || null;
    const key = `${month}|${serviceId || 'all'}`;

    if (!force && S.consumptionLoadedKey === key) {
      renderConsumption();
      return;
    }
    if (S.consumptionLoading) return;

    S.consumptionLoading = true;
    E.consumptionError.classList.add('d-none');
    E.consumptionError.textContent = '';
    buttonBusy(E.refreshConsumptionButton, true, 'Actualizando...');
    renderConsumptionLoading();

    try {
      const parameters = { p_month: `${month}-01`, p_service_id: serviceId };
      const [servicesResult, productsResult] = await Promise.all([
        S.sb.rpc('admin_consumption_service_summary', parameters),
        S.sb.rpc('admin_consumption_report', parameters)
      ]);
      if (servicesResult.error) throw servicesResult.error;
      if (productsResult.error) throw productsResult.error;

      S.consumptionServiceRows = servicesResult.data || [];
      S.consumptionRows = productsResult.data || [];
      S.consumptionLoadedKey = key;
    } catch (error) {
      console.error(error);
      S.consumptionServiceRows = [];
      S.consumptionRows = [];
      S.consumptionLoadedKey = '';
      E.consumptionError.textContent = consumptionErrorMessage(error);
      E.consumptionError.classList.remove('d-none');
    } finally {
      S.consumptionLoading = false;
      buttonBusy(E.refreshConsumptionButton, false);
      renderConsumption();
    }
  }

  function renderConsumptionLoading() {
    E.consumptionServiceTableBody.innerHTML = '<tr class="consumption-loading-row"><td colspan="9"><span class="spinner-border spinner-border-sm me-2"></span>Calculando consumo por servicio...</td></tr>';
    E.consumptionProductsTableBody.innerHTML = '<tr class="consumption-loading-row"><td colspan="9"><span class="spinner-border spinner-border-sm me-2"></span>Consolidando productos e histórico...</td></tr>';
  }

  function renderConsumption() {
    if (!E.adminConsumption || S.tab !== 'consumption') return;
    if (S.consumptionLoading) return;

    const month = E.consumptionMonth.value || monthInputValue(new Date());
    const selectedServiceId = E.consumptionServiceFilter.value || '';
    const monthText = monthLabel(month);
    const productRows = filteredConsumptionRows();
    const visibleServiceRows = S.consumptionServiceRows.filter((row) => {
      if (selectedServiceId) return row.service_id === selectedServiceId;
      return number(row.historical_orders) > 0 || number(row.month_orders) > 0;
    });

    const activeServices = visibleServiceRows.filter((row) => number(row.month_orders) > 0);
    const currentProducts = S.consumptionRows.filter((row) => number(row.month_quantity) > 0);
    const deliveredOrders = activeServices.reduce((sum, row) => sum + number(row.month_orders), 0);
    const monthAmount = activeServices.reduce((sum, row) => sum + number(row.month_amount), 0);

    E.consumptionKpiServices.textContent = String(activeServices.length);
    E.consumptionKpiProducts.textContent = String(currentProducts.length);
    E.consumptionKpiOrders.textContent = formatQty(deliveredOrders);
    E.consumptionKpiAmount.textContent = formatCurrency(monthAmount);
    E.consumptionKpiServicesFoot.textContent = `Consumo confirmado en ${monthText}`;
    E.consumptionServiceCount.textContent = `${visibleServiceRows.length} ${visibleServiceRows.length === 1 ? 'servicio' : 'servicios'}`;
    E.consumptionProductCount.textContent = `${productRows.length} ${productRows.length === 1 ? 'registro' : 'registros'}`;
    E.consumptionResultsCaption.textContent = `Cantidades de ${monthText}, promedio de los tres meses anteriores e histórico acumulado.`;

    E.consumptionServiceTableBody.innerHTML = visibleServiceRows.map((row) => {
      const signal = consumptionSignal(row.month_amount, row.avg_previous_3_amount, row.previous_3_months_with_activity);
      const variation = consumptionVariation(row.month_amount, row.avg_previous_3_amount, row.previous_3_months_with_activity);
      const meter = consumptionMeter(row.month_amount, row.avg_previous_3_amount, signal);
      return `<tr>
        <td><div class="consumption-service-name">${eh(row.service_name)}</div><span class="consumption-subvalue">${row.last_consumption_at ? `Último consumo: ${eh(dtf.format(new Date(row.last_consumption_at)))}` : 'Sin entregas registradas'}</span></td>
        <td><span class="consumption-value">${formatQty(row.month_orders)}</span></td>
        <td><span class="consumption-value">${formatQty(row.month_products)}</span></td>
        <td><span class="consumption-value">${eh(formatCurrency(row.month_amount))}</span>${meter}</td>
        <td><span class="consumption-value">${eh(formatCurrency(row.previous_month_amount))}</span></td>
        <td><span class="consumption-value">${eh(formatCurrency(row.avg_previous_3_amount))}</span><span class="consumption-subvalue">Incluye meses sin consumo</span></td>
        <td>${consumptionVariationBadge(variation)}</td>
        <td><span class="consumption-value">${eh(formatCurrency(row.historical_amount))}</span><span class="consumption-subvalue">${formatQty(row.historical_orders)} pedidos entregados</span></td>
        <td>${consumptionSignalBadge(signal)}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="9"><div class="consumption-empty">No hay pedidos entregados para construir un resumen de consumo.</div></td></tr>';

    E.consumptionProductsTableBody.innerHTML = productRows.map((row) => {
      const signal = consumptionSignal(row.month_quantity, row.avg_previous_3_quantity, row.previous_3_months_with_activity);
      const variation = consumptionVariation(row.month_quantity, row.avg_previous_3_quantity, row.previous_3_months_with_activity);
      const meter = consumptionMeter(row.month_quantity, row.avg_previous_3_quantity, signal);
      const sku = row.item_sku ? `SKU ${row.item_sku} · ` : '';
      return `<tr>
        <td class="consumption-product-cell"><strong>${eh(row.item_name)}</strong><small>${eh(row.service_name)} · ${eh(sku)}${eh(row.unit || 'unidad')}</small></td>
        <td><span class="consumption-value">${formatQty(row.month_quantity)} ${eh(row.unit || 'unidad')}</span><span class="consumption-subvalue">${formatQty(row.month_orders)} pedidos</span>${meter}</td>
        <td><span class="consumption-value">${formatQty(row.previous_month_quantity)} ${eh(row.unit || 'unidad')}</span></td>
        <td><span class="consumption-value">${formatQty(row.avg_previous_3_quantity)} ${eh(row.unit || 'unidad')}</span><span class="consumption-subvalue">Promedio calendario</span></td>
        <td>${consumptionVariationBadge(variation)}</td>
        <td><span class="consumption-value">${formatQty(row.historical_quantity)} ${eh(row.unit || 'unidad')}</span><span class="consumption-subvalue">${formatQty(row.historical_orders)} pedidos · ${eh(formatCurrency(row.historical_amount))}</span></td>
        <td><span class="consumption-value">${eh(formatCurrency(row.month_amount))}</span></td>
        <td>${consumptionSignalBadge(signal)}</td>
        <td><button class="btn btn-outline-primary btn-sm consumption-history-button" type="button" data-consumption-service="${ea(row.service_id)}" data-consumption-history="${ea(row.material_key)}"><i class="bi bi-bar-chart-line me-1"></i>Histórico</button></td>
      </tr>`;
    }).join('') || '<tr><td colspan="9"><div class="consumption-empty">No hay consumos que coincidan con los filtros. Los pedidos deben estar marcados como Entregados.</div></td></tr>';
  }

  function filteredConsumptionRows() {
    const query = normalize(E.consumptionSearch?.value);
    return S.consumptionRows.filter((row) => {
      if (!query) return true;
      return normalize(`${row.item_name} ${row.item_sku || ''} ${row.service_name} ${row.unit || ''}`).includes(query);
    });
  }

  function consumptionSignal(currentValue, baselineValue, activeMonths) {
    const current = number(currentValue);
    const baseline = number(baselineValue);
    const months = number(activeMonths);
    if (months <= 0 || baseline <= 0) return current > 0 ? 'new' : 'none';
    const ratio = current / baseline;
    if (ratio > 1.2) return 'high';
    if (ratio < 0.8) return 'low';
    return 'normal';
  }

  function consumptionVariation(currentValue, baselineValue, activeMonths) {
    const baseline = number(baselineValue);
    if (number(activeMonths) <= 0 || baseline <= 0) return null;
    return ((number(currentValue) - baseline) / baseline) * 100;
  }

  function consumptionVariationBadge(variation) {
    if (variation == null || !Number.isFinite(variation)) return '<span class="consumption-variation is-stable">Sin referencia</span>';
    const rounded = Math.round(variation * 10) / 10;
    const cls = rounded > 5 ? 'is-up' : (rounded < -5 ? 'is-down' : 'is-stable');
    const icon = rounded > 5 ? 'bi-arrow-up-right' : (rounded < -5 ? 'bi-arrow-down-right' : 'bi-dash');
    const prefix = rounded > 0 ? '+' : '';
    return `<span class="consumption-variation ${cls}"><i class="bi ${icon}"></i>${eh(`${prefix}${rounded.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`)}</span>`;
  }

  function consumptionSignalBadge(signal) {
    const config = {
      high: ['Alto', 'bi-exclamation-triangle-fill'],
      low: ['Bajo', 'bi-arrow-down-circle-fill'],
      normal: ['Habitual', 'bi-check-circle-fill'],
      new: ['Nuevo', 'bi-stars'],
      none: ['Sin datos', 'bi-dash-circle']
    }[signal] || ['Sin datos', 'bi-dash-circle'];
    return `<span class="consumption-signal ${ea(signal)}"><i class="bi ${config[1]}"></i>${eh(config[0])}</span>`;
  }

  function consumptionMeter(currentValue, baselineValue, signal) {
    const current = number(currentValue);
    const baseline = number(baselineValue);
    const ratio = baseline > 0 ? current / baseline : (current > 0 ? 1 : 0);
    const width = Math.max(0, Math.min(100, ratio * 62.5));
    const cls = signal === 'high' ? 'is-high' : (signal === 'low' ? 'is-low' : '');
    return `<div class="consumption-meter ${cls}" title="${ea(baseline > 0 ? `Consumo frente al promedio de tres meses: ${formatPercent(ratio * 100)}` : 'Sin promedio histórico suficiente')}"><span style="width:${width.toFixed(2)}%"></span></div>`;
  }

  async function openConsumptionHistory(serviceId, materialKey) {
    if (!isFullAdmin()) return;
    const row = S.consumptionRows.find((item) => item.service_id === serviceId && item.material_key === materialKey);
    if (!row) return;

    S.consumptionHistoryContext = row;
    E.consumptionHistoryTitle.textContent = row.item_name;
    E.consumptionHistorySubtitle.textContent = `${row.service_name} · ${row.item_sku ? `SKU ${row.item_sku} · ` : ''}${row.unit || 'unidad'} · 12 meses hasta ${monthLabel(E.consumptionMonth.value)}`;
    E.consumptionHistoryLoading.classList.remove('d-none');
    E.consumptionHistoryContent.classList.add('d-none');
    E.consumptionHistoryError.classList.add('d-none');
    E.consumptionHistoryError.textContent = '';
    M.consumptionHistory.show();

    try {
      const { data, error } = await S.sb.rpc('admin_consumption_history', {
        p_service_id: serviceId,
        p_material_key: materialKey,
        p_until_month: `${E.consumptionMonth.value || monthInputValue(new Date())}-01`,
        p_months: 12
      });
      if (error) throw error;
      renderConsumptionHistory(data || [], row);
    } catch (error) {
      console.error(error);
      E.consumptionHistoryLoading.classList.add('d-none');
      E.consumptionHistoryError.textContent = consumptionErrorMessage(error);
      E.consumptionHistoryError.classList.remove('d-none');
    }
  }

  function renderConsumptionHistory(rows, context) {
    const totalQty = rows.reduce((sum, row) => sum + number(row.quantity), 0);
    const totalAmount = rows.reduce((sum, row) => sum + number(row.amount), 0);
    const maxQty = Math.max(0, ...rows.map((row) => number(row.quantity)));
    const average = rows.length ? totalQty / rows.length : 0;

    E.consumptionHistoryTotal.textContent = `${formatQty(totalQty)} ${context.unit || 'unidad'}`;
    E.consumptionHistoryAverage.textContent = `${formatQty(average)} ${context.unit || 'unidad'}`;
    E.consumptionHistoryMax.textContent = `${formatQty(maxQty)} ${context.unit || 'unidad'}`;
    E.consumptionHistoryAmount.textContent = formatCurrency(totalAmount);
    E.consumptionHistoryBars.innerHTML = rows.map((row) => {
      const qty = number(row.quantity);
      const width = maxQty > 0 ? Math.max(qty > 0 ? 3 : 0, qty / maxQty * 100) : 0;
      return `<div class="consumption-history-row">
        <div class="consumption-history-month">${eh(monthLabelFromDate(row.consumption_month))}</div>
        <div class="consumption-history-track"><span style="width:${width.toFixed(2)}%"></span></div>
        <div class="consumption-history-qty">${formatQty(qty)} ${eh(context.unit || 'unidad')}</div>
        <div class="consumption-history-amount">${formatQty(row.orders)} pedidos · ${eh(formatCurrency(row.amount))}</div>
      </div>`;
    }).join('') || '<div class="consumption-empty">No hay información histórica.</div>';
    E.consumptionHistoryLoading.classList.add('d-none');
    E.consumptionHistoryContent.classList.remove('d-none');
  }

  function exportConsumptionCsv() {
    const rows = filteredConsumptionRows();
    if (!rows.length) {
      toast('No hay datos de consumo para exportar.', 'error');
      return;
    }
    const month = E.consumptionMonth.value || monthInputValue(new Date());
    const headers = ['Mes','Servicio','Producto','SKU','Unidad','Cantidad mes','Valor mes','Pedidos mes','Cantidad mes anterior','Promedio 3 meses','Variación vs promedio','Cantidad histórica','Valor histórico','Pedidos históricos','Señal'];
    const lines = [headers, ...rows.map((row) => {
      const signal = consumptionSignal(row.month_quantity, row.avg_previous_3_quantity, row.previous_3_months_with_activity);
      const variation = consumptionVariation(row.month_quantity, row.avg_previous_3_quantity, row.previous_3_months_with_activity);
      return [
        month,
        row.service_name,
        row.item_name,
        row.item_sku || '',
        row.unit || 'unidad',
        csvNumber(row.month_quantity),
        csvNumber(row.month_amount),
        csvNumber(row.month_orders),
        csvNumber(row.previous_month_quantity),
        csvNumber(row.avg_previous_3_quantity),
        variation == null ? '' : csvNumber(Math.round(variation * 100) / 100),
        csvNumber(row.historical_quantity),
        csvNumber(row.historical_amount),
        csvNumber(row.historical_orders),
        ({ high: 'Alto', low: 'Bajo', normal: 'Habitual', new: 'Nuevo', none: 'Sin datos' })[signal]
      ];
    })].map((row) => row.map(csvCell).join(';')).join('\r\n');

    const blob = new Blob([`\ufeff${lines}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `consumo-clean-it-${month}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function csvNumber(value) {
    return number(value).toLocaleString('es-AR', { useGrouping: false, maximumFractionDigits: 2 });
  }

  function csvCell(value) {
    const text = String(value ?? '').replace(/"/g, '""');
    return `"${text}"`;
  }

  function consumptionErrorMessage(error) {
    const message = String(error?.message || '');
    if (message.includes('admin_consumption_') || message.includes('schema cache') || String(error?.code || '').includes('PGRST202')) {
      return 'El módulo de consumos todavía no está instalado en Supabase. Ejecutá actualizar-consumos-por-servicio.sql desde SQL Editor y volvé a actualizar.';
    }
    return message || 'No se pudo calcular el consumo por servicio.';
  }

  function monthInputValue(date) {
    const value = new Date(date);
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  }

  function monthLabel(value) {
    if (!/^\d{4}-\d{2}$/.test(String(value || ''))) return 'el mes seleccionado';
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 15));
  }

  function monthLabelFromDate(value) {
    const text = String(value || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(text)) return '—';
    const [year, month] = text.split('-').map(Number);
    return new Intl.DateTimeFormat('es-AR', { month: 'short', year: 'numeric' }).format(new Date(year, month - 1, 15));
  }

  function renderHistory() {
    const typeFilter = E.historyTypeFilter?.value || 'all';
    const query = normalize(E.historySearch?.value || '');

    const orderEvents = S.history.map((entry) => {
      const order = S.orders.find((item) => item.id === entry.order_id);
      const service = order ? serviceById(order.service_id) : null;
      const profile = S.profiles.find((item) => item.id === entry.changed_by);
      const isEdit = Boolean(entry.old_status && entry.old_status === entry.new_status);
      const changeHtml = isEdit
        ? '<div class="history-change"><span class="badge text-bg-primary"><i class="bi bi-pencil-square me-1"></i>Pedido editado</span></div>'
        : `<div class="history-change"><span class="status-badge ${ea(entry.old_status || 'pendiente')}">${eh(entry.old_status ? STATUS_LABELS[entry.old_status] : 'Creado')}</span><i class="bi bi-arrow-right history-arrow"></i><span class="status-badge ${ea(entry.new_status)}">${eh(STATUS_LABELS[entry.new_status] || entry.new_status)}</span></div>`;
      const userName = profile?.full_name || profile?.email || 'Sistema';
      const reference = order?.order_code || 'Pedido eliminado';
      const context = service?.name || '—';
      const detail = entry.notes || '';
      return {
        type: 'order',
        timestamp: entry.changed_at,
        searchText: normalize(`${reference} ${context} ${userName} ${detail} pedido ${entry.old_status || ''} ${entry.new_status || ''}`),
        html: `<tr>
          <td class="history-date">${dtf.format(new Date(entry.changed_at))}</td>
          <td><span class="history-type is-order"><i class="bi bi-bag-check"></i>Pedido</span></td>
          <td><button class="btn btn-link p-0 fw-bold text-decoration-none" type="button" data-order-open="${ea(entry.order_id)}">${eh(reference)}</button></td>
          <td>${eh(context)}</td>
          <td>${changeHtml}</td>
          <td>${eh(userName)}</td>
          <td>${eh(detail)}</td>
        </tr>`
      };
    });

    const priceEvents = (isFullAdmin() ? S.priceHistory : []).map((entry) => {
      const material = S.materials.find((item) => item.id === entry.material_id);
      const profile = S.profiles.find((item) => item.id === entry.changed_by);
      const materialName = entry.material_name_snapshot || material?.name || 'Insumo eliminado';
      const sku = entry.sku_snapshot || material?.sku || '';
      const oldPrice = number(entry.old_price);
      const newPrice = number(entry.new_price);
      const difference = roundMoney(newPrice - oldPrice);
      const percent = oldPrice > 0 ? (difference / oldPrice) * 100 : null;
      const direction = difference > 0 ? 'increase' : (difference < 0 ? 'decrease' : 'same');
      const directionLabel = difference > 0 ? 'Aumento' : (difference < 0 ? 'Disminución' : 'Sin variación');
      const userName = profile?.full_name || profile?.email || 'Sistema';
      const sourceParts = [];
      if (entry.source_file) sourceParts.push(`Archivo: ${entry.source_file}`);
      if (entry.source_sheet) sourceParts.push(`Hoja: ${entry.source_sheet}`);
      const method = entry.change_method === 'excel' || entry.source_file ? 'Importación Excel' : 'Edición manual';
      const detailParts = [method, ...sourceParts];
      if (difference !== 0) {
        detailParts.push(`${directionLabel}: ${difference > 0 ? '+' : ''}${formatCurrency(difference)}${percent == null ? '' : ` (${percent > 0 ? '+' : ''}${formatPercent(percent)})`}`);
      }
      const detail = detailParts.join(' · ');
      const priceChange = `<div class="history-price-change is-${direction}">
        <span>${eh(formatCurrency(oldPrice))}</span>
        <i class="bi bi-arrow-right history-arrow"></i>
        <strong>${eh(formatCurrency(newPrice))}</strong>
        ${difference === 0 ? '' : `<small>${difference > 0 ? '+' : ''}${eh(formatCurrency(difference))}${percent == null ? '' : ` · ${percent > 0 ? '+' : ''}${eh(formatPercent(percent))}`}</small>`}
      </div>`;
      return {
        type: 'price',
        timestamp: entry.changed_at,
        searchText: normalize(`${materialName} ${sku} ${userName} ${detail} precio`),
        html: `<tr class="history-price-row">
          <td class="history-date">${dtf.format(new Date(entry.changed_at))}</td>
          <td><span class="history-type is-price"><i class="bi bi-currency-dollar"></i>Precio</span></td>
          <td><div class="history-reference"><strong>${eh(materialName)}</strong>${sku ? `<small>SKU ${eh(sku)}</small>` : ''}</div></td>
          <td>Catálogo de insumos</td>
          <td>${priceChange}</td>
          <td>${eh(userName)}</td>
          <td>${eh(detail)}</td>
        </tr>`
      };
    });

    const visible = [...orderEvents, ...priceEvents]
      .filter((event) => typeFilter === 'all' || event.type === typeFilter)
      .filter((event) => !query || event.searchText.includes(query))
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    E.historyTableBody.innerHTML = visible.map((event) => event.html).join('')
      || '<tr><td colspan="7"><div class="empty-inline">No hay movimientos que coincidan con los filtros.</div></td></tr>';
    E.historyResultsCaption.textContent = `${visible.length} ${visible.length === 1 ? 'movimiento visible' : 'movimientos visibles'} · ${orderEvents.length} de pedidos${isFullAdmin() ? ` · ${priceEvents.length} de precios` : ''}`;
  }

  function renderServiceBudgetPreview() {
    const billing = clampMoney(E.serviceBilling?.value);
    const percent = Math.min(7, Math.max(5, number(E.serviceBudgetPercent?.value) || 5));
    E.serviceFiveValue.textContent = formatCurrency(billing * 0.05);
    E.serviceLimitValue.textContent = `${formatCurrency(billing * percent / 100)} (${formatPercent(percent)})`;
    E.serviceSevenValue.textContent = formatCurrency(billing * 0.07);
  }

  function cartMetrics() {
    const service = currentService();
    let totalUnits = 0;
    let totalAmount = 0;
    let selectedMaterials = 0;
    let unpricedCount = 0;

    S.draft.forEach((quantity, materialId) => {
      const qty = number(quantity);
      if (qty <= 0) return;
      const material = S.materials.find((item) => item.id === materialId);
      const price = number(material?.unit_price);
      selectedMaterials += 1;
      totalUnits += qty;
      totalAmount += qty * price;
      if (price <= 0) unpricedCount += 1;
    });

    S.extras.forEach((item) => {
      const qty = number(item.quantity);
      const price = number(item.unitPrice);
      totalUnits += qty;
      totalAmount += qty * price;
      if (price <= 0) unpricedCount += 1;
    });

    totalAmount = Math.round(totalAmount * 100) / 100;
    const billing = number(service?.monthly_billing);
    const limitPercent = Math.min(7, Math.max(5, number(service?.budget_limit_percent) || 5));
    const fiveAmount = Math.round(billing * 5) / 100;
    const sevenAmount = Math.round(billing * 7) / 100;
    const limitAmount = Math.round(billing * limitPercent) / 100;
    const status = billing <= 0 ? 'sin_configurar' : (totalAmount > sevenAmount ? 'sobre_7' : (totalAmount > limitAmount ? 'sobre_limite' : 'dentro'));
    const usagePercent = limitAmount > 0 ? totalAmount / limitAmount * 100 : 0;

    return {
      totalItems: selectedMaterials + S.extras.length,
      totalUnits,
      totalAmount,
      unpricedCount,
      billing,
      limitPercent,
      fiveAmount,
      sevenAmount,
      limitAmount,
      status,
      usagePercent
    };
  }

  function budgetStatusText(status) {
    return ({
      sin_configurar: 'Sin facturación configurada',
      dentro: 'Dentro del límite',
      sobre_limite: 'Supera el límite operativo',
      sobre_7: 'Supera el 7%'
    })[status] || 'Sin información';
  }


  function isOpenOperationalOrder(order) {
    return Boolean(order) && !['entregado','cancelado'].includes(order.status);
  }

  function orderBillingReferenceState(order) {
    const service=serviceById(order?.service_id);
    const snapshotBilling=roundMoney(number(order?.monthly_billing_snapshot));
    const snapshotPercent=number(order?.budget_limit_percent_snapshot) || 5;
    const currentBilling=roundMoney(number(service?.monthly_billing));
    const currentPercent=Math.min(7,Math.max(5,number(service?.budget_limit_percent)||5));
    const billingChanged=Math.abs(currentBilling-snapshotBilling)>=0.01;
    const percentChanged=Math.abs(currentPercent-snapshotPercent)>=0.001;
    const changed=Boolean(service) && (billingChanged || percentChanged);
    const reviewedBilling=order?.billing_reference_reviewed_service_billing == null ? null : roundMoney(order.billing_reference_reviewed_service_billing);
    const reviewedPercent=order?.billing_reference_reviewed_limit_percent == null ? null : number(order.billing_reference_reviewed_limit_percent);
    const reviewedCurrent=reviewedBilling!=null && reviewedPercent!=null &&
      Math.abs(reviewedBilling-currentBilling)<0.01 && Math.abs(reviewedPercent-currentPercent)<0.001;
    const decision=String(order?.billing_reference_decision||'');
    const open=isOpenOperationalOrder(order);
    const usingPrevious=open && changed && reviewedCurrent && decision==='previous';
    const needsReview=open && changed && !usingPrevious;
    const currentLimit=roundMoney(currentBilling*currentPercent/100);
    const currentFive=roundMoney(currentBilling*0.05);
    const currentSeven=roundMoney(currentBilling*0.07);
    const snapshotLimit=roundMoney(number(order?.budget_limit_amount_snapshot) || snapshotBilling*snapshotPercent/100);
    const snapshotFive=roundMoney(number(order?.budget_five_percent_snapshot) || snapshotBilling*0.05);
    const snapshotSeven=roundMoney(number(order?.budget_seven_percent_snapshot) || snapshotBilling*0.07);
    return {
      service,open,changed,billingChanged,percentChanged,needsReview,usingPrevious,decision,
      snapshotBilling,snapshotPercent,snapshotLimit,snapshotFive,snapshotSeven,
      currentBilling,currentPercent,currentLimit,currentFive,currentSeven,
      billingDifference:roundMoney(currentBilling-snapshotBilling)
    };
  }

  function ordersNeedingBillingReferenceReview() {
    return S.orders.filter((order)=>orderBillingReferenceState(order).needsReview);
  }

  function renderOrdersBillingChangeAlert() {
    if (!E.ordersBillingChangeAlert) return;
    const rows=ordersNeedingBillingReferenceReview();
    const visible=isFullAdmin() && rows.length>0;
    E.ordersBillingChangeAlert.classList.toggle('d-none',!visible);
    if (!visible) return;
    E.ordersBillingChangeAlertTitle.textContent=`${rows.length} pedido${rows.length===1?'':'s'} abierto${rows.length===1?' usa':'s usan'} una facturación anterior`;
    E.ordersBillingChangeAlertText.textContent='La facturación o el porcentaje operativo del servicio cambió después de crear esos pedidos. La barra sigue usando la referencia anterior hasta que Operaciones elija qué criterio conservar.';
    E.applyCurrentBillingToOpenOrdersButton.innerHTML=`<i class="bi bi-arrow-repeat me-2"></i>Usar nueva facturación en todos (${rows.length})`;
  }

  function orderBillingReferenceBadge(order) {
    const state=orderBillingReferenceState(order);
    if (state.needsReview) return '<div class="billing-reference-badge is-review"><i class="bi bi-exclamation-triangle-fill"></i>Facturación cambió · revisar</div>';
    if (state.usingPrevious) return '<div class="billing-reference-badge is-previous"><i class="bi bi-clock-history"></i>Usa límite anterior</div>';
    return '';
  }

  function renderOrderBillingReferenceAlert(order) {
    if (!E.orderBillingReferenceAlert) return;
    const state=orderBillingReferenceState(order);
    if (!state.needsReview && !state.usingPrevious) {
      E.orderBillingReferenceAlert.innerHTML='';
      E.orderBillingReferenceAlert.classList.add('d-none');
      return;
    }
    const direction=state.billingDifference>0?'aumentó':state.billingDifference<0?'disminuyó':'cambió';
    const oldValues=`<div class="billing-reference-option-card is-old"><span>Referencia del pedido</span><strong>${eh(formatCurrency(state.snapshotBilling))}</strong><small>5%: ${eh(formatCurrency(state.snapshotFive))} · Límite ${eh(formatPercent(state.snapshotPercent))}: ${eh(formatCurrency(state.snapshotLimit))} · 7%: ${eh(formatCurrency(state.snapshotSeven))}</small></div>`;
    const newValues=`<div class="billing-reference-option-card is-new"><span>Facturación actual del servicio</span><strong>${eh(formatCurrency(state.currentBilling))}</strong><small>5%: ${eh(formatCurrency(state.currentFive))} · Límite ${eh(formatPercent(state.currentPercent))}: ${eh(formatCurrency(state.currentLimit))} · 7%: ${eh(formatCurrency(state.currentSeven))}</small></div>`;
    if (state.needsReview) {
      E.orderBillingReferenceAlert.className='billing-reference-order-alert is-review mb-3';
      E.orderBillingReferenceAlert.innerHTML=`
        <div class="billing-reference-order-head"><div><span class="eyebrow">Referencia presupuestaria pendiente</span><h6>La facturación del servicio ${eh(direction)} desde que se creó este pedido</h6><p>Elegí qué referencia debe usar la barra y el control del pedido. La opción recomendada es trabajar con la facturación actual.</p></div><i class="bi bi-exclamation-triangle-fill"></i></div>
        <div class="billing-reference-options">${oldValues}${newValues}</div>
        <div class="billing-reference-actions">
          <button class="btn btn-primary fw-bold" type="button" data-order-billing-reference="current" data-order-billing-id="${ea(order.id)}"><i class="bi bi-arrow-repeat me-2"></i>Usar nueva facturación</button>
          <button class="btn btn-outline-secondary fw-bold" type="button" data-order-billing-reference="previous" data-order-billing-id="${ea(order.id)}"><i class="bi bi-clock-history me-2"></i>Mantener facturación anterior</button>
        </div>`;
    } else {
      E.orderBillingReferenceAlert.className='billing-reference-order-alert is-previous mb-3';
      E.orderBillingReferenceAlert.innerHTML=`
        <div class="billing-reference-order-head"><div><span class="eyebrow">Referencia elegida</span><h6>Este pedido continúa trabajando con la facturación anterior</h6><p>La decisión ya fue registrada. La barra permanece sobre la referencia original, aunque el servicio tenga una facturación más nueva.</p></div><i class="bi bi-clock-history"></i></div>
        <div class="billing-reference-options">${oldValues}${newValues}</div>
        <div class="billing-reference-actions"><button class="btn btn-primary fw-bold" type="button" data-order-billing-reference="current" data-order-billing-id="${ea(order.id)}"><i class="bi bi-arrow-repeat me-2"></i>Pasar a nueva facturación</button></div>`;
    }
    E.orderBillingReferenceAlert.classList.remove('d-none');
  }

  async function setOrderBillingReference(orderId,mode,button=null) {
    if (!isFullAdmin()) { toast('Solo el administrador puede definir la referencia presupuestaria.', 'error'); return; }
    if (!['current','previous'].includes(mode)) return;
    const order=S.orders.find((item)=>item.id===orderId);
    if (!order) return;
    const state=orderBillingReferenceState(order);
    const actionText=mode==='current'
      ? `usar la facturación actual de ${formatCurrency(state.currentBilling)}`
      : `mantener la facturación anterior de ${formatCurrency(state.snapshotBilling)}`;
    if (!confirm(`Este pedido pasará a ${actionText}. ¿Continuar?`)) return;
    if (button) buttonBusy(button,true,mode==='current'?'Actualizando referencia...':'Guardando decisión...');
    try {
      const { error }=await S.sb.rpc('admin_set_order_billing_reference',{p_order_id:orderId,p_mode:mode});
      if (error) {
        if (/admin_set_order_billing_reference|schema cache|function/i.test(String(error.message||''))) {
          throw new Error('Falta instalar la actualización de base de datos. Ejecutá actualizar-referencia-facturacion-pedidos.sql en Supabase.');
        }
        throw error;
      }
      await refreshAdmin(false);
      const updated=S.orders.find((item)=>item.id===orderId);
      if (updated && S.selectedOrderId===orderId) renderOrderDetail(updated);
      toast(mode==='current'?'El pedido ahora usa la facturación actual del servicio.':'Se registró que este pedido seguirá usando la facturación anterior.','success');
    } catch(error) {
      console.error(error);
      toast(error.message||'No se pudo actualizar la referencia del pedido.','error');
    } finally {
      if (button && document.body.contains(button)) buttonBusy(button,false);
    }
  }

  async function applyCurrentBillingToAllOpenOrders() {
    if (!isFullAdmin()) return;
    const rows=ordersNeedingBillingReferenceReview();
    if (!rows.length) { toast('No hay pedidos abiertos pendientes de revisar.', 'success'); return; }
    if (!confirm(`Se actualizarán ${rows.length} pedido${rows.length===1?'':'s'} abierto${rows.length===1?'':'s'} para que usen la facturación y el límite actuales de sus servicios. Los pedidos entregados o cancelados no se modifican. ¿Continuar?`)) return;
    buttonBusy(E.applyCurrentBillingToOpenOrdersButton,true,'Actualizando pedidos...');
    let updated=0;
    const failures=[];
    try {
      for (const order of rows) {
        const { error }=await S.sb.rpc('admin_set_order_billing_reference',{p_order_id:order.id,p_mode:'current'});
        if (error) failures.push(`${order.order_code}: ${error.message}`); else updated+=1;
      }
      await refreshAdmin(false);
      if (failures.length) toast(`${updated} pedidos actualizados. ${failures.length} no pudieron modificarse.`, 'error');
      else toast(`${updated} pedido${updated===1?'':'s'} actualizado${updated===1?'':'s'} a la nueva facturación.`, 'success');
    } catch(error) {
      console.error(error);
      toast(error.message||'No se pudieron actualizar los pedidos.','error');
    } finally {
      buttonBusy(E.applyCurrentBillingToOpenOrdersButton,false);
      renderOrders();
    }
  }

  function orderBudgetMetrics(order) {
    const totalAmount = roundMoney(number(order?.total_amount));
    const billing = number(order?.monthly_billing_snapshot);
    const snapshotLimitAmount = roundMoney(number(order?.budget_limit_amount_snapshot));
    const snapshotLimitPercent = number(order?.budget_limit_percent_snapshot);
    const limitPercent = snapshotLimitPercent > 0
      ? Math.min(7, Math.max(0, snapshotLimitPercent))
      : (billing > 0 && snapshotLimitAmount > 0 ? Math.min(7, snapshotLimitAmount / billing * 100) : 0);
    const limitAmount = snapshotLimitAmount > 0
      ? snapshotLimitAmount
      : roundMoney(billing * limitPercent / 100);
    const sevenAmount = number(order?.budget_seven_percent_snapshot) > 0
      ? roundMoney(order.budget_seven_percent_snapshot)
      : roundMoney(billing * 0.07);
    const status = billing <= 0 || sevenAmount <= 0
      ? 'sin_configurar'
      : (totalAmount > sevenAmount ? 'sobre_7' : (totalAmount > limitAmount ? 'sobre_limite' : 'dentro'));
    const usagePercent = sevenAmount > 0 ? totalAmount / sevenAmount * 100 : 0;
    const differenceToSeven = roundMoney(sevenAmount - totalAmount);
    const differenceToLimit = roundMoney(limitAmount - totalAmount);
    const limitMarkerPercent = sevenAmount > 0 ? Math.max(0, Math.min(100, limitAmount / sevenAmount * 100)) : 0;
    return { totalAmount, billing, limitPercent, limitAmount, sevenAmount, status, usagePercent, differenceToSeven, differenceToLimit, limitMarkerPercent };
  }

  function budgetVisualClass(status) {
    return status === 'sobre_7' ? 'danger' : (status === 'sobre_limite' ? 'warning' : (status === 'dentro' ? 'success' : 'muted'));
  }

  function budgetLimitMarker(order) {
    const metrics = orderBudgetMetrics(order);
    if (metrics.status === 'sin_configurar') return '';
    return `<i class="budget-limit-marker" style="left:${metrics.limitMarkerPercent.toFixed(2)}%" aria-hidden="true"></i>`;
  }

  function orderBudgetMiniProgress(order) {
    const metrics = orderBudgetMetrics(order);
    if (metrics.status === 'sin_configurar') {
      return `<div class="order-budget-mini is-muted"><div class="order-budget-mini-head"><span>Sin referencia presupuestaria</span></div><div class="order-budget-track"><span style="width:0%"></span></div></div>`;
    }
    const visual = budgetVisualClass(metrics.status);
    const progress = Math.max(0, Math.min(100, metrics.usagePercent));
    return `<div class="order-budget-mini is-${visual}" title="${ea(`Uso del 7%: ${formatPercent(metrics.usagePercent)} · Límite operativo: ${formatPercent(metrics.limitPercent)}`)}">
      <div class="order-budget-mini-head"><span>Uso del máximo 7%</span><strong>${eh(formatPercent(metrics.usagePercent))}</strong></div>
      <div class="order-budget-track" role="progressbar" aria-label="Uso de la referencia máxima del 7%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.max(0, Math.min(100, metrics.usagePercent)))}"><span style="width:${progress.toFixed(2)}%"></span>${budgetLimitMarker(order)}</div>
    </div>`;
  }

  function orderBudgetOverview(order) {
    const metrics = orderBudgetMetrics(order);
    const visual = budgetVisualClass(metrics.status);
    if (metrics.status === 'sin_configurar') {
      return `<section class="order-budget-overview is-muted" aria-label="Control presupuestario">
        <div class="order-budget-overview-head"><div><div class="order-meta-label">Control presupuestario</div><div class="order-budget-overview-total">${eh(formatCurrency(metrics.totalAmount))}</div></div><span class="order-budget-overview-pill">Sin configurar</span></div>
        <div class="order-budget-empty"><i class="bi bi-info-circle"></i><span>Este servicio no tiene facturación mensual configurada, por lo que no puede calcularse la barra de referencia.</span></div>
      </section>`;
    }
    const progress = Math.max(0, Math.min(100, metrics.usagePercent));
    const resultText = metrics.status === 'sobre_7'
      ? `Exceso sobre el 7%: ${formatCurrency(Math.abs(metrics.differenceToSeven))}`
      : (metrics.status === 'sobre_limite'
        ? `Supera el límite operativo por ${formatCurrency(Math.abs(metrics.differenceToLimit))}`
        : `Margen hasta el límite: ${formatCurrency(Math.max(0, metrics.differenceToLimit))}`);
    return `<section class="order-budget-overview is-${visual}" aria-label="Control presupuestario">
      <div class="order-budget-overview-head">
        <div><div class="order-meta-label">Total actual del pedido</div><div class="order-budget-overview-total">${eh(formatCurrency(metrics.totalAmount))}</div></div>
        <span class="order-budget-overview-pill">${eh(budgetStatusText(metrics.status))}</span>
      </div>
      <div class="order-budget-overview-grid">
        <div><span>Límite operativo</span><strong>${eh(formatCurrency(metrics.limitAmount))} (${eh(formatPercent(metrics.limitPercent))})</strong></div>
        <div><span>Referencia máxima</span><strong>${eh(formatCurrency(metrics.sevenAmount))} (7%)</strong></div>
        <div><span>Uso del máximo</span><strong>${eh(formatPercent(metrics.usagePercent))}</strong></div>
        <div><span>Resultado</span><strong>${eh(resultText)}</strong></div>
      </div>
      <div class="order-budget-overview-track" role="progressbar" aria-label="Uso de la referencia máxima del 7%" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.max(0, Math.min(100, metrics.usagePercent)))}"><span style="width:${progress.toFixed(2)}%"></span>${budgetLimitMarker(order)}</div>
      <div class="order-budget-overview-caption">La marca vertical indica el límite operativo configurado. La barra completa representa el 7% de la facturación mensual.</div>
    </section>`;
  }

  function budgetBadge(order) {
    const status = orderBudgetMetrics(order).status;
    const klass = status === 'sobre_7' ? 'budget-badge-danger' : (status === 'sobre_limite' ? 'budget-badge-warning' : (status === 'dentro' ? 'budget-badge-ok' : 'budget-badge-muted'));
    return `<div class="budget-badge ${klass}">${eh(budgetStatusText(status))}</div>`;
  }

  function currentService() {
    return S.services.find((item) => item.id === S.publicServiceId) || null;
  }

  function isMaterialHiddenForService(materialId, serviceId) {
    if (!serviceId) return false;
    return S.serviceMaterialExclusions.some((item) => item.service_id === serviceId && item.material_id === materialId);
  }

  function visibleMaterialsForService(serviceId) {
    return S.materials.filter((material) => material.active !== false && !isMaterialHiddenForService(material.id, serviceId));
  }

  function serviceById(id) {
    return S.services.find((item) => item.id === id) || null;
  }

  function itemsForOrder(orderId) {
    return S.orderItems.filter((item) => item.order_id === orderId).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }

  function getSelectedOrder() {
    return S.orders.find((item) => item.id === S.selectedOrderId) || null;
  }

  function materialSort(a, b) {
    return String(a.category || '').localeCompare(String(b.category || ''), 'es') ||
      number(a.sort_order) - number(b.sort_order) ||
      String(a.name || '').localeCompare(String(b.name || ''), 'es');
  }

  function orderPriorityScore(order) {
    let score = 0;
    if (!['entregado', 'cancelado'].includes(order.status)) score += 100;
    if (order.priority === 'urgente') score += 50;
    if (order.status === 'pendiente') score += 20;
    return score;
  }

  function showLoading() {
    E.loadingScreen.classList.remove('d-none');
  }

  function toggleAccessPassword() {
    const show = E.accessLoginPassword.type === 'password';
    E.accessLoginPassword.type = show ? 'text' : 'password';
    E.accessTogglePassword.innerHTML = `<i class="bi ${show ? 'bi-eye-slash' : 'bi-eye'}"></i>`;
    E.accessTogglePassword.setAttribute('aria-label', show ? 'Ocultar contraseña' : 'Mostrar contraseña');
  }

  function togglePassword() {
    const show = E.loginPassword.type === 'password';
    E.loginPassword.type = show ? 'text' : 'password';
    E.togglePassword.innerHTML = `<i class="bi ${show ? 'bi-eye-slash' : 'bi-eye'}"></i>`;
  }

  function showEntryError(message) {
    E.publicEntryError.textContent = message;
    E.publicEntryError.classList.remove('d-none');
  }

  function hideEntryError() {
    E.publicEntryError.classList.add('d-none');
    E.publicEntryError.textContent = '';
  }

  function showAccessLoginError(message) {
    E.accessLoginError.textContent = message;
    E.accessLoginError.classList.remove('d-none');
  }

  function hideAccessLoginError() {
    E.accessLoginError.classList.add('d-none');
    E.accessLoginError.textContent = '';
  }

  function showAccessLoginSuccess(message) {
    E.accessLoginSuccess.textContent = message;
    E.accessLoginSuccess.classList.remove('d-none');
  }

  function hideAccessLoginSuccess() {
    E.accessLoginSuccess.classList.add('d-none');
    E.accessLoginSuccess.textContent = '';
  }

  function showLoginError(message) {
    E.loginError.textContent = message;
    E.loginError.classList.remove('d-none');
  }

  function hideLoginError() {
    E.loginError.classList.add('d-none');
    E.loginError.textContent = '';
  }

  function toast(message, type = 'info') {
    E.toastBody.textContent = message;
    E.appToast.classList.remove('toast-success', 'toast-error', 'toast-info');
    E.appToast.classList.add(`toast-${type}`);
    M.toast.show();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copiado al portapapeles.', 'success');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      toast('Copiado al portapapeles.', 'success');
    }
  }

  function buttonBusy(button, busy, label = '') {
    if (!button) return;
    if (busy) {
      if (!button.dataset.originalHtml) button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      if (label) button.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${eh(label)}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) {
        button.innerHTML = button.dataset.originalHtml;
        delete button.dataset.originalHtml;
      }
    }
  }


  function setupSmartHorizontalScrollbars() {
    // Cada tabla ancha recibe una segunda barra horizontal en su parte superior.
    // Esa barra queda "sticky" debajo del encabezado mientras el usuario recorre
    // verticalmente la tabla. Es más fiable que una barra flotante global y evita
    // tener que llegar al último renglón para desplazarse hacia los costados.
    const selector = '.table-responsive, [data-ci-hscroll]';
    const enhanced = new WeakSet();
    const cleaners = [];

    const topbarHeight = () => {
      const topbar = document.querySelector('.topbar');
      if (!topbar || getComputedStyle(topbar).display === 'none') return 0;
      return Math.max(0, Math.round(topbar.getBoundingClientRect().height));
    };

    const enhance = (target) => {
      if (!(target instanceof HTMLElement) || enhanced.has(target)) return;
      enhanced.add(target);
      target.classList.add('ci-hscroll-target');

      const host = target.parentElement;
      if (!host) return;
      host.classList.add('ci-hscroll-host');

      const dock = document.createElement('div');
      dock.className = 'ci-hscroll-dock';
      dock.setAttribute('role', 'scrollbar');
      dock.setAttribute('aria-label', 'Mover tabla horizontalmente');
      dock.innerHTML = '<div class="ci-hscroll-dock-spacer"></div>';
      host.insertBefore(dock, target);
      const spacer = dock.firstElementChild;

      let syncing = false;
      let raf = 0;

      const update = () => {
        raf = 0;
        if (!target.isConnected || !dock.isConnected) return;

        const content = target.querySelector('table') || target.firstElementChild;
        const contentWidth = Math.max(
          target.scrollWidth || 0,
          content instanceof HTMLElement ? content.scrollWidth : 0,
          content instanceof HTMLElement ? Math.ceil(content.getBoundingClientRect().width) : 0
        );
        const viewportWidth = target.clientWidth || Math.ceil(target.getBoundingClientRect().width);
        const needsScroll = contentWidth > viewportWidth + 2;

        dock.classList.toggle('d-none', !needsScroll);
        if (!needsScroll) return;

        // En la vista principal se pega debajo de la barra superior. Dentro de un
        // modal se pega al borde superior del área desplazable del modal.
        const inModal = Boolean(target.closest('.modal'));
        dock.style.setProperty('--ci-hscroll-top', `${inModal ? 0 : topbarHeight()}px`);
        spacer.style.width = `${Math.max(contentWidth, viewportWidth + 1)}px`;

        // Mantener exactamente la misma posición lateral después de renderizados,
        // filtros, cambios de pestaña o actualización de datos.
        if (!syncing && Math.abs(dock.scrollLeft - target.scrollLeft) > 1) {
          syncing = true;
          dock.scrollLeft = target.scrollLeft;
          syncing = false;
        }
      };

      const schedule = () => {
        if (raf) return;
        raf = requestAnimationFrame(update);
      };

      const fromDock = () => {
        if (syncing) return;
        syncing = true;
        target.scrollLeft = dock.scrollLeft;
        syncing = false;
      };

      const fromTarget = () => {
        if (syncing) return;
        syncing = true;
        dock.scrollLeft = target.scrollLeft;
        syncing = false;
      };

      dock.addEventListener('scroll', fromDock, { passive: true });
      target.addEventListener('scroll', fromTarget, { passive: true });

      let resizeObserver = null;
      if ('ResizeObserver' in window) {
        resizeObserver = new ResizeObserver(schedule);
        resizeObserver.observe(target);
        const content = target.querySelector('table') || target.firstElementChild;
        if (content instanceof HTMLElement) resizeObserver.observe(content);
      }

      cleaners.push(() => resizeObserver?.disconnect());
      schedule();
      // Varias tablas se llenan luego de llamadas a Supabase; una segunda medición
      // evita que queden ocultas por haber estado vacías durante el primer render.
      setTimeout(schedule, 0);
      setTimeout(schedule, 250);
    };

    const scan = () => {
      document.querySelectorAll(selector).forEach(enhance);
      document.querySelectorAll('.ci-hscroll-target').forEach((target) => {
        if (target instanceof HTMLElement) {
          // Forzamos un resize sintético para recalcular tablas cuyo contenido cambió.
          target.dispatchEvent(new Event('ci-hscroll-refresh'));
        }
      });
    };

    // Cada target escucha también este evento liviano, usado por el observer global.
    document.addEventListener('ci-hscroll-refresh-all', () => {
      document.querySelectorAll('.ci-hscroll-target').forEach((target) => {
        const dock = target.previousElementSibling;
        if (dock?.classList.contains('ci-hscroll-dock')) {
          const content = target.querySelector('table') || target.firstElementChild;
          const width = Math.max(target.scrollWidth || 0, content instanceof HTMLElement ? content.scrollWidth : 0);
          const client = target.clientWidth || 0;
          dock.classList.toggle('d-none', !(width > client + 2));
          const spacer = dock.firstElementChild;
          if (spacer instanceof HTMLElement) spacer.style.width = `${Math.max(width, client + 1)}px`;
          if (!dock.classList.contains('d-none')) dock.scrollLeft = target.scrollLeft;
        }
      });
    });

    const observer = new MutationObserver(() => {
      scan();
      document.dispatchEvent(new Event('ci-hscroll-refresh-all'));
    });
    observer.observe(document.body, { childList: true, subtree: true });

    window.addEventListener('resize', () => document.dispatchEvent(new Event('ci-hscroll-refresh-all')), { passive: true });
    document.addEventListener('shown.bs.modal', () => setTimeout(() => document.dispatchEvent(new Event('ci-hscroll-refresh-all')), 0));
    document.addEventListener('shown.bs.tab', () => setTimeout(() => document.dispatchEvent(new Event('ci-hscroll-refresh-all')), 0));
    document.addEventListener('click', () => setTimeout(() => document.dispatchEvent(new Event('ci-hscroll-refresh-all')), 0), true);

    scan();
  }

  function publicErrorMessage(error) {
    const message = String(error?.message || '');
    if (message.includes('supervisor_order_bootstrap') || message.includes('schema cache')) return 'La base de datos todavía no tiene instalada la última versión. Ejecutá actualizar-login-obligatorio.sql.';
    return message || 'No se pudieron cargar los servicios.';
  }

  function publicCreateErrorMessage(error) {
    const message = String(error?.message || '');
    if (message.includes('supervisor_create_order') || message.includes('schema cache')) return 'La función de pedidos no está actualizada. Ejecutá actualizar-operario-y-buscador-servicios.sql en Supabase.';
    return message || 'No se pudo registrar el pedido.';
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  function normalizeCuit(value) {
    return String(value ?? '').replace(/[^0-9]/g, '');
  }

  function isCuitFormatValid(value) {
    return /^\d{11}$/.test(normalizeCuit(value));
  }

  function formatCuit(value) {
    const digits=normalizeCuit(value);
    if (digits.length!==11) return digits || '';
    return `${digits.slice(0,2)}-${digits.slice(2,10)}-${digits.slice(10)}`;
  }

  function slugify(value) {
    const base = normalize(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `${base || 'insumo'}-${Date.now().toString(36)}`;
  }

  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function clampQty(value, min = 0) {
    return Math.min(999, Math.max(min, Math.round(number(value) * 100) / 100));
  }

  function formatQty(value) {
    const qty = number(value);
    return Number.isInteger(qty) ? String(qty) : qty.toLocaleString('es-AR', { maximumFractionDigits: 2 });
  }

  function formatInputQty(value) {
    const qty = number(value);
    return Number.isInteger(qty) ? String(qty) : String(Math.round(qty * 100) / 100);
  }

  function roundMoney(value) {
    return Math.round((number(value) + Number.EPSILON) * 100) / 100;
  }

  function clampMoney(value) {
    return Math.min(999999999.99, Math.max(0, Math.round(number(value) * 100) / 100));
  }

  function formatMoneyInput(value) {
    return String(Math.round(number(value) * 100) / 100);
  }

  function formatCurrency(value) {
    return number(value).toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 });
  }

  function formatPercent(value) {
    return `${number(value).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`;
  }

  function localDateKey(date) {
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function eh(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function ea(value) {
    return eh(value).replace(/`/g, '&#96;');
  }
})();
