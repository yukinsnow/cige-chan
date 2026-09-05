import { ui } from '../core/state.js';

export const openDialog = name => { ui.dialog = name; };
export const closeDialog = () => { ui.dialog = null; };
