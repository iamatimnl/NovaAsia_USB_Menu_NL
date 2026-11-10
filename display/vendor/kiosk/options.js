(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KioskOptions = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUPPORTED_RULES = new Set([
    'fixed_base_v1', 'fixed_base_with_preferences_v1', 'per_unit_preference_delta_v1',
    'mini_bento_fixed_v1', 'nigiri_box_fixed_v1', 'xbox_fixed_bundle_v1',
    'roll_variant_absolute_v1', 'xbento_component_sum_v1', 'xbowl_composition_v1'
  ]);

  function pricingRule(item) {
    return item.pricing_rule_id || 'fixed_base_with_preferences_v1';
  }

  function supports(item) {
    return SUPPORTED_RULES.has(pricingRule(item));
  }

  function effectiveMax(group) {
    return group.rule_type === 'variant' ? 1 : group.max;
  }

  function countOf(values, optionId) {
    return (values || []).filter((value) => value === optionId).length;
  }

  function availableCapacity(group) {
    const maximum = effectiveMax(group);
    const capacity = group.options.filter((option) => option.available !== false && !option.sold_out)
      .reduce((sum, option) => sum + Math.min(maximum, option.max_quantity || maximum), 0);
    return Math.min(maximum, capacity);
  }

  function canConfigure(item) {
    return supports(item) && (item.option_groups || []).every((group) => availableCapacity(group) >= group.min);
  }

  function validate(item, selections) {
    const errors = [];
    const selected = selections || {};
    if (!supports(item)) errors.push({ code: 'unsupported_pricing_rule' });
    const knownGroups = new Set((item.option_groups || []).map((group) => group.id));
    Object.keys(selected).filter((groupId) => !knownGroups.has(groupId)).forEach((groupId) => {
      errors.push({ group_id: groupId, code: 'unknown_group' });
    });
    (item.option_groups || []).forEach((group) => {
      const chosen = selected[group.id] || [];
      if (!Array.isArray(chosen)) {
        errors.push({ group_id: group.id, code: 'invalid' });
        return;
      }
      if (chosen.length < group.min) errors.push({ group_id: group.id, code: 'required' });
      if (chosen.length > effectiveMax(group)) errors.push({ group_id: group.id, code: 'too_many' });
      const allowed = new Set(group.options.filter((option) => option.available !== false && !option.sold_out).map((option) => option.id));
      if (chosen.some((id) => !allowed.has(id))) errors.push({ group_id: group.id, code: 'unknown' });
      group.options.forEach((option) => {
        const limit = option.max_quantity || effectiveMax(group);
        if (countOf(chosen, option.id) > limit) errors.push({ group_id: group.id, option_id: option.id, code: 'option_too_many' });
      });
    });
    return { valid: errors.length === 0, errors };
  }

  function selectedPrice(item, selections) {
    const rule = pricingRule(item);
    const selected = selections || {};
    if (rule === 'roll_variant_absolute_v1') {
      return optionValues(item.option_groups?.[0], selected[item.option_groups?.[0]?.id])[0]?.price_cents || 0;
    }
    if (rule === 'xbowl_composition_v1') return xBowlPrice(item, selected);
    if (rule === 'xbento_component_sum_v1') return allOptionDeltas(item, selected);
    if (['fixed_base_v1', 'nigiri_box_fixed_v1', 'xbox_fixed_bundle_v1'].includes(rule)) return item.price_cents;
    return item.price_cents + allOptionDeltas(item, selected);
  }

  function toggle(group, current, optionId) {
    const chosen = [...(current || [])];
    if (effectiveMax(group) === 1) return chosen[0] === optionId ? [] : [optionId];
    return chosen.includes(optionId) ? chosen.filter((id) => id !== optionId) : adjust(group, chosen, optionId, 1);
  }

  function adjust(group, current, optionId, delta) {
    const chosen = [...(current || [])];
    const option = group.options.find((candidate) => candidate.id === optionId);
    if (!option || !Number.isInteger(delta) || !delta) return chosen;
    if (delta < 0) {
      const index = chosen.lastIndexOf(optionId);
      if (index >= 0) chosen.splice(index, 1);
      return chosen;
    }
    if (option.available === false || option.sold_out) return chosen;
    if (effectiveMax(group) === 1) return [optionId];
    const optionLimit = option.max_quantity || effectiveMax(group);
    if (chosen.length >= effectiveMax(group) || countOf(chosen, optionId) >= optionLimit) return chosen;
    chosen.push(optionId);
    return chosen;
  }

  function optionValues(group, optionIds) {
    if (!group) return [];
    const options = new Map(group.options.map((option) => [option.id, option]));
    return (optionIds || []).map((optionId) => options.get(optionId)).filter(Boolean);
  }

  function allOptionDeltas(item, selections) {
    return (item.option_groups || []).reduce((total, group) => {
      return total + optionValues(group, selections[group.id]).reduce((sum, option) => sum + option.price_cents, 0);
    }, 0);
  }

  function xBowlPrice(item, selections) {
    return (item.option_groups || []).reduce((total, group) => {
      const options = optionValues(group, selections[group.id]);
      if (!options.length) return total;
      if (group.pricing_component === 'base_absolute') return total + options[0].price_cents;
      if (group.pricing_component === 'first_configured_then_additional') {
        return total + options[0].price_cents + Math.max(0, options.length - 1) * (group.additional_unit_price_cents || 0);
      }
      if (group.pricing_component === 'per_non_none_unit') {
        return total + options.reduce((sum, option) => sum + option.price_cents, 0);
      }
      return total;
    }, 0);
  }

  function minimumSelections(item) {
    return Object.fromEntries((item.option_groups || []).map((group) => {
      const limit = group.rule_type === 'variant' ? 1 : group.min;
      const ranked = [...group.options].sort((left, right) => left.price_cents - right.price_cents);
      const chosen = [];
      for (const option of ranked) {
        const count = Math.min(limit - chosen.length, option.max_quantity || limit);
        chosen.push(...Array(Math.max(0, count)).fill(option.id));
        if (chosen.length >= limit) break;
      }
      return [group.id, chosen];
    }));
  }

  function pricePreview(item) {
    const rule = pricingRule(item);
    const variable = !['fixed_base_v1', 'nigiri_box_fixed_v1', 'xbox_fixed_bundle_v1'].includes(rule)
      && (item.option_groups || []).some((group) => new Set(group.options.map((option) => option.price_cents)).size > 1 || group.options.some((option) => option.price_cents !== 0));
    return { cents: selectedPrice(item, minimumSelections(item)), variable };
  }

  function checkoutSelections(item, selections, quantity) {
    const groups = new Map((item.option_groups || []).map((group) => [group.id, group]));
    return Object.entries(selections || {}).map(([groupId, optionIds]) => {
      const group = groups.get(groupId);
      const repeats = group?.selection_scope === 'per_unit' ? quantity : 1;
      return { group_id: groupId, option_ids: Array.from({ length: repeats }, () => [...optionIds]).flat() };
    });
  }

  return { supports, canConfigure, availableCapacity, effectiveMax, countOf, validate, selectedPrice, toggle, adjust, pricePreview, checkoutSelections };
}));
