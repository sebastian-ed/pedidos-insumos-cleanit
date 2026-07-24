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
  const ROLE_LABELS = { admin: 'Administrador', supplier: 'Proveedor', operator: 'Operario especial' };
  const FULL_ADMIN_ROLE = 'admin';

  const STATUS_OPTIONS = Object.entries(STATUS_LABELS)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');

  const S = {
    sb: null,
    session: null,
    profile: null,
    mode: 'public',
    services: [],
    materials: [],
    orders: [],
    orderItems: [],
    profiles: [],
    history: [],
    serviceMaterialExclusions: [],
    selectedServiceMaterialsId: null,
    serviceMaterialsDraftHidden: new Set(),
    publicServiceId: null,
    draft: new Map(),
    extras: [],
    tab: 'dashboard',
    selectedOrderId: null,
    orderEditDraft: [],
    orderEditOriginalUpdatedAt: null,
    orderEditMode: false,
    lastSuccessText: '',
    channel: null,
    refreshTimer: null,
    lastBudgetStatus: null,
    initialized: false
  };

  const E = {};
  const M = {};
  const dtf = new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' });

  function isFullAdmin() { return S.profile?.role === FULL_ADMIN_ROLE; }
  function isSupplier() { return S.profile?.role === 'supplier'; }
  function canOperateOrders() { return ['admin', 'supplier'].includes(S.profile?.role); }
  function canManageMasterData() { return isFullAdmin(); }
  function canManageUsers() { return isFullAdmin(); }
  function allowedTabs() { return isFullAdmin() ? ['dashboard','orders','materials','services','users','history'] : ['dashboard','orders','history']; }

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    if (S.initialized) return;
    S.initialized = true;

    document.querySelectorAll('[id]').forEach((node) => { E[node.id] = node; });

    M.adminLogin = new bootstrap.Modal(E.adminLoginModal);
    M.extraMaterial = new bootstrap.Modal(E.extraMaterialModal);
    M.orderSuccess = new bootstrap.Modal(E.orderSuccessModal);
    M.orderDetail = new bootstrap.Modal(E.orderDetailModal);
    M.service = new bootstrap.Modal(E.serviceModal);
    M.serviceMaterials = new bootstrap.Modal(E.serviceMaterialsModal);
    M.material = new bootstrap.Modal(E.materialModal);
    M.user = new bootstrap.Modal(E.userModal);
    M.toast = new bootstrap.Toast(E.appToast, { delay: 3200 });

    bindEvents();

    document.title = cfg.APP_NAME || 'Pedidos Clean It';
    E.appTitle.textContent = document.title;
    E.publicReporterName.value = localStorage.getItem('pedidosCleanItReporter') || '';
    E.orderDetailStatus.innerHTML = STATUS_OPTIONS;

    if (!configured) {
      E.loadingScreen.classList.add('d-none');
      E.setupWarning.classList.remove('d-none');
      E.publicStartButton.disabled = true;
      E.openAdminLoginButton.disabled = true;
      showPublicEntry();
      return;
    }

    S.sb = supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    S.sb.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && S.mode === 'admin') {
        setTimeout(() => returnToPublic(), 0);
      }
    });

    try {
      await loadPublicData();
      showPublicEntry();
    } catch (error) {
      console.error(error);
      showPublicEntry();
      showEntryError(publicErrorMessage(error));
    } finally {
      E.loadingScreen.classList.add('d-none');
    }
  }

  function bindEvents() {
    E.publicEntryForm.addEventListener('submit', startPublicOrder);
    E.openAdminLoginButton.addEventListener('click', openAdminLogin);
    E.headerAdminLoginButton.addEventListener('click', openAdminLogin);
    E.switchServiceButton.addEventListener('click', requestServiceSwitch);
    E.emptySwitchServiceButton.addEventListener('click', requestServiceSwitch);
    E.loginForm.addEventListener('submit', login);
    E.togglePassword.addEventListener('click', togglePassword);
    E.logoutButton.addEventListener('click', logout);

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
    E.materialsSearch.addEventListener('input', renderMaterials);
    E.materialsStatusFilter.addEventListener('change', renderMaterials);
    E.adminServiceSearch.addEventListener('input', renderServices);

    E.addMaterialButton.addEventListener('click', () => openMaterial());
    E.materialForm.addEventListener('submit', saveMaterial);
    E.materialImageFile.addEventListener('change', previewMaterialImage);
    E.addServiceButton.addEventListener('click', () => openService());
    E.serviceForm.addEventListener('submit', saveService);
    E.serviceBilling.addEventListener('input', renderServiceBudgetPreview);
    E.serviceBudgetPercent.addEventListener('input', renderServiceBudgetPreview);
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
    E.orderDetailModal.addEventListener('hidden.bs.modal', resetOrderEditState);

    E.appShell.addEventListener('click', handleAppClick);
    E.appShell.addEventListener('input', handleAppInput);

    document.querySelectorAll('[data-admin-tab]').forEach((button) => {
      button.addEventListener('click', () => switchTab(button.dataset.adminTab));
    });
  }

  async function loadPublicData() {
    const { data, error } = await S.sb.rpc('public_order_bootstrap');
    if (error) throw error;
    const payload = typeof data === 'string' ? JSON.parse(data) : (data || {});
    S.services = Array.isArray(payload.services) ? payload.services : [];
    S.materials = Array.isArray(payload.materials) ? payload.materials : [];
    S.serviceMaterialExclusions = Array.isArray(payload.hidden_materials) ? payload.hidden_materials : [];
    populatePublicServiceSelect();
    populateOperatorCategories();
  }

  function showPublicEntry() {
    E.loadingScreen.classList.add('d-none');
    E.appShell.classList.add('d-none');
    E.authView.classList.remove('d-none');
    populatePublicServiceSelect();
  }

  function populatePublicServiceSelect() {
    const active = S.services.filter((item) => item.active !== false);
    const remembered = localStorage.getItem('pedidosCleanItService') || '';
    E.publicServiceSelect.innerHTML = '<option value="">Seleccionar servicio...</option>' + active
      .map((item) => `<option value="${ea(item.id)}">${eh(item.name)}</option>`)
      .join('');
    if (active.some((item) => item.id === remembered)) E.publicServiceSelect.value = remembered;
    E.publicStartButton.disabled = !configured || active.length === 0;
    if (configured && active.length === 0) showEntryError('No hay servicios activos cargados.');
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
      showEntryError('Ingresá tu nombre para continuar.');
      E.publicReporterName.focus();
      return;
    }

    localStorage.setItem('pedidosCleanItService', serviceId);
    localStorage.setItem('pedidosCleanItReporter', reporter);
    S.publicServiceId = serviceId;
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
    E.authView.classList.add('d-none');
    E.appShell.classList.remove('d-none');
    E.adminView.classList.add('d-none');
    E.operatorView.classList.remove('d-none');
    E.adminMenuButton.classList.add('d-none');
    E.switchServiceButton.classList.remove('d-none');
    E.headerAdminLoginButton.classList.remove('d-none');
    E.logoutButton.classList.add('d-none');
    E.headerUserChip.classList.remove('d-none');
    E.headerUserName.textContent = localStorage.getItem('pedidosCleanItReporter') || 'Operario';
    E.headerUserRole.textContent = 'Carga pública';
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
    E.operatorReporter.textContent = localStorage.getItem('pedidosCleanItReporter') || 'Operario';
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
    const reporter = localStorage.getItem('pedidosCleanItReporter') || '';
    if (!service || reporter.length < 2) {
      toast('Falta identificar el servicio o el responsable.', 'error');
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
      const { data, error } = await S.sb.rpc('public_create_order', {
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
      S.lastSuccessText = `Pedido ${result.order_code}\nServicio: ${service.name}\nResponsable: ${reporter}\n${summary}${budgetNote}\nFecha: ${dtf.format(new Date(result.created_at))}`;

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
    showPublicEntry();
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

  async function logout() {
    buttonBusy(E.logoutButton, true);
    await S.sb.auth.signOut();
    buttonBusy(E.logoutButton, false);
    await returnToPublic();
  }

  async function returnToPublic() {
    teardownRealtime();
    S.session = null;
    S.profile = null;
    S.mode = 'public';
    S.orders = [];
    S.orderItems = [];
    S.profiles = [];
    S.history = [];
    S.serviceMaterialExclusions = [];
    try { await loadPublicData(); } catch (error) { console.error(error); }
    showPublicEntry();
  }

  function showAdminApp() {
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

    const masterButtons = [
      E.addMaterialButton, E.addServiceButton, E.saveMaterialButton, E.saveServiceButton,
      E.saveServiceMaterialsButton, E.showAllServiceMaterialsButton, E.hideAllServiceMaterialsButton
    ];
    masterButtons.forEach((button) => { if (button) button.disabled = !canManageMasterData(); });

    if (!allowed.has(S.tab)) S.tab = 'dashboard';
  }

  async function refreshAdmin(feedback = false) {
    if (S.mode !== 'admin' || !canOperateOrders()) return;
    if (feedback) buttonBusy(E.refreshAdminButton, true, 'Actualizando...');

    try {
      const [servicesResult, materialsResult, exclusionsResult, ordersResult, itemsResult, profilesResult, historyResult] = await Promise.all([
        S.sb.from('services').select('*').order('name'),
        S.sb.from('materials').select('*').order('category').order('sort_order').order('name'),
        S.sb.from('service_material_exclusions').select('service_id,material_id'),
        S.sb.from('orders').select('*').order('created_at', { ascending: false }).limit(1000),
        S.sb.from('order_items').select('*').order('sort_order').order('created_at'),
        S.sb.from('profiles').select('*').order('full_name'),
        S.sb.from('order_status_history').select('*').order('changed_at', { ascending: false }).limit(500)
      ]);

      [servicesResult, materialsResult, exclusionsResult, ordersResult, itemsResult, profilesResult, historyResult]
        .forEach((result) => { if (result.error) throw result.error; });

      S.services = servicesResult.data || [];
      S.materials = materialsResult.data || [];
      S.serviceMaterialExclusions = exclusionsResult.data || [];
      S.orders = ordersResult.data || [];
      S.orderItems = itemsResult.data || [];
      S.profiles = profilesResult.data || [];
      S.history = historyResult.data || [];

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, scheduleAdminRefresh)
      .subscribe();
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
      materials: E.adminMaterials,
      services: E.adminServices,
      users: E.adminUsers,
      history: E.adminHistory
    };
    Object.entries(panels).forEach(([key, panel]) => panel.classList.toggle('d-none', key !== S.tab));

    if (S.tab === 'dashboard') renderDashboard();
    if (S.tab === 'orders') renderOrders();
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
        <td><strong>${order.total_items}</strong> insumos<div class="order-content-summary">${formatQty(order.total_units)} unidades · ${formatCurrency(order.total_amount)}</div>${budgetBadge(order)}</td>
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
    const budgetValue = order.budget_status === 'sin_configurar'
      ? 'Sin tope configurado'
      : `${formatCurrency(order.total_amount)} / ${formatCurrency(order.budget_limit_amount_snapshot)} (${formatPercent(order.budget_limit_percent_snapshot)})`;
    E.orderDetailMeta.innerHTML = [
      ['Servicio', service?.name || 'Servicio eliminado'],
      ['Responsable', order.reporter_name],
      ['Fecha', dtf.format(new Date(order.created_at))],
      ['Prioridad', PRIORITY_LABELS[order.priority] || order.priority],
      ['Estado', STATUS_LABELS[order.status] || order.status],
      ['Contenido', `${order.total_items} insumos · ${formatQty(order.total_units)} unidades`],
      ['Total', formatCurrency(order.total_amount)],
      ['Control presupuestario', `${budgetStatusText(order.budget_status)} · ${budgetValue}`]
    ].map(([label, value]) => `<div class="order-meta-card"><div class="order-meta-label">${eh(label)}</div><div class="order-meta-value">${eh(value)}</div></div>`).join('');

    E.orderDetailItems.innerHTML = items.map((item) => `
      <div class="order-detail-item">
        <img class="order-detail-thumb" src="${ea(item.image_url || 'assets/materials/default.svg')}" alt="${ea(item.item_name)}" onerror="this.src='assets/materials/default.svg'">
        <div><div class="order-detail-name">${eh(item.item_name)}</div><div class="order-detail-sub">${eh(item.item_sku ? `SKU ${item.item_sku} · ` : '')}${eh(item.category || (item.is_custom ? 'No listado' : 'General'))}${item.notes ? ` · ${eh(item.notes)}` : ''}</div><div class="order-detail-sub">Precio unitario: ${eh(formatCurrency(item.unit_price))}</div></div>
        <div class="order-detail-qty">${formatQty(item.quantity)}<div class="order-detail-sub">${eh(item.unit || 'unidad')}</div><strong class="order-line-total">${eh(formatCurrency(item.line_total))}</strong></div>
      </div>`).join('');

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
    if (E.orderEditItems) E.orderEditItems.innerHTML = '';
    if (E.orderAddMaterialSelect) E.orderAddMaterialSelect.innerHTML = '<option value="">Seleccionar insumo...</option>';
  }

  function startOrderEdit() {
    if (!isFullAdmin()) {
      toast('Solo el administrador puede modificar el contenido de un pedido.', 'error');
      return;
    }
    const order = getSelectedOrder();
    if (!order) return;
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
      notes: item.notes || '',
      image_url: item.image_url || 'assets/materials/default.svg',
      is_custom: Boolean(item.is_custom),
      sort_order: number(item.sort_order) || ((index + 1) * 10),
      is_new: false
    }));
    S.orderEditOriginalUpdatedAt = order.updated_at;
    setOrderEditMode(true);
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
    E.orderEditItems.innerHTML = S.orderEditDraft.map((item) => `
      <div class="order-edit-item" data-order-edit-row="${ea(item.key)}">
        <img class="order-detail-thumb" src="${ea(item.image_url || 'assets/materials/default.svg')}" alt="${ea(item.item_name)}" onerror="this.src='assets/materials/default.svg'">
        <div class="order-edit-item-info">
          <div class="order-detail-name">${eh(item.item_name)}</div>
          <div class="order-detail-sub">${eh(item.item_sku ? `SKU ${item.item_sku} · ` : '')}${eh(item.category || 'General')} · ${eh(item.unit || 'unidad')}</div>
          <div class="order-detail-sub">Precio unitario: ${eh(formatCurrency(item.unit_price))}${item.is_new ? ' · Precio actual del catálogo' : ' · Precio registrado en el pedido'}</div>
        </div>
        <div class="order-edit-item-actions">
          <div class="order-edit-qty-control">
            <button class="btn btn-outline-secondary" type="button" data-order-edit-action="minus" data-order-edit-key="${ea(item.key)}" aria-label="Restar una unidad"><i class="bi bi-dash-lg"></i></button>
            <input class="form-control order-edit-qty-input" type="number" min="0.01" max="999" step="0.01" value="${ea(formatInputQty(item.quantity))}" data-order-edit-input data-order-edit-key="${ea(item.key)}" aria-label="Cantidad de ${ea(item.item_name)}">
            <button class="btn btn-outline-primary" type="button" data-order-edit-action="plus" data-order-edit-key="${ea(item.key)}" aria-label="Sumar una unidad"><i class="bi bi-plus-lg"></i></button>
          </div>
          <strong class="order-edit-line-total" data-order-edit-line-total>${eh(formatCurrency(number(item.quantity) * number(item.unit_price)))}</strong>
          <button class="btn btn-outline-danger btn-sm order-edit-remove" type="button" data-order-edit-remove="${ea(item.key)}"><i class="bi bi-trash3 me-1"></i>Quitar</button>
        </div>
      </div>`).join('') || '<div class="empty-inline border rounded-4">El pedido quedó sin insumos. Agregá al menos uno para poder guardar.</div>';
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
      .map((material) => `<option value="${ea(material.id)}">${eh(material.name)}${material.sku ? ` · SKU ${eh(material.sku)}` : ''} · ${eh(formatCurrency(material.unit_price))}</option>`)
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
    if (lineTotal) lineTotal.textContent = formatCurrency(number(item.quantity) * number(item.unit_price));
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

  function orderEditMetrics(order) {
    const validItems = S.orderEditDraft.filter((item) => number(item.quantity) > 0);
    const totalUnits = validItems.reduce((sum, item) => sum + number(item.quantity), 0);
    const totalAmount = Math.round(validItems.reduce((sum, item) => sum + number(item.quantity) * number(item.unit_price), 0) * 100) / 100;
    const billing = number(order?.monthly_billing_snapshot);
    const limitAmount = number(order?.budget_limit_amount_snapshot);
    const sevenAmount = number(order?.budget_seven_percent_snapshot);
    const status = billing <= 0 ? 'sin_configurar' : (totalAmount > sevenAmount ? 'sobre_7' : (totalAmount > limitAmount ? 'sobre_limite' : 'dentro'));
    const differenceToSeven = Math.round((sevenAmount - totalAmount) * 100) / 100;
    const usagePercent = sevenAmount > 0 ? totalAmount / sevenAmount * 100 : 0;
    return { totalItems: validItems.length, totalUnits, totalAmount, billing, limitAmount, sevenAmount, status, differenceToSeven, usagePercent };
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
      <div class="order-edit-budget-grid">
        <div><span>Contenido</span><strong>${metrics.totalItems} insumos · ${eh(formatQty(metrics.totalUnits))} unidades</strong></div>
        <div><span>Límite configurado</span><strong>${metrics.billing > 0 ? `${eh(formatCurrency(metrics.limitAmount))} (${eh(formatPercent(order.budget_limit_percent_snapshot))})` : 'Sin configurar'}</strong></div>
        <div><span>Referencia máxima 7%</span><strong>${metrics.billing > 0 ? eh(formatCurrency(metrics.sevenAmount)) : 'Sin configurar'}</strong></div>
        <div class="order-edit-difference"><span>Resultado</span><strong>${eh(differenceText)}</strong></div>
      </div>
      ${metrics.billing > 0 ? `<div class="order-edit-progress" aria-label="Uso del límite del 7%"><span style="width:${progress.toFixed(2)}%"></span></div><div class="order-detail-sub mt-1">El pedido utiliza ${eh(formatPercent(metrics.usagePercent))} de la referencia del 7%.</div>` : ''}`;
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
        p_items: payload
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
        toast('Falta instalar la actualización SQL de edición de pedidos.', 'error');
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
      `Responsable: ${order.reporter_name}`,
      `Fecha: ${dtf.format(new Date(order.created_at))}`,
      `Prioridad: ${PRIORITY_LABELS[order.priority] || order.priority}`,
      `Estado: ${STATUS_LABELS[order.status] || order.status}`,
      '',
      'INSUMOS:'
    ].filter((line) => line !== null);

    items.forEach((item) => {
      const sku = item.item_sku ? ` [SKU ${item.item_sku}]` : '';
      lines.push(`• ${formatQty(item.quantity)} ${item.unit || 'unidad'} — ${item.item_name}${sku} · ${formatCurrency(item.unit_price)} c/u · ${formatCurrency(item.line_total)}${item.notes ? ` (${item.notes})` : ''}`);
    });
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
    const filtered = S.services.filter((service) => !query || normalize(`${service.name} ${service.zone || ''} ${service.address || ''} ${service.supervisor || ''}`).includes(query));
    const activeMaterials = S.materials.filter((material) => material.active !== false);

    E.servicesTableBody.innerHTML = filtered.map((service) => {
      const orderCount = S.orders.filter((order) => order.service_id === service.id).length;
      const hiddenCount = activeMaterials.filter((material) => isMaterialHiddenForService(material.id, service.id)).length;
      const visibleCount = Math.max(0, activeMaterials.length - hiddenCount);
      const limitAmount = number(service.monthly_billing) * number(service.budget_limit_percent || 5) / 100;
      return `<tr>
        <td><div class="table-title">${eh(service.name)}</div><div class="table-subtitle">${eh(service.address || '')}</div></td>
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
    }).join('') || '<tr><td colspan="10"><div class="empty-inline">No hay servicios para mostrar.</div></td></tr>';
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
    E.serviceAddress.value = service?.address || '';
    E.serviceZone.value = service?.zone || '';
    E.serviceSupervisor.value = service?.supervisor || '';
    E.serviceBilling.value = formatMoneyInput(service?.monthly_billing || 0);
    E.serviceBudgetPercent.value = formatInputQty(service?.budget_limit_percent || 5);
    E.serviceDescription.value = service?.description || '';
    E.serviceNotes.value = service?.notes || '';
    E.serviceActive.checked = service ? service.active !== false : true;
    renderServiceBudgetPreview();
    M.service.show();
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
    buttonBusy(E.saveServiceButton, true, 'Guardando...');
    try {
      const payload = {
        name: E.serviceName.value.trim(),
        address: E.serviceAddress.value.trim() || null,
        zone: E.serviceZone.value.trim() || null,
        supervisor: E.serviceSupervisor.value.trim() || null,
        monthly_billing: clampMoney(E.serviceBilling.value),
        budget_limit_percent: Math.round(budgetPercent * 100) / 100,
        description: E.serviceDescription.value.trim() || null,
        notes: E.serviceNotes.value.trim() || null,
        active: E.serviceActive.checked
      };
      const id = E.serviceId.value;
      const query = id ? S.sb.from('services').update(payload).eq('id', id) : S.sb.from('services').insert(payload);
      const { error } = await query;
      if (error) throw error;
      M.service.hide();
      await refreshAdmin(false);
      toast(id ? 'Servicio actualizado.' : 'Servicio creado.', 'success');
    } catch (error) {
      console.error(error);
      toast(error.message || 'No se pudo guardar el servicio.', 'error');
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

  function renderHistory() {
    E.historyTableBody.innerHTML = S.history.map((entry) => {
      const order = S.orders.find((item) => item.id === entry.order_id);
      const service = order ? serviceById(order.service_id) : null;
      const profile = S.profiles.find((item) => item.id === entry.changed_by);
      const isEdit = Boolean(entry.old_status && entry.old_status === entry.new_status);
      const change = isEdit
        ? '<div class="history-change"><span class="badge text-bg-primary"><i class="bi bi-pencil-square me-1"></i>Pedido editado</span></div>'
        : `<div class="history-change"><span class="status-badge ${ea(entry.old_status || 'pendiente')}">${eh(entry.old_status ? STATUS_LABELS[entry.old_status] : 'Creado')}</span><i class="bi bi-arrow-right history-arrow"></i><span class="status-badge ${ea(entry.new_status)}">${eh(STATUS_LABELS[entry.new_status] || entry.new_status)}</span></div>`;
      return `<tr><td>${dtf.format(new Date(entry.changed_at))}</td><td><button class="btn btn-link p-0 fw-bold text-decoration-none" type="button" data-order-open="${ea(entry.order_id)}">${eh(order?.order_code || 'Pedido eliminado')}</button></td><td>${eh(service?.name || '—')}</td><td>${change}</td><td>${eh(profile?.full_name || profile?.email || 'Sistema')}</td><td>${eh(entry.notes || '')}</td></tr>`;
    }).join('') || '<tr><td colspan="6"><div class="empty-inline">Todavía no hay cambios registrados.</div></td></tr>';
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

  function budgetBadge(order) {
    const status = order.budget_status || 'sin_configurar';
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

  function publicErrorMessage(error) {
    const message = String(error?.message || '');
    if (message.includes('public_order_bootstrap') || message.includes('schema cache')) return 'La base de datos todavía no tiene instalada la última versión. Ejecutá actualizar-sku-precios-topes.sql.';
    return message || 'No se pudieron cargar los servicios.';
  }

  function publicCreateErrorMessage(error) {
    const message = String(error?.message || '');
    if (message.includes('public_create_order') || message.includes('schema cache')) return 'La función de pedidos no está actualizada. Ejecutá actualizar-sku-precios-topes.sql en Supabase.';
    return message || 'No se pudo registrar el pedido.';
  }

  function normalize(value) {
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
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
