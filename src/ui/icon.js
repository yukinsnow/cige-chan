import { createElement } from 'lucide';

export function iconEl(node, size = 15) {
  const svg = createElement(node);
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  return svg;
}
