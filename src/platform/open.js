import { $ } from '../ui/dom.js';

function pick(accept) { const f = $('#file'); f.accept = accept; f.value = ''; f.click(); }
const pickImage = () => pick('image/*');

export { pick, pickImage };
