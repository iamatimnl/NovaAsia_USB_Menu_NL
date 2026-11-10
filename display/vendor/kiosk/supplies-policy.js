(function (root, factory) {
  const reference = typeof module === 'object' && module.exports ? require('./supplies-reference.js') : root.KioskSuppliesReference;
  const api = factory(reference);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KioskSuppliesPolicy = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (reference) {
  'use strict';
  const IDS = Object.freeze(['extra:Stokjes', 'extra:Sojasaus', 'extra:Wasabi', 'extra:Gember']);
  const products = new Map(reference.products.map(([id, category, kind]) => [id, { category, kind }]));
  const components = new Map(reference.components.map(([item, category, group, option, name, kind]) =>
    [JSON.stringify([item, group, option]), { category, name, kind }]));
  const rank = { skip: 0, chopsticks: 1, full: 2 };
  const isSupply = id => IDS.includes(id);
  const emptyQuantities = () => Object.fromEntries(IDS.map(id => [id, 0]));
  const allowedIds = kind => kind === 'full' ? IDS : kind === 'chopsticks' ? IDS.slice(0, 1) : [];
  const foodLines = lines => (lines || []).filter(line => !isSupply(line.item_id) && line.quantity > 0);

  function validDefinition(item) {
    return item.category_id === 'supplies' && item.category_name === 'Benodigdheden'
      && item.name === item.item_id.slice(6) && item.base_price_cents === 0
      && item.deposit_cents === 0 && item.tax_rate_bps === 900
      && item.pricing_rule_id === 'fixed_base_v1' && Array.isArray(item.option_groups) && item.option_groups.length === 0
      && typeof item.available === 'boolean' && typeof item.sold_out === 'boolean';
  }

  function definitions(catalog) {
    const rows = (catalog.items || []).filter(item => isSupply(item.item_id));
    const complete = rows.length === 4 && IDS.every(id => rows.filter(item => item.item_id === id).length === 1);
    let status = 'invalid';
    if (!rows.length) status = 'legacy';
    else if (complete && rows.every(validDefinition)) {
      if (rows.every(item => item.available === true)) status = 'enabled';
      else if (rows.every(item => item.available === false)) status = 'disabled';
    }
    const items = Object.fromEntries(rows.map(item => [item.item_id, Object.freeze({
      item_id: item.item_id, name: item.name, available: item.available, sold_out: item.sold_out
    })]));
    return Object.freeze({ status, items: Object.freeze(items) });
  }

  function selectedKind(item, selections, base) {
    let kind = base;
    for (const [groupId, ids] of Object.entries(selections || {})) {
      if (!Array.isArray(ids)) return 'full';
      const group = item.option_groups?.find(group => (group.id || group.group_id) === groupId);
      for (const id of ids) {
        const option = group?.options.find(option => (option.id || option.option_id) === id);
        const entry = components.get(JSON.stringify([item.id || item.item_id, groupId, id]));
        if (!entry || !option || entry.category !== item.category_id || entry.name !== option.option_name) return 'full';
        if (rank[entry.kind] > rank[kind]) kind = entry.kind;
      }
    }
    return kind;
  }

  function classify(lines, catalog) {
    let kind = 'skip';
    for (const line of foodLines(lines)) {
      const item = catalog.items.find(item => (item.id || item.item_id) === line.item_id);
      const entry = products.get(line.item_id);
      if (!entry || !item || item.category_id !== entry.category || entry.kind === 'full') return 'full';
      const current = selectedKind(item, line.selections, entry.kind);
      if (rank[current] > rank[kind]) kind = current;
    }
    return kind;
  }

  function validQuantities(quantities, kind, definition) {
    if (!quantities || typeof quantities !== 'object' || Array.isArray(quantities)) return false;
    if (Object.keys(quantities).some(id => !isSupply(id))) return false;
    return IDS.every(id => {
      const count = quantities[id];
      if (!Number.isInteger(count) || count < 0 || count > 20) return false;
      const item = definition.items[id];
      return count === 0 || (allowedIds(kind).includes(id) && item?.available === true && !item.sold_out);
    });
  }

  function restore(saved) {
    if (!saved || saved.confirmed !== true || !['full', 'chopsticks'].includes(saved.kind)) return null;
    const quantities = saved.quantities;
    if (!quantities || Object.keys(quantities).some(id => !isSupply(id))) return null;
    if (!IDS.every(id => Number.isInteger(quantities[id]) && quantities[id] >= 0 && quantities[id] <= 20)) return null;
    return { confirmed: true, kind: saved.kind, quantities: { ...quantities } };
  }

  // Prompt eligibility does not revoke already selected, valid supplies.
  function editKind(kind, saved) {
    return kind === 'full' || IDS.slice(1).some(id => saved?.quantities[id] > 0) ? 'full' : 'chopsticks';
  }

  function assess(lines, catalog, saved, activated) {
    const definition = catalog.supplies || definitions(catalog);
    const kind = classify(lines, catalog);
    const blocked = definition.status === 'invalid' || (activated && definition.status === 'legacy');
    if (blocked) return { kind, definition, ready: false, blocked: true };
    if (definition.status !== 'enabled') return { kind, definition, ready: true, blocked: false };
    const record = restore(saved);
    const positive = record && IDS.some(id => record.quantities[id] > 0);
    const covered = record && (positive || record.kind === 'full' || record.kind === kind);
    const ready = kind === 'skip' && !positive
      || covered && validQuantities(record.quantities, editKind(kind, record), definition);
    return { kind, definition, blocked: false, ready: Boolean(ready) };
  }

  function requestLines(lines, catalog, saved, activated) {
    const status = assess(lines, catalog, saved, activated);
    if (!foodLines(lines).length || !status.ready) throw new Error('supplies_confirmation_required');
    const record = restore(saved);
    if (status.definition.status !== 'enabled' || !record) return [];
    return IDS.filter(id => record.quantities[id] > 0)
      .map(id => ({ item_id: id, quantity: record.quantities[id], selections: [] }));
  }

  return { IDS, isSupply, emptyQuantities, allowedIds, foodLines, definitions, classify,
    validQuantities, restore, editKind, assess, requestLines };
}));
