import { bindDisclosureMenu } from './disclosure-menu.js';

// Home owns presentation only. Navigation and experiment activation stay in Controller.
export function renderHomeCards(root, { sensors, activities, linkTo, onSelect, signal }) {
  const doc = root.ownerDocument ?? root;
  const element = (tag, className, text = '') => {
    const node = doc.createElement(tag); node.className = className; node.textContent = text; return node;
  };
  function link(item, className, text = '') {
    const anchor = element('a', className, text); anchor.href = linkTo(item.context);
    anchor.addEventListener('click', event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      event.preventDefault(); onSelect(item.context);
    }, { signal });
    return anchor;
  }
  function heading(item, activity = false) {
    const anchor = link(item, 'home-card-link');
    if (activity) anchor.append(element('span', 'home-card-eyebrow', item.copy.activityEyebrow));
    anchor.append(element('strong', 'home-card-title', activity
      ? item.copy.activityTitle || item.context.activity.name : item.copy.sensorTitle || item.context.sensor.name));
    if (!activity) anchor.append(element('span', 'home-card-sensor', item.copy.sensorEquipment));
    anchor.append(element('span', 'home-card-description', activity ? item.copy.activityDescription
      : item.copy.sensorDescription || item.context.channels.map(channel => channel.name).join(' · ')));
    const arrow = element('span', 'home-card-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true'); anchor.append(arrow);
    return anchor;
  }
  const sensorCards = sensors.map(item => {
    const card = element('article', 'experiment-card sensor-card'); card.append(heading(item));
    const related = activities.filter(activity => activity.context.activity.sensorIds.includes(item.context.sensor.id));
    if (related.length) {
      const footer = element('div', 'home-card-related');
      if (related.length <= 2) {
        footer.append(element('span', 'home-related-label', item.copy.relatedActivities));
        for (const activity of related) footer.append(link(activity, 'home-related-link', activity.context.activity.name));
      } else {
        const menu = element('details', 'disclosure-menu home-activities-menu');
        menu.append(element('summary', 'ui-button', `${item.copy.relatedActivities} ${related.length}`));
        const panel = element('div', 'disclosure-menu-panel home-activities-panel');
        for (const activity of related) {
          const anchor = link(activity, 'home-activity-option');
          anchor.append(element('strong', '', activity.copy.activityTitle), element('span', '', activity.copy.activityDescription));
          panel.append(anchor);
        }
        menu.append(panel); bindDisclosureMenu(menu, { signal });
        panel.addEventListener('click', event => { if (event.target.closest('a')) menu.open = false; }, { signal });
        footer.append(menu);
      }
      card.append(footer);
    }
    return card;
  });
  const activityCards = activities.map(item => {
    const card = element('article', 'experiment-card activity-card'); card.append(heading(item, true));
    const details = element('div', 'home-activity-details'), metadata = element('dl', 'home-activity-metadata');
    metadata.append(element('dt', '', item.copy.sensorLabel), element('dd', '', item.copy.sensorEquipment));
    if (item.copy.curriculum) {
      const curriculum = element('dd', '', item.copy.curriculum);
      if (item.copy.curriculumDetail) curriculum.append(element('span', 'home-curriculum-detail', item.copy.curriculumDetail));
      metadata.append(element('dt', '', item.copy.curriculumLabel), curriculum);
    }
    details.append(metadata, element('span', 'home-activity-action', item.copy.activityAction + ' →'));
    card.append(details); return card;
  });
  root.querySelector('#sensor-cards').replaceChildren(...sensorCards);
  root.querySelector('#activity-cards').replaceChildren(...activityCards);
}
