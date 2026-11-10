(function (root, factory) {
  const options = typeof module === 'object' && module.exports ? require('./options.js') : root.KioskOptions;
  const supplies = typeof module === 'object' && module.exports ? require('./supplies-policy.js') : root.KioskSuppliesPolicy;
  const api = factory(options, supplies);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KioskCatalogViewModel = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Options, Supplies) {
  'use strict';

  const accents = ['salmon', 'gold', 'mint', 'blue', 'coral'];

  function normalize(catalog) {
    if (!catalog || catalog.version) return catalog;
    const result = {
      ...catalog,
      supplies: Supplies.definitions(catalog),
      version: catalog.catalog_version,
      categories: catalog.categories.map((category) => ({
        ...category, id: category.category_id, label: category.category_name
      })),
      items: catalog.items.filter((item) => item.available && !item.sold_out).map((item, index) => {
        const normalized = {
          ...item,
          id: item.item_id,
          price_cents: item.base_price_cents,
          accent: accents[index % accents.length],
          option_groups: (item.option_groups || []).map((group) => ({
          ...group,
          id: group.group_id,
          label: group.group_name,
          options: (group.options || []).filter((option) => option.available && !option.sold_out).map((option) => ({
            ...option, id: option.option_id, label: option.option_name, price_cents: option.price_delta_cents
          }))
        }))
        };
        const saleable = Options.canConfigure(normalized);
        const preview = saleable ? Options.pricePreview(normalized) : { cents: normalized.price_cents, variable: false };
        return {
          ...normalized,
          kiosk_saleable: saleable,
          kiosk_block_reason: saleable ? null : (Options.supports(normalized)
            ? 'Tijdelijk niet samen te stellen' : 'Nog niet beschikbaar op deze kiosk'),
          display_price_cents: preview.cents,
          price_kind: preview.variable ? 'from' : 'fixed'
        };
      })
    };
    result.menu_items = result.items.filter(item => !Supplies.isSupply(item.id));
    result.categories = result.categories.filter(category => result.menu_items.some(item => item.category_id === category.id));
    return result;
  }

  function checkoutSelections(item, selections, quantity) {
    return Options.checkoutSelections(item, selections, quantity);
  }

  return { normalize, checkoutSelections };
}));
