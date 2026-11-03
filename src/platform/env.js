import { TAURI } from './save.js';

const ua = navigator.userAgent;
// iPadOS 13 起 UA 自称 Macintosh 只能靠触点数跟真 Mac 区分
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
export const isMac = /Macintosh|Mac OS X/.test(ua) && !isIOS;
// 鸿蒙宿主也注入 __TAURI__ 但没有 window API 不能当桌面端
export const isMobile = isIOS || /Android|OpenHarmony|HarmonyOS/.test(ua);
// 自绘标题栏只在桌面客户端出现，网页版和手机上都不要
export const isDesktopApp = !!TAURI && !isMobile;

const win = () => TAURI.window.getCurrentWindow();
export const winMinimize = () => win().minimize();
export const winToggleMax = () => win().toggleMaximize();
export const winClose = () => win().close();
export const winIsMax = () => win().isMaximized();
export const winResize = dir => win().startResizeDragging(dir);
